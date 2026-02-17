import { cn } from '@/lib/utils';

type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';

interface ConnectionStatusProps {
  state: ConnectionState;
  label?: string;
  className?: string;
  lastUpdated?: number;
}

function formatLastUpdated(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

/**
 * A visual indicator for connection status.
 * Shows a colored dot with optional label and last-updated time.
 */
export function ConnectionStatus({
  state,
  label,
  className,
  lastUpdated,
}: ConnectionStatusProps) {
  const stateConfig: Record<ConnectionState, { color: string; text: string }> = {
    connected: { color: 'bg-cyan-400 shadow-[0_0_8px_hsl(187,92%,60%,0.4)]', text: 'Connected' },
    connecting: { color: 'bg-yellow-500 animate-pulse', text: 'Connecting' },
    disconnected: { color: 'bg-muted-foreground', text: 'Disconnected' },
    error: { color: 'bg-red-500', text: 'Error' },
  };

  const config = stateConfig[state];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'h-2 w-2 rounded-full shadow-sm',
          config.color
        )}
      />
      <span className="text-sm text-muted-foreground">
        {label || config.text}
      </span>
      {lastUpdated && state === 'connected' && (
        <span className="text-xs text-muted-foreground/60">
          · {formatLastUpdated(lastUpdated)}
        </span>
      )}
    </div>
  );
}

/**
 * Determines connection state based on health check response.
 */
export function getConnectionState(
  isLoading: boolean,
  isError: boolean,
  isSuccess: boolean
): ConnectionState {
  if (isLoading) return 'connecting';
  if (isError) return 'error';
  if (isSuccess) return 'connected';
  return 'disconnected';
}
