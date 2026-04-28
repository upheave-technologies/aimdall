// =============================================================================
// Application — Get Sync Status Use Case
// =============================================================================
// Lightweight read used by client-side polling (every ~5 s) to detect when a
// provider sync completes. Returns only sync-lifecycle fields — no usage
// aggregations, no credential lookups — so it is cheap to call frequently.
//
// Flow:
//   1. Delegate to providerRepo.findSyncStatus()
//   2. Return one ProviderSyncStatus entry per existing provider row
//
// Pre-wired export: `getSyncStatus`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { ProviderSyncState } from '../domain/provider';
import { IProviderSyncStatusRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeProviderSyncStatusRepository } from '../infrastructure/repositories/DrizzleProviderRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type ProviderSyncStatus = {
  slug: string;
  syncState: ProviderSyncState;
  syncStartedAt: Date | null;
  syncError: string | null;
  lastSyncAt: Date | null;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the getSyncStatus use case.
 *
 * @param syncStatusRepo - Lightweight repository for sync-state reads
 * @returns Async use case function (no arguments — always returns all providers)
 */
export const makeGetSyncStatusUseCase = (
  syncStatusRepo: IProviderSyncStatusRepository,
) => {
  return async (): Promise<Result<ProviderSyncStatus[], CostTrackingError>> => {
    try {
      const rows = await syncStatusRepo.findSyncStatus();
      return { success: true, value: rows };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to fetch provider sync status', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const syncStatusRepo = makeProviderSyncStatusRepository(db);

export const getSyncStatus = makeGetSyncStatusUseCase(syncStatusRepo);
