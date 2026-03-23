// =============================================================================
// Application — List User Assignments Use Case
// =============================================================================
// Returns all active key assignments for a list of principals, grouped by
// principalId, with each assignment enriched with credential label and
// provider display name.
//
// Flow:
//   1. For each principalId, fetch enriched assignments in parallel
//   2. Assemble results as a Record<principalId, EnrichedKeyAssignment[]>
//   3. Return the record
//
// Pre-wired export: `listUserAssignments`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IKeyAssignmentRepository, EnrichedKeyAssignment } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeKeyAssignmentRepository } from '../infrastructure/repositories/DrizzleKeyAssignmentRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type ListUserAssignmentsInput = {
  principalIds: string[];
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the listUserAssignments use case.
 *
 * Fetches enriched assignments for all requested principals in parallel.
 * ZOMBIE SHIELD: only returns active (non-deleted) assignments.
 *
 * @param keyAssignmentRepo - Repository for querying key assignments
 * @returns Async use case function
 */
export const makeListUserAssignmentsUseCase = (keyAssignmentRepo: IKeyAssignmentRepository) => {
  return async (
    data: ListUserAssignmentsInput,
  ): Promise<Result<Record<string, EnrichedKeyAssignment[]>, CostTrackingError>> => {
    try {
      const result: Record<string, EnrichedKeyAssignment[]> = {};

      await Promise.all(
        data.principalIds.map(async (principalId) => {
          result[principalId] = await keyAssignmentRepo.findByPrincipalIdEnriched(principalId);
        }),
      );

      return { success: true, value: result };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to list user assignments', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const keyAssignmentRepo = makeKeyAssignmentRepository(db);

export const listUserAssignments = makeListUserAssignmentsUseCase(keyAssignmentRepo);
