import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { TRANSLATOR_PORT, JDC_PORT, JDC_AUTHORITY_PUBLIC_KEY } from '@/lib/ports';
import { useHostEnv } from '@/hooks/useHostEnv';

function copyWithSelectionFallback(text: string): boolean {
  const textArea = document.createElement('textarea');

  textArea.value = text;
  textArea.setAttribute('readonly', 'true');
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.opacity = '0';

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, text.length);

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}

function CopyableAddress({ address }: { address: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      copied = copyWithSelectionFallback(address);
    }

    setCopyState(copied ? 'copied' : 'failed');
    setTimeout(() => setCopyState('idle'), 2000);
  };

  const copyLabel = copyState === 'copied'
    ? 'Copied'
    : copyState === 'failed'
      ? 'Copy failed'
      : 'Copy to clipboard';

  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <code className="min-w-0 flex-1 select-all break-all font-mono leading-relaxed text-foreground">
        {address}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="mt-0.5 flex-shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        title={copyLabel}
        aria-label={copyLabel}
        aria-live="polite"
      >
        {copyState === 'copied' ? (
          <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
        ) : (
          <Copy
            className={`h-4 w-4${copyState === 'failed' ? ' text-destructive' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  );
}

interface MinerConnectionInfoProps {
  isJdMode: boolean;
  centered?: boolean;
}

export function MinerConnectionInfo({ isJdMode, centered = false }: MinerConnectionInfoProps) {
  const { stratumHost } = useHostEnv();
  const host = stratumHost ?? '<your-machine-ip>';
  const translatorUrl = `stratum+tcp://${host}:${TRANSLATOR_PORT}`;
  const jdcUrl = `stratum2+tcp://${host}:${JDC_PORT}/${JDC_AUTHORITY_PUBLIC_KEY}`;

  const hint = (
    <p className="text-xs text-muted-foreground">
      Replace <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">&lt;your-machine-ip&gt;</code> with your local network IP (e.g. <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">192.168.1.100</code>).
    </p>
  );

  // When only one card is shown (SV1-only mode) it should stretch to full width.
  // In JD mode two cards sit side-by-side on md+ screens.
  const wrapperClass = centered
    ? 'flex flex-wrap justify-center gap-3'
    : isJdMode
      ? 'grid gap-3 md:grid-cols-2'
      : 'grid gap-3';

  return (
    <div className={wrapperClass}>
      <div className={`p-4 rounded-xl border border-border bg-card space-y-2${centered ? ' w-full max-w-sm' : ''}`}>
        <div className="font-semibold text-sm">SV1 Firmware</div>
        <div className="text-xs text-muted-foreground">Point to the Translator Proxy</div>
        <CopyableAddress address={translatorUrl} />
        {!stratumHost && hint}
      </div>

      {isJdMode && (
        <div className={`p-4 rounded-xl border border-border bg-card space-y-2${centered ? ' w-full max-w-sm' : ''}`}>
          <div className="font-semibold text-sm">SV2 Firmware</div>
          <div className="text-xs text-muted-foreground">Point directly to the JD Client</div>
          <CopyableAddress address={jdcUrl} />
          {!stratumHost && hint}
        </div>
      )}
    </div>
  );
}
