// =============================================================================
// SummaryStrip — Zone 1: KPI headline cards
// =============================================================================
// 4 cards in a responsive grid. Pure presentational — no hooks, no state.
// =============================================================================

import { formatCost, formatNumber } from './formatters';

type DominantSegment = {
  label: string;
  share: number;
};

type SummaryStripProps = {
  totalCost: string;
  priorTotalCost: string;
  currency: string;
  dailyRunRate: number;
  dominantSegment: DominantSegment | null;
  anomalyDays: number;
  groupByLabel?: string;
};

function KpiCard({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sublabel: React.ReactNode;
  accent?: 'warning' | 'success';
}) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <div
        className={`mt-1 text-xs ${
          accent === 'warning'
            ? 'text-amber-500'
            : accent === 'success'
              ? 'text-emerald-500'
              : 'text-foreground/40'
        }`}
      >
        {sublabel}
      </div>
    </div>
  );
}

export function SummaryStrip({
  totalCost,
  priorTotalCost,
  currency: _currency,
  dailyRunRate,
  dominantSegment,
  anomalyDays,
  groupByLabel,
}: SummaryStripProps) {
  const current = parseFloat(totalCost);
  const prior = parseFloat(priorTotalCost);
  const hasPrior = prior > 0;
  const priorChange = hasPrior ? ((current - prior) / prior) * 100 : null;
  const isGood = priorChange !== null && priorChange < 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {/* Card 1: Total Spend */}
      <KpiCard
        label="Total Spend"
        value={formatCost(totalCost)}
        sublabel={
          priorChange !== null ? (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                isGood ? 'text-emerald-500' : 'text-red-500'
              }`}
            >
              {isGood ? '↓' : '↑'}
              {Math.abs(priorChange).toFixed(1)}% vs prior period
            </span>
          ) : (
            'No prior period data'
          )
        }
      />

      {/* Card 2: Daily Run Rate */}
      <KpiCard
        label="Daily Run Rate"
        value={`${formatCost(dailyRunRate)}/day`}
        sublabel="avg per day in period"
      />

      {/* Card 3: Top segment (only shown when groupBy is active) */}
      {dominantSegment !== null ? (
        <KpiCard
          label={`Top ${groupByLabel ?? 'Segment'}`}
          value={
            <span
              className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
              title={dominantSegment.label}
            >
              {dominantSegment.label}
            </span>
          }
          sublabel={`${(dominantSegment.share * 100).toFixed(1)}% of total spend`}
        />
      ) : (
        <KpiCard
          label="Top Segment"
          value={
            <span className="text-foreground/30 text-lg font-normal">—</span>
          }
          sublabel="No grouping active"
        />
      )}

      {/* Card 4: Anomaly Days */}
      <KpiCard
        label="Anomaly Days"
        value={
          <span
            className={
              anomalyDays > 0 ? 'text-amber-500' : 'text-foreground/70'
            }
          >
            {formatNumber(anomalyDays)}
          </span>
        }
        sublabel={
          anomalyDays === 0
            ? 'All spend looks normal'
            : `${anomalyDays} unusual day${anomalyDays !== 1 ? 's' : ''} detected`
        }
        accent={anomalyDays > 0 ? 'warning' : 'success'}
      />
    </div>
  );
}
