import { useState, useEffect, useRef } from 'react';
import {
  rpcVersionToCoreVersion,
  rpcVersionToDisplayVersion,
  formatBitcoinCoreVersion,
  DEFAULT_BITCOIN_PATHS,
  computeDefaultSocketPath,
  type OperatingSystem,
  inferOsFromDataDir,
  mapHostOsToOperatingSystem,
} from '@sv2-ui/shared';
import { BITCOIN_MESSAGES } from '@/lib/messages';
import { StepProps, BitcoinConfig } from '../types';
import { Copy, Check, ExternalLink, Loader2, RotateCw, CheckCircle2, AlertCircle } from 'lucide-react';
import type { BitcoinRpcDiscoveryResult } from '@/hooks/useBitcoinRpcDiscovery';
import { useHostEnv } from '@/hooks/useHostEnv';

interface BitcoinPrereqStepProps extends StepProps {
  discoveredNodes: BitcoinRpcDiscoveryResult[];
  isDiscovering: boolean;
  onRetryDiscovery: () => void;
  onAutoAdvance: () => void;
}

export function BitcoinPrereqStep({ data, updateData, onNext, discoveredNodes, isDiscovering, onRetryDiscovery, onAutoAdvance }: BitcoinPrereqStepProps) {
  const { hostOs, isLoading: hostOsLoading } = useHostEnv();
  const [copiedMainnet, setCopiedMainnet] = useState(false);
  const [copiedTestnet, setCopiedTestnet] = useState(false);
  const [ipcStatus, setIpcStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const ipcCompletedRef = useRef(false);

  const copy = async (text: string, which: 'mainnet' | 'testnet') => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'mainnet') {
        setCopiedMainnet(true);
        setTimeout(() => setCopiedMainnet(false), 2000);
      } else {
        setCopiedTestnet(true);
        setTimeout(() => setCopiedTestnet(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    if (hostOsLoading) return;

    const pNode = discoveredNodes.find(n => n.network === 'mainnet') ?? discoveredNodes[0];
    const dCoreVersion = pNode ? rpcVersionToCoreVersion(pNode.version) : null;

    if (hostOs) {
      const mapped = mapHostOsToOperatingSystem(hostOs);
      if (mapped) {
        updateData({
          bitcoin: {
            core_version: null,
            os: mapped,
            network: pNode?.network ?? 'mainnet',
            customDataDir: '',
            socket_path: '',
          },
        });
        return;
      }
    }

    if (!data.bitcoin?.os && pNode) {
      updateData({
        bitcoin: {
          core_version: dCoreVersion ?? null,
          os: inferOsFromDataDir(pNode.dataDir),
          network: pNode.network,
          customDataDir: '',
          socket_path: '',
        },
      });
    }
  }, [hostOs, hostOsLoading, discoveredNodes, data.bitcoin?.os, updateData]);

  useEffect(() => {
    if (hostOsLoading) return;
    if (ipcCompletedRef.current) return;
    if (isDiscovering) return;

    if (discoveredNodes.length !== 1) {
      setIpcStatus('idle');
      return;
    }

    const node = discoveredNodes[0];
    const version = rpcVersionToCoreVersion(node.version);
    if (!version || node.initialBlockDownload) {
      setIpcStatus('idle');
      return;
    }

    const os: OperatingSystem = data.bitcoin?.os ?? (
      node.dataDir.includes('Library/Application Support') ? 'macos' : 'linux'
    );
    const socketPath = computeDefaultSocketPath(DEFAULT_BITCOIN_PATHS[os], node.network);

    setIpcStatus('checking');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    fetch('/api/validate/bitcoin-socket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ socket_path: socketPath, network: node.network }),
      signal: controller.signal,
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        clearTimeout(timeoutId);
        if (data?.valid === true) {
          updateData({
            bitcoin: {
              core_version: version,
              os,
              network: node.network,
              customDataDir: '',
              socket_path: socketPath,
              discoveredLogPath: node.logpath,
            } as BitcoinConfig,
          });
          setIpcStatus('valid');
          ipcCompletedRef.current = true;
          setTimeout(() => onAutoAdvance(), 1500);
        } else {
          setIpcStatus('invalid');
          ipcCompletedRef.current = true;
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setIpcStatus('invalid');
        ipcCompletedRef.current = true;
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [discoveredNodes, hostOsLoading, isDiscovering, updateData, onAutoAdvance, data.bitcoin?.os]);

  const mainnetCmd = 'bitcoin -m node -ipcbind=unix';
  const testnetCmd = 'bitcoin -m node -ipcbind=unix -testnet4';

  const hasDiscovered = discoveredNodes.length > 0;
  const primaryNode = discoveredNodes.find(n => n.network === 'mainnet') ?? discoveredNodes[0];
  const isSyncing = hasDiscovered && discoveredNodes.some(n => n.initialBlockDownload);
  const detectedCoreVersion = primaryNode ? rpcVersionToCoreVersion(primaryNode.version) : null;
  const isUnsupportedVersion = hasDiscovered && !detectedCoreVersion;
  const autoSocketPath = hasDiscovered && primaryNode
    ? computeDefaultSocketPath(
      DEFAULT_BITCOIN_PATHS[
        primaryNode.dataDir.includes('Library/Application Support') ? 'macos' : 'linux'
      ],
      primaryNode.network,
    )
    : '';
  const needsManualConnection = ipcStatus === 'invalid' || (!isDiscovering && !hasDiscovered);

  return (
    <div className="space-y-6 text-center">
      <div>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">
          {BITCOIN_MESSAGES.prereqHeading}
        </h2>
        <p className="text-base text-muted-foreground">
          {BITCOIN_MESSAGES.versionRequirement}
        </p>
      </div>

      <div className="text-left rounded-xl border border-border bg-card divide-y divide-border">
        {/* Step 1 */}
        <div className="flex gap-4 p-4">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono flex-shrink-0 mt-0.5">1</div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm mb-1">
              {BITCOIN_MESSAGES.installStep}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <a
                href="https://bitcoincore.org/en/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
              >
                Download Bitcoin Core
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
              <span aria-hidden="true">·</span>
              <span>{BITCOIN_MESSAGES.upgradePrompt}</span>
              <span aria-hidden="true">·</span>
              <a
                href="https://github.com/bitcoin-core/libmultiprocess/pull/231"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
              >
                {BITCOIN_MESSAGES.windowsSupport}
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex gap-4 p-4">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono flex-shrink-0 mt-0.5">2</div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm mb-3">
              Start with IPC enabled
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">Mainnet</p>
              <div className="relative">
                <pre
                  className="bg-muted/60 p-3 pr-12 rounded-lg text-xs font-mono overflow-x-auto"
                  aria-label="Mainnet start command"
                >
                  {mainnetCmd}
                </pre>
                <button
                  type="button"
                  onClick={() => copy(mainnetCmd, 'mainnet')}
                  aria-label={copiedMainnet ? 'Copied!' : 'Copy mainnet command'}
                  aria-live="polite"
                  className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                >
                  {copiedMainnet
                    ? <Check className="w-4 h-4 text-green-500" aria-hidden="true" />
                    : <Copy className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
                </button>
              </div>

              <details className="mt-3 group">
                <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded">
                  Using Testnet4?
                </summary>
                <div className="relative mt-2">
                  <pre
                    className="bg-muted/60 p-3 pr-12 rounded-lg text-xs font-mono overflow-x-auto"
                    aria-label="Testnet4 start command"
                  >
                    {testnetCmd}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copy(testnetCmd, 'testnet')}
                    aria-label={copiedTestnet ? 'Copied!' : 'Copy testnet4 command'}
                    aria-live="polite"
                    className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                  >
                    {copiedTestnet
                      ? <Check className="w-4 h-4 text-green-500" aria-hidden="true" />
                      : <Copy className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="flex gap-4 p-4">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono flex-shrink-0 mt-0.5">3</div>
          <div className="flex-1">
            <div className="font-medium text-sm mb-1">
              Wait for initial sync
            </div>
            <p className="text-xs text-muted-foreground">
              Initial sync must finish before you can continue.
            </p>
          </div>
        </div>
      </div>

      {isDiscovering && (
        <div
          className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground flex gap-3 items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" aria-hidden="true" />
          <span>{BITCOIN_MESSAGES.detecting}</span>
        </div>
      )}

      {hasDiscovered && primaryNode && isUnsupportedVersion && (
        <div
          className="p-3 rounded-lg bg-destructive/[0.08] border border-destructive/20 text-sm text-destructive flex gap-3 items-start"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-left">
            <span className="font-medium">{BITCOIN_MESSAGES.unsupportedHeading}</span>
            <p className="text-xs mt-1 opacity-80">
              {BITCOIN_MESSAGES.unsupportedDetected(rpcVersionToDisplayVersion(primaryNode.version))}
            </p>
            <p className="text-xs mt-2">
              {BITCOIN_MESSAGES.upgradeNode}
            </p>
          </div>
        </div>
      )}

      {hasDiscovered && primaryNode && !isUnsupportedVersion && isSyncing && (
        <div
          className="p-3 rounded-lg bg-warning/[0.08] border border-warning/20 text-sm text-warning flex gap-3 items-start"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-left">
            <span className="font-medium">{BITCOIN_MESSAGES.syncingHeading}</span>
            <p className="text-xs mt-1 opacity-80">
              Network: {primaryNode.network} • Version: {detectedCoreVersion ? formatBitcoinCoreVersion(detectedCoreVersion) : rpcVersionToDisplayVersion(primaryNode.version)} • Syncing...
            </p>
            <p className="text-xs mt-2">
              Your node is still downloading the blockchain. Please wait for the initial block download to finish before continuing.
            </p>
          </div>
        </div>
      )}

      {hasDiscovered && primaryNode && !isUnsupportedVersion && !isSyncing && detectedCoreVersion && (
        <div
          className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success flex gap-3 items-start"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-left">
            <span className="font-medium">{BITCOIN_MESSAGES.detectedHeading}</span>
            <p className="text-xs mt-1 opacity-80">
              {detectedCoreVersion !== null
                ? `Network: ${primaryNode.network} • Version: ${formatBitcoinCoreVersion(detectedCoreVersion)} • Synced`
                : `Network: ${primaryNode.network} • Version: ${rpcVersionToDisplayVersion(primaryNode.version)} • Synced`}
            </p>
          </div>
        </div>
      )}

      {ipcStatus === 'checking' && (
        <div
          className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground flex gap-3 items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" aria-hidden="true" />
          <span>Verifying IPC socket...</span>
        </div>
      )}

      {ipcStatus === 'valid' && (
        <div
          className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success flex gap-3 items-start"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-left">
            <span className="font-medium">IPC socket verified — proceeding automatically...</span>
            <p className="text-xs mt-1 opacity-80">
              Socket at {autoSocketPath} is listening
            </p>
          </div>
        </div>
      )}

      {ipcStatus === 'invalid' && (
        <div
          className="p-3 rounded-lg bg-warning/[0.08] border border-warning/20 text-sm text-warning flex gap-3 items-start"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-left">
            <span className="font-medium">IPC socket wasn’t detected</span>
            <p className="text-xs mt-1 opacity-80">
              Start Bitcoin Core with IPC enabled, or configure the connection manually.
            </p>
          </div>
        </div>
      )}

      {!isDiscovering && !hasDiscovered && (
        <div
          className="p-3 rounded-lg bg-warning/[0.08] border border-warning/20 text-sm text-warning flex gap-3 items-start"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0 text-left">
            <span className="font-medium">Bitcoin Core wasn’t detected</span>
            <p className="text-xs mt-1 opacity-80">
              Start the node and retry, or configure the connection manually.
            </p>
            <button
              type="button"
              onClick={onRetryDiscovery}
              className="inline-flex h-8 items-center gap-2 mt-3 rounded-md border border-warning/30 bg-background px-3 text-xs font-medium text-warning transition-colors hover:bg-warning/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/30"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNext}
          disabled={isDiscovering || isSyncing || isUnsupportedVersion || ipcStatus === 'checking'}
          className="h-11 px-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {needsManualConnection ? 'Configure manually' : 'Configure Connection'}
        </button>
      </div>
    </div>
  );
}
