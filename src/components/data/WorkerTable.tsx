import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatHashrate, formatDifficulty, truncateHex, formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Sv1ClientInfo, ServerExtendedChannelInfo, ServerStandardChannelInfo } from '@/types/api';

type ServerChannel = ServerExtendedChannelInfo | ServerStandardChannelInfo;

interface WorkerTableProps {
  clients: Sv1ClientInfo[];
  extendedChannels: ServerExtendedChannelInfo[];
  standardChannels: ServerStandardChannelInfo[];
  isLoading?: boolean;
}

/**
 * Unified worker table.
 *
 * Joins SV1 clients (actual hashrate from tProxy) with upstream server channels
 * (nominal hashrate, shares, best diff reported to pool) via channel_id.
 * Worker names are resolved from the upstream channel's user_identity since
 * SV1 clients may have empty authorized_worker_name / user_identity fields.
 */
export function WorkerTable({
  clients,
  extendedChannels,
  standardChannels,
  isLoading,
}: WorkerTableProps) {
  if (isLoading) {
    return (
      <div className="glass-table">
        <div className="p-8 text-center text-muted-foreground">
          Loading workers...
        </div>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="glass-table">
        <div className="p-8 text-center text-muted-foreground">
          No workers connected
        </div>
      </div>
    );
  }

  // Build lookup: channel_id → upstream channel (pool-side data)
  const channelById = new Map<number, ServerChannel>();
  for (const ch of extendedChannels) {
    channelById.set(ch.channel_id, ch);
  }
  for (const ch of standardChannels) {
    channelById.set(ch.channel_id, ch);
  }

  return (
    <div className="glass-table">
      <Table>
        <TableHeader className="bg-foreground/[0.02]">
          <TableRow className="hover:bg-transparent border-border/40">
            <TableHead>Worker</TableHead>
            <TableHead className="text-right">Actual</TableHead>
            <TableHead className="text-right">Nominal</TableHead>
            <TableHead className="text-right hidden sm:table-cell">Shares</TableHead>
            <TableHead className="text-right hidden md:table-cell">Best Diff</TableHead>
            <TableHead className="hidden lg:table-cell">Target</TableHead>
            <TableHead className="hidden xl:table-cell">Version Rolling</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => {
            const channel = client.channel_id !== null
              ? channelById.get(client.channel_id)
              : undefined;
            const isActive = client.hashrate !== null;

            // Resolve worker name: SV1 client fields first, then upstream channel identity
            const workerName =
              client.authorized_worker_name ||
              client.user_identity ||
              channel?.user_identity ||
              '-';

            return (
              <TableRow key={client.client_id} className="hover:bg-foreground/[0.03] border-border/20">
                <TableCell className="font-medium">
                  <div className="flex items-center space-x-2">
                    <div className={cn(
                      "h-2 w-2 rounded-full shadow-sm shrink-0",
                      isActive ? "bg-cyan-400 shadow-[0_0_6px_hsl(187,92%,60%,0.3)]" : "bg-muted-foreground"
                    )} />
                    <span className="truncate">{workerName}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {isActive ? formatHashrate(client.hashrate!) : '-'}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {channel ? formatHashrate(channel.nominal_hashrate) : '-'}
                </TableCell>
                <TableCell className="text-right font-mono hidden sm:table-cell">
                  {channel
                    ? formatNumber(channel.shares_accepted)
                    : '-'}
                </TableCell>
                <TableCell className="text-right font-mono hidden md:table-cell text-muted-foreground">
                  {channel && channel.best_diff > 0 ? formatDifficulty(channel.best_diff) : '-'}
                </TableCell>
                <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
                  {truncateHex(client.target_hex, 8)}
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  {client.version_rolling_mask ? (
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                      {truncateHex(client.version_rolling_mask, 4)}
                    </span>
                  ) : (
                    channel && 'version_rolling' in channel && (channel as ServerExtendedChannelInfo).version_rolling ? (
                      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-muted text-muted-foreground border-border">
                        No
                      </span>
                    )
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
