mod sv2_capability;

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use asic_rs::MinerFactory;
use asic_rs_core::config::pools::{PoolConfig, PoolGroupConfig};
use asic_rs_core::data::pool::PoolURL;
use asic_rs_core::traits::miner::{Miner, MinerAuth};
use axum::body::Body;
use axum::extract::{Json, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use futures::stream::{FuturesUnordered, StreamExt};
use ipnet::Ipv4Net;
use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;
use tokio_stream::wrappers::ReceiverStream;
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

use crate::sv2_capability::{classify, Sv2Status};

const DEFAULT_PORT: u16 = 9099;
const DEFAULT_PROBE_TIMEOUT: Duration = Duration::from_secs(8);
const SCAN_CONCURRENCY: usize = 64;
const OP_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone)]
struct AppState {
    factory: Arc<MinerFactory>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .init();

    let port: u16 = std::env::var("ASIC_BRIDGE_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    let state = AppState {
        factory: Arc::new(MinerFactory::new()),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/scan", post(scan))
        .route("/pair", post(pair))
        .route("/set-pool", post(set_pool))
        .with_state(state)
        .layer(CorsLayer::very_permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "asic-bridge listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> &'static str {
    "ok"
}

#[derive(Deserialize)]
struct AuthInput {
    username: String,
    password: String,
}

impl AuthInput {
    fn into_miner_auth(self) -> MinerAuth {
        MinerAuth::new(&self.username, &self.password)
    }
}

#[derive(Deserialize)]
struct ScanRequest {
    cidr: String,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

async fn scan(
    State(state): State<AppState>,
    Json(req): Json<ScanRequest>,
) -> Result<Response, AppError> {
    // Match proto-fleet's validateNmapTargets: refuse IPv6 CIDR with the same
    // error message so the dashboard surfaces a consistent failure mode.
    if let Ok(v6) = req.cidr.parse::<ipnet::Ipv6Net>() {
        let _ = v6;
        return Err(AppError::bad_request(
            "IPv6 CIDR subnet scanning is not supported; use mDNS or IP list discovery for IPv6 devices",
        ));
    }
    let net: Ipv4Net = req
        .cidr
        .parse()
        .map_err(|e| AppError::bad_request(format!("invalid cidr: {e}")))?;

    let timeout = req
        .timeout_ms
        .map(Duration::from_millis)
        .unwrap_or(DEFAULT_PROBE_TIMEOUT);

    let hosts: Vec<IpAddr> = net.hosts().map(IpAddr::V4).collect();
    let total = hosts.len();
    tracing::info!(cidr = %req.cidr, host_count = total, "scan start");

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<axum::body::Bytes, std::io::Error>>(64);
    let factory = state.factory.clone();
    let semaphore = Arc::new(Semaphore::new(SCAN_CONCURRENCY));

    tokio::spawn(async move {
        let mut tasks = FuturesUnordered::new();
        for ip in hosts {
            let permit = semaphore.clone().acquire_owned().await.ok();
            let factory = factory.clone();
            tasks.push(tokio::spawn(async move {
                let _permit = permit;
                probe_one(factory, ip, timeout).await
            }));
        }

        while let Some(joined) = tasks.next().await {
            let Ok(Some(info)) = joined else { continue };
            let mut line = match serde_json::to_vec(&info) {
                Ok(v) => v,
                Err(e) => {
                    tracing::warn!(error = %e, "serialize scan result failed");
                    continue;
                }
            };
            line.push(b'\n');
            if tx.send(Ok(axum::body::Bytes::from(line))).await.is_err() {
                break;
            }
        }
        tracing::info!("scan complete");
    });

    let stream = ReceiverStream::new(rx);
    let body = Body::from_stream(stream);
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/x-ndjson")
        .header("cache-control", "no-store")
        .body(body)
        .unwrap())
}

#[derive(Serialize)]
struct ScanRow {
    ip: String,
    mac: Option<String>,
    make: String,
    model: String,
    manufacturer: String,
    firmware: String,
    firmware_version: String,
    serial_number: Option<String>,
    sv2_status: Sv2Status,
}

async fn probe_one(
    factory: Arc<MinerFactory>,
    ip: IpAddr,
    timeout: Duration,
) -> Option<ScanRow> {
    let miner = match tokio::time::timeout(timeout, factory.get_miner(ip)).await {
        Ok(Ok(Some(m))) => m,
        _ => return None,
    };

    // Trait-level info is cheap and works without auth.
    let info = miner.get_device_info();
    let trait_make = info.make.to_string();
    let trait_model = info.model.to_string();
    let trait_firmware = info.firmware.to_string();

    // Try to enrich with full device data; timeout is non-fatal — fall back to
    // trait-level info. `get_data()` itself is infallible in asic-rs v0.5.0,
    // so the only error this match handles is the tokio timeout.
    let (make, model, firmware, firmware_version, serial_number, mac) =
        match tokio::time::timeout(timeout, miner.get_data()).await {
            Ok(d) => (
                d.device_info.make.to_string(),
                d.device_info.model.to_string(),
                d.device_info.firmware.to_string(),
                d.firmware_version.unwrap_or_default(),
                d.serial_number,
                d.mac.as_ref().map(|m| m.to_string()),
            ),
            Err(_) => (
                trait_make,
                trait_model,
                trait_firmware,
                String::new(),
                None,
                None,
            ),
        };

    let sv2_status = classify(&make, &model, &firmware_version);
    let manufacturer = make.clone();

    Some(ScanRow {
        ip: ip.to_string(),
        mac,
        make,
        model,
        manufacturer,
        firmware,
        firmware_version,
        serial_number,
        sv2_status,
    })
}

#[derive(Deserialize)]
struct PairRequest {
    ip: String,
    #[serde(default)]
    auth: Option<AuthInput>,
}

#[derive(Serialize)]
struct PairResponse {
    ip: String,
    make: String,
    model: String,
    firmware: String,
    firmware_version: String,
    serial_number: Option<String>,
    mac: Option<String>,
    sv2_status: Sv2Status,
}

async fn pair(
    State(state): State<AppState>,
    Json(req): Json<PairRequest>,
) -> Result<Json<PairResponse>, AppError> {
    let ip: IpAddr = req
        .ip
        .parse()
        .map_err(|e| AppError::bad_request(format!("invalid ip: {e}")))?;

    let mut miner = locate_miner(&state.factory, ip).await?;
    if let Some(a) = req.auth {
        miner.set_auth(a.into_miner_auth());
    }

    let data = tokio::time::timeout(OP_TIMEOUT, miner.get_data())
        .await
        .map_err(|_| AppError::unavailable("get_data timed out"))?;

    let firmware_version = data.firmware_version.clone().unwrap_or_default();
    let sv2_status = classify(
        &data.device_info.make,
        &data.device_info.model,
        &firmware_version,
    );

    Ok(Json(PairResponse {
        ip: req.ip,
        make: data.device_info.make.to_string(),
        model: data.device_info.model.to_string(),
        firmware: data.device_info.firmware.to_string(),
        firmware_version,
        serial_number: data.serial_number,
        mac: data.mac.as_ref().map(|m| m.to_string()),
        sv2_status,
    }))
}

#[derive(Deserialize)]
struct SetPoolRequest {
    ip: String,
    pool_url: String,
    #[serde(default = "default_worker")]
    worker_name: String,
    #[serde(default)]
    auth: Option<AuthInput>,
}

fn default_worker() -> String {
    "sv2-ui".to_string()
}

#[derive(Serialize)]
struct SetPoolResponse {
    ok: bool,
}

async fn set_pool(
    State(state): State<AppState>,
    Json(req): Json<SetPoolRequest>,
) -> Result<Json<SetPoolResponse>, AppError> {
    let ip: IpAddr = req
        .ip
        .parse()
        .map_err(|e| AppError::bad_request(format!("invalid ip: {e}")))?;

    let mut miner = locate_miner(&state.factory, ip).await?;
    if let Some(a) = req.auth {
        miner.set_auth(a.into_miner_auth());
    }

    let group = PoolGroupConfig {
        name: "default".into(),
        quota: 1,
        pools: vec![PoolConfig {
            url: PoolURL::from(req.pool_url.clone()),
            username: req.worker_name.clone(),
            password: "x".into(),
        }],
    };

    let ok = tokio::time::timeout(OP_TIMEOUT, miner.set_pools_config(vec![group]))
        .await
        .map_err(|_| AppError::unavailable("set_pools_config timed out"))?
        .map_err(|e| AppError::from_anyhow_kind(e))?;

    Ok(Json(SetPoolResponse { ok }))
}

async fn locate_miner(factory: &MinerFactory, ip: IpAddr) -> Result<Box<dyn Miner>, AppError> {
    match tokio::time::timeout(OP_TIMEOUT, factory.get_miner(ip)).await {
        Ok(Ok(Some(m))) => Ok(m),
        Ok(Ok(None)) => Err(AppError::not_found(format!("no miner identified at {ip}"))),
        Ok(Err(e)) => Err(AppError::unavailable(format!("get_miner failed: {e}"))),
        Err(_) => Err(AppError::unavailable("get_miner timed out")),
    }
}

#[derive(Debug)]
enum AppErrorKind {
    BadRequest,
    NotFound,
    Unauthenticated,
    Unavailable,
}

#[derive(Debug)]
struct AppError {
    kind: AppErrorKind,
    message: String,
}

impl AppError {
    fn bad_request(msg: impl Into<String>) -> Self {
        Self {
            kind: AppErrorKind::BadRequest,
            message: msg.into(),
        }
    }
    fn not_found(msg: impl Into<String>) -> Self {
        Self {
            kind: AppErrorKind::NotFound,
            message: msg.into(),
        }
    }
    fn unavailable(msg: impl Into<String>) -> Self {
        Self {
            kind: AppErrorKind::Unavailable,
            message: msg.into(),
        }
    }
    fn from_anyhow_kind(err: anyhow::Error) -> Self {
        let msg = err.to_string();
        let lower = msg.to_lowercase();
        if lower.contains("auth")
            || lower.contains("password")
            || lower.contains("credential")
            || lower.contains("forbidden")
            || lower.contains("401")
            || lower.contains("403")
        {
            Self {
                kind: AppErrorKind::Unauthenticated,
                message: msg,
            }
        } else {
            Self {
                kind: AppErrorKind::Unavailable,
                message: msg,
            }
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match self.kind {
            AppErrorKind::BadRequest => StatusCode::BAD_REQUEST,
            AppErrorKind::NotFound => StatusCode::NOT_FOUND,
            AppErrorKind::Unauthenticated => StatusCode::UNAUTHORIZED,
            AppErrorKind::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
        };
        (
            status,
            Json(serde_json::json!({ "error": self.message })),
        )
            .into_response()
    }
}
