// =============================================================================
// Application — Detect Spend Anomalies Use Case
// =============================================================================
// Analyses daily spend time-series per provider to surface statistical
// anomalies — spikes and drops — relative to a trailing 14-day baseline.
//
// Flow:
//   1. Compute lookback start date
//   2. Fetch daily spend for the lookback period
//   3. Group rows by providerSlug
//   4. For each provider, scan the last 7 days against a trailing-14-day baseline
//   5. Classify and score each anomaly
//   6. Sort by date DESC, then severity
//   7. Return result with metadata
//
// Pre-wired export: `detectSpendAnomalies`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IUsageRecordRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type DetectSpendAnomaliesInput = {
  lookbackDays?: number; // default 30
};

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

export type SpendAnomaliesResult = {
  anomalies: SpendAnomaly[];
  analysisDays: number;
  providersAnalyzed: number;
  lastUpdated: string; // ISO date string
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

const SEVERITY_ORDER: Record<SpendAnomaly['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

const computeStats = (
  values: number[],
): { mean: number; stddev: number } => {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, stddev: Math.sqrt(variance) };
};

/**
 * Higher-order function that creates the detectSpendAnomalies use case.
 *
 * @param repo - Usage record repository for daily spend data
 * @returns Async use case function
 */
export const makeDetectSpendAnomaliesUseCase = (repo: IUsageRecordRepository) => {
  return async (
    data: DetectSpendAnomaliesInput,
  ): Promise<Result<SpendAnomaliesResult, CostTrackingError>> => {
    try {
      const lookbackDays = data.lookbackDays ?? 30;
      const now = new Date();

      // Step 1: Compute lookback window (UTC)
      const lookbackStart = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - lookbackDays,
        ),
      );
      const today = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
      );

      // Step 2: Fetch daily spend
      const rows = await repo.findDailySpend(lookbackStart, today);

      // Step 3: Group by provider
      const providerMap = new Map<
        string,
        { displayName: string; timeSeries: Map<string, number> }
      >();

      for (const row of rows) {
        if (!providerMap.has(row.providerSlug)) {
          providerMap.set(row.providerSlug, {
            displayName: row.providerDisplayName,
            timeSeries: new Map(),
          });
        }
        const provider = providerMap.get(row.providerSlug)!;
        provider.timeSeries.set(
          row.date,
          (provider.timeSeries.get(row.date) ?? 0) + parseFloat(row.totalCost),
        );
      }

      // Build the sorted list of all dates in the data window
      const allDates = Array.from(
        new Set(rows.map((r) => r.date)),
      ).sort();

      // Detection window: last 7 days (by date string)
      const todayStr = now.toISOString().slice(0, 10);
      const sevenDaysAgoStr = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6),
      )
        .toISOString()
        .slice(0, 10);

      const detectionDates = allDates.filter(
        (d) => d >= sevenDaysAgoStr && d <= todayStr,
      );

      const anomalies: SpendAnomaly[] = [];

      // Step 4: Analyse each provider
      for (const [providerSlug, { displayName, timeSeries }] of providerMap) {
        const sortedProviderDates = Array.from(timeSeries.keys()).sort();

        for (const date of detectionDates) {
          const dateIdx = sortedProviderDates.indexOf(date);
          if (dateIdx < 0) continue;

          // Trailing 14-day baseline: dates strictly before `date`
          const baselineDates = sortedProviderDates
            .slice(0, dateIdx)
            .slice(-14);

          // Need at least 3 days of history
          if (baselineDates.length < 3) continue;

          const baselineValues = baselineDates.map((d) => timeSeries.get(d) ?? 0);
          const { mean: baseline, stddev } = computeStats(baselineValues);
          const actualSpend = timeSeries.get(date) ?? 0;
          const safeBaseline = Math.max(baseline, 0.01);
          const ratio = actualSpend / safeBaseline;

          // Skip if not anomalous
          const isSpike = ratio > 1.5;
          const isDrop = ratio < 0.5 && actualSpend > 1;

          if (!isSpike && !isDrop) continue;

          // Compute std deviations from mean
          const deviation = stddev > 0 ? Math.abs(actualSpend - baseline) / stddev : 0;

          // Determine severity
          let severity: SpendAnomaly['severity'];
          if (isSpike) {
            severity = ratio > 3.0 ? 'critical' : ratio > 2.0 ? 'high' : 'medium';
          } else {
            severity = ratio < 0.2 ? 'critical' : ratio < 0.33 ? 'high' : 'medium';
          }

          anomalies.push({
            date,
            providerSlug,
            providerDisplayName: displayName,
            actualSpend,
            baselineSpend: baseline,
            ratio,
            deviation,
            severity,
            type: isSpike ? 'spike' : 'drop',
          });
        }
      }

      // Step 5: Sort by date DESC, then severity ASC
      anomalies.sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      });

      return {
        success: true,
        value: {
          anomalies,
          analysisDays: lookbackDays,
          providersAnalyzed: providerMap.size,
          lastUpdated: now.toISOString(),
        },
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to detect spend anomalies', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const usageRecordRepo = makeUsageRecordRepository(db);

export const detectSpendAnomalies = makeDetectSpendAnomaliesUseCase(usageRecordRepo);
