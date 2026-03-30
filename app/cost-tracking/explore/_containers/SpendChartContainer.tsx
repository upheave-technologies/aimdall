'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { TimeSeriesPoint } from '@/modules/cost-tracking/domain/types';
import { SpendChartShell } from '../_components/SpendChart';

type SpendChartContainerProps = {
  data: TimeSeriesPoint[];
  groupBy?: string;
};

const SERIES_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildChartData(
  points: TimeSeriesPoint[],
  groupKeys: string[],
): Array<Record<string, string | number>> {
  const dateSet = new Set(points.map((p) => p.date));
  const dates = Array.from(dateSet).sort();

  if (groupKeys.length === 0) {
    const byDate = new Map<string, number>();
    for (const p of points) {
      byDate.set(p.date, (byDate.get(p.date) ?? 0) + parseFloat(p.totalCost || '0'));
    }
    return dates.map((date) => ({ date, total: byDate.get(date) ?? 0 }));
  }

  const byDateAndGroup = new Map<string, Map<string, number>>();
  for (const p of points) {
    if (!byDateAndGroup.has(p.date)) {
      byDateAndGroup.set(p.date, new Map());
    }
    const key = p.groupKey ?? 'unknown';
    const existing = byDateAndGroup.get(p.date)!;
    existing.set(key, (existing.get(key) ?? 0) + parseFloat(p.totalCost || '0'));
  }

  return dates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const key of groupKeys) {
      row[key] = byDateAndGroup.get(date)?.get(key) ?? 0;
    }
    return row;
  });
}

function getGroupLabel(points: TimeSeriesPoint[], key: string): string {
  const point = points.find((p) => p.groupKey === key);
  return point?.groupLabel ?? key;
}

function formatXTick(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatYTick(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function SpendChartContainer({ data, groupBy }: SpendChartContainerProps) {
  const isEmpty = data.length === 0;

  if (isEmpty) {
    return <SpendChartShell isEmpty>{null}</SpendChartShell>;
  }

  const groupKeys = groupBy
    ? Array.from(new Set(data.filter((p) => p.groupKey).map((p) => p.groupKey!)))
    : [];

  const chartData = buildChartData(data, groupKeys);
  const isGrouped = groupKeys.length > 0;

  return (
    <SpendChartShell isEmpty={false}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {isGrouped ? (
              groupKeys.map((key, i) => (
                <linearGradient key={key} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIES_COLORS[i % SERIES_COLORS.length]} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={SERIES_COLORS[i % SERIES_COLORS.length]} stopOpacity={0} />
                </linearGradient>
              ))
            ) : (
              <linearGradient id="grad-0" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            )}
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--foreground)"
            strokeOpacity={0.1}
            vertical={false}
          />

          <XAxis
            dataKey="date"
            tickFormatter={formatXTick}
            tick={{ fill: 'var(--foreground)', opacity: 0.5, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />

          <YAxis
            tickFormatter={formatYTick}
            tick={{ fill: 'var(--foreground)', opacity: 0.5, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--background)',
              border: '1px solid rgba(var(--foreground), 0.1)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(label) => formatXTick(String(label))}
            formatter={(value, name) => [
              `$${Number(value ?? 0).toFixed(4)}`,
              isGrouped ? getGroupLabel(data, String(name)) : 'Total',
            ]}
          />

          {isGrouped && groupKeys.length > 1 && (
            <Legend
              formatter={(value) => getGroupLabel(data, value)}
              wrapperStyle={{ fontSize: '11px', opacity: 0.6 }}
            />
          )}

          {isGrouped ? (
            groupKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={1.5}
                fill={`url(#grad-${i})`}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ))
          ) : (
            <Area
              type="monotone"
              dataKey="total"
              stroke="#3b82f6"
              strokeWidth={1.5}
              fill="url(#grad-0)"
              dot={false}
              activeDot={{ r: 3 }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </SpendChartShell>
  );
}
