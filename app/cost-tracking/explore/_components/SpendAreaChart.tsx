// =============================================================================
// SpendAreaChart — Recharts area chart for the TimeSeriesZone
// =============================================================================
// Pure presentational. No hooks. No 'use client' — inherits client boundary
// from the importing container (TimeSeriesChartContainer).
// =============================================================================

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatXAxisTick, formatYAxis, formatCost } from './formatters';

// =============================================================================
// SECTION 1: CONSTANTS
// =============================================================================

export const SERIES_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#64748b', // slate (for Other)
];

// =============================================================================
// SECTION 2: TOOLTIP
// =============================================================================

type TooltipPayloadItem = {
  name: string;
  value: number;
  color: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  granularity,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  granularity: 'daily' | 'weekly' | 'monthly';
}) {
  if (!active || !payload?.length || !label) return null;

  const nonZero = payload.filter((p) => (p.value as number) > 0);
  if (!nonZero.length) return null;

  return (
    <div className="rounded-lg border border-foreground/10 bg-background px-3 py-2.5 shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-foreground/60">
        {formatXAxisTick(label, granularity)}
      </p>
      <div className="space-y-1">
        {nonZero.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="max-w-[140px] truncate text-xs text-foreground/70">
              {p.name}
            </span>
            <span className="ml-auto pl-3 text-xs font-medium tabular-nums text-foreground/90">
              {formatCost(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// SECTION 3: PROPS & COMPONENT
// =============================================================================

export type SpendSeriesKey = {
  key: string;
  displayName: string;
  color: string;
};

export type SpendAreaChartProps = {
  chartData: Array<Record<string, string | number>>;
  seriesKeys: SpendSeriesKey[];
  isGrouped: boolean;
  granularity: 'daily' | 'weekly' | 'monthly';
  onLegendClick: (groupKey: string) => void;
};

export function SpendAreaChart({
  chartData,
  seriesKeys,
  isGrouped,
  granularity,
  onLegendClick,
}: SpendAreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart
        data={chartData}
        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
      >
        <defs>
          {seriesKeys.map((s, i) => (
            <linearGradient
              key={s.key}
              id={`gradient-${i}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="5%" stopColor={s.color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0.01} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="rgba(128,128,128,0.08)"
        />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatXAxisTick(v as string, granularity)}
          tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.4 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatYAxis(v as number)}
          tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.4 }}
          width={52}
        />
        <Tooltip
          content={<ChartTooltip granularity={granularity} />}
          cursor={{ stroke: 'rgba(128,128,128,0.15)', strokeWidth: 1 }}
        />
        {isGrouped && seriesKeys.length > 1 && (
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '12px', paddingTop: '12px', cursor: 'pointer' }}
            onClick={(data) => typeof data.value === 'string' && onLegendClick(data.value)}
          />
        )}
        {seriesKeys.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.displayName}
            stackId={isGrouped ? 'stack' : undefined}
            stroke={s.color}
            strokeWidth={isGrouped ? 1.5 : 2}
            fill={`url(#gradient-${i})`}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
