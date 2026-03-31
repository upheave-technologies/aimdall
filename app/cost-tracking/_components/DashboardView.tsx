import Link from 'next/link';
import type { UsageSummaryRow, DailySpendRow } from '@/modules/cost-tracking/domain/types';
import { SyncButtonContainer } from '../_containers/SyncButtonContainer';
import { DateRangeFilterContainer } from '../_containers/DateRangeFilterContainer';

// ---------------------------------------------------------------------------
// Types (local — mirrors what page.tsx passes down)
// ---------------------------------------------------------------------------

export type DashboardSummary = {
  byProvider: UsageSummaryRow[];
  byModel: UsageSummaryRow[];
  byCredential: UsageSummaryRow[];
  bySegment: UsageSummaryRow[];
  dailySpend: DailySpendRow[];
};

export type DashboardForecast = {
  periodStart: string;
  periodEnd: string;
  daysElapsed: number;
  daysTotal: number;
  actualSpendToDate: number;
  projectedMonthlySpend: number;
  projectedLow: number;
  projectedHigh: number;
  dailyRunRate: number;
  trend: 'accelerating' | 'decelerating' | 'stable';
  confidence: number;
  byProvider: Array<{
    providerSlug: string;
    providerDisplayName: string;
    actualSpend: number;
    projectedSpend: number;
    percentage: number;
  }>;
} | null;

export type DashboardUnassignedSpend = {
  totalSpend: number;
  assignedSpend: number;
  unassignedSpend: number;
  assignedPercentage: number;
  unassignedCredentials: Array<{
    credentialId: string;
    credentialLabel: string;
    keyHint: string | null;
    providerDisplayName: string;
    totalCost: number;
    totalRequests: number;
  }>;
} | null;

export type DashboardAnomalies = {
  anomalies: Array<{
    date: string;
    providerSlug: string;
    providerDisplayName: string;
    actualSpend: number;
    baselineSpend: number;
    ratio: number;
    deviation: number;
    severity: 'critical' | 'high' | 'medium';
    type: 'spike' | 'drop';
  }>;
  analysisDays: number;
  providersAnalyzed: number;
  lastUpdated: string;
} | null;

export type DashboardBudgets = {
  budgets: Array<{
    id: string;
    name: string;
    amount: number;
    periodType: string;
    currentSpend: number;
    projectedSpend: number;
    percentUsed: number;
    projectedPercentUsed: number;
    daysElapsed: number;
    daysTotal: number;
    daysRemaining: number;
    status: 'on_track' | 'at_risk' | 'exceeded';
    currency: string;
    alertThresholds: number[];
  }>;
  totalBudgeted: number;
  totalSpent: number;
  overallStatus: 'on_track' | 'at_risk' | 'exceeded';
} | null;

export type DashboardViewProps = {
  summary: DashboardSummary;
  mtdSummary: DashboardSummary;
  hasFilter: boolean;
  filterLabel: string | null;
  forecast: DashboardForecast;
  unassignedSpend: DashboardUnassignedSpend;
  anomalies: DashboardAnomalies;
  budgets: DashboardBudgets;
};

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

function formatCurrencyCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return formatCurrency(n);
}

