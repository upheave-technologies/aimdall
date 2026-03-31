import { detectSpendAnomalies } from '@/modules/cost-tracking/application/detectSpendAnomaliesUseCase';
import { getUsageSummary } from '@/modules/cost-tracking/application/getUsageSummaryUseCase';
import { AlertsView } from './_components/AlertsView';
import type { AnomaliesData, SummaryData } from './_components/AlertsView';

export default async function AlertsPage() {
  const [anomaliesResult, summaryResult] = await Promise.all([
    detectSpendAnomalies({ lookbackDays: 30 }),
    getUsageSummary({}),
  ]);

  if (!anomaliesResult.success) {
    throw new Error(anomaliesResult.error.message);
  }

  const anomalies: AnomaliesData = anomaliesResult.value;
  const summary: SummaryData = summaryResult.success ? summaryResult.value : null;

  return <AlertsView anomalies={anomalies} summary={summary} />;
}
