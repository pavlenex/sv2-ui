import { useMemo } from 'react';
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
  data: { time: string; hashrate: number }[];
  title?: string;
  description?: string;
}

/** Pick a unit and divisor so all Y-axis labels stay in the same unit. */
function getHashrateUnit(max: number): { unit: string; divisor: number } {
  const units = [
    { unit: 'EH/s', divisor: 1e18 },
    { unit: 'PH/s', divisor: 1e15 },
    { unit: 'TH/s', divisor: 1e12 },
    { unit: 'GH/s', divisor: 1e9 },
    { unit: 'MH/s', divisor: 1e6 },
    { unit: 'KH/s', divisor: 1e3 },
    { unit: 'H/s', divisor: 1 },
  ];
  for (const u of units) {
    if (max >= u.divisor) return u;
  }
  return { unit: 'H/s', divisor: 1 };
}

/** Compute nice round tick values (3 ticks) in a single consistent unit. */
function niceYTicks(min: number, max: number): number[] {
  if (max <= 0) return [0];
  const range = max - min;
  if (range === 0) {
    // Flat line — show value ± 10%
    const pad = max * 0.1 || 1;
    return [Math.max(0, max - pad), max, max + pad];
  }
  // 3 evenly spaced ticks
  const step = range / 2;
  return [min, min + step, max];
}

export function HashrateChart({
  data,
  title = 'Hashrate',
  description,
}: HashrateChartProps) {
  const { yMin, yMax, ticks, unit, divisor } = useMemo(() => {
    if (!data || data.length === 0) {
      return { yMin: 0, yMax: 1, ticks: [0], unit: 'H/s', divisor: 1 };
    }

    const hashrates = data.map(d => d.hashrate);
    const rawMin = Math.min(...hashrates);
    const rawMax = Math.max(...hashrates);
    const range = rawMax - rawMin;
    const padding = range > 0 ? range * 0.15 : rawMax * 0.15;
    const yMin = Math.max(0, rawMin - padding);
    const yMax = rawMax + padding || 1;
    const { unit, divisor } = getHashrateUnit(yMax);
    const ticks = niceYTicks(yMin, yMax);

    return { yMin, yMax, ticks, unit, divisor };
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground mb-3">{title}</p>
        <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
          Collecting data...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs text-muted-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorHashrate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="hsl(var(--border))"
              opacity={0.3}
            />
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              dy={8}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              domain={[yMin, yMax]}
              ticks={ticks}
              tickFormatter={(value) => `${(value / divisor).toFixed(1)} ${unit}`}
              width={72}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                borderRadius: '8px',
                border: '1px solid hsl(var(--border))',
                fontSize: '12px',
              }}
              itemStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(value: number) => [formatHashrate(value), 'Hashrate']}
              labelFormatter={(label) => label}
            />
            <Area
              type="monotone"
              dataKey="hashrate"
              stroke="hsl(var(--chart-1))"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#colorHashrate)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
