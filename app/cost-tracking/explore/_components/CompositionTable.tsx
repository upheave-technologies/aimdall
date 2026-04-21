// =============================================================================
// CompositionTable — Zone 3: Dimension breakdown table with sparklines
// =============================================================================
// Pure presentational. No hooks. Drill-down affordances, sparklines, pagination.
// =============================================================================

import type {
  ExplorerDimension,
  ExplorerResultRow,
  ExplorerMetricConfig,
  TimeSeriesPoint,
} from '@/modules/cost-tracking/domain/types';
import { Sparkline } from './Sparkline';
import { formatCost, formatNumber, formatMetricValue } from './formatters';

// =============================================================================
// SECTION 1: SPARKLINE DATA EXTRACTION
// =============================================================================

function getSparklineData(timeSeries: TimeSeriesPoint[], groupKey: string): number[] {
  const rowPoints = timeSeries
    .filter((p) =>
      groupKey === '__aggregate__' ? !p.groupKey : p.groupKey === groupKey,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const byDate = new Map<string, number>();
  for (const p of rowPoints) {
    byDate.set(p.date, (byDate.get(p.date) ?? 0) + parseFloat(p.totalCost || '0'));
  }

  const sorted = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.slice(-14).map(([, v]) => v);
}

// =============================================================================
// SECTION 2: PROPS
// =============================================================================

type CompositionTableProps = {
  rows: ExplorerResultRow[];
  timeSeries: TimeSeriesPoint[];
  metrics: ExplorerMetricConfig[];
  groupBy: ExplorerDimension | undefined;
  groupByLabel?: string;
  totalCost: string;
  totalRows: number;
  currentPage: number;
  pageSize: number;
  onDrillDown: (dimension: ExplorerDimension, value: string, label: string) => void;
  onPageChange: (page: number) => void;
};

// =============================================================================
// SECTION 3: COMPONENT
// =============================================================================

export function CompositionTable({
  rows,
  timeSeries,
  metrics,
  groupBy,
  groupByLabel,
  totalCost,
  totalRows,
  currentPage,
  pageSize,
  onDrillDown,
  onPageChange,
}: CompositionTableProps) {
  const totalCostNum = Math.max(0.000001, parseFloat(totalCost));

  // Primary extra metrics: priority=primary, not cost or requests, up to 2
  const primaryExtraMetrics = metrics
    .filter(
      (m) =>
        m.priority === 'primary' &&
        m.key !== 'totalCost' &&
        m.key !== 'totalRequestCount',
    )
    .slice(0, 2);

  const totalPages = Math.ceil(totalRows / pageSize);
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalRows);

  return (
    <div className="rounded-xl border border-foreground/10 overflow-hidden">
      {/* Table header */}
      <div className="flex items-center justify-between border-b border-foreground/10 px-5 py-3.5 bg-foreground/[0.02]">
        <h3 className="text-sm font-medium text-foreground/80">
          {groupBy ? `By ${groupByLabel ?? groupBy}` : 'Overview'}
        </h3>
        <span className="text-xs text-foreground/40">
          {totalRows}{' '}
          {groupBy
            ? `${(groupByLabel ?? 'item').toLowerCase()}${totalRows !== 1 ? 's' : ''}`
            : 'row'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/[0.08] text-left">
              <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-foreground/40">
                {groupByLabel ?? 'Segment'}
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-foreground/40">
                Cost
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-foreground/40">
                Share
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-foreground/40">
                Requests
              </th>
              {primaryExtraMetrics.map((m) => (
                <th
                  key={m.key}
                  className="hidden px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-foreground/40 md:table-cell"
                >
                  {m.label}
                </th>
              ))}
              <th className="hidden px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-foreground/40 lg:table-cell">
                14-day trend
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/[0.06]">
            {rows.map((row) => {
              const rowKey = row.groupKey || '__aggregate__';
              const sparkData = getSparklineData(timeSeries, rowKey);
              const share = parseFloat(row.totalCost) / totalCostNum;
              const sharePercent = Math.min(100, share * 100);
              const isDrillable = !!groupBy;

              return (
                <tr
                  key={rowKey}
                  onClick={
                    isDrillable
                      ? () =>
                          onDrillDown(
                            groupBy,
                            row.groupKey,
                            row.groupLabel || row.groupKey,
                          )
                      : undefined
                  }
                  className={
                    isDrillable
                      ? 'group cursor-pointer transition-colors hover:bg-foreground/[0.04]'
                      : 'transition-colors hover:bg-foreground/[0.02]'
                  }
                >
                  {/* Name */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground/80 transition-colors group-hover:text-foreground">
                        {row.groupLabel || row.groupKey || 'All Usage'}
                      </span>
                      {isDrillable && (
                        <svg
                          className="h-3 w-3 flex-shrink-0 text-foreground/20 transition-colors group-hover:text-foreground/50"
                          viewBox="0 0 12 12"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M4.5 3L7.5 6L4.5 9"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </td>

                  {/* Cost */}
                  <td className="px-5 py-3.5 text-right tabular-nums font-medium text-foreground/80">
                    {formatCost(row.totalCost)}
                  </td>

                  {/* Share */}
                  <td className="px-5 py-3.5 text-right text-foreground/50">
                    <div className="flex items-center justify-end gap-2">
                      <div className="hidden h-1 w-16 overflow-hidden rounded-full bg-foreground/[0.08] sm:block">
                        <div
                          className="h-1 rounded-full bg-foreground/30"
                          style={{ width: `${sharePercent.toFixed(1)}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-xs">
                        {sharePercent.toFixed(1)}%
                      </span>
                    </div>
                  </td>

                  {/* Requests */}
                  <td className="px-5 py-3.5 text-right tabular-nums text-foreground/60">
                    {formatNumber(row.totalRequestCount)}
                  </td>

                  {/* Primary extra metrics */}
                  {primaryExtraMetrics.map((m) => (
                    <td
                      key={m.key}
                      className="hidden px-5 py-3.5 text-right tabular-nums text-foreground/50 md:table-cell"
                    >
                      {formatMetricValue(row, m)}
                    </td>
                  ))}

                  {/* Sparkline */}
                  <td className="hidden px-5 py-3.5 lg:table-cell">
                    <div className="flex justify-end">
                      <Sparkline data={sparkData} width={64} height={22} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalRows > pageSize && (
        <div className="flex items-center justify-between border-t border-foreground/[0.08] bg-foreground/[0.02] px-5 py-3">
          <span className="text-xs text-foreground/40">
            Showing {startItem}–{endItem} of {totalRows}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Previous page"
              className="rounded-md px-2.5 py-1 text-xs text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground/80 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="px-2 text-xs text-foreground/40">{currentPage}</span>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
              className="rounded-md px-2.5 py-1 text-xs text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground/80 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
