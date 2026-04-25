# asic-bridge

Rust HTTP service that wraps [`asic-rs`](https://github.com/256foundation/asic-rs) so the SRI dashboard can scan a subnet for miners and reconfigure them to point at the local Translator (port 34255) or JDC (port 34265).

This is the same library proto-fleet uses in its `asicrs` plugin. We get vendor support (Antminer / Whatsminer / BraiinsOS / LuxOS / VNish / ePIC / Bitaxe / NerdAxe …) for free.

## Endpoints

- `POST /scan` — body `{ "cidr": "192.168.1.0/24", "timeout_ms": 8000 }` — streams `application/x-ndjson` rows as miners are identified.
- `POST /pair` — body `{ "ip": "192.168.1.42", "auth": { "username": "root", "password": "root" } }` (auth optional) — returns full device info.
- `POST /set-pool` — body `{ "ip": "192.168.1.42", "pool_url": "stratum+tcp://host:34255", "worker_name": "sv2-ui", "auth": {…} }` — writes the pool to the miner using the vendor-specific adapter inside `asic-rs`.
- `GET /health` — returns `ok`.

## How it runs

The Node server (`server/src/index.ts`) auto-starts an `asic-bridge` Docker container alongside the Translator/JDC stack. The container runs with `network_mode: host` so `asic-rs` can probe miners on the local LAN. The browser never talks to this service directly — only the Node server does, over loopback.

## Local dev

```sh
cargo run --release
# bridge listens on 0.0.0.0:9099
```

Set `ASIC_BRIDGE_PORT` to override the listen port.
