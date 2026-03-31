import { getUsageSummary } from '@/modules/cost-tracking/application/getUsageSummaryUseCase';
import { getSpendForecast } from '@/modules/cost-tracking/application/getSpendForecastUseCase';
import { detectSpendAnomalies } from '@/modules/cost-tracking/application/detectSpendAnomaliesUseCase';
import { getBudgetStatus } from '@/modules/cost-tracking/application/getBudgetStatusUseCase';
import { getUnassignedSpend } from '@/modules/cost-tracking/application/getUnassignedSpendUseCase';
import { getAttributionSummary } from '@/modules/cost-tracking/application/getAttributionSummaryUseCase';
import { ReportView } from './_components/ReportView';
import type {
  ReportSummary,
  ReportForecast,
  ReportAnomalies,
  ReportBudgets,
  ReportUnassignedSpend,
} from './_components/ReportView';
import type { AttributionSummaryRow } from '@/modules/cost-tracking/domain/types';

export default async function ReportPage() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999),
  );

  const reportMonth = monthStart.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const reportYear = now.getUTCFullYear();

  const [
    currentMonthResult,
    lastMonthResult,
    forecastResult,
    anomaliesResult,
    budgetsResult,
    unassignedResult,
    attributionResult,
  ] = await Promise.all([
    getUsageSummary({ startDate: monthStart, endDate: monthEnd }),
    getUsageSummary({ startDate: lastMonthStart, endDate: lastMonthEnd }),
    getSpendForecast({}),
    detectSpendAnomalies({ windowDays: 90 }),
    getBudgetStatus({}),
    getUnassignedSpend({}),
    getAttributionSummary({}),
  ]);

  if (!currentMonthResult.success) {
    throw new Error(currentMonthResult.error.message);
  }

  const currentMonth: ReportSummary = currentMonthResult.value;
  const lastMonth: ReportSummary = lastMonthResult.success ? lastMonthResult.value : null;
  const forecast: ReportForecast = forecastResult.success ? forecastResult.value : null;
  const anomalies: ReportAnomalies = anomaliesResult.success ? anomaliesResult.value : null;
  const budgets: ReportBudgets = budgetsResult.success ? budgetsResult.value : null;
  const unassignedSpend: ReportUnassignedSpend = unassignedResult.success
    ? unassignedResult.value
    : null;
  const attribution: AttributionSummaryRow[] = attributionResult.success
    ? attributionResult.value
    : [];

  return (
    <ReportView
      currentMonth={currentMonth}
      lastMonth={lastMonth}
      forecast={forecast}
      anomalies={anomalies}
      budgets={budgets}
      unassignedSpend={unassignedSpend}
      attribution={attribution}
      reportMonth={reportMonth}
      reportYear={reportYear}
    />
  );
}
