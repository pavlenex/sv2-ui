import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatHashrate } from '@/lib/utils';

interface HashrateChartProps {
  data: { time: string; timestamp: number; hashrate: number }[];
  title?: string;
  description?: string;
}

function formatAxisTime(timestamp: number, pointCount: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: pointCount <= 20 ? '2-digit' : undefined,
    hour12: false,
  });
}

export function HashrateChart({
  data,
  title = 'Hashrate History',
  description,
}: HashrateChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div className="flex h-[260px] w-full items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/25 text-sm text-muted-foreground">
            Collecting hashrate samples...
          </div>
        </CardContent>
      </Card>
    );
  }

  const hashrates = data.map((d) => d.hashrate);
  const minHashrate = Math.min(...hashrates);
  const maxHashrate = Math.max(...hashrates);
  const padding = (maxHashrate - minHashrate) * 0.12 || maxHashrate * 0.08;
  const yMin = Math.max(0, minHashrate - padding);
  const yMax = maxHashrate + padding;
  const xDomain: [number | string, number | string] = data.length > 1
    ? ['dataMin', 'dataMax']
    : [data[0].timestamp - 2500, data[0].timestamp + 2500];

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="pl-2 md:pl-0">
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 14, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="colorHashrate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.28} />
                  <stop offset="82%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="4 6"
                vertical={false}
                stroke="hsl(var(--border))"
                opacity={0.8}
              />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={xDomain}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                dy={10}
                interval="preserveStartEnd"
                minTickGap={30}
                tickFormatter={(value) => formatAxisTime(Number(value), data.length)}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                domain={[yMin, yMax]}
                tickFormatter={(value) => formatHashrate(value)}
                width={76}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  borderRadius: '0.6rem',
                  border: '1px solid hsl(var(--border))',
                  boxShadow: 'none',
                }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [formatHashrate(value), 'Hashrate']}
                labelFormatter={(label) => `Time ${formatAxisTime(Number(label), 1)}`}
              />
              <Area
                type="monotone"
                dataKey="hashrate"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2.2}
                fillOpacity={1}
                fill="url(#colorHashrate)"
                dot={data.length === 1 ? { r: 3, fill: 'hsl(var(--chart-1))', stroke: 'none' } : false}
                activeDot={{ r: 4.2, strokeWidth: 0, fill: 'hsl(var(--chart-1))' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
