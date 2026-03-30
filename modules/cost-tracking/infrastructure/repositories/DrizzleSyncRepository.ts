// =============================================================================
// Infrastructure — Drizzle Sync Repository
// =============================================================================
// Concrete implementations of ISyncLogRepository and ISyncCursorRepository
// using Drizzle ORM.
//
// SyncLog: Immutable audit records. Created once, status updated on completion.
//   No soft-delete — sync logs are never removed.
//
// SyncCursor: Operational state. Upserted on every successful sync.
//   ON CONFLICT (provider_id, credential_id, service_category) DO UPDATE —
//   always overwrites lastSyncedBucket with the newest synced position.
//   No soft-delete — cursors are hard-deleted when a credential is revoked.
//
// Factory pattern for dependency injection:
//   const { syncLogRepo, syncCursorRepo } = makeSyncRepositories(db);
// =============================================================================

import { eq, and, isNull } from 'drizzle-orm';
import { costTrackingSyncLogs } from '../../schema/syncLogs';
import { costTrackingSyncCursors } from '../../schema/syncCursors';
import { SyncLog, SyncStatus } from '../../domain/syncLog';
import { SyncCursor } from '../../domain/syncCursor';
import { ISyncLogRepository, ISyncCursorRepository } from '../../domain/repositories';
import { ServiceCategory } from '../../domain/model';
import { CostTrackingDatabase } from '../database';
import { createId } from '@paralleldrive/cuid2';

// =============================================================================
// SECTION 1: SYNC LOG REPOSITORY FACTORY
// =============================================================================

/**
 * Factory function that creates a SyncLog repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking schema
 * @returns ISyncLogRepository implementation
 */
