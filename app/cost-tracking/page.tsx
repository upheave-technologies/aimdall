import { db } from '@/lib/db';
import { makeUsageRecordRepository } from '@/modules/cost-tracking/infrastructure/repositories/DrizzleUsageRecordRepository';
import { makeGetUsageSummaryUseCase } from '@/modules/cost-tracking/application/getUsageSummaryUseCase';
import type { UsageSummaryRow, DailySpendRow } from '@/modules/cost-tracking/domain/repositories';
import { ProviderCards } from './_components/ProviderCards';
import { UsageSummaryTable } from './_components/UsageSummaryTable';
import { DailySpendTable } from './_components/DailySpendTable';
import { SyncButton } from './_components/SyncButton';

type SearchParams = Promise<{ from?: string; to?: string }>;

// ---------------------------------------------------------------------------
// Adapters — map new UsageSummaryRow shape to legacy component prop types
// ---------------------------------------------------------------------------

type LegacyProviderSummary = {
  provider: string;
  totalCostUsd: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

type LegacySummaryRow = {
  provider: string;
  model: string;
  credentialId: string;
  accountSegment?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedInputTokens: number;
  totalCacheCreationTokens: number;
  totalRequests: number;
  totalCostUsd: string;
};

type LegacyDailySpendRow = {
  date: string;
  provider: string;
  totalCostUsd: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

function toProviderSummary(row: UsageSummaryRow): LegacyProviderSummary {
  return {
    provider: row.providerId,
    totalCostUsd: row.totalCost,
    totalRequests: row.totalRequests,
    totalInputTokens: row.totalInputTokens,
    totalOutputTokens: row.totalOutputTokens,
  };
}

function toSummaryRow(row: UsageSummaryRow): LegacySummaryRow {
  return {
    provider: row.providerId,
    model: row.modelSlug,
    credentialId: row.credentialId ?? row.segmentId ?? '—',
    accountSegment: row.segmentId,
    totalInputTokens: row.totalInputTokens,
    totalOutputTokens: row.totalOutputTokens,
    totalCachedInputTokens: row.totalCachedInputTokens,
    totalCacheCreationTokens: 0, // field removed in v2 schema
    totalRequests: row.totalRequests,
    totalCostUsd: row.totalCost,
  };
}

function toDailySpendRow(row: DailySpendRow): LegacyDailySpendRow {
  return {
    date: row.date,
    provider: row.providerId,
    totalCostUsd: row.totalCost,
    totalRequests: row.totalRequests,
    totalInputTokens: row.totalInputTokens,
    totalOutputTokens: row.totalOutputTokens,
  };
}

export default async function CostTrackingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const repo = makeUsageRecordRepository(db);
  const getUsageSummary = makeGetUsageSummaryUseCase(repo);

  const startDate = params.from ? new Date(params.from) : undefined;
  const endDate = params.to ? new Date(params.to) : undefined;

  const result = await getUsageSummary({ startDate, endDate });

  if (!result.success) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold">LLM Cost Tracker</h1>
        <p className="mt-4 text-red-500">
          Failed to load usage data: {result.error.message}
        </p>
      </main>
    );
  }

  const { byProvider, byModel, byCredential, dailySpend } = result.value;

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">LLM Cost Tracker</h1>
        <SyncButton />
      </div>

      <ProviderCards data={byProvider.map(toProviderSummary)} />

      <DailySpendTable data={dailySpend.map(toDailySpendRow)} />

      <UsageSummaryTable
        title="Cost by Model"
        data={byModel.map(toSummaryRow)}
        groupBy="model"
      />

      <UsageSummaryTable
        title="Cost by Credential"
        data={byCredential.map(toSummaryRow)}
        groupBy="credential"
      />
    </main>
  );
}
