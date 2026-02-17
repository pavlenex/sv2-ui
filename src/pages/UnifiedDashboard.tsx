import { useState, useMemo, useCallback } from 'react';
import { Search, RefreshCw, Copy, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Shell } from '@/components/layout/Shell';
import { StatCard } from '@/components/data/StatCard';
import { HashrateChart } from '@/components/data/HashrateChart';
import { WorkerTable } from '@/components/data/WorkerTable';
import {
  usePoolData,
  useSv1ClientsData,
  getMiningEndpoint,
} from '@/hooks/usePoolData';
import { useHashrateHistory } from '@/hooks/useHashrateHistory';
import { formatHashrate, formatUptime, formatDifficulty } from '@/lib/utils';
import type { Sv1ClientInfo } from '@/types/api';
import { useUiConfig } from '@/hooks/useUiConfig';

type SortField = 'name' | 'hashrate' | 'id';
type SortDir = 'asc' | 'desc';

/**
 * Unified Dashboard for the SV2 Mining Stack.
 * 
 * This dashboard presents a single, consistent view regardless of deployment:
 * - Non-JD mode: Pool ← Translator ← SV1 Clients
 * - JD mode: Pool ← JDC ← Translator ← SV1 Clients
 * 
 * The "Pool data" (shares, hashrate, channels) always comes from:
 * - JDC's upstream (if JD mode)
 * - Translator's upstream (if non-JD mode)
 * 
 * SV1 Clients always come from Translator.
 */
