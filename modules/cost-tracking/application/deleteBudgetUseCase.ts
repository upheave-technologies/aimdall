// =============================================================================
// Application — Delete Budget Use Case
// =============================================================================
// Soft-deletes an existing Budget by setting its deletedAt timestamp.
// Never hard-deletes — preserves audit trail.
//
// Flow:
//   1. Validate id is non-empty
//   2. Confirm the budget exists (findById)
//   3. Soft-delete via budgetRepo.softDelete
//   4. Return success
//
// Pre-wired export: `deleteBudget`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IBudgetRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeBudgetRepository } from '../infrastructure/repositories/DrizzleBudgetRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type DeleteBudgetInput = {
  id: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the deleteBudget use case.
 *
 * @param budgetRepo - Repository for finding and soft-deleting budgets
 * @returns Async use case function
 */
export const makeDeleteBudgetUseCase = (budgetRepo: IBudgetRepository) => {
  return async (
    data: DeleteBudgetInput,
  ): Promise<Result<void, CostTrackingError>> => {
    try {
      // Step 1: Validate id
      if (!data.id || data.id.trim().length === 0) {
        return {
          success: false,
          error: new CostTrackingError('Budget id cannot be empty', 'VALIDATION_ERROR'),
        };
      }

      // Step 2: Confirm the budget exists
      const budget = await budgetRepo.findById(data.id);
      if (!budget) {
        return {
          success: false,
          error: new CostTrackingError(
            `Budget "${data.id}" not found`,
            'NOT_FOUND',
          ),
        };
      }

      // Step 3: Soft-delete
      await budgetRepo.softDelete(data.id);

      // Step 4: Return success
      return { success: true, value: undefined };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to delete budget', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const budgetRepo = makeBudgetRepository(db);

export const deleteBudget = makeDeleteBudgetUseCase(budgetRepo);
