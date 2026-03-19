// =============================================================================
// Cost Tracking Module — Provider Costs Table
// =============================================================================
// Dollar amounts as reported by provider cost/billing APIs. This table is
// separate from usage_records because provider-reported costs often have
// different granularity, dimensions, and update cadence than usage metrics.
//
// Design decisions:
//   - amount uses numeric(16,8) matching usage_records for consistent
//     financial precision.
//   - model_slug is nullable because some provider cost line items are not
//     model-specific (e.g., "web_search" or "code_execution" charges).
//   - cost_type and token_type are plain text (not enums) because providers
//     can introduce new billing categories at any time without requiring a
//     migration.
//   - No updatedAt: provider cost records are write-once facts. If a provider
//     revises a cost, we soft-delete the old record and insert a new one.
// =============================================================================

import { pgTable, text, timestamp, numeric, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingProviders } from './providers';
import { costTrackingProviderSegments } from './providerSegments';
import { costTrackingSyncLogs } from './syncLogs';

export const costTrackingProviderCosts = pgTable(
  'cost_tracking_provider_costs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    providerId: text('provider_id')
      .notNull()
      .references(() => costTrackingProviders.id),

    segmentId: text('segment_id')
      .references(() => costTrackingProviderSegments.id),

    // Raw model string from the provider (nullable for non-model costs)
    modelSlug: text('model_slug'),

    // 'tokens', 'web_search', 'code_execution', 'image_models', etc.
    costType: text('cost_type').notNull(),

    // 'input', 'output', 'cached_input', etc. (nullable for non-token costs)
    tokenType: text('token_type'),

    serviceTier: text('service_tier'),
    contextTier: text('context_tier'),
    region: text('region'),

    // Time bucket
    bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
    bucketEnd: timestamp('bucket_end', { withTimezone: true }).notNull(),

    // The cost amount
    amount: numeric('amount', { precision: 16, scale: 8 }).notNull(),
    currency: text('currency').notNull().default('USD'),

    // Provider's own description (e.g., OpenAI line_item text)
    description: text('description'),

    // SHA-256 hash of dimension columns for idempotent upserts
    dedupKey: text('dedup_key').notNull(),

    // Sync provenance
    syncId: text('sync_id')
      .references(() => costTrackingSyncLogs.id),

    providerMetadata: jsonb('provider_metadata'),

    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    // Zombie Shield
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Zombie Shield: one active record per dedup_key
    uniqueIndex('cost_tracking_provider_costs_dedup_key_unique_active')
      .on(table.dedupKey)
      .where(isNull(table.deletedAt)),

    index('cost_tracking_provider_costs_provider_id_idx').on(table.providerId),
    index('cost_tracking_provider_costs_segment_id_idx').on(table.segmentId),
    index('cost_tracking_provider_costs_bucket_start_idx').on(table.bucketStart),
    index('cost_tracking_provider_costs_cost_type_idx').on(table.costType),
    index('cost_tracking_provider_costs_deleted_at_idx').on(table.deletedAt),
  ],
);