export function UnifiedDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [copied, setCopied] = useState(false);
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const itemsPerPage = 15;
  const { config } = useUiConfig();
  const miningEndpoint = getMiningEndpoint();
  const queryClient = useQueryClient();

  const copyEndpoint = () => {
    navigator.clipboard.writeText(miningEndpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return field;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['sv1-clients'] });
    await queryClient.invalidateQueries({ queryKey: ['server-channels'] });
    await queryClient.invalidateQueries({ queryKey: ['pool-global'] });
    setIsRefreshing(false);
  }, [queryClient]);

  // Data from JDC or Translator depending on mode
  const {
    isJdMode,
    global: poolGlobal,
    clientChannels,
    serverChannels,
    isLoading: poolLoading,
    isError: poolError
  } = usePoolData();

  // SV1 clients (always from Translator)
  const {
    data: sv1Data,
    isLoading: sv1Loading,
  } = useSv1ClientsData(0, 1000); // Fetch all for client-side filtering

  // SV1 client stats (from Translator)
  const allClients = sv1Data?.items || [];
  const activeClients = allClients.filter((c: Sv1ClientInfo) => c.hashrate !== null);
  const totalClients = sv1Data?.total || 0;
  const activeCount = activeClients.length;

  // Calculate total hashrate from SV1 clients
  const sv1TotalHashrate = useMemo(() => {
    return allClients.reduce((sum, c) => sum + (c.hashrate || 0), 0);
  }, [allClients]);

  // Total hashrate:
  // - JD mode: from SV2 client channels (poolGlobal.clients.total_hashrate)
  // - Translator-only mode: from SV1 clients
  const totalHashrate = isJdMode 
    ? (poolGlobal?.clients.total_hashrate || 0)
    : sv1TotalHashrate;

  const totalClientChannels = isJdMode 
    ? (poolGlobal?.clients.total_channels || 0)
    : activeCount;

  const uptime = poolGlobal?.uptime_secs || 0;

  // Build hashrate history from real-time data
  const hashrateHistory = useHashrateHistory(totalHashrate);

  // Shares data from upstream SERVER channels (shares sent TO the Pool)
  const shareStats = useMemo(() => {
    if (!serverChannels) {
      return { accepted: 0, submitted: 0 };
    }

    // Shares accepted by the Pool
    const extAccepted = serverChannels.extended_channels.reduce((sum, ch) => sum + (ch.shares_accepted || 0), 0);
    const stdAccepted = serverChannels.standard_channels.reduce((sum, ch) => sum + (ch.shares_accepted || 0), 0);

    // Submitted: API may return shares_submitted or last_share_sequence_number
    // Use whichever is available, with safe fallback
    const extSubmitted = serverChannels.extended_channels.reduce(
      (sum, ch) => sum + (ch.shares_submitted ?? ch.last_share_sequence_number ?? 0), 0
    );
    const stdSubmitted = serverChannels.standard_channels.reduce(
      (sum, ch) => sum + (ch.shares_submitted ?? ch.last_share_sequence_number ?? 0), 0
    );
    const submitted = extSubmitted + stdSubmitted;

    return {
      accepted: extAccepted + stdAccepted,
      submitted,
    };
  }, [serverChannels]);

  // Best difficulty:
  // - JD mode: from SV2 client channels
  // - Translator-only mode: not available from SV1 clients API (no best_diff field)
  const bestDiff = useMemo(() => {
    if (!isJdMode) {
      // Translator doesn't expose best_diff for SV1 clients
      // We could potentially get it from server channels instead
      if (!serverChannels) return 0;
      const extBest = Math.max(...serverChannels.extended_channels.map(ch => ch.best_diff), 0);
      const stdBest = Math.max(...serverChannels.standard_channels.map(ch => ch.best_diff), 0);
      return Math.max(extBest, stdBest);
    }
    
    if (!clientChannels) return 0;
    
    const extBest = Math.max(...clientChannels.extended_channels.map(ch => ch.best_diff), 0);
    const stdBest = Math.max(...clientChannels.standard_channels.map(ch => ch.best_diff), 0);
    
    return Math.max(extBest, stdBest);
  }, [isJdMode, clientChannels, serverChannels]);

  // Calculate acceptance rate
  const acceptanceRate = shareStats.submitted > 0 
    ? ((shareStats.accepted / shareStats.submitted) * 100).toFixed(2) 
    : '0.00';

  // Build channel lookup for worker name resolution in sorting
  const channelById = useMemo(() => {
    const map = new Map<number, { user_identity: string }>();
    if (serverChannels) {
      for (const ch of serverChannels.extended_channels) map.set(ch.channel_id, ch);
      for (const ch of serverChannels.standard_channels) map.set(ch.channel_id, ch);
    }
    return map;
  }, [serverChannels]);

  const resolveWorkerName = useCallback((c: Sv1ClientInfo) => {
    const ch = c.channel_id !== null ? channelById.get(c.channel_id) : undefined;
    return c.authorized_worker_name || c.user_identity || ch?.user_identity || '';
  }, [channelById]);

  // Filter and sort clients
  const filteredClients = useMemo(() => {
    let result = allClients;

    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((c: Sv1ClientInfo) => {
        const name = resolveWorkerName(c).toLowerCase();
        return name.includes(term) ||
          c.authorized_worker_name?.toLowerCase().includes(term) ||
          c.user_identity?.toLowerCase().includes(term);
      });
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': {
          const nameA = resolveWorkerName(a).toLowerCase();
          const nameB = resolveWorkerName(b).toLowerCase();
          cmp = nameA.localeCompare(nameB);
          break;
        }
        case 'hashrate':
          cmp = (a.hashrate || 0) - (b.hashrate || 0);
          break;
        case 'id':
        default:
          cmp = a.client_id - b.client_id;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [allClients, searchTerm, sortField, sortDir, resolveWorkerName]);

  // Pagination
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredClients.slice(start, start + itemsPerPage);
  }, [filteredClients, currentPage, itemsPerPage]);

  return (
    <Shell appMode="translator" appName={config.appName}>
      {/* Mining Endpoint */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-foreground/[0.02] px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0 uppercase tracking-wide">Stratum</span>
          <code className="text-sm font-mono text-foreground truncate">{miningEndpoint}</code>
        </div>
        <button
          onClick={copyEndpoint}
          className="ml-3 shrink-0 p-1.5 rounded-md hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors"
          title="Copy mining endpoint"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Hashrate"
          value={formatHashrate(totalHashrate)}
          subtitle={`${totalClientChannels} channel(s)`}
        />
        <StatCard
          title="Workers"
          value={`${activeCount} / ${totalClients}`}
        />
        <StatCard
          title="Shares"
          value={`${shareStats.accepted.toLocaleString()} / ${shareStats.submitted.toLocaleString()}`}
          subtitle={`${acceptanceRate}% accepted`}
        />
        <StatCard
          title="Best Diff"
          value={bestDiff > 0 ? formatDifficulty(bestDiff) : '-'}
        />
      </div>

      {/* Chart */}
      <HashrateChart
        data={hashrateHistory}
        title="Hashrate"
        description={`Uptime: ${formatUptime(uptime)}`}
      />

      {/* Workers */}
      {!poolLoading && !poolError && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs min-w-[160px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search workers..."
                className="w-full pl-9 h-9 bg-transparent border border-border rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary/30"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              {(['id', 'name', 'hashrate'] as SortField[]).map((field) => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={`h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
                    sortField === field
                      ? 'border-primary/30 bg-primary/5 text-primary'
                      : 'border-border hover:bg-foreground/5 text-muted-foreground'
                  }`}
                >
                  {field === 'id' ? '#' : field === 'name' ? 'Name' : 'Hashrate'}
                  {sortField === field && (
                    <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-9 px-3 rounded-lg border border-border hover:bg-foreground/5 transition-colors flex items-center gap-2 text-sm text-muted-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <WorkerTable
            clients={paginatedClients}
            extendedChannels={serverChannels?.extended_channels || []}
            standardChannels={serverChannels?.standard_channels || []}
            isLoading={sv1Loading}
          />

          {filteredClients.length > itemsPerPage && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {paginatedClients.length} of {filteredClients.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-foreground/5 disabled:opacity-40 transition-colors"
                >
                  Prev
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-foreground/5 disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
