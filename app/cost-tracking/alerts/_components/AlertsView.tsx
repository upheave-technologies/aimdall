import Link from 'next/link';
import type { UsageSummaryRow, DailySpendRow } from '@/modules/cost-tracking/domain/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpendAnomaly = {
  date: string;
  providerSlug: string;
  providerDisplayName: string;
  actualSpend: number;
  baselineSpend: number;
  ratio: number;
  deviation: number;
  severity: 'critical' | 'high' | 'medium';
  type: 'spike' | 'drop';
};

export type AnomaliesData = {
  anomalies: SpendAnomaly[];
  analysisDays: number;
  providersAnalyzed: number;
  lastUpdated: string;
};

export type SummaryData = {
  byProvider: UsageSummaryRow[];
  byModel: UsageSummaryRow[];
  byCredential: UsageSummaryRow[];
  bySegment: UsageSummaryRow[];
  dailySpend: DailySpendRow[];
} | null;

export type AlertsViewProps = {
  anomalies: AnomaliesData;
  summary: SummaryData;
};

// ---------------------------------------------------------------------------
// Window segments
// ---------------------------------------------------------------------------

const WINDOW_SEGMENTS = [
  { days: 30,  label: '1M', longLabel: '1 month'  },
  { days: 90,  label: '3M', longLabel: '3 months' },
  { days: 180, label: '6M', longLabel: '6 months' },
] as const;

function windowLongLabel(days: number): string {
  return WINDOW_SEGMENTS.find((s) => s.days === days)?.longLabel ?? `${days} days`;
}

function WindowToggle({ analysisDays }: { analysisDays: number }) {
  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-foreground/[0.06] p-0.5">
      {WINDOW_SEGMENTS.map((seg) => {
        const isActive = analysisDays === seg.days;
        return (
          <Link
            key={seg.days}
            href={`?window=${seg.days}`}
            className={
              isActive
                ? 'rounded-lg bg-foreground/10 px-3 py-1 text-xs font-semibold text-foreground/90'
                : 'rounded-lg px-3 py-1 text-xs font-medium text-foreground/40 hover:text-foreground/70 transition-colors'
            }
          >
            {seg.label}
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const severityCardColors = {
  critical: 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20',
  high: 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20',
  medium: 'border-foreground/10 bg-foreground/[0.02]',
};

const severityBadgeColors = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  medium: 'bg-foreground/8 text-foreground/60',
};

function AnomalyCard({ anomaly }: { anomaly: SpendAnomaly }) {
  const baselineBarWidth = anomaly.actualSpend > 0
    ? Math.min(100, (anomaly.baselineSpend / anomaly.actualSpend) * 100)
    : 0;

  return (
    <div className={`rounded-2xl border p-5 ${severityCardColors[anomaly.severity]}`}>
      {/* Top row: severity + type badge + date */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${severityBadgeColors[anomaly.severity]}`}>
            {anomaly.severity}
          </span>
          <span className="text-xs text-foreground/50">
            {anomaly.type === 'spike' ? '↑ Spike' : '↓ Drop'}
          </span>
        </div>
        <span className="text-xs text-foreground/40">{formatDate(anomaly.date)}</span>
      </div>

      {/* Provider + spend detail */}
      <div className="mt-3">
        <span className="font-semibold">{anomaly.providerDisplayName}</span>
        <span className="mx-2 text-foreground/30">·</span>
        <span className="text-sm text-foreground/60">
          Spent {formatCurrency(anomaly.actualSpend)} vs {formatCurrency(anomaly.baselineSpend)} expected
        </span>
      </div>
      <div className="mt-1 text-sm font-medium">
        {anomaly.ratio.toFixed(1)}× the trailing average
      </div>

      {/* Visual comparison bar */}
      <div className="mt-4 space-y-1.5">
        <div className="flex justify-between text-xs text-foreground/40">
          <span>Expected baseline</span>
          <span>Actual spend</span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-foreground/10">
          {/* Actual (full width, muted red) */}
          <div
            className={`absolute inset-0 h-2 rounded-full ${
              anomaly.severity === 'critical'
                ? 'bg-red-400/60'
                : anomaly.severity === 'high'
                  ? 'bg-amber-400/60'
                  : 'bg-foreground/20'
            }`}
          />
          {/* Baseline (proportional, darker) */}
          <div
            className={`absolute left-0 h-2 rounded-full transition-all ${
              anomaly.severity === 'critical'
                ? 'bg-red-600 dark:bg-red-500'
                : anomaly.severity === 'high'
                  ? 'bg-amber-600 dark:bg-amber-500'
                  : 'bg-foreground/50'
            }`}
            style={{ width: `${baselineBarWidth}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-foreground/40">
          <span>{formatCurrency(anomaly.baselineSpend)}</span>
          <span>{formatCurrency(anomaly.actualSpend)}</span>
        </div>
      </div>

      {/* Explorer link */}
      <div className="mt-4">
        <Link
          href={`/cost-tracking/explore?provider=${anomaly.providerSlug}&from=${anomaly.date}&to=${anomaly.date}`}
          className="text-xs font-medium text-foreground/60 underline-offset-2 hover:underline"
        >
          Explore this day
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ analysisDays, providersAnalyzed }: { analysisDays: number; providersAnalyzed: number }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-foreground/10 p-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/30">
        <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold">No anomalies detected</h3>
      <p className="mt-1 text-sm text-foreground/50">
        Your spending patterns look normal. We analyzed the last {windowLongLabel(analysisDays)} of data across {providersAnalyzed} {providersAnalyzed === 1 ? 'provider' : 'providers'}.
      </p>
      <p className="mt-3 text-xs text-foreground/40">
        Anomalies are flagged when daily spend exceeds 1.5x the trailing average.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AlertsView({ anomalies }: AlertsViewProps) {
  const sorted = [...anomalies.anomalies].sort((a, b) => {
    const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateCompare !== 0) return dateCompare;
    const severityOrder = { critical: 0, high: 1, medium: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const uniqueProviders = new Set(anomalies.anomalies.map((a) => a.providerSlug)).size;

  return (
    <main className="mx-auto max-w-4xl px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Spend Alerts</h1>
            {anomalies.anomalies.length > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-300">
                {anomalies.anomalies.length} active
              </span>
            )}
          </div>
          <WindowToggle analysisDays={anomalies.analysisDays} />
        </div>
        <p className="mt-1 text-sm text-foreground/50">
          Statistical anomaly detection across {anomalies.providersAnalyzed}{' '}
          {anomalies.providersAnalyzed === 1 ? 'provider' : 'providers'} · {windowLongLabel(anomalies.analysisDays)} of history
        </p>
      </div>

      {anomalies.anomalies.length === 0 ? (
        <EmptyState analysisDays={anomalies.analysisDays} providersAnalyzed={anomalies.providersAnalyzed} />
      ) : (
        <>
          {/* Summary row */}
          <div className="mb-6 rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-4">
            <p className="text-sm text-foreground/70">
              <span className="font-semibold">{anomalies.anomalies.length}</span>{' '}
              {anomalies.anomalies.length === 1 ? 'anomaly' : 'anomalies'} detected across{' '}
              <span className="font-semibold">{uniqueProviders}</span>{' '}
              {uniqueProviders === 1 ? 'provider' : 'providers'} in the last {windowLongLabel(anomalies.analysisDays)}.
            </p>
          </div>

          {/* Anomaly cards */}
          <div className="space-y-4">
            {sorted.map((anomaly, idx) => (
              <AnomalyCard key={`${anomaly.date}-${anomaly.providerSlug}-${idx}`} anomaly={anomaly} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
