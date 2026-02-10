import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatHashrate, truncateHex } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Sv1ClientInfo } from '@/types/api';

interface Sv1ClientTableProps {
  clients: Sv1ClientInfo[];
  isLoading?: boolean;
}

export function Sv1ClientTable({ clients, isLoading }: Sv1ClientTableProps) {
  if (isLoading) {
    return (
      <div className="data-table-shell">
        <div className="p-10 text-center text-muted-foreground">Loading SV1 workers...</div>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="data-table-shell">
        <div className="p-10 text-center text-muted-foreground">No SV1 workers connected.</div>
      </div>
    );
  }

  return (
    <div className="data-table-shell">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[80px]">ID</TableHead>
            <TableHead>Worker</TableHead>
            <TableHead>User</TableHead>
            <TableHead className="text-right">Hashrate</TableHead>
            <TableHead className="hidden md:table-cell">Channel</TableHead>
            <TableHead className="hidden lg:table-cell">Extranonce1</TableHead>
            <TableHead className="hidden xl:table-cell">Version Rolling</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.client_id} className="group">
              <TableCell className="font-mono text-xs text-muted-foreground">{client.client_id}</TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full',
                      client.hashrate !== null ? 'bg-sv2-green' : 'bg-muted-foreground'
                    )}
                  />
                  <span className="truncate">{client.authorized_worker_name || '-'}</span>
                </div>
              </TableCell>
              <TableCell className="max-w-[220px] truncate text-muted-foreground">{client.user_identity || '-'}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {client.hashrate !== null ? formatHashrate(client.hashrate) : '-'}
              </TableCell>
              <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                {client.channel_id !== null ? client.channel_id : '-'}
              </TableCell>
              <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                {truncateHex(client.extranonce1_hex, 4)}
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                {client.version_rolling_mask ? (
                  <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {truncateHex(client.version_rolling_mask, 4)}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    Disabled
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
