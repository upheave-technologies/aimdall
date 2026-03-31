// =============================================================================
// Application — Get Budget Status Use Case
// =============================================================================
// Evaluates all active budgets against current and projected spend for their
// respective periods.
//
// Flow:
//   1. Fetch all active budgets
//   2. For each budget, derive the current period window
//   3. Fetch daily spend for that window
//   4. Compute spend, run rate, projections, and status
//   5. Aggregate across all budgets and return
//
// Pre-wired export: `getBudgetStatus`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IBudgetRepository, IUsageRecordRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { makeBudgetRepository } from '../infrastructure/repositories/DrizzleBudgetRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type GetBudgetStatusInput = Record<string, never>;

export type BudgetStatusRow = {
  id: string;
  name: string;
  amount: number;
  periodType: string;
  currentSpend: number;
  projectedSpend: number;
  percentUsed: number;
  projectedPercentUsed: number;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  status: 'on_track' | 'at_risk' | 'exceeded';
  currency: string;
  alertThresholds: number[];
};

export type BudgetStatusResult = {
  budgets: BudgetStatusRow[];
  totalBudgeted: number;
  totalSpent: number;
  overallStatus: 'on_track' | 'at_risk' | 'exceeded';
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Derives the current period [start, end] for a budget based on its periodType.
 * All dates are computed in UTC.
 */
function resolveBudgetPeriod(
  periodType: string,
  customStart?: Date,
  customEnd?: Date,
): { start: Date; end: Date } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  switch (periodType) {
    case 'monthly':
      return {
        start: new Date(Date.UTC(y, m, 1)),
        end: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)),
      };

    case 'daily':
      return {
        start: new Date(Date.UTC(y, m, d)),
        end: new Date(Date.UTC(y, m, d, 23, 59, 59, 999)),
      };

    case 'weekly': {
      // ISO week: Monday = day 1
      const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, …
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(Date.UTC(y, m, d - daysSinceMonday));
      const sunday = new Date(Date.UTC(y, m, d - daysSinceMonday + 6, 23, 59, 59, 999));
      return { start: monday, end: sunday };
    }

    case 'quarterly': {
      const quarterStart = Math.floor(m / 3) * 3;
      return {
        start: new Date(Date.UTC(y, quarterStart, 1)),
        end: new Date(Date.UTC(y, quarterStart + 3, 0, 23, 59, 59, 999)),
      };
    }

    case 'annual':
      return {
        start: new Date(Date.UTC(y, 0, 1)),
        end: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)),
      };

    case 'custom':
      if (customStart && customEnd) {
        return { start: customStart, end: customEnd };
      }
      // Fallback: last 30 days
      return {
        start: new Date(Date.UTC(y, m, d - 29)),
        end: new Date(Date.UTC(y, m, d, 23, 59, 59, 999)),
      };

    default:
      return {
        start: new Date(Date.UTC(y, m, 1)),
        end: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)),
      };
  }
}

/**
 * Higher-order function that creates the getBudgetStatus use case.
 *
 * @param budgetRepo - Repository for fetching active budgets
 * @param usageRecordRepo - Repository for daily spend data
 * @returns Async use case function
 */
export const makeGetBudgetStatusUseCase = (
  budgetRepo: IBudgetRepository,
  usageRecordRepo: IUsageRecordRepository,
) => {
  return async (
    _input: GetBudgetStatusInput,
  ): Promise<Result<BudgetStatusResult, CostTrackingError>> => {
    try {
      // Step 1: Fetch all active budgets
      const budgets = await budgetRepo.findAll();

      if (budgets.length === 0) {
        return {
          success: true,
          value: {
            budgets: [],
            totalBudgeted: 0,
            totalSpent: 0,
            overallStatus: 'on_track',
          },
        };
      }

      const msPerDay = 24 * 60 * 60 * 1000;
      const budgetRows: BudgetStatusRow[] = [];

      for (const budget of budgets) {
        // Step 3a: Compute period window
        const { start: periodStart, end: periodEnd } = resolveBudgetPeriod(
          budget.periodType,
          budget.currentPeriodStart,
          budget.currentPeriodEnd,
        );

        // Step 3b: Fetch daily spend for this period
        const dailyRows = await usageRecordRepo.findDailySpend(periodStart, periodEnd);

        // Aggregate by date
        const spendByDate = new Map<string, number>();
        for (const row of dailyRows) {
          spendByDate.set(row.date, (spendByDate.get(row.date) ?? 0) + parseFloat(row.totalCost));
        }

        // Step 3c: currentSpend = sum of all daily costs
        const currentSpend = Array.from(spendByDate.values()).reduce((s, v) => s + v, 0);

        // Step 3d: daysElapsed = distinct dates in data
        const daysElapsed = spendByDate.size;

        // Step 3e: daysTotal = total calendar days in period
        const daysTotal = Math.round((periodEnd.getTime() - periodStart.getTime()) / msPerDay) + 1;

        const daysRemaining = Math.max(0, daysTotal - daysElapsed);
        const dailyRunRate = currentSpend / Math.max(daysElapsed, 1);

        // Step 3f: projectedSpend
        const projectedSpend = currentSpend + daysRemaining * dailyRunRate;

        const amount = parseFloat(budget.amount);
        const percentUsed = amount > 0 ? (currentSpend / amount) * 100 : 0;
        const projectedPercentUsed = amount > 0 ? (projectedSpend / amount) * 100 : 0;

        // Step 3j: status
        let status: BudgetStatusRow['status'];
        if (percentUsed >= 100) {
          status = 'exceeded';
        } else if (projectedPercentUsed > 80) {
          status = 'at_risk';
        } else {
          status = 'on_track';
        }

        budgetRows.push({
          id: budget.id,
          name: budget.name,
          amount,
          periodType: budget.periodType,
          currentSpend,
          projectedSpend,
          percentUsed,
          projectedPercentUsed,
          daysElapsed,
          daysTotal,
          daysRemaining,
          status,
          currency: budget.currency,
          alertThresholds: budget.alertThresholds ?? [],
        });
      }

      // Step 4: Aggregate totals
      const totalBudgeted = budgetRows.reduce((s, r) => s + r.amount, 0);
      const totalSpent = budgetRows.reduce((s, r) => s + r.currentSpend, 0);

      let overallStatus: BudgetStatusResult['overallStatus'] = 'on_track';
      if (budgetRows.some((r) => r.status === 'exceeded')) {
        overallStatus = 'exceeded';
      } else if (budgetRows.some((r) => r.status === 'at_risk')) {
        overallStatus = 'at_risk';
      }

      return {
        success: true,
        value: {
          budgets: budgetRows,
          totalBudgeted,
          totalSpent,
          overallStatus,
        },
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to retrieve budget status', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const budgetRepo = makeBudgetRepository(db);
const usageRecordRepo = makeUsageRecordRepository(db);

export const getBudgetStatus = makeGetBudgetStatusUseCase(budgetRepo, usageRecordRepo);
