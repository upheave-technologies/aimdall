import { getUsageSummary } from '@/modules/cost-tracking/application/getUsageSummaryUseCase';
import { getSpendForecast } from '@/modules/cost-tracking/application/getSpendForecastUseCase';
import { getUnassignedSpend } from '@/modules/cost-tracking/application/getUnassignedSpendUseCase';
import { detectSpendAnomalies } from '@/modules/cost-tracking/application/detectSpendAnomaliesUseCase';
import { getBudgetStatus } from '@/modules/cost-tracking/application/getBudgetStatusUseCase';
import { listProviderStatus } from '@/modules/cost-tracking/application/listProviderStatusUseCase';
import { resolveSelectedPeriod } from '@/modules/cost-tracking/domain/types';
import { DashboardView } from './_components/DashboardView';
import type {
  DashboardSummary,
  DashboardForecast,
  DashboardUnassignedSpend,
  DashboardAnomalies,
  DashboardBudgets,
  DashboardProviderSyncItem,
} from './_components/DashboardView';

type SearchParams = Promise<{ period?: string; from?: string; to?: string; connected?: string }>;

const EMPTY_FORECAST: DashboardForecast = null;
const EMPTY_UNASSIGNED: DashboardUnassignedSpend = null;
const EMPTY_ANOMALIES: DashboardAnomalies = null;
const EMPTY_BUDGETS: DashboardBudgets = null;

export default async function CostTrackingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  // Resolve the unified period selector → concrete UTC date range.
  // This is the single authority for URL → dates on the dashboard.
  const resolvedPeriod = resolveSelectedPeriod({
    period: params.period,
    from: params.from,
    to: params.to,
  });
  const { startDate, endDate, label: periodLabel } = resolvedPeriod;

  // MTD hero card — fixed calendar period, always current month.
  // Editorial opt-out: this card never honours the global selector (RFC § 3.7).
  const now = new Date();
  const mtdStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [
    summaryResult,
    mtdSummaryResult,
    forecastResult,
    unassignedResult,
    unassignedAllTimeResult,
    anomaliesResult,
    budgetsResult,
    providerStatusResult,
  ] = await Promise.all([
    getUsageSummary({ startDate, endDate }),
    getUsageSummary({ startDate: mtdStart }), // MTD — editorial opt-out; always current month
    getSpendForecast({}), // editorial opt-out: always current calendar month (RFC § 3.7)
    getUnassignedSpend({ startDate, endDate }),
    getUnassignedSpend({}), // full-history for the >5% warning banner (RFC § 3.7)
    detectSpendAnomalies({ startDate, endDate }), // display filter; detection window is system-controlled (90 days)
    getBudgetStatus({ startDate, endDate }),
    listProviderStatus(),
  ]);

  if (!summaryResult.success) {
    throw new Error(summaryResult.error.message);
  }

  const summary: DashboardSummary = summaryResult.value;

  const mtdSummary: DashboardSummary = mtdSummaryResult.success
    ? mtdSummaryResult.value
    : summaryResult.value;

  const forecast: DashboardForecast = forecastResult.success
    ? forecastResult.value
    : EMPTY_FORECAST;

  const unassignedSpend: DashboardUnassignedSpend = unassignedResult.success
    ? unassignedResult.value
    : EMPTY_UNASSIGNED;

  // Full-history unassigned spend — used exclusively for the >5% banner alert.
  const unassignedSpendAllTime: DashboardUnassignedSpend = unassignedAllTimeResult.success
    ? unassignedAllTimeResult.value
    : EMPTY_UNASSIGNED;

  const anomalies: DashboardAnomalies = anomaliesResult.success
    ? anomaliesResult.value
    : EMPTY_ANOMALIES;

  const budgets: DashboardBudgets = budgetsResult.success
    ? budgetsResult.value
    : EMPTY_BUDGETS;

  // Derive provider sync states — used for three-state empty state logic and client polling.
  const providerSyncItems: DashboardProviderSyncItem[] = providerStatusResult.success
    ? providerStatusResult.value.map((p) => ({
        slug: p.slug,
        displayName: p.displayName,
        connected: p.connected,
        syncState: p.syncState,
        providerId: p.providerId ?? null,
      }))
    : [];

  const hasProviders = providerSyncItems.some((p) => p.connected);
  const anySyncing = providerSyncItems.some((p) => p.syncState === 'in_progress');

  // hasFilter: true when any period param is present in the URL.
  // The layout-level PeriodSelector writes `period` (and optionally `from`/`to`) to the URL.
  const hasFilter = !!(params.period || params.from || params.to);

  return (
    <DashboardView
      summary={summary}
      forecast={forecast}
      unassignedSpend={unassignedSpend}
      unassignedSpendAllTime={unassignedSpendAllTime}
      anomalies={anomalies}
      budgets={budgets}
      mtdSummary={mtdSummary}
      hasFilter={hasFilter}
      filterLabel={hasFilter ? periodLabel : null}
      hasProviders={hasProviders}
      anySyncing={anySyncing}
      providerSyncItems={providerSyncItems}
      connectedSlug={params.connected ?? null}
    />
  );
}
