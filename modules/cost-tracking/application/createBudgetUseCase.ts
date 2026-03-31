// =============================================================================
// Application — Create Budget Use Case
// =============================================================================
// Creates a new Budget entity with a derived current period window.
//
// Flow:
//   1. Validate name is non-empty
//   2. Validate amount is a positive number
//   3. Compute currentPeriodStart/End from periodType
//   4. Assemble full Budget entity with cuid2 ID and timestamps
//   5. Persist via budgetRepo.create
//   6. Return created budget
//
// Pre-wired export: `createBudget`
// =============================================================================

import { createId } from '@paralleldrive/cuid2';
import { Result } from '@/packages/shared/lib/result';
import { Budget, BudgetType, BudgetPeriodType } from '../domain/budget';
import { IBudgetRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeBudgetRepository } from '../infrastructure/repositories/DrizzleBudgetRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type CreateBudgetInput = {
  name: string;
  periodType: BudgetPeriodType;
  amount: string; // numeric string, e.g. "1000.00"
  currency?: string; // default 'USD'
  budgetType?: BudgetType; // default 'soft_alert'
  alertThresholds?: number[];
  scope?: Record<string, unknown>;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Derives the current period [start, end] for a periodType.
 * All dates are computed in UTC.
 */
function computePeriod(
  periodType: BudgetPeriodType,
): { currentPeriodStart: Date; currentPeriodEnd: Date } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  switch (periodType) {
    case 'monthly':
      return {
        currentPeriodStart: new Date(Date.UTC(y, m, 1)),
        currentPeriodEnd: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)),
      };

    case 'daily':
      return {
        currentPeriodStart: new Date(Date.UTC(y, m, d)),
        currentPeriodEnd: new Date(Date.UTC(y, m, d, 23, 59, 59, 999)),
      };

    case 'weekly': {
      const dayOfWeek = now.getUTCDay(); // 0=Sun
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      return {
        currentPeriodStart: new Date(Date.UTC(y, m, d - daysSinceMonday)),
        currentPeriodEnd: new Date(Date.UTC(y, m, d - daysSinceMonday + 6, 23, 59, 59, 999)),
      };
    }

    case 'quarterly': {
      const quarterStart = Math.floor(m / 3) * 3;
      return {
        currentPeriodStart: new Date(Date.UTC(y, quarterStart, 1)),
        currentPeriodEnd: new Date(Date.UTC(y, quarterStart + 3, 0, 23, 59, 59, 999)),
      };
    }

    case 'annual':
      return {
        currentPeriodStart: new Date(Date.UTC(y, 0, 1)),
        currentPeriodEnd: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)),
      };

    case 'custom':
      // For custom budgets created without explicit dates, use last 30 days
      return {
        currentPeriodStart: new Date(Date.UTC(y, m, d - 29)),
        currentPeriodEnd: new Date(Date.UTC(y, m, d, 23, 59, 59, 999)),
      };
  }
}

/**
 * Higher-order function that creates the createBudget use case.
 *
 * @param budgetRepo - Repository for persisting the new budget
 * @returns Async use case function
 */
export const makeCreateBudgetUseCase = (budgetRepo: IBudgetRepository) => {
  return async (
    data: CreateBudgetInput,
  ): Promise<Result<Budget, CostTrackingError>> => {
    try {
      // Step 1: Validate name
      if (!data.name || data.name.trim().length === 0) {
        return {
          success: false,
          error: new CostTrackingError('Budget name cannot be empty', 'VALIDATION_ERROR'),
        };
      }

      // Step 2: Validate amount
      const amountNum = parseFloat(data.amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return {
          success: false,
          error: new CostTrackingError(
            'Budget amount must be a positive number',
            'VALIDATION_ERROR',
          ),
        };
      }

      // Step 3: Compute period window
      const { currentPeriodStart, currentPeriodEnd } = computePeriod(data.periodType);

      // Step 4: Assemble full entity
      const now = new Date();
      const budget: Budget = {
        id: createId(),
        name: data.name.trim(),
        scope: data.scope ?? {},
        budgetType: data.budgetType ?? 'soft_alert',
        periodType: data.periodType,
        amount: amountNum.toFixed(8),
        currency: data.currency ?? 'USD',
        alertThresholds: data.alertThresholds,
        currentSpend: '0.00000000',
        currentPeriodStart,
        currentPeriodEnd,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      // Step 5: Persist
      await budgetRepo.create(budget);

      // Step 6: Return
      return { success: true, value: budget };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to create budget', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const budgetRepo = makeBudgetRepository(db);

export const createBudget = makeCreateBudgetUseCase(budgetRepo);
