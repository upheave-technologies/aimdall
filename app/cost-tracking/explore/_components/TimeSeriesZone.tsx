// =============================================================================
// TimeSeriesZone — Zone 2: Spend-over-time chart shell
// =============================================================================
// Pure presentational wrapper. The recharts-powered chart content is rendered
// by TimeSeriesChartContainer (a client container) and passed as children.
// =============================================================================

type TimeSeriesZoneProps = {
  hasData: boolean;
  granularity: 'daily' | 'weekly' | 'monthly';
  hasOther: boolean;
  totalGroupCount: number;
  groupByLabel?: string;
  anomalyDays: number;
  onGranularityChange: (gran: 'daily' | 'weekly' | 'monthly') => void;
  children: React.ReactNode;
};

export function TimeSeriesZone({
  hasData,
  granularity,
  hasOther,
  totalGroupCount,
  groupByLabel,
  anomalyDays,
  onGranularityChange,
  children,
}: TimeSeriesZoneProps) {
  const MAX_SERIES = 5;

  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-5">
      {/* Title row */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground/80">Spend over time</h3>
          {hasOther && (
            <p className="mt-0.5 text-xs text-foreground/40">
              Showing top {MAX_SERIES} of {totalGroupCount}{' '}
              {groupByLabel?.toLowerCase() ?? 'groups'}
            </p>
          )}
          {anomalyDays > 0 && (
            <p className="mt-0.5 text-xs text-amber-500/80">
              {anomalyDays} anomalous day{anomalyDays !== 1 ? 's' : ''} in period
            </p>
          )}
        </div>

        {/* Granularity selector */}
        <div className="flex items-center gap-0.5 rounded-lg border border-foreground/10 p-0.5">
          {(['daily', 'weekly', 'monthly'] as const).map((g) => (
            <button
              key={g}
              onClick={() => onGranularityChange(g)}
              aria-pressed={g === granularity}
              className={
                g === granularity
                  ? 'rounded-md px-2.5 py-1 text-xs font-medium bg-foreground/10 text-foreground transition-colors'
                  : 'rounded-md px-2.5 py-1 text-xs text-foreground/40 hover:text-foreground/70 transition-colors'
              }
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-[240px] items-center justify-center">
          <p className="text-sm text-foreground/30">No time series data</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
