// =============================================================================
// Application — List Users Use Case
// =============================================================================
// Returns all active (non-deleted) Principals, ordered by name.
//
// Flow:
//   1. Delegate to IPrincipalQueryRepository.findAll()
//   2. Return the list
//
// Pre-wired export: `listUsers`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IPrincipalQueryRepository, PrincipalRecord } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makePrincipalQueryRepository } from '../infrastructure/repositories/DrizzlePrincipalQueryRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type ListUsersInput = Record<string, never>;

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the listUsers use case.
 *
 * ZOMBIE SHIELD: only returns active (non-deleted) principals.
 *
 * @param principalQueryRepo - Repository for querying principals
 * @returns Async use case function
 */
export const makeListUsersUseCase = (principalQueryRepo: IPrincipalQueryRepository) => {
  return async (): Promise<Result<PrincipalRecord[], CostTrackingError>> => {
    try {
      const users = await principalQueryRepo.findAll();
      return { success: true, value: users };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to list users', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const principalQueryRepo = makePrincipalQueryRepository(db);

export const listUsers = makeListUsersUseCase(principalQueryRepo);
