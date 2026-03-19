// =============================================================================
// Cost Tracking Module — Usage Records Table (v2 — Complete Rewrite)
// =============================================================================
// The core fact table. Every sync operation produces rows here. This is a
// wide-column design with nullable metrics — not every service category uses
// every metric column.
//
// Design decisions:
//   - This table REPLACES the original single-table schema. The old table had
//     a fixed provider enum and limited token columns. This version supports
//     arbitrary providers (via FK to providers table), multiple metric types,
//     and full cost attribution.
//   - Token counts use bigint (not integer) because some providers report
//     cumulative totals that exceed 32-bit integer range.
//   - All metric columns are nullable — a text_generation model has
//     input_tokens/output_tokens but not image_count or duration_seconds.
//     An image_generation model has image_count but not input_tokens.
//   - model_slug always stores the raw string from the provider, even when
//     model_id links to our canonical models table. This ensures we never
//     lose the original identifier if a model hasn't been registered yet.
//   - dedup_key is a SHA-256 hash of all dimension columns, providing the
//     idempotency guarantee. The partial unique index ensures each unique
//     combination is stored exactly once among active records.
//   - calculated_cost_amount uses numeric(16,8) for sub-cent precision
//     across high-volume usage.
// =============================================================================

import { pgTable, text, timestamp, bigint, integer, numeric, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingServiceCategory, costTrackingBucketWidth, costTrackingCostSource } from './enums';
import { costTrackingProviders } from './providers';
import { costTrackingProviderCredentials } from './providerCredentials';
import { costTrackingProviderSegments } from './providerSegments';
import { costTrackingModels } from './models';
import { costTrackingSyncLogs } from './syncLogs';

export const costTrackingUsageRecords = pgTable(
  'cost_tracking_usage_records',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    // ---------------------------------------------------------------------------
    // Dimension columns — define WHAT this usage is for
    // ---------------------------------------------------------------------------

    providerId: text('provider_id')
      .notNull()
      .references(() => costTrackingProviders.id),

    // Nullable: usage may not be attributable to a specific credential
    credentialId: text('credential_id')
      .references(() => costTrackingProviderCredentials.id),

    // Nullable: not all providers expose workspace/project segmentation
    segmentId: text('segment_id')
      .references(() => costTrackingProviderSegments.id),

    // Nullable: new models may not be registered in our canonical registry yet
    modelId: text('model_id')
      .references(() => costTrackingModels.id),

    // Always store the raw model string from the provider
    modelSlug: text('model_slug').notNull(),

    serviceCategory: costTrackingServiceCategory('service_category').notNull(),

    // 'on_demand', 'batch', 'priority', 'flex', 'provisioned'
    serviceTier: text('service_tier'),

    // 'standard', 'extended' (for long-context pricing)
    contextTier: text('context_tier'),

    region: text('region'),

    // ---------------------------------------------------------------------------
    // Time bucket — the aggregation window
    // ---------------------------------------------------------------------------

    bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
    bucketEnd: timestamp('bucket_end', { withTimezone: true }).notNull(),
    bucketWidth: costTrackingBucketWidth('bucket_width').notNull(),

    // ---------------------------------------------------------------------------
    // Token metrics — nullable because not all service categories use tokens
    // ---------------------------------------------------------------------------

    inputTokens: bigint('input_tokens', { mode: 'number' }),
    outputTokens: bigint('output_tokens', { mode: 'number' }),
    cachedInputTokens: bigint('cached_input_tokens', { mode: 'number' }),
    cacheWriteTokens: bigint('cache_write_tokens', { mode: 'number' }),
    thinkingTokens: bigint('thinking_tokens', { mode: 'number' }),
    audioInputTokens: bigint('audio_input_tokens', { mode: 'number' }),
    audioOutputTokens: bigint('audio_output_tokens', { mode: 'number' }),

    // ---------------------------------------------------------------------------
    // Non-token metrics — nullable, service-category-dependent
    // ---------------------------------------------------------------------------

    imageCount: integer('image_count'),
    characterCount: integer('character_count'),
    durationSeconds: numeric('duration_seconds', { precision: 12, scale: 3 }),
    storageBytes: bigint('storage_bytes', { mode: 'number' }),
    sessionCount: integer('session_count'),
    searchCount: integer('search_count'),
    requestCount: integer('request_count'),

    // ---------------------------------------------------------------------------
    // Cost columns — our calculated or provider-reported cost
    // ---------------------------------------------------------------------------

    calculatedCostAmount: numeric('calculated_cost_amount', { precision: 16, scale: 8 }),
    calculatedCostCurrency: text('calculated_cost_currency').default('USD'),
    costSource: costTrackingCostSource('cost_source').notNull().default('calculated'),

    // ---------------------------------------------------------------------------
    // Provider overflow — anything that doesn't fit our schema
    // ---------------------------------------------------------------------------

    providerMetadata: jsonb('provider_metadata'),

    // ---------------------------------------------------------------------------
    // Sync tracking
    // ---------------------------------------------------------------------------

    syncId: text('sync_id')
      .references(() => costTrackingSyncLogs.id),

    // SHA-256 hash of all dimension columns for idempotent upserts
    dedupKey: text('dedup_key').notNull(),

    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),

    // ---------------------------------------------------------------------------
    // Timestamps
    // ---------------------------------------------------------------------------

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    // Zombie Shield
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Zombie Shield: THE idempotency guarantee — one active record per dedup_key
    uniqueIndex('cost_tracking_usage_records_dedup_key_unique_active')
      .on(table.dedupKey)
      .where(isNull(table.deletedAt)),

    // Dimension indexes for filtering and joins
    index('cost_tracking_usage_records_provider_id_idx').on(table.providerId),
    index('cost_tracking_usage_records_credential_id_idx').on(table.credentialId),
    index('cost_tracking_usage_records_segment_id_idx').on(table.segmentId),
    index('cost_tracking_usage_records_model_id_idx').on(table.modelId),
    index('cost_tracking_usage_records_model_slug_idx').on(table.modelSlug),
    index('cost_tracking_usage_records_service_category_idx').on(table.serviceCategory),

    // Time-range queries
    index('cost_tracking_usage_records_bucket_start_idx').on(table.bucketStart),
    index('cost_tracking_usage_records_bucket_range_idx').on(table.bucketStart, table.bucketEnd),

    // Sync provenance
    index('cost_tracking_usage_records_sync_id_idx').on(table.syncId),

    // Zombie Shield
    index('cost_tracking_usage_records_deleted_at_idx').on(table.deletedAt),
  ],
);
