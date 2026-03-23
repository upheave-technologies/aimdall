'use server';

import { getLastSyncedAt as getLastSyncedAtUseCase } from '@/modules/cost-tracking/application/getLastSyncedAtUseCase';

/**
 * Returns the start time for the next sync: the most recent bucket_start
 * across all active usage records, or 30 days ago if no data exists.
 */
export async function getLastSyncedAt(): Promise<string> {
  const result = await getLastSyncedAtUseCase();
  if (!result.success) {
    // Fall back to 30 days ago on error
    const fallback = new Date();
    fallback.setDate(fallback.getDate() - 30);
    return fallback.toISOString();
  }
  return result.value;
}
