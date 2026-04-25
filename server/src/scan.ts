/**
 * Scan endpoints — proxy to the asic-bridge Rust sidecar.
 *
 * The bridge wraps the asic-rs library and is the same mechanism proto-fleet
 * uses to identify and reconfigure miners on a LAN. The browser never talks
 * to it directly; only this Node server does.
 */

import os from 'os';
import type { Request, Response } from 'express';

// Mirrored from shared/ports.json. Keep in sync — these are the SV1 / SV2
// endpoints the dashboard exposes to miners on the LAN.
const TRANSLATOR_PORT = 34255;
const JDC_PORT = 34265;
const JDC_AUTHORITY_PUBLIC_KEY = '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72';

function getBridgeBaseUrl(): string {
  if (process.env.ASIC_BRIDGE_URL) return process.env.ASIC_BRIDGE_URL;
  // In Docker, the bridge runs as a separate container reachable by name.
  if (process.env.NODE_ENV === 'production') return 'http://sv2-asic-bridge:9099';
  return 'http://localhost:9099';
}

/**
 * Pick the primary IPv4 address of the host, mirroring proto-fleet's
 * GetLocalNetworkInfo (server/internal/infrastructure/networking/network.go):
 * walk interfaces in OS order, skip loopback/down, return the first one with
 * an IPv4 address. Use that interface's natural mask for the subnet CIDR.
 *
 * No RFC1918 preference — if the OS lists a VPN first, that is what gets
 * scanned, same as proto-fleet.
 */
function getPrimaryIPv4(): { address: string; cidr: string } | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const info of list) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (!info.cidr) continue;
      return { address: info.address, cidr: info.cidr };
    }
  }
  return null;
}

/**
 * Convert a host IP + prefix CIDR ("192.168.1.42/24") into the network CIDR
 * ("192.168.1.0/24"), which is what the bridge expects.
 */
function networkCidrFromHostCidr(hostCidr: string): string {
  const [ip, prefixStr] = hostCidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return hostCidr;
  const octets = ip.split('.').map((n) => parseInt(n, 10));
  if (octets.length !== 4 || octets.some((n) => !Number.isFinite(n))) return hostCidr;
  let asInt = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  asInt = (asInt & mask) >>> 0;
  const networkIp = [
    (asInt >>> 24) & 0xff,
    (asInt >>> 16) & 0xff,
    (asInt >>> 8) & 0xff,
    asInt & 0xff,
  ].join('.');
  return `${networkIp}/${prefix}`;
}

/**
 * GET /api/scan/network — return the host's primary IPv4 and the suggested
 * scan CIDR so the dialog can prefill its input.
 */
export async function getNetworkInfo(_req: Request, res: Response): Promise<void> {
  const primary = getPrimaryIPv4();
  if (!primary) {
    res.status(503).json({ error: 'No suitable network interface detected on the host' });
    return;
  }
  res.json({
    host_ip: primary.address,
    suggested_cidr: networkCidrFromHostCidr(primary.cidr),
  });
}

/**
 * POST /api/scan/start — body { cidr, timeout_ms? }
 * Streams NDJSON rows back to the browser as miners are identified.
 */
export async function startScan(req: Request, res: Response): Promise<void> {
  const { cidr, timeout_ms } = req.body ?? {};
  if (typeof cidr !== 'string' || !cidr.includes('/')) {
    res.status(400).json({ error: 'cidr (e.g. "192.168.1.0/24") is required' });
    return;
  }

  const upstream = await fetch(`${getBridgeBaseUrl()}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cidr, timeout_ms }),
  }).catch((err) => err as Error);

  if (upstream instanceof Error || !upstream.ok || !upstream.body) {
    const detail = upstream instanceof Error ? upstream.message : `bridge returned ${upstream.status}`;
    res.status(502).json({
      error: 'asic-bridge unavailable',
      detail,
      hint: 'The asic-bridge sidecar is not running. Start it with `docker compose up asic-bridge` or the equivalent for your dev setup.',
    });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-store');
  res.flushHeaders();

  const reader = upstream.body.getReader();
  const cancel = () => reader.cancel().catch(() => {});
  res.on('close', cancel);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
  } catch (err) {
    console.error('Scan stream error:', err);
  } finally {
    res.end();
  }
}

/**
 * POST /api/scan/pair — body { ip, auth? } — full pairing, returns DeviceInfo.
 */
export async function pairMiner(req: Request, res: Response): Promise<void> {
  try {
    const upstream = await fetch(`${getBridgeBaseUrl()}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    });
    const text = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (err) {
    res.status(502).json({ error: 'asic-bridge unavailable', detail: (err as Error).message });
  }
}

/**
 * POST /api/scan/set-pool — body { ip, sv2_status?, auth?, worker_name? }
 * The Node server is authoritative for the pool URL. The browser supplies
 * the miner's identity and the Node server selects the right destination
 * (JDC for SV2-native miners when JDC is up, Translator otherwise).
 */
type SetPoolBody = {
  ip?: string;
  sv2_status?: 'sv2_native' | 'sv1_translated';
  auth?: { username: string; password: string };
  worker_name?: string;
};

export function buildSetPoolRequest(
  body: SetPoolBody,
  hostIp: string,
  jdMode: boolean,
): { ip: string; pool_url: string; worker_name: string; auth?: { username: string; password: string } } | { error: string } {
  if (typeof body.ip !== 'string') return { error: 'ip is required' };
  // Native SV2 miners go straight to JDC when running in JD mode; everyone
  // else uses the Translator. This matches the SV1/SV2 distinction that's
  // already surfaced in the worker table.
  const useJdc = jdMode && body.sv2_status === 'sv2_native';
  const pool_url = useJdc
    ? `stratum2+tcp://${hostIp}:${JDC_PORT}/${JDC_AUTHORITY_PUBLIC_KEY}`
    : `stratum+tcp://${hostIp}:${TRANSLATOR_PORT}`;
  return {
    ip: body.ip,
    pool_url,
    worker_name: body.worker_name && body.worker_name.length > 0 ? body.worker_name : 'sv2-ui',
    ...(body.auth ? { auth: body.auth } : {}),
  };
}

export async function setMinerPool(
  req: Request,
  res: Response,
  jdMode: boolean,
): Promise<void> {
  const primary = getPrimaryIPv4();
  if (!primary) {
    res.status(503).json({ error: 'No suitable network interface detected on the host' });
    return;
  }

  const built = buildSetPoolRequest(req.body ?? {}, primary.address, jdMode);
  if ('error' in built) {
    res.status(400).json({ error: built.error });
    return;
  }

  try {
    const upstream = await fetch(`${getBridgeBaseUrl()}/set-pool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(built),
    });
    const text = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (err) {
    res.status(502).json({ error: 'asic-bridge unavailable', detail: (err as Error).message });
  }
}
