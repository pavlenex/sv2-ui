import { AlertTriangle, Loader2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AlertTone = 'loading' | 'error' | 'warning';

interface ConnectionAlertProps {
  tone: AlertTone;
  title: string;
  message: string;
  detail?: string;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  className?: string;
}

export function ConnectionAlert({
  tone,
  title,
  message,
  detail,
  onRetry,
  retrying = false,
  retryLabel = 'Retry now',
  className,
}: ConnectionAlertProps) {
  const toneClasses: Record<AlertTone, string> = {
    loading: 'border-sv2-yellow/40 border-l-sv2-yellow bg-sv2-yellow/8',
    error: 'border-sv2-red/40 border-l-sv2-red bg-sv2-red/8',
    warning: 'border-primary/40 border-l-primary bg-primary/8',
  };

  const Icon = tone === 'loading' ? Loader2 : tone === 'error' ? WifiOff : AlertTriangle;

  return (
    <div
      role={tone === 'loading' ? 'status' : 'alert'}
      aria-live={tone === 'loading' ? 'polite' : 'assertive'}
      aria-atomic="true"
      className={cn('rounded-lg border border-l-[3px] px-4 py-3', toneClasses[tone], className)}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className={cn(
            'mt-0.5 rounded-md border p-1.5',
            tone === 'loading' && 'border-sv2-yellow/30 bg-sv2-yellow/15 text-sv2-yellow',
            tone === 'error' && 'border-sv2-red/30 bg-sv2-red/15 text-sv2-red',
            tone === 'warning' && 'border-primary/30 bg-primary/15 text-primary'
          )}>
            <Icon className={cn('h-4 w-4', tone === 'loading' && 'animate-spin')} />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-sm text-foreground/90">{message}</p>
            {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
          </div>
        </div>

        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying} className="md:ml-4">
            {retrying ? 'Retrying...' : retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
