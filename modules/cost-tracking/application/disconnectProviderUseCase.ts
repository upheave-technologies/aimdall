// =============================================================================
// Application — Disconnect Provider Use Case
// =============================================================================
// Revokes all sync credentials for a provider and pauses the provider record.
// Soft-delete pattern: credentials are marked as revoked and given a deletedAt
// timestamp. The provider row transitions to status "paused" but is not removed.
//
// Flow:
//   1. Find provider by ID; return NOT_FOUND if absent
//   2. Fetch all sync credentials for the provider
//   3. Soft-delete each credential (deletedAt = now, status = 'revoked')
//   4. Update provider status to 'paused'
//   5. Return success
//
// Pre-wired export: `disconnectProvider`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IProviderRepository, IProviderCredentialRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeProviderRepository, makeProviderCredentialRepository } from '../infrastructure/repositories/DrizzleProviderRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type DisconnectProviderInput = {
  providerId: string;
};

export type DisconnectProviderOutput = {
  providerId: string;
  revokedCredentials: number;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the disconnectProvider use case.
 *
 * ZOMBIE SHIELD: credentials are soft-deleted (deletedAt set), not hard-deleted.
 * The provider record is paused rather than removed to preserve audit history
 * and allow reconnection without losing historical data.
 *
 * @param providerRepo   - Repository for provider CRUD
 * @param credentialRepo - Repository for credential CRUD
 * @returns Async use case function
 */
export const makeDisconnectProviderUseCase = (
  providerRepo: IProviderRepository,
  credentialRepo: IProviderCredentialRepository,
) => {
  return async (
    data: DisconnectProviderInput,
  ): Promise<Result<DisconnectProviderOutput, CostTrackingError>> => {
    // 1. Find provider
    let provider;
    try {
      provider = await providerRepo.findById(data.providerId);
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to look up provider', 'SERVICE_ERROR'),
      };
    }

    if (!provider) {
      return {
        success: false,
        error: new CostTrackingError(
          `Provider "${data.providerId}" not found`,
          'NOT_FOUND',
        ),
      };
    }

    // 2. Fetch all sync credentials for this provider
    let syncCredentials;
    try {
      syncCredentials = await credentialRepo.findSyncCredentials(provider.id);
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to fetch provider credentials', 'SERVICE_ERROR'),
      };
    }

    // 3. Soft-delete each credential
    const now = new Date();
    try {
      await Promise.all(
        syncCredentials.map((credential) =>
          credentialRepo.update({
            ...credential,
            status: 'revoked',
            deletedAt: now,
            updatedAt: now,
          }),
        ),
      );
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to revoke provider credentials', 'SERVICE_ERROR'),
      };
    }

    // 4. Pause the provider
    try {
      await providerRepo.update({
        ...provider,
        status: 'paused',
        updatedAt: now,
      });
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to update provider status', 'SERVICE_ERROR'),
      };
    }

    return {
      success: true,
      value: {
        providerId: provider.id,
        revokedCredentials: syncCredentials.length,
      },
    };
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const providerRepo = makeProviderRepository(db);
const credentialRepo = makeProviderCredentialRepository(db);

export const disconnectProvider = makeDisconnectProviderUseCase(providerRepo, credentialRepo);
