// =============================================================================
// Application — Detect Spend Anomalies Use Case
// =============================================================================
// Analyses daily spend time-series per provider to surface statistical
// anomalies — spikes and drops — relative to a trailing baseline.
//
// Flow:
//   1. Compute fetch window: windowDays * 2 (extra history for baseline)
//   2. Fetch daily spend for the fetch window
//   3. Group rows by providerSlug
//   4. For each provider, scan all dates within the last windowDays
//      against a trailing windowDays-deep baseline
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
  startDate?: Date; // optional display filter: include anomalies on or after this date
  endDate?: Date;   // optional display filter: include anomalies on or before this date
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

// System-wide statistical parameter — NOT user-tunable.
// 90 days provides a robust baseline that captures month-end patterns and
// seasonal effects. This constant must be the same for all call sites so that
// dashboard and alerts always report the same detected set for the same period.
const DETECTION_WINDOW_DAYS = 90;

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
      const windowDays = DETECTION_WINDOW_DAYS;
      const now = new Date();

      // Step 1: Compute fetch window (UTC).
      // Fetch windowDays * 2 days of data so every detection date has
      // enough history available for its baseline calculation.
      const fetchStart = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - windowDays * 2,
        ),
      );
      const today = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
      );

      // Step 2: Fetch daily spend
      const rows = await repo.findDailySpend(fetchStart, today);

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

      // Detection window: all dates within the last windowDays days
      const todayStr = now.toISOString().slice(0, 10);
      const windowStartStr = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (windowDays - 1)),
      )
        .toISOString()
        .slice(0, 10);

      const detectionDates = allDates.filter(
        (d) => d >= windowStartStr && d <= todayStr,
      );

      const anomalies: SpendAnomaly[] = [];

      // Step 4: Analyse each provider
      for (const [providerSlug, { displayName, timeSeries }] of providerMap) {
        const sortedProviderDates = Array.from(timeSeries.keys()).sort();

        for (const date of detectionDates) {
          const dateIdx = sortedProviderDates.indexOf(date);
          if (dateIdx < 0) continue;

          // Trailing baseline: up to windowDays dates strictly before `date`
          const baselineDates = sortedProviderDates
            .slice(0, dateIdx)
            .slice(-windowDays);

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

      // Step 6: Apply optional display filter.
      // Filters the sorted anomaly list to only those whose `date` (YYYY-MM-DD)
      // falls within [startDate, endDate]. Detection math above is unaffected —
      // windowDays continues to drive the statistical baseline entirely.
      // When startDate/endDate are absent the full list is returned unchanged.
      const startStr = data.startDate
        ? data.startDate.toISOString().slice(0, 10)
        : undefined;
      const endStr = data.endDate
        ? data.endDate.toISOString().slice(0, 10)
        : undefined;

      const displayedAnomalies =
        startStr !== undefined || endStr !== undefined
          ? anomalies.filter((a) => {
              if (startStr !== undefined && a.date < startStr) return false;
              if (endStr !== undefined && a.date > endStr) return false;
              return true;
            })
          : anomalies;

      return {
        success: true,
        value: {
          anomalies: displayedAnomalies,
          analysisDays: windowDays,
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
