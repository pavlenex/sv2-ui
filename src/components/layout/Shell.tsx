import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectionStatus, getConnectionState } from '@/components/data/ConnectionStatus';
import { useTranslatorHealth, useJdcHealth } from '@/hooks/usePoolData';
import type { AppMode, AppFeatures } from '@/types/api';
import { getAppFeatures } from '@/types/api';

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return { isDark, toggle: () => setIsDark(!isDark) };
}

interface ShellProps {
  children: React.ReactNode;
  appMode?: AppMode;
  appName?: string;
}

export function Shell({
  children,
  appMode = 'translator',
  appName = 'SV2 Monitor',
}: ShellProps) {
  const [location] = useLocation();
  const { isDark, toggle } = useTheme();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const { data: translatorOk, isLoading: translatorLoading } = useTranslatorHealth();
  const { data: jdcOk, isLoading: jdcLoading } = useJdcHealth();

  const isLoading = translatorLoading && jdcLoading;
  const isSuccess = Boolean(translatorOk || jdcOk);
  const isError = !isLoading && !isSuccess;

  const features = getAppFeatures(appMode);
  const navItems = getNavItems(features, appMode);

  return (
    <div className="app-shell-background flex min-h-screen w-full text-foreground">
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/35 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[17.5rem] transform transition-transform duration-200 md:translate-x-0',
          'sidebar-glass',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col p-4">
          <div className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="brand-logo-wrap">
                  <img
                    src="/assets/sv2-logo-240x40.png"
                    srcSet="/assets/sv2-logo-240x40.png 1x, /assets/sv2-logo-480x80.png 2x"
                    alt="Stratum V2"
                    width={180}
                    height={30}
                    className="brand-logo h-7 w-auto"
                  />
                </div>
                <p className="mt-2 text-sm font-semibold tracking-tight text-foreground text-balance">{appName}</p>
              </div>
              <button
                className="rounded-lg border border-border bg-background p-2 text-muted-foreground transition hover:text-foreground md:hidden"
                onClick={() => setIsMobileOpen(false)}
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <nav className="mt-4 flex-1 space-y-1.5">
            {navItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== '/' && location.startsWith(item.href));

              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      'group flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
                    )}
                    onClick={() => setIsMobileOpen(false)}
                  >
                    <item.icon
                      className={cn(
                        'h-4 w-4 transition-colors',
                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
                      )}
                    />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="space-y-3">
            <div className="glass-card p-3.5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Service Status</p>
              <ConnectionStatus
                state={getConnectionState(isLoading, isError, isSuccess)}
                label={isSuccess ? 'API Connected' : undefined}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={toggle}
                className="ui-theme-toggle"
                aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                <Sun className="sun-icon h-4 w-4" />
                <Moon className="moon-icon h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 md:pl-[17.5rem]">
        <div className="md:hidden px-4 pt-4">
          <div className="glass flex items-center justify-between rounded-xl px-3 py-2">
            <button
              className="rounded-lg border border-border bg-background p-2 text-muted-foreground transition hover:text-foreground"
              onClick={() => setIsMobileOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <img
              src="/assets/sv2-logo-240x40.png"
              srcSet="/assets/sv2-logo-240x40.png 1x, /assets/sv2-logo-480x80.png 2x"
              alt="Stratum V2"
              width={120}
              height={20}
              className="brand-logo h-5 w-auto"
            />
            <div className="w-9" />
          </div>
        </div>

        <div className="px-4 pb-8 pt-4 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-[1320px] space-y-8 animate-fade-in">{children}</div>
        </div>
      </main>
    </div>
  );
}

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
}

function getNavItems(_features: AppFeatures, _appMode: AppMode): NavItem[] {
  return [
    { icon: LayoutDashboard, label: 'Overview', href: '/' },
    { icon: BarChart3, label: 'Pool Stats', href: '/pool-stats' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ];
}
