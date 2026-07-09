import { Server } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PoolIconProps {
  logoUrl?: string | null;
  logoOnDark?: boolean;
  name?: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

export function PoolIcon({
  logoUrl,
  logoOnDark,
  name,
  className,
  imageClassName,
  fallbackClassName,
}: PoolIconProps) {
  return (
    <div
      className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', className)}
      style={{ background: logoOnDark ? '#27272a' : 'hsl(var(--muted) / 0.5)' }}
      aria-hidden="true"
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name ?? ''}
          className={cn('w-7 h-7 object-contain', imageClassName)}
          onError={e => {
            e.currentTarget.style.display = 'none';
            (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
          }}
        />
      ) : null}
      <Server className={cn('w-5 h-5 text-muted-foreground', logoUrl ? 'hidden' : '', fallbackClassName)} />
    </div>
  );
}
