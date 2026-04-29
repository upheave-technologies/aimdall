import { detectSpendAnomalies } from '@/modules/cost-tracking/application/detectSpendAnomaliesUseCase';
import { getUsageSummary } from '@/modules/cost-tracking/application/getUsageSummaryUseCase';
import { resolveSelectedPeriod } from '@/modules/cost-tracking/domain/types';
import { AlertsView } from './_components/AlertsView';
import type { AnomaliesData, SummaryData } from './_components/AlertsView';

// The `window` param is retired per RFC Section 3.1 and Section 3.9.
// Stale `window=` URLs are ignored — first navigation lands on the 30d default.
// The layout-mounted PeriodSelector now owns period selection for all cost-tracking pages.
type SearchParams = Promise<{ period?: string; from?: string; to?: string }>;


export default async function AlertsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  // Resolve the unified period from URL params (`period`, `from`, `to`).
  // Any stale `window` param in the URL is absent from SearchParams and
  // therefore silently ignored — no error, no translation.
  const { startDate, endDate } = resolveSelectedPeriod({
    period: params.period,
    from: params.from,
    to: params.to,
  });

  const [anomaliesResult, summaryResult] = await Promise.all([
    // startDate/endDate filter the displayed list; detection window is system-controlled.
    detectSpendAnomalies({ startDate, endDate }),
    getUsageSummary({ startDate, endDate }),
  ]);

  if (!anomaliesResult.success) {
    throw new Error(anomaliesResult.error.message);
  }

  const anomalies: AnomaliesData = anomaliesResult.value;
  const summary: SummaryData = summaryResult.success ? summaryResult.value : null;

  return <AlertsView anomalies={anomalies} summary={summary} />;
}
