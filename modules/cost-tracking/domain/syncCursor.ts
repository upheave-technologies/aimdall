// =============================================================================
// Domain — SyncCursor Entity
// =============================================================================
// Tracks the last successfully synced point per provider + credential +
// service category combination. This enables incremental syncs — each run
// picks up where the last one left off instead of re-fetching everything.
//
// Design decisions:
//   - No deletedAt: cursors are operational state, not business data.
//     When a credential is revoked, its cursor is hard-deleted.
//   - lastPageToken stores provider pagination state for APIs that use
//     cursor-based pagination across multiple sync runs.
//   - ServiceCategory is imported from model.ts so both entities share the
//     same type definition — the only cross-domain file import here.
//   - Zero external library imports.
// =============================================================================

import { ServiceCategory } from './model';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type SyncCursor = {
  id: string;
  providerId: string;
  credentialId?: string;
  serviceCategory: ServiceCategory;
  lastSyncedBucket: Date;
  lastPageToken?: string;
  metadata?: Record<string, unknown>;
  updatedAt: Date;
  createdAt: Date;
};
