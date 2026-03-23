// =============================================================================
// Application — Create User Use Case
// =============================================================================
// Creates a new human Principal via the Identity module.
// This is the cost-tracking module's entry point for user management —
// it delegates all identity-specific logic to the identity package.
//
// Flow:
//   1. Delegate to identity's makeCreatePrincipalUseCase with type='human'
//   2. Map IdentityError → CostTrackingError on failure
//   3. Return the created Principal on success
//
// Pre-wired export: `createUser`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import {
  Principal,
  makeCreatePrincipalUseCase,
  makePrincipalRepository,
  IdentityError,
} from '@/packages/@core/identity';
import { IPrincipalRepository } from '@/packages/@core/identity/domain/principalRepository';
import { CostTrackingError } from './costTrackingError';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type CreateUserInput = {
  name: string;
  email: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the createUser use case.
 * Delegates to identity's makeCreatePrincipalUseCase with type fixed to 'human'.
 *
 * @param principalRepository - Repository for persisting the new Principal
 * @returns Async use case function
 */
export const makeCreateUserUseCase = (principalRepository: IPrincipalRepository) => {
  const createPrincipal = makeCreatePrincipalUseCase(principalRepository);

  return async (data: CreateUserInput): Promise<Result<Principal, CostTrackingError>> => {
    try {
      const result = await createPrincipal({
        type: 'human',
        name: data.name,
        email: data.email,
      });

      if (!result.success) {
        const code =
          result.error instanceof IdentityError &&
          result.error.code === 'EMAIL_ALREADY_EXISTS'
            ? 'ALREADY_EXISTS'
            : result.error instanceof IdentityError &&
                result.error.code === 'VALIDATION_ERROR'
              ? 'VALIDATION_ERROR'
              : 'SERVICE_ERROR';

        return {
          success: false,
          error: new CostTrackingError(result.error.message, code),
        };
      }

      return { success: true, value: result.value };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to create user', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const principalRepository = makePrincipalRepository(db);

export const createUser = makeCreateUserUseCase(principalRepository);
