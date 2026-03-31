import Link from 'next/link';
import type { UsageSummaryRow, DailySpendRow, AttributionSummaryRow } from '@/modules/cost-tracking/domain/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportSummary = {
  byProvider: UsageSummaryRow[];
  byModel: UsageSummaryRow[];
  byCredential: UsageSummaryRow[];
  bySegment: UsageSummaryRow[];
  dailySpend: DailySpendRow[];
} | null;

export type ReportForecast = {
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

export type ReportAnomalies = {
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

export type ReportBudgets = {
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

export type ReportUnassignedSpend = {
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

export type ReportViewProps = {
  currentMonth: ReportSummary;
  lastMonth: ReportSummary;
  forecast: ReportForecast;
  anomalies: ReportAnomalies;
  budgets: ReportBudgets;
  unassignedSpend: ReportUnassignedSpend;
  attribution: AttributionSummaryRow[];
  reportMonth: string;
  reportYear: number;
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

function formatPercent(n: number, withSign = false): string {
  const prefix = withSign && n > 0 ? '+' : '';
  return `${prefix}${n.toFixed(1)}%`;
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

function SectionDivider() {
  return <div className="border-t border-foreground/8" />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReportView({
  currentMonth,
  lastMonth,
  forecast,
  anomalies,
  budgets,
  unassignedSpend,
  attribution,
  reportMonth,
  reportYear,
}: ReportViewProps) {
  // Compute current month totals
  const currentTotalSpend = currentMonth
    ? currentMonth.byProvider.reduce((sum, r) => sum + parseFloat(r.totalCost), 0)
    : 0;
  const lastTotalSpend = lastMonth
    ? lastMonth.byProvider.reduce((sum, r) => sum + parseFloat(r.totalCost), 0)
    : 0;
  const momChange =
    lastTotalSpend > 0
      ? ((currentTotalSpend - lastTotalSpend) / lastTotalSpend) * 100
      : null;

  // Aggregate current month by provider
  const currentByProvider = currentMonth
    ? [...currentMonth.byProvider
        .reduce<Map<string, { providerId: string; providerDisplayName: string; total: number }>>(
          (acc, row) => {
            const e = acc.get(row.providerId);
            if (e) {
              e.total += parseFloat(row.totalCost);
            } else {
              acc.set(row.providerId, {
                providerId: row.providerId,
                providerDisplayName: row.providerDisplayName,
                total: parseFloat(row.totalCost),
              });
            }
            return acc;
          },
          new Map(),
        )
        .values()]
        .sort((a, b) => b.total - a.total)
    : [];

  // Aggregate last month by provider for MoM comparison
  const lastByProviderMap = lastMonth
    ? lastMonth.byProvider.reduce<Map<string, number>>((acc, row) => {
        acc.set(row.providerId, (acc.get(row.providerId) ?? 0) + parseFloat(row.totalCost));
        return acc;
      }, new Map())
    : new Map<string, number>();

  const anomalyCount = anomalies?.anomalies.length ?? 0;
  const providersCount = currentByProvider.length;

  // Narrative
  const narrative = [
    `In ${reportMonth} ${reportYear}, your organization spent ${formatCurrency(currentTotalSpend)} on LLM APIs across ${providersCount} ${providersCount === 1 ? 'provider' : 'providers'}.`,
    momChange !== null
      ? momChange > 0
        ? ` This represents a ${formatPercent(momChange)} increase from last month.`
        : ` This represents a ${formatPercent(Math.abs(momChange))} decrease from last month.`
      : ' Month-over-month data is not yet available.',
    anomalyCount > 0
      ? ` ${anomalyCount} spending ${anomalyCount === 1 ? 'anomaly was' : 'anomalies were'} detected during the period.`
      : ' No spending anomalies were detected.',
  ].join('');

  // Top attribution rows
  const topAttribution = [...attribution]
    .sort((a, b) => parseFloat(b.totalCost) - parseFloat(a.totalCost))
    .slice(0, 5);

  const generatedDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const unassignedPct =
    unassignedSpend && unassignedSpend.totalSpend > 0
      ? (unassignedSpend.unassignedSpend / unassignedSpend.totalSpend) * 100
      : 0;

  return (
    <main className="mx-auto max-w-4xl px-8 py-8">
      {/* ----------------------------------------------------------------- */}
      {/* Report header                                                      */}
      {/* ----------------------------------------------------------------- */}
      <div className="mb-10 flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-foreground/40">
            AI Financial Report
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {reportMonth} {reportYear}
          </h1>
          <p className="mt-1 text-sm text-foreground/50">Generated {generatedDate}</p>
        </div>
        <button className="rounded-xl border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5">
          Export
        </button>
      </div>

      <div className="space-y-10">
        {/* --------------------------------------------------------------- */}
        {/* Section 1: Executive Summary                                     */}
        {/* --------------------------------------------------------------- */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Executive Summary</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/40">
                Total Spend
              </div>
              <div className="font-mono text-2xl font-bold tabular-nums">
                {formatCurrencyCompact(currentTotalSpend)}
              </div>
            </div>
            <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/40">
                MoM Change
              </div>
              <div
                className={`font-mono text-2xl font-bold tabular-nums ${
                  momChange === null
                    ? 'text-foreground/30'
                    : momChange > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {momChange === null ? '—' : formatPercent(momChange, true)}
              </div>
            </div>
            <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/40">
                Providers
              </div>
              <div className="font-mono text-2xl font-bold tabular-nums">{providersCount}</div>
            </div>
            <div
              className={`rounded-2xl border p-4 ${
                anomalyCount > 0
                  ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20'
                  : 'border-foreground/8 bg-foreground/[0.02]'
              }`}
            >
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/40">
                Anomalies
              </div>
              <div
                className={`font-mono text-2xl font-bold tabular-nums ${anomalyCount > 0 ? 'text-red-700 dark:text-red-400' : ''}`}
              >
                {anomalyCount}
              </div>
            </div>
          </div>

          {/* Narrative */}
          <p className="mt-5 text-sm leading-relaxed text-foreground/70">{narrative}</p>
        </section>

        <SectionDivider />

        {/* --------------------------------------------------------------- */}
        {/* Section 2: Spend by Provider                                     */}
        {/* --------------------------------------------------------------- */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Spend by Provider</h2>
          {currentByProvider.length === 0 ? (
            <p className="text-sm text-foreground/50">No provider data available for this period.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-foreground/8">
              <table className="w-full text-sm">
                <thead className="border-b border-foreground/8 bg-foreground/[0.02]">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Provider</th>
                    <th className="px-5 py-3 text-right font-medium">This Month</th>
                    <th className="px-5 py-3 text-right font-medium">Last Month</th>
                    <th className="px-5 py-3 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/5">
                  {currentByProvider.map((row) => {
                    const prev = lastByProviderMap.get(row.providerId) ?? 0;
                    const change =
                      prev > 0 ? ((row.total - prev) / prev) * 100 : null;
                    return (
                      <tr key={row.providerId} className="hover:bg-foreground/[0.02]">
                        <td className="px-5 py-3 font-medium">{row.providerDisplayName}</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">
                          {formatCurrency(row.total)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-foreground/50">
                          {prev > 0 ? formatCurrency(prev) : '—'}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-medium ${
                            change === null
                              ? 'text-foreground/40'
                              : change > 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {change === null ? '—' : formatPercent(change, true)}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr className="border-t border-foreground/8 bg-foreground/[0.02] font-semibold">
                    <td className="px-5 py-3">Total</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">
                      {formatCurrency(currentTotalSpend)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-foreground/50">
                      {lastTotalSpend > 0 ? formatCurrency(lastTotalSpend) : '—'}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-medium ${
                        momChange === null
                          ? 'text-foreground/40'
                          : momChange > 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {momChange === null ? '—' : formatPercent(momChange, true)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* --------------------------------------------------------------- */}
        {/* Section 3: Budget Performance (conditional)                      */}
        {/* --------------------------------------------------------------- */}
        {budgets && budgets.budgets.length > 0 && (
          <>
            <SectionDivider />
            <section>
              <h2 className="mb-4 text-lg font-semibold">Budget Performance</h2>
              <div className="overflow-hidden rounded-2xl border border-foreground/8">
                <table className="w-full text-sm">
                  <thead className="border-b border-foreground/8 bg-foreground/[0.02]">
                    <tr>
                      <th className="px-5 py-3 text-left font-medium">Budget</th>
                      <th className="px-5 py-3 text-left font-medium">Period</th>
                      <th className="px-5 py-3 text-right font-medium">Spent</th>
                      <th className="px-5 py-3 text-right font-medium">Limit</th>
                      <th className="px-5 py-3 text-right font-medium">Used</th>
                      <th className="px-5 py-3 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-foreground/5">
                    {budgets.budgets.map((budget) => (
                      <tr key={budget.id} className="hover:bg-foreground/[0.02]">
                        <td className="px-5 py-3 font-medium">{budget.name}</td>
                        <td className="px-5 py-3 capitalize text-foreground/60">
                          {budget.periodType}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">
                          {formatCurrencyCompact(budget.currentSpend)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-foreground/60">
                          {formatCurrencyCompact(budget.amount)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-foreground/60">
                          {formatPercent(budget.percentUsed)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <StatusBadge status={budget.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <SectionDivider />

        {/* --------------------------------------------------------------- */}
        {/* Section 4: Anomalies Detected                                    */}
        {/* --------------------------------------------------------------- */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Anomalies Detected</h2>
          {!anomalies || anomalies.anomalies.length === 0 ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              No anomalies detected this period.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-foreground/8">
              <table className="w-full text-sm">
                <thead className="border-b border-foreground/8 bg-foreground/[0.02]">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Date</th>
                    <th className="px-5 py-3 text-left font-medium">Provider</th>
                    <th className="px-5 py-3 text-left font-medium">Type</th>
                    <th className="px-5 py-3 text-right font-medium">Actual</th>
                    <th className="px-5 py-3 text-right font-medium">Baseline</th>
                    <th className="px-5 py-3 text-right font-medium">Ratio</th>
                    <th className="px-5 py-3 text-right font-medium">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/5">
                  {anomalies.anomalies
                    .slice()
                    .sort(
                      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
                    )
                    .map((anomaly, idx) => (
                      <tr
                        key={`${anomaly.date}-${anomaly.providerSlug}-${idx}`}
                        className="hover:bg-foreground/[0.02]"
                      >
                        <td className="px-5 py-3 text-foreground/60">{formatDate(anomaly.date)}</td>
                        <td className="px-5 py-3 font-medium">{anomaly.providerDisplayName}</td>
                        <td className="px-5 py-3 text-foreground/60">
                          {anomaly.type === 'spike' ? '↑ Spike' : '↓ Drop'}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">
                          {formatCurrency(anomaly.actualSpend)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-foreground/50">
                          {formatCurrency(anomaly.baselineSpend)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums font-medium">
                          {anomaly.ratio.toFixed(1)}×
                        </td>
                        <td className="px-5 py-3 text-right">
                          {anomaly.severity === 'critical' ? (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold uppercase text-red-800 dark:bg-red-900/30 dark:text-red-300">
                              Critical
                            </span>
                          ) : anomaly.severity === 'high' ? (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold uppercase text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              High
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs font-semibold uppercase text-foreground/60">
                              Medium
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* --------------------------------------------------------------- */}
        {/* Section 5: Cost Attribution (conditional)                        */}
        {/* --------------------------------------------------------------- */}
        {topAttribution.length > 0 && (
          <>
            <SectionDivider />
            <section>
              <h2 className="mb-4 text-lg font-semibold">Cost Attribution</h2>
              <div className="overflow-hidden rounded-2xl border border-foreground/8">
                <table className="w-full text-sm">
                  <thead className="border-b border-foreground/8 bg-foreground/[0.02]">
                    <tr>
                      <th className="px-5 py-3 text-left font-medium">Group</th>
                      <th className="px-5 py-3 text-left font-medium">Type</th>
                      <th className="px-5 py-3 text-right font-medium">Requests</th>
                      <th className="px-5 py-3 text-right font-medium">Cost (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-foreground/5">
                    {topAttribution.map((row) => (
                      <tr key={row.groupId} className="hover:bg-foreground/[0.02]">
                        <td className="px-5 py-3 font-medium">{row.groupDisplayName}</td>
                        <td className="px-5 py-3 capitalize text-foreground/60">
                          {row.groupType}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-foreground/60">
                          {row.recordCount.toLocaleString('en-US')}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums font-medium">
                          {formatCurrencyCompact(parseFloat(row.totalCost))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* --------------------------------------------------------------- */}
        {/* Section 6: Unattributed Spend (conditional — > 5%)               */}
        {/* --------------------------------------------------------------- */}
        {unassignedSpend && unassignedPct > 5 && (
          <>
            <SectionDivider />
            <section>
              <h2 className="mb-4 text-lg font-semibold text-amber-700 dark:text-amber-400">
                Unattributed Spend
              </h2>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
                <p className="text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                  {formatCurrency(unassignedSpend.unassignedSpend)} ({formatPercent(unassignedPct)}) of spend this period
                  could not be attributed to a team or project.{' '}
                  {unassignedSpend.unassignedCredentials.length > 0 && (
                    <>
                      This includes {unassignedSpend.unassignedCredentials.length} unassigned API{' '}
                      {unassignedSpend.unassignedCredentials.length === 1 ? 'key' : 'keys'}.{' '}
                    </>
                  )}
                  <Link
                    href="/cost-tracking/attributions"
                    className="font-medium underline underline-offset-2"
                  >
                    Assign these API keys
                  </Link>{' '}
                  to improve cost visibility.
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