function formatPercent(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ percent, status }: { percent: number; status: 'on_track' | 'at_risk' | 'exceeded' }) {
  const colorMap = {
    on_track: 'bg-emerald-500',
    at_risk: 'bg-amber-500',
    exceeded: 'bg-red-500',
  };
  return (
    <div className="h-1.5 w-full rounded-full bg-foreground/10">
      <div
        className={`h-1.5 rounded-full transition-all ${colorMap[status]}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: 'on_track' | 'at_risk' | 'exceeded' }) {
  if (status === 'on_track') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
        On Track
      </span>
    );
  }
  if (status === 'at_risk') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        At Risk
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
      Exceeded
    </span>
  );
}

function SeverityBadge({ severity }: { severity: 'critical' | 'high' | 'medium' }) {
  if (severity === 'critical') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold uppercase text-red-800 dark:bg-red-900/30 dark:text-red-300">
        Critical
      </span>
    );
  }
  if (severity === 'high') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold uppercase text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        High
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs font-semibold uppercase text-foreground/60">
      Medium
    </span>
  );
}

// ---------------------------------------------------------------------------
// Empty state (no providers connected)
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground/5">
          <svg className="h-8 w-8 text-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Your AI costs, unified.</h1>
        <p className="mx-auto mt-3 max-w-lg text-base text-foreground/50">
          Connect your LLM providers to start tracking spend across OpenAI, Anthropic, and Google — from a single dashboard.
        </p>
      </div>

      {/* Provider connection cards */}
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-5">
          <div className="mb-3 text-sm font-semibold">OpenAI</div>
          <p className="text-xs text-foreground/50 leading-relaxed">Set the following environment variable in your deployment:</p>
          <code className="mt-2 block rounded-lg bg-foreground/6 px-3 py-2 text-xs font-mono text-foreground/70">
            OPENAI_USAGE_API_KEY
          </code>
        </div>
        <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-5">
          <div className="mb-3 text-sm font-semibold">Anthropic</div>
          <p className="text-xs text-foreground/50 leading-relaxed">Set the following environment variable in your deployment:</p>
          <code className="mt-2 block rounded-lg bg-foreground/6 px-3 py-2 text-xs font-mono text-foreground/70">
            ANTHROPIC_ADMIN_API_KEY
          </code>
        </div>
        <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-5">
          <div className="mb-3 text-sm font-semibold">Google Vertex</div>
          <p className="text-xs text-foreground/50 leading-relaxed">Set the following environment variable in your deployment:</p>
          <code className="mt-2 block rounded-lg bg-foreground/6 px-3 py-2 text-xs font-mono text-foreground/70">
            GOOGLE_CLOUD_PROJECT_ID
          </code>
        </div>
      </div>

      {/* Sync note */}
      <div className="mt-6 rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-5">
        <div className="text-sm font-semibold">After adding environment variables</div>
        <p className="mt-1 text-xs text-foreground/50 leading-relaxed">
          Trigger a data sync by calling <code className="rounded bg-foreground/8 px-1.5 py-0.5 font-mono text-foreground/70">POST /api/cost-tracking/sync</code> or use the Sync button that will appear in this dashboard once providers are detected.
        </p>
      </div>

      {/* Preview cards */}
      <div className="mt-12">
        <div className="mb-4 text-xs font-medium uppercase tracking-widest text-foreground/30">
          What you will see
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {['MTD Spend', 'Monthly Forecast', 'Active Budgets', 'Anomalies'].map((label) => (
            <div key={label} className="rounded-2xl border border-dashed border-foreground/10 p-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/30">{label}</div>
              <div className="h-7 w-20 rounded-md bg-foreground/6" />
              <div className="mt-2 h-3 w-14 rounded bg-foreground/4" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardView({ summary, mtdSummary, hasFilter, filterLabel, forecast, unassignedSpend, anomalies, budgets }: DashboardViewProps) {
  // Compute totals
  const mtdSpend = mtdSummary.byProvider.reduce((sum, row) => sum + parseFloat(row.totalCost), 0);
  const filteredSpend = summary.byProvider.reduce((sum, row) => sum + parseFloat(row.totalCost), 0);
  const hasData = (mtdSummary.byProvider.length > 0 && mtdSpend > 0) || (summary.byProvider.length > 0 && filteredSpend > 0);

  if (!hasData) {
    return <EmptyState />;
  }

  // Current month range label
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRange = `${monthStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

  // Unassigned spend alert threshold
  const unassignedPct =
    unassignedSpend && unassignedSpend.totalSpend > 0
      ? (unassignedSpend.unassignedSpend / unassignedSpend.totalSpend) * 100
      : 0;
  const showUnassignedAlert = unassignedPct > 5;

  // Anomaly count
  const anomalyCount = anomalies?.anomalies.length ?? 0;

  // Top provider for bar width reference
  const maxProviderSpend = Math.max(
    ...summary.byProvider.map((r) => parseFloat(r.totalCost)),
    1,
  );

  // Aggregate providers (sum by providerId since byProvider may have multiple model rows)
  const providerTotals = summary.byProvider.reduce<
    Map<string, { providerDisplayName: string; providerSlug: string; total: number }>
  >((acc, row) => {
    const existing = acc.get(row.providerId);
    if (existing) {
      existing.total += parseFloat(row.totalCost);
    } else {
      acc.set(row.providerId, {
        providerDisplayName: row.providerDisplayName,
        providerSlug: row.providerSlug,
        total: parseFloat(row.totalCost),
      });
    }
    return acc;
  }, new Map());

  const sortedProviders = [...providerTotals.values()].sort((a, b) => b.total - a.total);
  const maxProviderTotal = Math.max(...sortedProviders.map((p) => p.total), 1);

  // Top 5 models
  const modelTotals = summary.byModel.reduce<
    Map<string, { modelSlug: string; providerDisplayName: string; total: number; requests: number }>
  >((acc, row) => {
    const key = `${row.providerSlug}::${row.modelSlug}`;
    const existing = acc.get(key);
    if (existing) {
      existing.total += parseFloat(row.totalCost);
      existing.requests += row.totalRequests;
    } else {
      acc.set(key, {
        modelSlug: row.modelSlug,
        providerDisplayName: row.providerDisplayName,
        total: parseFloat(row.totalCost),
        requests: row.totalRequests,
      });
    }
    return acc;
  }, new Map());
  const topModels = [...modelTotals.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  // Recent anomalies (up to 3, sorted by date desc)
  const recentAnomalies = anomalies
    ? [...anomalies.anomalies]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3)
    : [];

  return (
    <main className="mx-auto max-w-7xl px-8 py-8">
      {/* ----------------------------------------------------------------- */}
      {/* Header                                                             */}
      {/* ----------------------------------------------------------------- */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="mt-0.5 text-sm text-foreground/50">
            {hasFilter ? `${filterLabel} · Filtered` : `${monthRange} · Updated daily`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangeFilterContainer />
          <SyncButtonContainer />
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Hero metrics                                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Card 1 — This Month (fixed, never changes with filter) */}
        <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-5">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-foreground/40">
            This Month
          </div>
          <div className="font-mono text-3xl font-bold tabular-nums tracking-tight">
            {formatCurrencyCompact(mtdSpend)}
          </div>
          <div className="mt-1.5 text-xs text-foreground/50">{monthRange}</div>
        </div>

        {/* Card 2 — Selected Period (filter-responsive) */}
        {(() => {
          const valuesAreClose = !hasFilter && mtdSpend > 0 && Math.abs(filteredSpend - mtdSpend) / mtdSpend <= 0.05;
          return (
            <div
              className={`rounded-2xl border p-5 ${hasFilter ? 'border-foreground/20 bg-foreground/[0.04]' : 'border-foreground/8 bg-foreground/[0.02]'}`}
            >
              <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground/40">
                {hasFilter && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
                )}
                {hasFilter ? 'Selected Period' : 'Last 30 Days'}
              </div>
              <div
                className={`font-mono text-3xl font-bold tabular-nums tracking-tight ${valuesAreClose ? 'text-foreground/60' : ''}`}
              >
                {formatCurrencyCompact(filteredSpend)}
              </div>
              <div className="mt-1.5 text-xs text-foreground/50">
                {hasFilter ? filterLabel : '30-day rolling window'}
              </div>
            </div>
          );
        })()}

        {/* Card 3 — Month Forecast (unchanged) */}
        <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-5">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-foreground/40">
            Month Forecast
          </div>
          {forecast ? (
            <>
              <div className="font-mono text-3xl font-bold tabular-nums tracking-tight">
                {formatCurrencyCompact(forecast.projectedMonthlySpend)}
              </div>
              <div className="mt-1.5 flex items-center gap-1 text-xs text-foreground/50">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${forecast.trend === 'accelerating' ? 'bg-red-400' : forecast.trend === 'decelerating' ? 'bg-emerald-400' : 'bg-foreground/30'}`}
                />
                {forecast.trend === 'accelerating'
                  ? 'Accelerating'
                  : forecast.trend === 'decelerating'
                    ? 'Decelerating'
                    : 'Stable'}
              </div>
            </>
          ) : (
            <>
              <div className="font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground/30">
                N/A
              </div>
              <div className="mt-1.5 text-xs text-foreground/50">No forecast data</div>
            </>
          )}
        </div>

        {/* Card 4 — Anomalies (unchanged) */}
        <div
          className={`rounded-2xl border p-5 ${anomalyCount > 0 ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20' : 'border-foreground/8 bg-foreground/[0.02]'}`}
        >
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-foreground/40">
            Anomalies
          </div>
          <div
            className={`font-mono text-3xl font-bold tabular-nums tracking-tight ${anomalyCount > 0 ? 'text-red-700 dark:text-red-400' : ''}`}
          >
            {anomalyCount}
          </div>
          <div className="mt-1.5 text-xs text-foreground/50">
            {anomalyCount === 0
              ? 'No anomalies detected'
              : anomalyCount === 1
                ? '1 flagged this period'
                : `${anomalyCount} flagged this period`}
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Unassigned spend alert                                             */}
      {/* ----------------------------------------------------------------- */}
      {showUnassignedAlert && unassignedSpend && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 rounded-xl bg-amber-100 p-2 dark:bg-amber-900/30">
              <svg className="h-5 w-5 text-amber-700 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-amber-900 dark:text-amber-100">
                {formatCurrency(unassignedSpend.unassignedSpend)} is unattributed
              </div>
              <div className="mt-0.5 text-sm text-amber-800/70 dark:text-amber-200/60">
                {unassignedSpend.unassignedCredentials.length}{' '}
                {unassignedSpend.unassignedCredentials.length === 1 ? 'API key has' : 'API keys have'} spend but no team or project assignment. This spend is invisible to your finance team.
              </div>
            </div>
            <Link
              href="/cost-tracking/attributions"
              className="flex-shrink-0 rounded-xl bg-amber-900 px-4 py-2 text-sm font-medium text-amber-50 transition-opacity hover:opacity-80 dark:bg-amber-700"
            >
              Assign Now
            </Link>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Provider breakdown + Budget status                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Provider breakdown */}
        <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold">Provider Breakdown</h2>
            <Link
              href="/cost-tracking/explore"
              className="text-xs text-foreground/50 underline-offset-2 hover:underline"
            >
              Explore all
            </Link>
          </div>
          <div className="space-y-4">
            {sortedProviders.map((provider) => {
              const pct = (provider.total / maxProviderTotal) * 100;
              const sharePct = (provider.total / mtdSpend) * 100;
              return (
                <div key={provider.providerSlug}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Link
                      href={`/cost-tracking/explore?provider=${provider.providerSlug}`}
                      className="text-sm font-medium hover:underline underline-offset-2"
                    >
                      {provider.providerDisplayName}
                    </Link>
                    <div className="flex items-center gap-3 text-right">
                      <span className="text-xs text-foreground/40">{sharePct.toFixed(1)}%</span>
                      <span className="font-mono text-sm tabular-nums font-medium">
                        {formatCurrencyCompact(provider.total)}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-foreground/8">
                    <div
                      className="h-1.5 rounded-full bg-foreground/40 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Budget status */}
        <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold">Budget Status</h2>
            <Link
              href="/cost-tracking/budget"
              className="text-xs text-foreground/50 underline-offset-2 hover:underline"
            >
              Manage budgets
            </Link>
          </div>
          {!budgets || budgets.budgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/5">
                <svg className="h-5 w-5 text-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-foreground/50">No budgets configured</p>
              <Link
                href="/cost-tracking/budget"
                className="mt-3 text-xs font-medium text-foreground/60 underline-offset-2 hover:underline"
              >
                Set spending limits
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              {budgets.budgets.slice(0, 3).map((budget) => (
                <div key={budget.id}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium">{budget.name}</span>
                    <StatusBadge status={budget.status} />
                  </div>
                  <ProgressBar percent={budget.percentUsed} status={budget.status} />
                  <div className="mt-1 flex items-center justify-between text-xs text-foreground/50">
                    <span>{formatCurrencyCompact(budget.currentSpend)} spent</span>
                    <span>{formatCurrencyCompact(budget.amount)} limit</span>
                  </div>
                </div>
              ))}
              {budgets.budgets.length > 3 && (
                <p className="text-xs text-foreground/40">
                  +{budgets.budgets.length - 3} more budgets
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Recent anomalies                                                   */}
      {/* ----------------------------------------------------------------- */}
      {recentAnomalies.length > 0 && (
        <div className="mb-6 rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent Anomalies</h2>
            <Link
              href="/cost-tracking/alerts"
              className="text-xs text-foreground/50 underline-offset-2 hover:underline"
            >
              See all alerts
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {recentAnomalies.map((anomaly, idx) => (
              <div
                key={`${anomaly.date}-${anomaly.providerSlug}-${idx}`}
                className={`rounded-xl border p-4 ${
                  anomaly.severity === 'critical'
                    ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20'
                    : anomaly.severity === 'high'
                      ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20'
                      : 'border-foreground/8 bg-background'
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <SeverityBadge severity={anomaly.severity} />
                  <span className="text-xs text-foreground/40">
                    {anomaly.type === 'spike' ? '↑' : '↓'}
                  </span>
                </div>
                <div className="text-sm font-semibold">{anomaly.providerDisplayName}</div>
                <div className="mt-0.5 text-xs text-foreground/50">{formatDate(anomaly.date)}</div>
                <div className="mt-2 text-sm">
                  <span className="font-mono font-medium">{formatCurrencyCompact(anomaly.actualSpend)}</span>
                  <span className="ml-1 text-foreground/50">
                    ({anomaly.ratio.toFixed(1)}× expected)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Top cost drivers                                                   */}
      {/* ----------------------------------------------------------------- */}
      {topModels.length > 0 && (
        <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold">Top Cost Drivers</h2>
            <Link
              href="/cost-tracking/explore?groupBy=model"
              className="text-xs text-foreground/50 underline-offset-2 hover:underline"
            >
              Explore by model
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-foreground/8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/8 bg-foreground/[0.02]">
                  <th className="px-5 py-3 text-left text-xs font-medium text-foreground/50">Model</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-foreground/50">Provider</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-foreground/50">Total Cost</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-foreground/50">Requests</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-foreground/50">Cost / Req</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {topModels.map((model, idx) => {
                  const costPerReq = model.requests > 0 ? model.total / model.requests : 0;
                  return (
                    <tr key={`${model.providerDisplayName}-${model.modelSlug}-${idx}`} className="hover:bg-foreground/[0.02]">
                      <td className="px-5 py-3">
                        <Link
                          href={`/cost-tracking/explore?groupBy=model&model=${encodeURIComponent(model.modelSlug)}`}
                          className="font-mono text-xs font-medium hover:underline underline-offset-2"
                        >
                          {model.modelSlug}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-foreground/60">{model.providerDisplayName}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums font-medium">
                        {formatCurrencyCompact(model.total)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-foreground/60">
                        {model.requests.toLocaleString('en-US')}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-foreground/60">
                        {costPerReq > 0 ? `$${costPerReq.toFixed(4)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
