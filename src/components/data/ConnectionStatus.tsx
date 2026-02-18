import { cn } from '@/lib/utils';

type ConnectionState = 'connected' | 'connecting' | 'error';

interface ConnectionStatusProps {
  state: ConnectionState;
  label?: string;
  className?: string;
}

const stateConfig: Record<
  ConnectionState,
  { dot: string; badge: string; defaultLabel: string }
> = {
  connected: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
    defaultLabel: 'Connected',
  },
  connecting: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20 animate-pulse',
    defaultLabel: 'Connecting',
  },
  error: {
    dot: 'bg-red-500',
    badge: 'bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20 animate-pulse',
    defaultLabel: 'Reconnecting',
  },
};

/**
 * Connection status badge.
 */
export function ConnectionStatus({
  state,
  label,
  className,
}: ConnectionStatusProps) {
  const config = stateConfig[state];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
        config.badge,
        className,
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', config.dot)}
        aria-hidden="true"
      />
      {label || config.defaultLabel}
    </div>
  );
}

/**
 * Determines connection state based on health check response.
 */
export function getConnectionState(
  isLoading: boolean,
  isError: boolean,
): ConnectionState {
  if (isLoading) return 'connecting';
  if (isError) return 'error';
  return 'connected';
}
