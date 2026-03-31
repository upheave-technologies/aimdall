// =============================================================================
// Application — Get Spend Forecast Use Case
// =============================================================================
// Projects future spend for the current (or specified) period based on
// historical daily spend data.
//
// Flow:
//   1. Resolve period start/end (defaults to current calendar month, UTC)
//   2. Fetch daily spend rows for the period
//   3. Compute run rate, trend, stddev, and projections
//   4. Build per-provider projections
//   5. Return assembled SpendForecast
//
// Pre-wired export: `getSpendForecast`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IUsageRecordRepository, DailySpendRow } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type GetSpendForecastInput = {
  startDate?: Date; // defaults to start of current month
  endDate?: Date;   // defaults to end of current month
};

export type SpendForecast = {
  periodStart: string;  // YYYY-MM-DD
  periodEnd: string;    // YYYY-MM-DD
  daysElapsed: number;
  daysTotal: number;
  actualSpendToDate: number;
  projectedMonthlySpend: number;
  projectedLow: number;
  projectedHigh: number;
  dailyRunRate: number;
  trend: 'accelerating' | 'decelerating' | 'stable';
  confidence: number; // 0–100
  byProvider: Array<{
    providerSlug: string;
    providerDisplayName: string;
    actualSpend: number;
    projectedSpend: number;
    percentage: number;
  }>;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

const toDateString = (d: Date): string => d.toISOString().slice(0, 10);

const computeStdDev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

/**
 * Higher-order function that creates the getSpendForecast use case.
 *
 * @param repo - Usage record repository for daily spend data
 * @returns Async use case function
 */
export const makeGetSpendForecastUseCase = (repo: IUsageRecordRepository) => {
  return async (
    data: GetSpendForecastInput,
  ): Promise<Result<SpendForecast, CostTrackingError>> => {
    try {
      const now = new Date();

      // Step 1: Resolve period bounds — default to current calendar month (UTC)
      const periodStart =
        data.startDate ??
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

      const periodEnd =
        data.endDate ??
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

      // Step 2: Fetch daily spend rows
      const rows: DailySpendRow[] = await repo.findDailySpend(periodStart, periodEnd);

      const periodStartStr = toDateString(periodStart);
      const periodEndStr = toDateString(periodEnd);

      // Total days in period
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysTotal = Math.round(
        (periodEnd.getTime() - periodStart.getTime()) / msPerDay,
      ) + 1;

      // Step 3: Handle empty data — return zeroed forecast
      if (rows.length === 0) {
        return {
          success: true,
          value: {
            periodStart: periodStartStr,
            periodEnd: periodEndStr,
            daysElapsed: 0,
            daysTotal,
            actualSpendToDate: 0,
            projectedMonthlySpend: 0,
            projectedLow: 0,
            projectedHigh: 0,
            dailyRunRate: 0,
            trend: 'stable',
            confidence: 0,
            byProvider: [],
          },
        };
      }

      // Aggregate all costs and group by date
      const spendByDate = new Map<string, number>();
      for (const row of rows) {
        const cost = parseFloat(row.totalCost);
        spendByDate.set(row.date, (spendByDate.get(row.date) ?? 0) + cost);
      }

      const sortedDates = Array.from(spendByDate.keys()).sort();
      const dailyValues = sortedDates.map((d) => spendByDate.get(d) ?? 0);

      const daysElapsed = sortedDates.length;
      const actualSpendToDate = dailyValues.reduce((s, v) => s + v, 0);
      const dailyRunRate = actualSpendToDate / Math.max(daysElapsed, 1);
      const daysRemaining = Math.max(0, daysTotal - daysElapsed);

      // Step 7: Compute trend — compare first half vs second half avg
      let trend: 'accelerating' | 'decelerating' | 'stable' = 'stable';
      if (dailyValues.length >= 4) {
        const mid = Math.floor(dailyValues.length / 2);
        const firstHalf = dailyValues.slice(0, mid);
        const secondHalf = dailyValues.slice(mid);
        const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
        if (firstAvg > 0) {
          const ratio = secondAvg / firstAvg;
          if (ratio > 1.15) trend = 'accelerating';
          else if (ratio < 1 / 1.15) trend = 'decelerating';
        }
      }

      // Step 8: Compute stddev of daily values
      const stddev = computeStdDev(dailyValues);

      // Step 9–11: Project remaining spend
      const projectedMonthlySpend = actualSpendToDate + daysRemaining * dailyRunRate;
      const projectedLow =
        actualSpendToDate + daysRemaining * Math.max(0, dailyRunRate - stddev);
      const projectedHigh =
        actualSpendToDate + daysRemaining * (dailyRunRate + stddev);

      // Step 13: Confidence — 50 points per 7 days of data, capped at 100
      const confidence = Math.min(100, Math.round((daysElapsed / 7) * 50));

      // Step 14: Build per-provider breakdown
      const providerActual = new Map<
        string,
        { providerSlug: string; providerDisplayName: string; actual: number }
      >();

      for (const row of rows) {
        const cost = parseFloat(row.totalCost);
        const existing = providerActual.get(row.providerSlug);
        if (existing) {
          existing.actual += cost;
        } else {
          providerActual.set(row.providerSlug, {
            providerSlug: row.providerSlug,
            providerDisplayName: row.providerDisplayName,
            actual: cost,
          });
        }
      }

      const byProvider = Array.from(providerActual.values()).map((p) => {
        const share = actualSpendToDate > 0 ? p.actual / actualSpendToDate : 0;
        const projectedSpend = projectedMonthlySpend * share;
        return {
          providerSlug: p.providerSlug,
          providerDisplayName: p.providerDisplayName,
          actualSpend: p.actual,
          projectedSpend,
          percentage: projectedMonthlySpend > 0 ? (projectedSpend / projectedMonthlySpend) * 100 : 0,
        };
      });

      return {
        success: true,
        value: {
          periodStart: periodStartStr,
          periodEnd: periodEndStr,
          daysElapsed,
          daysTotal,
          actualSpendToDate,
          projectedMonthlySpend,
          projectedLow,
          projectedHigh,
          dailyRunRate,
          trend,
          confidence,
          byProvider,
        },
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to compute spend forecast', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const usageRecordRepo = makeUsageRecordRepository(db);

export const getSpendForecast = makeGetSpendForecastUseCase(usageRecordRepo);
