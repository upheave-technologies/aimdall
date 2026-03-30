import type { ExplorerResultRow, ExplorerMetricConfig } from '@/modules/cost-tracking/domain/types';
import { DIMENSION_LABELS } from './constants';
import { DrillDownRow } from './DrillDownRow';
import { parseColumnsParam, resolveVisibleMetrics, metricsWithData } from './columnUtils';

type ExplorerTableProps = {
  rows: ExplorerResultRow[];
  metrics: ExplorerMetricConfig[];
  groupBy?: string;
  groupByLabel?: string;
  /** Raw `columns` URL param value. Omit to use the default (detailed preset). */
  columns?: string;
  onDrillDown: (groupBy: string, groupKey: string) => void;
};

// ---------------------------------------------------------------------------
// Value formatters
// ---------------------------------------------------------------------------

function formatCost(raw: string | number): string {
  const num = typeof raw === 'string' ? parseFloat(raw) : raw;
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(num);
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatValue(
  row: ExplorerResultRow,
  metric: ExplorerMetricConfig,
): string {
  const key = metric.key;
  const raw = row[key as keyof ExplorerResultRow];

  if (key === 'totalCost') {
    return formatCost(row.totalCost);
  }

  const num = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '0'));

  switch (metric.format) {
    case 'cost':
      return formatCost(num);
    case 'duration':
      return formatDuration(num);
    case 'bytes':
      return formatBytes(num);
    case 'number':
    default:
      return formatNumber(num);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExplorerTable({
  rows,
  metrics,
  groupBy,
  groupByLabel,
  columns,
  onDrillDown,
}: ExplorerTableProps) {
  const visibility = parseColumnsParam(columns);

  const candidateMetrics =
    visibility.preset === 'full' ? metricsWithData(rows, metrics) : metrics;

  const visibleMetrics = resolveVisibleMetrics(candidateMetrics, visibility);
  const groupHeader =
    groupByLabel ?? (groupBy ? (DIMENSION_LABELS[groupBy] ?? groupBy) : 'Dimension');

  return (
    <div className="overflow-x-auto rounded-lg border border-foreground/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-foreground/10 text-left text-xs text-foreground/50">
            <th className="px-4 py-3 font-medium">
              {groupBy ? groupHeader : 'Aggregate'}
            </th>
            {visibleMetrics.map((m) => (
              <th key={m.key} className="px-4 py-3 font-medium text-right">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-foreground/10">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={visibleMetrics.length + 1}
                className="px-4 py-8 text-center text-foreground/40"
              >
                No data
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <DrillDownRow
                key={row.groupKey}
                groupKey={row.groupKey}
                isClickable={!!groupBy}
                onClick={() => groupBy && onDrillDown(groupBy, row.groupKey)}
              >
                <td className="px-4 py-3 font-medium text-foreground/80">
                  {row.groupLabel || row.groupKey || 'All Usage'}
                </td>
                {visibleMetrics.map((m) => (
                  <td key={m.key} className="px-4 py-3 text-right tabular-nums text-foreground/70">
                    {formatValue(row, m)}
                  </td>
                ))}
              </DrillDownRow>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
