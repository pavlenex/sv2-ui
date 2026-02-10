import { useCallback, useMemo, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConnectionAlert } from '@/components/data/ConnectionAlert';
import { StatCard } from '@/components/data/StatCard';
import { UpstreamChannelTable } from '@/components/data/UpstreamChannelTable';
import { usePoolData } from '@/hooks/usePoolData';
import { formatHashrate, formatDifficulty, formatUptime } from '@/lib/utils';
import {
  CheckCircle2,
  Activity,
  Network,
  Clock,
  Server,
  ArrowUpRight,
  Layers3,
  RefreshCw,
} from 'lucide-react';
import { useUiConfig } from '@/hooks/useUiConfig';
import { cn } from '@/lib/utils';

export function PoolStats() {
  const [manualRetrying, setManualRetrying] = useState(false);
  const {
    modeLabel,
    isJdMode,
    global: poolGlobal,
    channels: poolChannels,
    isLoading,
    isFetching,
    isError,
    refetchAll,
  } = usePoolData();
  const { config } = useUiConfig();

  const stats = useMemo(() => {
    if (!poolChannels) {
      return {
        sharesAccepted: 0,
        sharesSubmitted: 0,
        shareWorkSum: 0,
        bestDiff: 0,
        extendedCount: 0,
        standardCount: 0,
      };
    }

    const extAccepted = poolChannels.extended_channels.reduce((sum, ch) => sum + ch.shares_accepted, 0);
    const stdAccepted = poolChannels.standard_channels.reduce((sum, ch) => sum + ch.shares_accepted, 0);

    const extLatest = poolChannels.extended_channels.length
      ? Math.max(...poolChannels.extended_channels.map((ch) => ch.last_share_sequence_number))
      : 0;
    const stdLatest = poolChannels.standard_channels.length
      ? Math.max(...poolChannels.standard_channels.map((ch) => ch.last_share_sequence_number))
      : 0;
    const sharesSubmitted = Math.max(extLatest, stdLatest);

    const extWork = poolChannels.extended_channels.reduce((sum, ch) => sum + ch.share_work_sum, 0);
    const stdWork = poolChannels.standard_channels.reduce((sum, ch) => sum + ch.share_work_sum, 0);

    const extBest = Math.max(...poolChannels.extended_channels.map((ch) => ch.best_diff), 0);
    const stdBest = Math.max(...poolChannels.standard_channels.map((ch) => ch.best_diff), 0);

    return {
      sharesAccepted: extAccepted + stdAccepted,
      sharesSubmitted,
      shareWorkSum: extWork + stdWork,
      bestDiff: Math.max(extBest, stdBest),
      extendedCount: poolChannels.total_extended,
      standardCount: poolChannels.total_standard,
    };
  }, [poolChannels]);

  const acceptanceRate = stats.sharesSubmitted > 0
    ? ((stats.sharesAccepted / stats.sharesSubmitted) * 100).toFixed(2)
    : '100.00';

  const hasPoolData = Boolean(poolGlobal || poolChannels);
  const canRenderData = !isLoading && (!isError || hasPoolData);
  const showHardErrorState = isError && !hasPoolData;
  const retrying = manualRetrying || isFetching;

  const handleRetry = useCallback(async () => {
    setManualRetrying(true);
    await refetchAll();
    setManualRetrying(false);
  }, [refetchAll]);

  return (
    <Shell appMode="translator" appName={config.appName}>
      <PageHeader
        title="Pool Statistics"
        description={`Upstream telemetry via ${modeLabel}.`}
        actions={
          <Button variant={isError ? 'default' : 'outline'} onClick={handleRetry} disabled={retrying} className="gap-2">
            <RefreshCw className={cn('h-4 w-4 transition-transform', retrying && 'animate-spin')} />
            {isError ? (retrying ? 'Reconnecting...' : 'Reconnect') : (retrying ? 'Refreshing...' : 'Refresh')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="status-pill">Via {modeLabel}</span>
        <span className="status-pill">Mode {isJdMode ? 'Job Declaration' : 'Standard'}</span>
      </div>

      {isLoading && !hasPoolData && (
        <ConnectionAlert
          tone="loading"
          title="Connecting to pool telemetry"
          message={`Attempting to read upstream channel data via ${modeLabel}.`}
          detail="The dashboard retries every 3 seconds and will update as soon as telemetry is reachable."
        />
      )}

      {isError && (
        <ConnectionAlert
          tone={hasPoolData ? 'warning' : 'error'}
          title={hasPoolData ? 'Connection degraded' : 'Disconnected'}
          message={hasPoolData
            ? `Live updates from ${modeLabel} are temporarily unavailable. Pool values on screen may be stale.`
            : `Failed to connect. Ensure the ${modeLabel} monitoring endpoint is reachable.`}
          detail="Check endpoint configuration in Settings, then reconnect."
          onRetry={handleRetry}
          retrying={retrying}
          retryLabel="Reconnect"
        />
      )}

      {isLoading && !hasPoolData && <PoolStatsLoadingState />}

      {showHardErrorState && (
        <div className="loading-surface p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No pool telemetry has been received yet. Verify endpoint settings, confirm monitoring is enabled, then reconnect to retry.
          </p>
          <div className="mt-4">
            <Button variant="outline" onClick={handleRetry} disabled={retrying} className="gap-2">
              <RefreshCw className={cn('h-4 w-4 transition-transform', retrying && 'animate-spin')} />
              {retrying ? 'Retrying...' : 'Retry now'}
            </Button>
          </div>
        </div>
      )}

      {canRenderData && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Shares Submitted"
              value={`${stats.sharesAccepted.toLocaleString()} / ${stats.sharesSubmitted.toLocaleString()}`}
              icon={<CheckCircle2 className="h-4 w-4" />}
              subtitle={`${acceptanceRate}% acceptance rate`}
            />

            <StatCard
              title="Best Difficulty"
              value={formatDifficulty(stats.bestDiff)}
              icon={<ArrowUpRight className="h-4 w-4" />}
              subtitle="Highest accepted share"
            />

            <StatCard
              title="Share Work Sum"
              value={stats.shareWorkSum.toLocaleString()}
              icon={<Activity className="h-4 w-4" />}
              subtitle="Cumulative submitted work"
            />

            <StatCard
              title="Pool Channels"
              value={`${stats.extendedCount} ext / ${stats.standardCount} std`}
              icon={<Network className="h-4 w-4" />}
              subtitle={isJdMode ? 'JD Mode Active' : 'Direct Upstream'}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              title="Upstream Hashrate"
              value={formatHashrate(poolGlobal?.server.total_hashrate || 0)}
              icon={<Activity className="h-4 w-4" />}
              subtitle="Reported to pool"
            />

            <StatCard
              title="Uptime"
              value={formatUptime(poolGlobal?.uptime_secs || 0)}
              icon={<Clock className="h-4 w-4" />}
              subtitle="Connection duration"
            />

            <StatCard
              title="Transport"
              value={modeLabel}
              icon={<Server className="h-4 w-4" />}
              subtitle={isJdMode ? 'Job Declaration stack' : 'Translator stack'}
            />
          </div>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers3 className="h-5 w-5 text-primary" />
                Connection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
                <InfoRow label="Data Source" value={modeLabel} />
                <InfoRow label="Protocol" value="Stratum V2" />
                <InfoRow label="Mode" value={isJdMode ? 'Job Declaration' : 'Standard'} />
                <InfoRow label="Extended Channels" value={String(stats.extendedCount)} />
                <InfoRow label="Standard Channels" value={String(stats.standardCount)} />
                <InfoRow label="Status" value={isError ? 'Degraded' : 'Connected'} valueClassName={isError ? 'text-sv2-yellow' : 'text-sv2-green'} />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">Pool Channels</h3>
            </div>
            <UpstreamChannelTable
              extendedChannels={poolChannels?.extended_channels || []}
              standardChannels={poolChannels?.standard_channels || []}
              isLoading={isLoading}
            />
          </div>
        </>
      )}
    </Shell>
  );
}

function PoolStatsLoadingState() {
  return (
    <div className="loading-surface p-5 md:p-6">
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-medium ${valueClassName || 'text-foreground'}`}>{value}</p>
    </div>
  );
}
