// =============================================================================
// Application — Assign Key To User Use Case
// =============================================================================
// Creates a KeyAssignment mapping a Principal to a ProviderCredential.
// This enables per-user cost attribution for shared provider accounts.
//
// Flow:
//   1. Verify Principal exists via principalRepository.findById
//   2. Verify ProviderCredential exists via credentialRepository.findById
//   3. Check no active assignment already exists for this (principal, credential) pair
//   4. Call domain createKeyAssignment for field validation
//   5. Assemble full KeyAssignment with cuid2 ID and timestamps
//   6. Persist via keyAssignmentRepository.save
//   7. Return the created KeyAssignment
//
// Pre-wired export: `assignKeyToUser`
// =============================================================================

import { createId } from '@paralleldrive/cuid2';
import { Result } from '@/packages/shared/lib/result';
import { KeyAssignment, createKeyAssignment } from '../domain/keyAssignment';
import {
  IKeyAssignmentRepository,
  IProviderCredentialRepository,
} from '../domain/repositories';
import { IPrincipalRepository } from '@/packages/@core/identity/domain/principalRepository';
import { makeKeyAssignmentRepository } from '../infrastructure/repositories/DrizzleKeyAssignmentRepository';
import { makeProviderCredentialRepository } from '../infrastructure/repositories/DrizzleProviderRepository';
import { makePrincipalRepository } from '@/packages/@core/identity';
import { CostTrackingError } from './costTrackingError';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type AssignKeyToUserInput = {
  principalId: string;
  credentialId: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the assignKeyToUser use case.
 *
 * @param keyAssignmentRepository - Repository for persisting the assignment
 * @param principalRepository     - Repository for verifying the principal exists
 * @param credentialRepository    - Repository for verifying the credential exists
 * @returns Async use case function
 */
export const makeAssignKeyToUserUseCase = (
  keyAssignmentRepository: IKeyAssignmentRepository,
  principalRepository: IPrincipalRepository,
  credentialRepository: IProviderCredentialRepository,
) => {
  return async (
    data: AssignKeyToUserInput,
  ): Promise<Result<KeyAssignment, CostTrackingError>> => {
    try {
      // Step 1: Verify principal exists
      const principal = await principalRepository.findById(data.principalId);
      if (!principal) {
        return {
          success: false,
          error: new CostTrackingError(
            `Principal "${data.principalId}" not found`,
            'NOT_FOUND',
          ),
        };
      }

      // Step 2: Verify credential exists
      const credential = await credentialRepository.findById(data.credentialId);
      if (!credential) {
        return {
          success: false,
          error: new CostTrackingError(
            `ProviderCredential "${data.credentialId}" not found`,
            'NOT_FOUND',
          ),
        };
      }

      // Step 3: Check for duplicate assignment
      const existing = await keyAssignmentRepository.findByPrincipalAndCredential(
        data.principalId,
        data.credentialId,
      );
      if (existing) {
        return {
          success: false,
          error: new CostTrackingError(
            `Principal "${data.principalId}" is already assigned to credential "${data.credentialId}"`,
            'ALREADY_EXISTS',
          ),
        };
      }

      // Step 4: Validate via domain factory
      const domainResult = createKeyAssignment({
        principalId: data.principalId,
        credentialId: data.credentialId,
      });
      if (!domainResult.success) {
        return {
          success: false,
          error: new CostTrackingError(domainResult.error.message, 'VALIDATION_ERROR'),
        };
      }

      // Step 5: Assemble full KeyAssignment entity
      const now = new Date();
      const assignment: KeyAssignment = {
        id: createId(),
        principalId: domainResult.value.principalId,
        credentialId: domainResult.value.credentialId,
        assignedAt: now,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      // Step 6: Persist
      await keyAssignmentRepository.save(assignment);

      // Step 7: Return
      return { success: true, value: assignment };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to assign key to user', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const keyAssignmentRepository = makeKeyAssignmentRepository(db);
const principalRepository = makePrincipalRepository(db);
const credentialRepository = makeProviderCredentialRepository(db);

export const assignKeyToUser = makeAssignKeyToUserUseCase(
  keyAssignmentRepository,
  principalRepository,
  credentialRepository,
);
