// =============================================================================
// Application — Unassign Key From User Use Case
// =============================================================================
// Soft-deletes a KeyAssignment, revoking a Principal's association with
// a ProviderCredential.
//
// Flow:
//   1. Verify the assignment exists via keyAssignmentRepository.findById
//   2. Soft-delete via keyAssignmentRepository.softDelete
//   3. Return void on success
//
// Pre-wired export: `unassignKeyFromUser`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IKeyAssignmentRepository } from '../domain/repositories';
import { makeKeyAssignmentRepository } from '../infrastructure/repositories/DrizzleKeyAssignmentRepository';
import { CostTrackingError } from './costTrackingError';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type UnassignKeyFromUserInput = {
  assignmentId: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the unassignKeyFromUser use case.
 *
 * @param keyAssignmentRepository - Repository for managing the assignment
 * @returns Async use case function
 */
export const makeUnassignKeyFromUserUseCase = (
  keyAssignmentRepository: IKeyAssignmentRepository,
) => {
  return async (
    data: UnassignKeyFromUserInput,
  ): Promise<Result<void, CostTrackingError>> => {
    try {
      // Step 1: Verify the assignment exists
      const assignment = await keyAssignmentRepository.findById(data.assignmentId);
      if (!assignment) {
        return {
          success: false,
          error: new CostTrackingError(
            `KeyAssignment "${data.assignmentId}" not found`,
            'NOT_FOUND',
          ),
        };
      }

      // Step 2: Soft-delete
      await keyAssignmentRepository.softDelete(data.assignmentId);

      // Step 3: Return success
      return { success: true, value: undefined };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to unassign key from user', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const keyAssignmentRepository = makeKeyAssignmentRepository(db);

export const unassignKeyFromUser = makeUnassignKeyFromUserUseCase(keyAssignmentRepository);
