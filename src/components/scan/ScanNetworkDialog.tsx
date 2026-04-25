import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Radar, Search, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MinerConnectionInfo } from '@/components/setup/MinerConnectionInfo';
import { cn } from '@/lib/utils';
import type { PairOutcome, ScanRow } from './types';

interface ScanNetworkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isJdMode: boolean;
}

type Phase = 'configure' | 'scanning' | 'review' | 'pairing' | 'done';

const PAIR_CONCURRENCY = 8;

export function ScanNetworkDialog({ open, onOpenChange, isJdMode }: ScanNetworkDialogProps) {
  const [phase, setPhase] = useState<Phase>('configure');
  const [cidr, setCidr] = useState<string>('');
  const [hostIp, setHostIp] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const [results, setResults] = useState<ScanRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanError, setScanError] = useState<string | null>(null);

  const [pairOutcomes, setPairOutcomes] = useState<Record<string, PairOutcome>>({});
  const [authInputs, setAuthInputs] = useState<Record<string, { username: string; password: string }>>({});

  const abortRef = useRef<AbortController | null>(null);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setPhase('configure');
    setResults([]);
    setSelected(new Set());
    setPairOutcomes({});
    setAuthInputs({});
    setScanError(null);
    setNetworkError(null);

    let cancelled = false;
    fetch('/api/scan/network')
      .then(async (r) => {
        if (!r.ok) throw new Error(`network info request failed (${r.status})`);
        return r.json() as Promise<{ host_ip: string; suggested_cidr: string }>;
      })
      .then((info) => {
        if (cancelled) return;
        setHostIp(info.host_ip);
        setCidr(info.suggested_cidr);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setNetworkError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Cancel any in-flight scan when the dialog closes.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
  }, [open]);

  const startScan = async () => {
    if (!cidr) return;
    setScanError(null);
    setResults([]);
    setSelected(new Set());
    setPhase('scanning');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cidr }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.hint || body.detail || body.error || `scan failed (${resp.status})`);
      }
      if (!resp.body) throw new Error('scan returned an empty stream');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const row = JSON.parse(line) as ScanRow;
            setResults((prev) => [...prev, row]);
            // Default-select every miner found, like proto-fleet does.
            setSelected((prev) => {
              const next = new Set(prev);
              next.add(row.ip);
              return next;
            });
          } catch {
            // Ignore malformed lines.
          }
        }
      }
      setPhase('review');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setScanError((err as Error).message);
      setPhase('configure');
    }
  };

  const toggleSelect = (ip: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  };

  const startPairing = async () => {
    if (selected.size === 0) return;
    setPhase('pairing');

    const queue = results.filter((r) => selected.has(r.ip));
    const initial: Record<string, PairOutcome> = {};
    for (const r of queue) initial[r.ip] = { kind: 'pending' };
    setPairOutcomes(initial);

    let cursor = 0;
    const workers: Promise<void>[] = [];
    const runOne = async (): Promise<void> => {
      while (true) {
        const idx = cursor++;
        if (idx >= queue.length) return;
        const row = queue[idx];
        const auth = authInputs[row.ip];
        try {
          const resp = await fetch('/api/scan/set-pool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ip: row.ip,
              sv2_status: row.sv2_status,
              ...(auth ? { auth } : {}),
            }),
          });
          if (resp.status === 401) {
            setPairOutcomes((p) => ({ ...p, [row.ip]: { kind: 'auth_required' } }));
          } else if (!resp.ok) {
            const body = await resp.json().catch(() => ({}));
            setPairOutcomes((p) => ({
              ...p,
              [row.ip]: { kind: 'error', message: body.error || `failed (${resp.status})` },
            }));
          } else {
            setPairOutcomes((p) => ({ ...p, [row.ip]: { kind: 'success' } }));
          }
        } catch (err) {
          setPairOutcomes((p) => ({
            ...p,
            [row.ip]: { kind: 'error', message: (err as Error).message },
          }));
        }
      }
    };
    for (let i = 0; i < Math.min(PAIR_CONCURRENCY, queue.length); i++) workers.push(runOne());
    await Promise.all(workers);
    setPhase('done');
  };

  const retryPair = async (ip: string) => {
    setPairOutcomes((p) => ({ ...p, [ip]: { kind: 'pending' } }));
    const row = results.find((r) => r.ip === ip);
    if (!row) return;
    const auth = authInputs[ip];
    try {
      const resp = await fetch('/api/scan/set-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: row.ip,
          sv2_status: row.sv2_status,
          ...(auth ? { auth } : {}),
        }),
      });
      if (resp.status === 401) {
        setPairOutcomes((p) => ({ ...p, [ip]: { kind: 'auth_required' } }));
      } else if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setPairOutcomes((p) => ({
          ...p,
          [ip]: { kind: 'error', message: body.error || `failed (${resp.status})` },
        }));
      } else {
        setPairOutcomes((p) => ({ ...p, [ip]: { kind: 'success' } }));
      }
    } catch (err) {
      setPairOutcomes((p) => ({
        ...p,
        [ip]: { kind: 'error', message: (err as Error).message },
      }));
    }
  };

  const successCount = useMemo(
    () => Object.values(pairOutcomes).filter((o) => o.kind === 'success').length,
    [pairOutcomes],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Scan network for miners"
      description={
        hostIp
          ? `Probing miners reachable from this host (${hostIp}). Found miners can be pointed at this dashboard with one click.`
          : 'Probing miners reachable from this host.'
      }
      panelClassName="max-w-3xl"
    >
      {networkError && (
        <ErrorBanner
          title="Could not detect a usable network interface"
          message={networkError}
        />
      )}

      {(phase === 'configure' || phase === 'scanning') && (
        <ConfigurePane
          cidr={cidr}
          setCidr={setCidr}
          onStart={startScan}
          scanning={phase === 'scanning'}
          error={scanError}
          incoming={results}
        />
      )}

      {(phase === 'review' || phase === 'pairing' || phase === 'done') && (
        <ResultsPane
          rows={results}
          selected={selected}
          toggleSelect={toggleSelect}
          phase={phase}
          outcomes={pairOutcomes}
          authInputs={authInputs}
          setAuthInputs={setAuthInputs}
          retryPair={retryPair}
          isJdMode={isJdMode}
        />
      )}

      <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-border/40">
        <div className="text-xs text-muted-foreground">
          {phase === 'review' && `${selected.size} of ${results.length} selected`}
          {phase === 'done' &&
            `${successCount} of ${Object.keys(pairOutcomes).length} miners pointed at this dashboard`}
        </div>
        <div className="flex gap-2">
          {phase === 'review' && (
            <Button
              size="sm"
              variant="default"
              onClick={startPairing}
              disabled={selected.size === 0}
            >
              Add {selected.size > 0 ? selected.size : ''} miner{selected.size === 1 ? '' : 's'}
            </Button>
          )}
          {phase === 'done' && (
            <Button size="sm" variant="default" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          {(phase === 'configure' || phase === 'scanning') && (
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function ConfigurePane({
  cidr,
  setCidr,
  onStart,
  scanning,
  error,
  incoming,
}: {
  cidr: string;
  setCidr: (v: string) => void;
  onStart: () => void;
  scanning: boolean;
  error: string | null;
  incoming: ScanRow[];
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Network range (CIDR)
        </span>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={cidr}
              onChange={(e) => setCidr(e.target.value)}
              placeholder="192.168.1.0/24"
              disabled={scanning}
              className="w-full pl-9 h-9 rounded-lg border border-border bg-muted/50 text-sm font-mono outline-none transition-all focus:bg-background focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
            />
          </div>
          <Button size="sm" onClick={onStart} disabled={scanning || !cidr}>
            {scanning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Scanning…
              </>
            ) : (
              <>
                <Radar className="h-3.5 w-3.5 mr-1.5" />
                Start scan
              </>
            )}
          </Button>
        </div>
      </label>

      {error && <ErrorBanner title="Scan failed" message={error} />}

      {scanning && (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {incoming.length === 0
            ? 'Scanning the subnet for miners. Identified miners will appear below as they respond.'
            : `Found ${incoming.length} miner${incoming.length === 1 ? '' : 's'} so far…`}
        </div>
      )}

      {scanning && incoming.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {incoming.map((r) => (
            <li key={r.ip} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30">
              <Sv2Badge status={r.sv2_status} />
              <span className="font-mono text-xs">{r.ip}</span>
              <span className="text-muted-foreground">
                {r.manufacturer} {r.model}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultsPane({
  rows,
  selected,
  toggleSelect,
  phase,
  outcomes,
  authInputs,
  setAuthInputs,
  retryPair,
  isJdMode,
}: {
  rows: ScanRow[];
  selected: Set<string>;
  toggleSelect: (ip: string) => void;
  phase: Phase;
  outcomes: Record<string, PairOutcome>;
  authInputs: Record<string, { username: string; password: string }>;
  setAuthInputs: React.Dispatch<
    React.SetStateAction<Record<string, { username: string; password: string }>>
  >;
  retryPair: (ip: string) => void;
  isJdMode: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-6 text-center">
          <p className="text-sm font-medium">No miners found on the network.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Some miners block automatic discovery. You can still onboard them by pointing them at the
            address below from the miner&apos;s own admin page.
          </p>
        </div>
        <MinerConnectionInfo isJdMode={isJdMode} />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/40">
      {rows.map((r) => {
        const outcome = outcomes[r.ip];
        const showCheckbox = phase === 'review';
        return (
          <li key={r.ip} className="py-3 flex items-start gap-3">
            {showCheckbox ? (
              <input
                type="checkbox"
                checked={selected.has(r.ip)}
                onChange={() => toggleSelect(r.ip)}
                className="mt-1 h-4 w-4 rounded border-border accent-primary"
              />
            ) : (
              <div className="mt-1 w-4">
                <OutcomeIcon outcome={outcome} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">
                  {r.manufacturer} {r.model}
                </span>
                <Sv2Badge status={r.sv2_status} />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                {r.ip}
                {r.mac && <span className="ml-2 opacity-60">{r.mac}</span>}
                {r.firmware_version && <span className="ml-2 opacity-60">fw {r.firmware_version}</span>}
              </div>
              {outcome?.kind === 'error' && (
                <div className="text-xs text-red-500 mt-1">{outcome.message}</div>
              )}
              {outcome?.kind === 'auth_required' && (
                <AuthInline
                  ip={r.ip}
                  authInputs={authInputs}
                  setAuthInputs={setAuthInputs}
                  onRetry={() => retryPair(r.ip)}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Sv2Badge({ status }: { status: ScanRow['sv2_status'] }) {
  if (status === 'sv2_native') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
        title="This miner natively speaks Stratum V2."
      >
        SV2 native
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/30"
      title="This miner speaks Stratum V1. It will be translated to SV2 by the Translator running on this host."
    >
      SV1 → translator
    </span>
  );
}

function OutcomeIcon({ outcome }: { outcome: PairOutcome | undefined }) {
  if (!outcome || outcome.kind === 'pending')
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (outcome.kind === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (outcome.kind === 'auth_required') return <Lock className="h-4 w-4 text-amber-500" />;
  return <AlertCircle className="h-4 w-4 text-red-500" />;
}

function AuthInline({
  ip,
  authInputs,
  setAuthInputs,
  onRetry,
}: {
  ip: string;
  authInputs: Record<string, { username: string; password: string }>;
  setAuthInputs: React.Dispatch<
    React.SetStateAction<Record<string, { username: string; password: string }>>
  >;
  onRetry: () => void;
}) {
  const current = authInputs[ip] ?? { username: '', password: '' };
  return (
    <div className="mt-2 flex items-end gap-2">
      <label className="flex-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Username
        </span>
        <input
          type="text"
          value={current.username}
          onChange={(e) =>
            setAuthInputs((p) => ({ ...p, [ip]: { ...current, username: e.target.value } }))
          }
          className="mt-1 w-full h-8 px-2 rounded-md border border-border bg-muted/50 text-xs font-mono"
        />
      </label>
      <label className="flex-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Password
        </span>
        <input
          type="password"
          value={current.password}
          onChange={(e) =>
            setAuthInputs((p) => ({ ...p, [ip]: { ...current, password: e.target.value } }))
          }
          className="mt-1 w-full h-8 px-2 rounded-md border border-border bg-muted/50 text-xs font-mono"
        />
      </label>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function ErrorBanner({ title, message }: { title: string; message: string }) {
  return (
    <div className={cn('rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm')}>
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
        <div>
          <div className="font-medium text-red-500">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{message}</div>
        </div>
      </div>
    </div>
  );
}
