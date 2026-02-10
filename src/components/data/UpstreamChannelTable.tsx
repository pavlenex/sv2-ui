import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatHashrate, formatDifficulty, truncateHex, formatNumber } from '@/lib/utils';
import type { ServerExtendedChannelInfo, ServerStandardChannelInfo } from '@/types/api';

interface UpstreamChannelTableProps {
  extendedChannels: ServerExtendedChannelInfo[];
  standardChannels: ServerStandardChannelInfo[];
  isLoading?: boolean;
}

export function UpstreamChannelTable({
  extendedChannels,
  standardChannels,
  isLoading,
}: UpstreamChannelTableProps) {
  if (isLoading) {
    return (
      <div className="data-table-shell">
        <div className="p-10 text-center text-muted-foreground">Loading channels...</div>
      </div>
    );
  }

  const allChannels = [
    ...extendedChannels.map((c) => ({ ...c, type: 'extended' as const })),
    ...standardChannels.map((c) => ({ ...c, type: 'standard' as const })),
  ];

  if (allChannels.length === 0) {
    return (
      <div className="data-table-shell">
        <div className="p-10 text-center text-muted-foreground">No upstream channels.</div>
      </div>
    );
  }

  return (
    <div className="data-table-shell">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[80px]">Channel</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>User Identity</TableHead>
            <TableHead className="text-right">Hashrate</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="hidden text-right md:table-cell">Best Diff</TableHead>
            <TableHead className="hidden lg:table-cell">Target</TableHead>
            <TableHead className="hidden xl:table-cell">Version Rolling</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allChannels.map((channel) => (
            <TableRow key={`${channel.type}-${channel.channel_id}`}>
              <TableCell className="font-mono text-xs">{channel.channel_id}</TableCell>
              <TableCell>
                <span
                  className={
                    channel.type === 'extended'
                      ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'
                      : 'inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                  }
                >
                  {channel.type}
                </span>
              </TableCell>
              <TableCell className="max-w-[260px] truncate text-muted-foreground">{channel.user_identity || '-'}</TableCell>
              <TableCell className="text-right font-mono text-sm font-medium">{formatHashrate(channel.nominal_hashrate)}</TableCell>
              <TableCell className="text-right font-mono">{formatNumber(channel.shares_accepted)}</TableCell>
              <TableCell className="hidden text-right font-mono text-muted-foreground md:table-cell">
                {formatDifficulty(channel.best_diff)}
              </TableCell>
              <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                {truncateHex(channel.target_hex, 8)}
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                {channel.type === 'extended' && 'version_rolling' in channel ? (
                  <span
                    className={
                      (channel as ServerExtendedChannelInfo).version_rolling
                        ? 'inline-flex items-center rounded-full border border-sv2-green/30 bg-sv2-green/10 px-2.5 py-0.5 text-xs font-medium text-sv2-green'
                        : 'inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                    }
                  >
                    {(channel as ServerExtendedChannelInfo).version_rolling ? 'Enabled' : 'Disabled'}
                  </span>
                ) : (
                  '-'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
