// =============================================================================
// Infrastructure — Drizzle Budget Repository
// =============================================================================
// Concrete implementation of IBudgetRepository using Drizzle ORM.
//
// Zombie Shield is active on all SELECT operations:
//   isNull(costTrackingBudgets.deletedAt) is present in every WHERE clause.
//
// Factory pattern for dependency injection:
//   const budgetRepo = makeBudgetRepository(db);
// =============================================================================

import { eq, and, isNull } from 'drizzle-orm';
import { costTrackingBudgets } from '../../schema/budgets';
import { Budget, BudgetType, BudgetPeriodType, BudgetStatus } from '../../domain/budget';
import { IBudgetRepository } from '../../domain/repositories';
import { CostTrackingDatabase } from '../database';

// =============================================================================
// SECTION 1: FACTORY
// =============================================================================

/**
 * Factory function that creates a Budget repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking schema
 * @returns IBudgetRepository implementation
 */
export const makeBudgetRepository = (db: CostTrackingDatabase): IBudgetRepository => ({
  /**
   * Find all active (non-deleted) budgets.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findAll(): Promise<Budget[]> {
    const rows = await db
      .select()
      .from(costTrackingBudgets)
      .where(isNull(costTrackingBudgets.deletedAt));

    return rows.map(mapToBudget);
  },

  /**
   * Find a budget by its internal ID.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findById(id: string): Promise<Budget | null> {
    const result = await db
      .select()
      .from(costTrackingBudgets)
      .where(and(eq(costTrackingBudgets.id, id), isNull(costTrackingBudgets.deletedAt)))
      .limit(1);

    if (result.length === 0) return null;
    return mapToBudget(result[0]);
  },

  /** Insert a new budget. */
  async create(budget: Budget): Promise<void> {
    await db.insert(costTrackingBudgets).values({
      id: budget.id,
      name: budget.name,
      scope: budget.scope,
      budgetType: budget.budgetType,
      periodType: budget.periodType,
      amount: budget.amount,
      currency: budget.currency,
      alertThresholds: budget.alertThresholds ?? null,
      currentSpend: budget.currentSpend,
      currentPeriodStart: budget.currentPeriodStart ?? null,
      currentPeriodEnd: budget.currentPeriodEnd ?? null,
      status: budget.status,
      lastEvaluatedAt: budget.lastEvaluatedAt ?? null,
      metadata: budget.metadata ?? null,
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
      deletedAt: budget.deletedAt ?? null,
    });
  },

  /** Update an existing budget. */
  async update(budget: Budget): Promise<void> {
    await db
      .update(costTrackingBudgets)
      .set({
        name: budget.name,
        scope: budget.scope,
        budgetType: budget.budgetType,
        periodType: budget.periodType,
        amount: budget.amount,
        currency: budget.currency,
        alertThresholds: budget.alertThresholds ?? null,
        currentSpend: budget.currentSpend,
        currentPeriodStart: budget.currentPeriodStart ?? null,
        currentPeriodEnd: budget.currentPeriodEnd ?? null,
        status: budget.status,
        lastEvaluatedAt: budget.lastEvaluatedAt ?? null,
        metadata: budget.metadata ?? null,
        updatedAt: budget.updatedAt,
        deletedAt: budget.deletedAt ?? null,
      })
      .where(eq(costTrackingBudgets.id, budget.id));
  },

  /**
   * Soft-delete a budget by setting deletedAt to the current timestamp.
   */
  async softDelete(id: string): Promise<void> {
    await db
      .update(costTrackingBudgets)
      .set({ deletedAt: new Date() })
      .where(eq(costTrackingBudgets.id, id));
  },

  /**
   * Update only the currentSpend, status, and lastEvaluatedAt fields.
   * More efficient than a full update during budget evaluation runs.
   */
  async updateSpend(
    id: string,
    currentSpend: string,
    status: BudgetStatus,
    lastEvaluatedAt: Date,
  ): Promise<void> {
    await db
      .update(costTrackingBudgets)
      .set({
        currentSpend,
        status,
        lastEvaluatedAt,
        updatedAt: new Date(),
      })
      .where(eq(costTrackingBudgets.id, id));
  },
});

// =============================================================================
// SECTION 2: INTERNAL MAPPING
// =============================================================================

function mapToBudget(row: typeof costTrackingBudgets.$inferSelect): Budget {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope as Record<string, unknown>,
    budgetType: row.budgetType as BudgetType,
    periodType: row.periodType as BudgetPeriodType,
    amount: row.amount,
    currency: row.currency,
    alertThresholds: (row.alertThresholds as number[] | null) ?? undefined,
    currentSpend: row.currentSpend,
    currentPeriodStart: row.currentPeriodStart ?? undefined,
    currentPeriodEnd: row.currentPeriodEnd ?? undefined,
    status: row.status as BudgetStatus,
    lastEvaluatedAt: row.lastEvaluatedAt ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
  };
}
