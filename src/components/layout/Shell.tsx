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
import { useUiConfig } from '@/hooks/useUiConfig';
import type { AppMode, AppFeatures } from '@/types/api';
import { getAppFeatures } from '@/types/api';

/**
 * Short absolute time (e.g. "11:20:15 AM").
 * For a real-time dashboard polling every few seconds, a ticking clock
 */
function formatShortTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Theme hook
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
}

/**
 * Main application shell with sidebar navigation.
 * Matches Replit UI styling - sidebar-glass effect.
 */
export function Shell({
  children,
  appMode = 'translator',
}: ShellProps) {
  const [location] = useLocation();
  const { isDark, toggle } = useTheme();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { config } = useUiConfig();
  
  // Check health of both services
  const { data: translatorOk, isLoading: translatorLoading, dataUpdatedAt: translatorUpdatedAt } = useTranslatorHealth();
  const { data: jdcOk, isLoading: jdcLoading, dataUpdatedAt: jdcUpdatedAt } = useJdcHealth();
  
  // Consider connected if at least one service is available
  const isLoading = translatorLoading && jdcLoading;
  const isSuccess = Boolean(translatorOk || jdcOk);
  const isError = !isLoading && !isSuccess;
  
  // Last updated timestamp from whichever health check responded most recently
  const lastUpdatedAt = Math.max(translatorUpdatedAt || 0, jdcUpdatedAt || 0);

  const features = getAppFeatures(appMode);

  const navItems = getNavItems(features, appMode);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans transition-colors duration-300">
      {/* Mobile Nav Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 md:relative md:translate-x-0',
          'sidebar-glass',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo Area */}
          <div className="flex h-14 items-center px-6 border-b border-border">
            <Link href="/">
              {config.customLogo ? (
                <img
                  src={config.customLogo}
                  alt="Logo"
                  className="h-[23px] w-auto max-w-[160px] object-contain cursor-pointer"
                />
              ) : (
                <img
                  src="/sv2-logo-240x40.png"
                  srcSet="/sv2-logo-240x40.png 1x, /sv2-logo-480x80.png 2x"
                  alt="Stratum V2"
                  width="140"
                  height="23"
                  className="h-[23px] w-auto cursor-pointer"
                  style={isDark ? undefined : { filter: 'brightness(0.3)' }}
                />
              )}
            </Link>
            <button
              className="md:hidden ml-auto p-1 hover:bg-muted/50 rounded"
              onClick={() => setIsMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      'group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 mb-1 cursor-pointer',
                      isActive
                        ? 'bg-primary/10 text-primary shadow-sm'
                        : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'mr-3 h-4 w-4 transition-colors',
                        isActive
                          ? 'text-primary'
                          : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background relative">
        {/* Header Bar */}
        <div className="flex items-center justify-between h-14 px-6 md:px-8 border-b border-border shrink-0">
          <button
            className="md:hidden p-2 -ml-2 hover:bg-accent rounded-lg transition-colors"
            onClick={() => setIsMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <ConnectionStatus
              state={getConnectionState(isLoading, isError)}
              label={isSuccess ? 'Connected' : undefined}
            />
            {lastUpdatedAt > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">
                Last check {formatShortTime(lastUpdatedAt)}
              </span>
            )}
          </div>
          <div className="ml-4">
          <button
            onClick={toggle}
            className="relative w-10 h-10 flex items-center justify-center rounded-full border border-border bg-background/50 cursor-pointer text-foreground opacity-70 hover:opacity-100 transition-all duration-200"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          </div>
        </div>

        {/* Connection Error Banner */}
        {isError && (
          <div className="px-6 md:px-8 py-3 bg-red-500/10 border-b border-red-500/30 text-sm text-red-400 text-center shrink-0">
            Failed to connect. Make sure Translator (and optionally JDC) are running.
          </div>
        )}
        {isLoading && (
          <div className="px-6 md:px-8 py-3 bg-muted/50 border-b border-border text-sm text-muted-foreground text-center shrink-0">
            Connecting to monitoring API...
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-5 md:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {children}
          </div>
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
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: BarChart3, label: 'Pool Stats', href: '/pool-stats' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ];
}
