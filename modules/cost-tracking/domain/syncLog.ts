// =============================================================================
// Domain — SyncLog Entity
// =============================================================================
// Audit trail for every sync operation. Each record represents one execution
// of the sync pipeline for a specific provider, covering a specific time range.
//
// Design decisions:
//   - No deletedAt: sync logs are immutable audit records. They are never
//     soft-deleted because they provide the provenance chain for usage data.
//   - durationMs is computed at completion (completedAt - startedAt) and
//     stored for easy performance monitoring without timestamp arithmetic.
//   - errorDetails stores the full error context as a flexible map
//     (stack traces, HTTP status codes, rate-limit headers) for debugging.
//   - Zero external imports — all values are plain TypeScript primitives.
// =============================================================================

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/** The kind of sync operation performed. */
export type SyncType = 'full' | 'incremental' | 'backfill';

/** Lifecycle state of a sync operation. */
export type SyncStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';

export type SyncLog = {
  id: string;
  providerId: string;
  credentialId?: string;
  syncType: SyncType;
  status: SyncStatus;
  periodStart: Date;
  periodEnd: Date;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};