export const makeSyncLogRepository = (db: CostTrackingDatabase): ISyncLogRepository => ({
  /**
   * Insert a new sync log entry and return the created record.
   */
  async create(log: Omit<SyncLog, 'id' | 'createdAt'>): Promise<SyncLog> {
    const id = createId();
    const now = new Date();

    const [row] = await db
      .insert(costTrackingSyncLogs)
      .values({
        id,
        providerId: log.providerId,
        credentialId: log.credentialId ?? null,
        syncType: log.syncType,
        status: log.status,
        periodStart: log.periodStart,
        periodEnd: log.periodEnd,
        recordsFetched: log.recordsFetched,
        recordsCreated: log.recordsCreated,
        recordsUpdated: log.recordsUpdated,
        recordsSkipped: log.recordsSkipped,
        errorMessage: log.errorMessage ?? null,
        errorDetails: log.errorDetails ?? null,
        startedAt: log.startedAt,
        completedAt: log.completedAt ?? null,
        durationMs: log.durationMs ?? null,
        metadata: log.metadata ?? null,
        createdAt: now,
      })
      .returning();

    return mapToSyncLog(row);
  },

  /**
   * Update the status and counters of a sync log at completion.
   */
  async updateStatus(
    id: string,
    status: SyncStatus,
    updates: {
      recordsFetched?: number;
      recordsCreated?: number;
      recordsUpdated?: number;
      recordsSkipped?: number;
      errorMessage?: string;
      errorDetails?: Record<string, unknown>;
      completedAt?: Date;
      durationMs?: number;
    },
  ): Promise<void> {
    await db
      .update(costTrackingSyncLogs)
      .set({
        status,
        ...(updates.recordsFetched !== undefined && { recordsFetched: updates.recordsFetched }),
        ...(updates.recordsCreated !== undefined && { recordsCreated: updates.recordsCreated }),
        ...(updates.recordsUpdated !== undefined && { recordsUpdated: updates.recordsUpdated }),
        ...(updates.recordsSkipped !== undefined && { recordsSkipped: updates.recordsSkipped }),
        ...(updates.errorMessage !== undefined && { errorMessage: updates.errorMessage }),
        ...(updates.errorDetails !== undefined && { errorDetails: updates.errorDetails }),
        ...(updates.completedAt !== undefined && { completedAt: updates.completedAt }),
        ...(updates.durationMs !== undefined && { durationMs: updates.durationMs }),
      })
      .where(eq(costTrackingSyncLogs.id, id));
  },

  /**
   * Find a sync log by its ID.
   */
  async findById(id: string): Promise<SyncLog | null> {
    const result = await db
      .select()
      .from(costTrackingSyncLogs)
      .where(eq(costTrackingSyncLogs.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return mapToSyncLog(result[0]);
  },
});

// =============================================================================
// SECTION 2: SYNC CURSOR REPOSITORY FACTORY
// =============================================================================

/**
 * Factory function that creates a SyncCursor repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking schema
 * @returns ISyncCursorRepository implementation
 */
export const makeSyncCursorRepository = (db: CostTrackingDatabase): ISyncCursorRepository => ({
  /**
   * Upsert a sync cursor — insert if it doesn't exist, update if it does.
   * Keyed on (providerId, credentialId, serviceCategory).
   *
   * Uses a manual find-then-update-or-insert instead of onConflictDoUpdate
   * because PostgreSQL unique constraints treat NULL != NULL, so the conflict
   * clause never fires when credentialId is NULL, producing duplicate rows.
   */
  async upsert(
    cursor: Omit<SyncCursor, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SyncCursor> {
    const now = new Date();

    const credentialCondition =
      cursor.credentialId !== undefined
        ? eq(costTrackingSyncCursors.credentialId, cursor.credentialId)
        : isNull(costTrackingSyncCursors.credentialId);

    const existing = await db
      .select()
      .from(costTrackingSyncCursors)
      .where(
        and(
          eq(costTrackingSyncCursors.providerId, cursor.providerId),
          credentialCondition,
          eq(costTrackingSyncCursors.serviceCategory, cursor.serviceCategory),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const [row] = await db
        .update(costTrackingSyncCursors)
        .set({
          lastSyncedBucket: cursor.lastSyncedBucket,
          lastPageToken: cursor.lastPageToken ?? null,
          metadata: cursor.metadata ?? null,
          updatedAt: now,
        })
        .where(eq(costTrackingSyncCursors.id, existing[0].id))
        .returning();

      return mapToSyncCursor(row);
    }

    const id = createId();

    const [row] = await db
      .insert(costTrackingSyncCursors)
      .values({
        id,
        providerId: cursor.providerId,
        credentialId: cursor.credentialId ?? null,
        serviceCategory: cursor.serviceCategory,
        lastSyncedBucket: cursor.lastSyncedBucket,
        lastPageToken: cursor.lastPageToken ?? null,
        metadata: cursor.metadata ?? null,
        updatedAt: now,
        createdAt: now,
      })
      .returning();

    return mapToSyncCursor(row);
  },

  /**
   * Find the cursor for a given provider + credential + service category.
   * Returns null when no cursor exists (first sync).
   */
  async findCursor(
    providerId: string,
    credentialId: string | undefined,
    serviceCategory: ServiceCategory,
  ): Promise<SyncCursor | null> {
    const result = await db
      .select()
      .from(costTrackingSyncCursors)
      .where(
        and(
          eq(costTrackingSyncCursors.providerId, providerId),
          credentialId !== undefined
            ? eq(costTrackingSyncCursors.credentialId, credentialId)
            : isNull(costTrackingSyncCursors.credentialId),
          eq(costTrackingSyncCursors.serviceCategory, serviceCategory),
        ),
      )
      .limit(1);

    if (result.length === 0) return null;
    return mapToSyncCursor(result[0]);
  },
});

// =============================================================================
// SECTION 3: INTERNAL MAPPING
// =============================================================================

function mapToSyncLog(row: typeof costTrackingSyncLogs.$inferSelect): SyncLog {
  return {
    id: row.id,
    providerId: row.providerId,
    credentialId: row.credentialId ?? undefined,
    syncType: row.syncType,
    status: row.status,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    recordsFetched: row.recordsFetched,
    recordsCreated: row.recordsCreated,
    recordsUpdated: row.recordsUpdated,
    recordsSkipped: row.recordsSkipped,
    errorMessage: row.errorMessage ?? undefined,
    errorDetails: (row.errorDetails as Record<string, unknown> | null) ?? undefined,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
    durationMs: row.durationMs ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: row.createdAt,
  };
}

function mapToSyncCursor(row: typeof costTrackingSyncCursors.$inferSelect): SyncCursor {
  return {
    id: row.id,
    providerId: row.providerId,
    credentialId: row.credentialId ?? undefined,
    serviceCategory: row.serviceCategory as ServiceCategory,
    lastSyncedBucket: row.lastSyncedBucket,
    lastPageToken: row.lastPageToken ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}
