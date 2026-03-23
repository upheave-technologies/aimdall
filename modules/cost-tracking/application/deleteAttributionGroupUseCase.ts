// =============================================================================
// Application — Delete Attribution Group Use Case
// =============================================================================
// Soft-deletes an existing AttributionGroup by setting its deletedAt timestamp.
// Never hard-deletes — preserves audit trail.
//
// Flow:
//   1. Verify the group exists — return NOT_FOUND if absent
//   2. Soft-delete via repo.softDeleteGroup
//
// Pre-wired export: `deleteAttributionGroup`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IAttributionRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type DeleteAttributionGroupInput = {
  id: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the deleteAttributionGroup use case.
 *
 * @param attributionRepository - Repository for finding and soft-deleting the group
 * @returns Async use case function
 */
export const makeDeleteAttributionGroupUseCase = (
  attributionRepository: IAttributionRepository,
) => {
  return async (
    data: DeleteAttributionGroupInput,
  ): Promise<Result<void, CostTrackingError>> => {
    try {
      // Step 1: Verify the group exists
      const allGroups = await attributionRepository.findAllGroups();
      const group = allGroups.find((g) => g.id === data.id) ?? null;

      if (!group) {
        return {
          success: false,
          error: new CostTrackingError(
            `Attribution group "${data.id}" not found`,
            'NOT_FOUND',
          ),
        };
      }

      // Step 2: Soft-delete
      await attributionRepository.softDeleteGroup(data.id);
      return { success: true, value: undefined };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to delete attribution group', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const attributionRepository = makeAttributionRepository(db);

export const deleteAttributionGroup = makeDeleteAttributionGroupUseCase(attributionRepository);
