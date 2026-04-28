// =============================================================================
// Cost Tracking Module — Providers Table
// =============================================================================
// A Provider represents a connected LLM service (Anthropic, OpenAI, Google
// Vertex, AWS Bedrock, etc.). This is the top-level entity that all other
// cost-tracking data hangs from.
//
// Design decisions:
//   - slug is the canonical machine-readable identifier ('anthropic', 'openai').
//     The partial unique index on slug ensures uniqueness among active records
//     while allowing soft-deleted providers to retain their slug.
//   - configuration stores provider-specific settings as JSONB (sync intervals,
//     API versions, rate-limit policies) that vary per provider and change
//     frequently enough to not warrant dedicated columns.
//   - last_sync_at is denormalized from sync_logs for quick dashboard display
//     without joining the sync history.
// =============================================================================

import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingProviderStatus, costTrackingProviderSyncState } from './enums';

export const costTrackingProviders = pgTable(
  'cost_tracking_providers',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    slug: text('slug').notNull(),

    displayName: text('display_name').notNull(),

    apiBaseUrl: text('api_base_url'),

    status: costTrackingProviderStatus('status').notNull().default('active'),

    // Provider-specific settings (sync intervals, API versions, etc.)
    configuration: jsonb('configuration'),

    // Denormalized from sync_logs for quick dashboard display
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),

    syncState: costTrackingProviderSyncState('sync_state').notNull().default('idle'),

    syncStartedAt: timestamp('sync_started_at', { withTimezone: true }),

    syncError: text('sync_error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    // Zombie Shield: NULL means active, timestamp means soft-deleted
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Zombie Shield: one active provider per slug
    uniqueIndex('cost_tracking_providers_slug_unique_active')
      .on(table.slug)
      .where(isNull(table.deletedAt)),

    index('cost_tracking_providers_status_idx').on(table.status),
    index('cost_tracking_providers_deleted_at_idx').on(table.deletedAt),
  ],
);
