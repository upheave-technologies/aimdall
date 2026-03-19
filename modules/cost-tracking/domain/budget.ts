// =============================================================================
// Domain — Budget Entity
// =============================================================================
// Spending limits and alert thresholds. Each budget defines a ceiling for a
// specific scope (provider, credential, attribution group, or global) over
// a time period.
//
// Design decisions:
//   - scope is a flexible map that defines what the budget covers. An empty
//     object {} means "everything." Specific keys narrow the scope:
//     { "providerId": "...", "credentialId": "...", "groupId": "..." }
//   - amount and currentSpend are strings to preserve numeric(16,8) precision.
//   - alertThresholds is an optional array of percentage values (0–100).
//   - evaluateBudgetStatus is a pure function that does NOT mutate the budget.
//     Callers persist status changes after evaluating.
//   - deletedAt uses undefined (not null) at the domain level.
//   - Zero external imports — all values are plain TypeScript primitives.
// =============================================================================

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/** What happens when the budget is reached. */
export type BudgetType = 'hard_limit' | 'soft_alert' | 'tracking_only';

/** The time window for budget evaluation. */
export type BudgetPeriodType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'custom';

/** Operational state of a budget. */
export type BudgetStatus = 'active' | 'paused' | 'exceeded' | 'archived';

export type Budget = {
  id: string;
  name: string;
  scope: Record<string, unknown>;
  budgetType: BudgetType;
  periodType: BudgetPeriodType;
  amount: string;   // numeric precision string
  currency: string;
  alertThresholds?: number[]; // percentage values, e.g. [50, 75, 90, 100]
  currentSpend: string; // numeric precision string
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  status: BudgetStatus;
  lastEvaluatedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

// =============================================================================
// SECTION 2: FUNCTIONS
// =============================================================================

/**
 * Evaluates the current state of a budget against its spend and thresholds.
 *
 * Business rules:
 *   - Paused and archived budgets return their current status without
 *     re-evaluating spend.
 *   - percentUsed is calculated as (currentSpend / amount) * 100, clamped
 *     to a minimum of 0 to handle edge cases where spend is negative.
 *   - A budget is 'exceeded' when percentUsed >= 100.
 *   - breachedThresholds includes every threshold value from alertThresholds
 *     that is <= percentUsed, sorted ascending.
 *   - When amount is 0 the result is 'exceeded' with 100% used to avoid
 *     division-by-zero edge cases (a zero-dollar budget is always exceeded).
 */
export const evaluateBudgetStatus = (
  budget: Budget,
): { status: BudgetStatus; percentUsed: number; breachedThresholds: number[] } => {
  // Non-active budgets are returned as-is
  if (budget.status === 'paused' || budget.status === 'archived') {
    return { status: budget.status, percentUsed: 0, breachedThresholds: [] };
  }

  const amountNum = parseFloat(budget.amount);
  const spendNum = parseFloat(budget.currentSpend);

  // Guard against zero-dollar budgets
  if (amountNum <= 0) {
    return {
      status: 'exceeded',
      percentUsed: 100,
      breachedThresholds: budget.alertThresholds ?? [],
    };
  }

  const percentUsed = Math.max(0, (spendNum / amountNum) * 100);
  const status: BudgetStatus = percentUsed >= 100 ? 'exceeded' : 'active';

  const breachedThresholds = (budget.alertThresholds ?? [])
    .filter((t) => t <= percentUsed)
    .sort((a, b) => a - b);

  return { status, percentUsed, breachedThresholds };
};
