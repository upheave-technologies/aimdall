// =============================================================================
// Application — List Credentials Use Case
// =============================================================================
// Returns all active provider credentials joined with their provider's
// display name, for use in assignment UIs and reporting dropdowns.
//
// Flow:
//   1. Delegate to IProviderCredentialRepository.findAllWithProvider()
//   2. Return the list
//
// Pre-wired export: `listCredentials`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IProviderCredentialRepository, CredentialWithProvider } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeProviderCredentialRepository } from '../infrastructure/repositories/DrizzleProviderRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the listCredentials use case.
 *
 * ZOMBIE SHIELD: only returns active (non-deleted) credentials.
 *
 * @param credentialRepo - Repository for querying provider credentials
 * @returns Async use case function
 */
export const makeListCredentialsUseCase = (credentialRepo: IProviderCredentialRepository) => {
  return async (): Promise<Result<CredentialWithProvider[], CostTrackingError>> => {
    try {
      const credentials = await credentialRepo.findAllWithProvider();
      return { success: true, value: credentials };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to list credentials', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 2: PRE-WIRED INSTANCE
// =============================================================================

const credentialRepo = makeProviderCredentialRepository(db);

export const listCredentials = makeListCredentialsUseCase(credentialRepo);
