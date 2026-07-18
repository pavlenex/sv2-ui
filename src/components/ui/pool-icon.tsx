import { Server } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PoolIconProps {
  logoUrl?: string | null;
  logoOnDark?: boolean;
  monogram?: string | null;
  invertLogoInDarkMode?: boolean;
  logoScale?: number;
  name?: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

export function PoolIcon({
  logoUrl,
  logoOnDark,
  monogram,
  invertLogoInDarkMode,
  logoScale,
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
          className={cn('w-7 h-7 object-contain', invertLogoInDarkMode && 'dark:invert', imageClassName)}
          style={logoScale ? { transform: `scale(${logoScale})` } : undefined}
          onError={e => {
            e.currentTarget.style.display = 'none';
            (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
          }}
        />
      ) : null}
      {monogram ? (
        <span className={cn('text-xs font-semibold leading-none tracking-tight text-black dark:text-white', logoUrl ? 'hidden' : '')}>
          {monogram}
        </span>
      ) : (
        <Server className={cn('w-5 h-5 text-muted-foreground', logoUrl ? 'hidden' : '', fallbackClassName)} />
      )}
    </div>
  );
}
