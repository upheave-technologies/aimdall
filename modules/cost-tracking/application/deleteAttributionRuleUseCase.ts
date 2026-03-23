// =============================================================================
// Application — Delete Attribution Rule Use Case
// =============================================================================
// Soft-deletes an existing AttributionRule by setting its deletedAt timestamp.
// Never hard-deletes — preserves audit trail.
//
// Flow:
//   1. Soft-delete via repo.softDeleteRule
//
// Note: No existence check is required — softDeleteRule is a no-op when no
// active record matches, which is the safe behaviour for idempotent deletes.
//
// Pre-wired export: `deleteAttributionRule`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IAttributionRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type DeleteAttributionRuleInput = {
  id: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the deleteAttributionRule use case.
 *
 * @param attributionRepository - Repository for soft-deleting the rule
 * @returns Async use case function
 */
export const makeDeleteAttributionRuleUseCase = (
  attributionRepository: IAttributionRepository,
) => {
  return async (
    data: DeleteAttributionRuleInput,
  ): Promise<Result<void, CostTrackingError>> => {
    try {
      await attributionRepository.softDeleteRule(data.id);
      return { success: true, value: undefined };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to delete attribution rule', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const attributionRepository = makeAttributionRepository(db);

export const deleteAttributionRule = makeDeleteAttributionRuleUseCase(attributionRepository);
