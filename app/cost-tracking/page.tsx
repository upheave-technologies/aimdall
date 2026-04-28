import { getUsageSummary } from '@/modules/cost-tracking/application/getUsageSummaryUseCase';
import { getSpendForecast } from '@/modules/cost-tracking/application/getSpendForecastUseCase';
import { getUnassignedSpend } from '@/modules/cost-tracking/application/getUnassignedSpendUseCase';
import { detectSpendAnomalies } from '@/modules/cost-tracking/application/detectSpendAnomaliesUseCase';
import { getBudgetStatus } from '@/modules/cost-tracking/application/getBudgetStatusUseCase';
import { listProviderStatus } from '@/modules/cost-tracking/application/listProviderStatusUseCase';
import { DashboardView } from './_components/DashboardView';
import type {
  DashboardSummary,
  DashboardForecast,
  DashboardUnassignedSpend,
  DashboardAnomalies,
  DashboardBudgets,
  DashboardProviderSyncItem,
} from './_components/DashboardView';

type SearchParams = Promise<{ from?: string; to?: string; connected?: string }>;

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
  const startDate = params.from ? new Date(params.from) : undefined;
  const endDate = params.to ? new Date(params.to) : undefined;

  const now = new Date();
  const mtdStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [summaryResult, mtdSummaryResult, forecastResult, unassignedResult, anomaliesResult, budgetsResult, providerStatusResult] =
    await Promise.all([
      getUsageSummary({ startDate, endDate }),
      getUsageSummary({ startDate: mtdStart }), // MTD — always current month, no filter
      getSpendForecast({}),
      getUnassignedSpend({}),
      detectSpendAnomalies({}),
      getBudgetStatus({}),
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

  return (
    <DashboardView
      summary={summary}
      forecast={forecast}
      unassignedSpend={unassignedSpend}
      anomalies={anomalies}
      budgets={budgets}
      mtdSummary={mtdSummary}
      hasFilter={!!(params.from || params.to)}
      filterLabel={params.from && params.to ? `${params.from} – ${params.to}` : params.from ? `From ${params.from}` : params.to ? `Until ${params.to}` : null}
      hasProviders={hasProviders}
      anySyncing={anySyncing}
      providerSyncItems={providerSyncItems}
      connectedSlug={params.connected ?? null}
    />
  );
}
