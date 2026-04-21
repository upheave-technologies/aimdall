'use client';

// =============================================================================
// TimeSeriesChartContainer — Slim client proxy for the spend chart
// =============================================================================
// Responsibilities:
//   1. Rebucket timeSeries points into the requested granularity bucket
//   2. Limit grouped series to top 5 + Other
//   3. Map raw groupKeys to display-ready SpendSeriesKey objects
//   4. Wire legend click → onSegmentClick handler
//   5. Pass computed props to SpendAreaChart — no raw JSX here
// =============================================================================

import type { ExplorerDimension, TimeSeriesPoint } from '@/modules/cost-tracking/domain/types';
import { SpendAreaChart, SERIES_COLORS } from '../_components/SpendAreaChart';
import type { SpendSeriesKey } from '../_components/SpendAreaChart';

const MAX_SERIES = 5;

// =============================================================================
// REBUCKETING
// =============================================================================

function rebucket(
  points: TimeSeriesPoint[],
  gran: 'daily' | 'weekly' | 'monthly',
): TimeSeriesPoint[] {
  if (gran === 'daily') return points;

  const buckets = new Map<
    string,
    { totalCost: number; totalRequestCount: number; groupKey?: string; groupLabel?: string }
  >();

  for (const p of points) {
    const date = new Date(p.date + 'T00:00:00Z');
    let bucketKey: string;

    if (gran === 'weekly') {
      const day = date.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day;
      const monday = new Date(date.getTime() + diff * 86400000);
      bucketKey = (p.groupKey ? p.groupKey + '|' : '') + monday.toISOString().slice(0, 10);
    } else {
      bucketKey =
        (p.groupKey ? p.groupKey + '|' : '') + p.date.slice(0, 7) + '-01';
    }

    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.totalCost += parseFloat(p.totalCost || '0');
      existing.totalRequestCount += p.totalRequestCount;
    } else {
      buckets.set(bucketKey, {
        totalCost: parseFloat(p.totalCost || '0'),
        totalRequestCount: p.totalRequestCount,
        groupKey: p.groupKey,
        groupLabel: p.groupLabel,
      });
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => ({
      date: key.includes('|') ? key.split('|')[1] : key,
      groupKey: v.groupKey,
      groupLabel: v.groupLabel,
      totalCost: v.totalCost.toString(),
      totalRequestCount: v.totalRequestCount,
    }));
}

// =============================================================================
// SERIES LIMITING
// =============================================================================

type LimitedSeries = {
  seriesKeys: SpendSeriesKey[];
  chartData: Array<Record<string, string | number>>;
  labelByKey: Map<string, string>;
  hasOther: boolean;
  totalGroupCount: number;
};

function buildGroupedSeries(points: TimeSeriesPoint[]): LimitedSeries {
  const spendByKey = new Map<string, number>();
  const labelByKey = new Map<string, string>();

  for (const p of points) {
    if (p.groupKey) {
      spendByKey.set(
        p.groupKey,
        (spendByKey.get(p.groupKey) ?? 0) + parseFloat(p.totalCost || '0'),
      );
      if (p.groupLabel && !labelByKey.has(p.groupKey)) {
        labelByKey.set(p.groupKey, p.groupLabel);
      }
    }
  }

  const sorted = Array.from(spendByKey.entries()).sort((a, b) => b[1] - a[1]);
  const topKeys = sorted.slice(0, MAX_SERIES).map(([k]) => k);
  const hasOther = sorted.length > MAX_SERIES;
  const totalGroupCount = sorted.length;

  const dates = Array.from(new Set(points.map((p) => p.date))).sort();
  const byDateGroup = new Map<string, Map<string, number>>();

  for (const p of points) {
    if (!byDateGroup.has(p.date)) byDateGroup.set(p.date, new Map());
    const key = topKeys.includes(p.groupKey ?? '') ? (p.groupKey ?? 'unknown') : 'Other';
    const dateMap = byDateGroup.get(p.date)!;
    dateMap.set(key, (dateMap.get(key) ?? 0) + parseFloat(p.totalCost || '0'));
  }

  const allKeyStrings = [...topKeys, ...(hasOther ? ['Other'] : [])];
  const chartData = dates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const k of allKeyStrings) {
      row[k] = byDateGroup.get(date)?.get(k) ?? 0;
    }
    return row;
  });

  const seriesKeys: SpendSeriesKey[] = allKeyStrings.map((k, i) => ({
    key: k,
    displayName: k === 'Other' ? 'Other' : (labelByKey.get(k) ?? k),
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  }));

  return { seriesKeys, chartData, labelByKey, hasOther, totalGroupCount };
}

function buildFlatSeries(points: TimeSeriesPoint[]): LimitedSeries {
  const byDate = new Map<string, number>();
  for (const p of points) {
    byDate.set(p.date, (byDate.get(p.date) ?? 0) + parseFloat(p.totalCost || '0'));
  }
  const chartData = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, cost]) => ({ date, spend: cost }));

  return {
    seriesKeys: [{ key: 'spend', displayName: 'Spend', color: SERIES_COLORS[0] }],
    chartData,
    labelByKey: new Map(),
    hasOther: false,
    totalGroupCount: 0,
  };
}

// =============================================================================
// EXPORTED METRIC HELPER (used by parent to compute zone title annotations)
// =============================================================================

export function getChartMetrics(
  timeSeries: TimeSeriesPoint[],
  granularity: 'daily' | 'weekly' | 'monthly',
  isGrouped: boolean,
): { hasOther: boolean; totalGroupCount: number } {
  if (!isGrouped) return { hasOther: false, totalGroupCount: 0 };
  const bucketed = rebucket(timeSeries, granularity);
  const { hasOther, totalGroupCount } = buildGroupedSeries(bucketed);
  return { hasOther, totalGroupCount };
}

// =============================================================================
// PROPS & CONTAINER
// =============================================================================

type TimeSeriesChartContainerProps = {
  timeSeries: TimeSeriesPoint[];
  groupBy: ExplorerDimension | undefined;
  granularity: 'daily' | 'weekly' | 'monthly';
  onSegmentClick: (groupKey: string, groupLabel: string) => void;
};

export function TimeSeriesChartContainer({
  timeSeries,
  groupBy,
  granularity,
  onSegmentClick,
}: TimeSeriesChartContainerProps) {
  const isGrouped = !!groupBy;
  const bucketed = rebucket(timeSeries, granularity);
  const { seriesKeys, chartData, labelByKey } = isGrouped
    ? buildGroupedSeries(bucketed)
    : buildFlatSeries(bucketed);

  const handleLegendClick = (groupKey: string) => {
    if (!groupBy || groupKey === 'Other') return;
    onSegmentClick(groupKey, labelByKey.get(groupKey) ?? groupKey);
  };

  return (
    <SpendAreaChart
      chartData={chartData}
      seriesKeys={seriesKeys}
      isGrouped={isGrouped}
      granularity={granularity}
      onLegendClick={handleLegendClick}
    />
  );
}
