// =============================================================================
// Cost Tracking Module — Sync Cursors Table
// =============================================================================
// Tracks the last successfully synced point per provider + credential +
// service category combination. This enables incremental syncs — each run
// picks up where the last one left off instead of re-fetching everything.
//
// Design decisions:
//   - The composite unique index on (provider_id, credential_id,
//     service_category) ensures exactly one cursor per sync dimension.
//   - credential_id is nullable because some sync operations cover all
//     credentials for a provider (e.g., admin API usage reports).
//   - last_page_token stores provider pagination state for APIs that use
//     cursor-based pagination across multiple sync runs.
//   - No deletedAt: cursors are operational state, not business data.
//     When a credential is revoked, its cursor is hard-deleted.
// =============================================================================

import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingServiceCategory } from './enums';
import { costTrackingProviders } from './providers';
import { costTrackingProviderCredentials } from './providerCredentials';

export const costTrackingSyncCursors = pgTable(
  'cost_tracking_sync_cursors',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    providerId: text('provider_id')
      .notNull()
      .references(() => costTrackingProviders.id),

    // Nullable: some sync operations cover all credentials for a provider
    credentialId: text('credential_id')
      .references(() => costTrackingProviderCredentials.id),

    serviceCategory: costTrackingServiceCategory('service_category').notNull(),

    // The last bucket_start we successfully synced
    lastSyncedBucket: timestamp('last_synced_bucket', { withTimezone: true }).notNull(),

    // Provider pagination token for cursor-based APIs
    lastPageToken: text('last_page_token'),

    metadata: jsonb('metadata'),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One cursor per provider + credential + service category combination
    uniqueIndex('cost_tracking_sync_cursors_combo_unique')
      .on(table.providerId, table.credentialId, table.serviceCategory),

    index('cost_tracking_sync_cursors_provider_id_idx').on(table.providerId),
  ],
);
