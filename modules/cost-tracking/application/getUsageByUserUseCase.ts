// =============================================================================
// Application — Get Usage By User Use Case
// =============================================================================
// Retrieves aggregated LLM usage and cost totals grouped by Principal (user).
//
// The join chain: identity_principals → key_assignments → usage_records
// is encapsulated entirely within the KeyAssignment repository so that
// cross-module join logic lives in one place.
//
// Flow:
//   1. Default to last 30 days if no date range is provided
//   2. Delegate to keyAssignmentRepository.getUserUsageSummary
//   3. Return the list of UserUsageRow results
//
// Pre-wired export: `getUsageByUser`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IKeyAssignmentRepository, UserUsageRow } from '../domain/repositories';
import { makeKeyAssignmentRepository } from '../infrastructure/repositories/DrizzleKeyAssignmentRepository';
import { CostTrackingError } from './costTrackingError';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type GetUsageByUserInput = {
  startDate?: Date;
  endDate?: Date;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the getUsageByUser use case.
 *
 * @param keyAssignmentRepository - Repository containing the cross-module join query
 * @returns Async use case function
 */
export const makeGetUsageByUserUseCase = (
  keyAssignmentRepository: IKeyAssignmentRepository,
) => {
  return async (
    data: GetUsageByUserInput,
  ): Promise<Result<UserUsageRow[], CostTrackingError>> => {
    try {
      // Step 1: Resolve date range defaults (last 30 days)
      const endDate = data.endDate ?? new Date();
      const startDate =
        data.startDate ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1_000);

      // Step 2: Fetch usage summary grouped by user
      const rows = await keyAssignmentRepository.getUserUsageSummary(startDate, endDate);

      // Step 3: Return results
      return { success: true, value: rows };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to retrieve usage by user', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const keyAssignmentRepository = makeKeyAssignmentRepository(db);

export const getUsageByUser = makeGetUsageByUserUseCase(keyAssignmentRepository);
