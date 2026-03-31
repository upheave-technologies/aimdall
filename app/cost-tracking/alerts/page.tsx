import { detectSpendAnomalies } from '@/modules/cost-tracking/application/detectSpendAnomaliesUseCase';
import { getUsageSummary } from '@/modules/cost-tracking/application/getUsageSummaryUseCase';
import { AlertsView } from './_components/AlertsView';
import type { AnomaliesData, SummaryData } from './_components/AlertsView';

type SearchParams = Promise<{ window?: string }>;

const VALID_WINDOWS = [30, 90, 180] as const;
type WindowDays = (typeof VALID_WINDOWS)[number];

function parseWindowDays(raw: string | undefined): WindowDays {
  const parsed = parseInt(raw ?? '', 10);
  return (VALID_WINDOWS as readonly number[]).includes(parsed)
    ? (parsed as WindowDays)
    : 30;
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const windowDays = parseWindowDays(params.window);

  const [anomaliesResult, summaryResult] = await Promise.all([
    detectSpendAnomalies({ windowDays }),
    getUsageSummary({}),
  ]);

  if (!anomaliesResult.success) {
    throw new Error(anomaliesResult.error.message);
  }

  const anomalies: AnomaliesData = anomaliesResult.value;
  const summary: SummaryData = summaryResult.success ? summaryResult.value : null;

  return <AlertsView anomalies={anomalies} summary={summary} />;
}
