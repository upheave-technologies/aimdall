// =============================================================================
// Application — Get Last Synced At Use Case
// =============================================================================
// Returns the ISO 8601 timestamp of the most recently synced bucket_start
// across all active usage records. When no records exist, returns a date
// DEFAULT_DAYS in the past as a safe fallback start point for syncing.
//
// Flow:
//   1. Query the latest bucket_start from the usage record repository
//   2. If found, return its ISO string
//   3. If not found, return a fallback date DEFAULT_DAYS ago
//
// Pre-wired export: `getLastSyncedAt`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IUsageRecordRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the getLastSyncedAt use case.
 *
 * @param usageRecordRepo - Repository for querying usage records
 * @returns Async use case function returning an ISO 8601 date string
 */
export const makeGetLastSyncedAtUseCase = (usageRecordRepo: IUsageRecordRepository) => {
  const DEFAULT_DAYS = 30;

  return async (): Promise<Result<string, CostTrackingError>> => {
    try {
      const latest = await usageRecordRepo.getLatestBucketStart();

      if (latest) {
        return { success: true, value: new Date(latest).toISOString() };
      }

      // No records yet — return a fallback start date DEFAULT_DAYS in the past
      const fallback = new Date();
      fallback.setDate(fallback.getDate() - DEFAULT_DAYS);
      return { success: true, value: fallback.toISOString() };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to get last synced timestamp', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 2: PRE-WIRED INSTANCE
// =============================================================================

const usageRecordRepo = makeUsageRecordRepository(db);

export const getLastSyncedAt = makeGetLastSyncedAtUseCase(usageRecordRepo);
