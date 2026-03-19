'use server';

import { sql, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { costTrackingUsageRecords } from '@/modules/cost-tracking/schema';

const DEFAULT_DAYS = 30;

/**
 * Returns the start time for the next sync: the most recent bucket_start
 * across all active usage records, or 30 days ago if no data exists.
 *
 * Zombie Shield: isNull(deletedAt) ensures soft-deleted records are excluded.
 *
 * Note: node-postgres deserialises timestamp columns to JS Date objects, so
 * sql<Date> is the correct generic — not sql<string>.
 */
export async function getLastSyncedAt(): Promise<string> {
  const rows = await db
    .select({
      latest: sql<Date>`MAX(${costTrackingUsageRecords.bucketStart})`,
    })
    .from(costTrackingUsageRecords)
    .where(isNull(costTrackingUsageRecords.deletedAt));

  const latest = rows[0]?.latest;

  if (latest) {
    return new Date(latest).toISOString();
  }

  const fallback = new Date();
  fallback.setDate(fallback.getDate() - DEFAULT_DAYS);
  return fallback.toISOString();
}
