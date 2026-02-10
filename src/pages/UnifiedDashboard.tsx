import { lazy, Suspense, useState, useMemo, useCallback } from 'react';
import { Activity, Server, Search, RefreshCw, ArrowUpRight, Clock3 } from 'lucide-react';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConnectionAlert } from '@/components/data/ConnectionAlert';
import { StatCard } from '@/components/data/StatCard';
import { Sv1ClientTable } from '@/components/data/Sv1ClientTable';
import {
  usePoolData,
  useSv1ClientsData,
  useTranslatorHealth,
  useJdcHealth,
} from '@/hooks/usePoolData';
import { useHashrateHistory } from '@/hooks/useHashrateHistory';
import { formatHashrate, formatUptime, formatDifficulty } from '@/lib/utils';
import type { Sv1ClientInfo } from '@/types/api';
import { useUiConfig } from '@/hooks/useUiConfig';
import { cn } from '@/lib/utils';

const HashrateChart = lazy(async () => {
  const module = await import('@/components/data/HashrateChart');
  return { default: module.HashrateChart };
});

export function UnifiedDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [manualRetrying, setManualRetrying] = useState(false);
  const itemsPerPage = 15;
  const { config } = useUiConfig();

  const {
    modeLabel,
    isJdMode,
    global: poolGlobal,
    clientChannels,
    serverChannels,
    isLoading: poolLoading,
    isFetching: poolFetching,
    isError: poolError,
    refetchAll,
  } = usePoolData();

  const {
    data: sv1Data,
    isLoading: sv1Loading,
    isFetching: sv1Fetching,
    refetch: refetchSv1,
  } = useSv1ClientsData(0, 1000);

  const {
    data: translatorOk,
    refetch: refetchTranslatorHealth,
    isFetching: translatorChecking,
  } = useTranslatorHealth();
  const {
    data: jdcOk,
    refetch: refetchJdcHealth,
    isFetching: jdcChecking,
  } = useJdcHealth();

  const allClients = sv1Data?.items || [];
  const activeClients = allClients.filter((c: Sv1ClientInfo) => c.hashrate !== null);
  const totalClients = sv1Data?.total || 0;
  const activeCount = activeClients.length;

  const sv1TotalHashrate = useMemo(
    () => allClients.reduce((sum, c) => sum + (c.hashrate || 0), 0),
    [allClients]
  );

  const totalHashrate = isJdMode
    ? (poolGlobal?.clients.total_hashrate || 0)
    : sv1TotalHashrate;

  const totalClientChannels = isJdMode
    ? (poolGlobal?.clients.total_channels || 0)
    : activeCount;

  const uptime = poolGlobal?.uptime_secs || 0;
  const hashrateHistory = useHashrateHistory(totalHashrate);

  const shareStats = useMemo(() => {
    if (!serverChannels) {
      return { accepted: 0, submitted: 0 };
    }

    const extAccepted = serverChannels.extended_channels.reduce((sum, ch) => sum + ch.shares_accepted, 0);
    const stdAccepted = serverChannels.standard_channels.reduce((sum, ch) => sum + ch.shares_accepted, 0);

    const extLatest = serverChannels.extended_channels.length
      ? Math.max(...serverChannels.extended_channels.map((ch) => ch.last_share_sequence_number))
      : 0;
    const stdLatest = serverChannels.standard_channels.length
      ? Math.max(...serverChannels.standard_channels.map((ch) => ch.last_share_sequence_number))
      : 0;
    const submitted = Math.max(extLatest, stdLatest);

    return {
      accepted: extAccepted + stdAccepted,
      submitted,
    };
  }, [serverChannels]);

  const bestDiff = useMemo(() => {
    if (!isJdMode) {
      if (!serverChannels) return 0;
      const extBest = Math.max(...serverChannels.extended_channels.map((ch) => ch.best_diff), 0);
      const stdBest = Math.max(...serverChannels.standard_channels.map((ch) => ch.best_diff), 0);
      return Math.max(extBest, stdBest);
    }

    if (!clientChannels) return 0;

    const extBest = Math.max(...clientChannels.extended_channels.map((ch) => ch.best_diff), 0);
    const stdBest = Math.max(...clientChannels.standard_channels.map((ch) => ch.best_diff), 0);

    return Math.max(extBest, stdBest);
  }, [isJdMode, clientChannels, serverChannels]);

  const poolChannelCount = (serverChannels?.total_extended || 0) + (serverChannels?.total_standard || 0);

  const clientChannelCount = isJdMode
    ? (clientChannels?.total_extended || 0) + (clientChannels?.total_standard || 0)
    : activeCount;

  const acceptanceRate = shareStats.submitted > 0
    ? ((shareStats.accepted / shareStats.submitted) * 100).toFixed(2)
    : '0.00';

  const hashrateTrend = useMemo(() => {
    if (hashrateHistory.length < 2) return undefined;
    const previous = hashrateHistory[hashrateHistory.length - 2]?.hashrate || 0;
    const current = hashrateHistory[hashrateHistory.length - 1]?.hashrate || 0;
    if (previous <= 0) return undefined;

    const change = ((current - previous) / previous) * 100;
    return {
      value: Number(Math.abs(change).toFixed(2)),
      isPositive: change >= 0,
    };
  }, [hashrateHistory]);

  const filteredClients = useMemo(() => {
    if (!searchTerm) return allClients;
    const term = searchTerm.toLowerCase();
    return allClients.filter((c: Sv1ClientInfo) =>
      c.authorized_worker_name?.toLowerCase().includes(term) ||
      c.user_identity?.toLowerCase().includes(term)
    );
  }, [allClients, searchTerm]);

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredClients.slice(start, start + itemsPerPage);
  }, [filteredClients, currentPage, itemsPerPage]);

  const hasTelemetryData = Boolean(poolGlobal || serverChannels || clientChannels || allClients.length > 0);
  const canRenderData = !poolLoading && (!poolError || hasTelemetryData);
  const showHardErrorState = poolError && !hasTelemetryData;
  const servicesReachable = Boolean(translatorOk || jdcOk);
  const isRetrying = manualRetrying || poolFetching || sv1Fetching || translatorChecking || jdcChecking;

  const handleRefreshAll = useCallback(async () => {
    setManualRetrying(true);
    await Promise.allSettled([
      refetchAll(),
      refetchSv1(),
      refetchTranslatorHealth(),
      refetchJdcHealth(),
    ]);
    setManualRetrying(false);
  }, [refetchAll, refetchSv1, refetchTranslatorHealth, refetchJdcHealth]);

  return (
    <Shell appMode="translator" appName={config.appName}>
      <PageHeader
        title="Mining Operations"
        description="Live Translator and JD Client telemetry."
        actions={
          <Button variant={poolError ? 'default' : 'outline'} onClick={handleRefreshAll} className="gap-2" disabled={isRetrying}>
            <RefreshCw className={cn('h-4 w-4 transition-transform', isRetrying && 'animate-spin')} />
            {poolError ? (isRetrying ? 'Reconnecting...' : 'Reconnect') : (isRetrying ? 'Refreshing...' : 'Refresh')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="status-pill">
          <span className={`h-2 w-2 rounded-full ${translatorOk ? 'bg-sv2-green' : 'bg-sv2-red'}`} />
          Translator
        </span>
        {isJdMode && (
          <span className="status-pill">
            <span className={`h-2 w-2 rounded-full ${jdcOk ? 'bg-sv2-green' : 'bg-sv2-red'}`} />
            JD Client
          </span>
        )}
        <span className="status-pill">Via {modeLabel}</span>
        <span className="status-pill">
          <Clock3 className="h-3.5 w-3.5" />
          Uptime {formatUptime(uptime)}
        </span>
      </div>

      {poolLoading && !hasTelemetryData && (
        <ConnectionAlert
          tone="loading"
          title="Connecting to monitoring services"
          message="Attempting to reach Translator and optional JD Client monitoring endpoints."
          detail="The dashboard retries every 3 seconds and will populate automatically once telemetry is available."
        />
      )}

      {poolError && (
        <ConnectionAlert
          tone={hasTelemetryData ? 'warning' : 'error'}
          title={hasTelemetryData ? 'Connection degraded' : 'Disconnected'}
          message={hasTelemetryData
            ? 'Telemetry updates are temporarily unavailable. The values on screen may be stale.'
            : 'Failed to connect. Ensure Translator (and optional JD Client) monitoring endpoints are reachable.'}
          detail={servicesReachable
            ? 'Health checks are reachable, but telemetry requests failed. Verify endpoint URLs, /api/v1 paths, and proxy/CORS settings in Settings.'
            : 'Neither Translator nor JD Client health endpoint is reachable. Confirm services are running and expected ports are exposed, then reconnect.'}
          onRetry={handleRefreshAll}
          retrying={isRetrying}
          retryLabel="Reconnect"
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Hashrate"
          value={formatHashrate(totalHashrate)}
          icon={<Activity className="h-4 w-4" />}
          subtitle={`${totalClientChannels} active channel(s)`}
          trend={hashrateTrend}
        />

        <StatCard
          title="Workers Online"
          value={`${activeCount} / ${totalClients}`}
          icon={<Server className="h-4 w-4" />}
          subtitle={`${Math.max(totalClients - activeCount, 0)} offline`}
        />

        <StatCard
          title="Shares to Pool"
          value={`${shareStats.accepted.toLocaleString()} / ${shareStats.submitted.toLocaleString()}`}
          icon={<ArrowUpRight className="h-4 w-4" />}
          subtitle={`${acceptanceRate}% accepted across ${poolChannelCount} channel(s)`}
        />

        <StatCard
          title="Best Difficulty"
          value={bestDiff > 0 ? formatDifficulty(bestDiff) : '-'}
          icon={<Activity className="h-4 w-4" />}
          subtitle={`From ${clientChannelCount} client channel(s)`}
        />
      </div>

      <Suspense fallback={<ChartLoadingFallback />}>
        <HashrateChart
          data={hashrateHistory}
          title="Hashrate Trend"
          description="Session samples."
        />
      </Suspense>

      {poolLoading && !hasTelemetryData && <DashboardLoadingState />}

      {showHardErrorState && (
        <div className="loading-surface p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No telemetry has been received yet. Verify endpoint configuration in Settings, then reconnect to retry all monitoring requests.
          </p>
          <div className="mt-4">
            <Button variant="outline" onClick={handleRefreshAll} disabled={isRetrying} className="gap-2">
              <RefreshCw className={cn('h-4 w-4 transition-transform', isRetrying && 'animate-spin')} />
              {isRetrying ? 'Retrying...' : 'Retry now'}
            </Button>
          </div>
        </div>
      )}

      {canRenderData && (
        <>
          <div className="glass-card sticky top-0 z-30 border-border px-4 py-4 md:px-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search workers"
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <span className="text-sm text-muted-foreground">
                Showing {paginatedClients.length} of {filteredClients.length} workers
              </span>
            </div>
          </div>

          <Sv1ClientTable clients={paginatedClients} isLoading={sv1Loading} />

          {filteredClients.length > itemsPerPage && (
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

function DashboardLoadingState() {
  return (
    <div className="loading-surface p-5 md:p-6">
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <Skeleton className="h-[260px] rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}

function ChartLoadingFallback() {
  return (
    <div className="loading-surface p-6">
      <div className="space-y-4">
        <Skeleton className="h-6 w-56 rounded-lg" />
        <Skeleton className="h-[248px] rounded-2xl" />
      </div>
    </div>
  );
}
