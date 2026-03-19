// =============================================================================
// Cost Tracking Module — Models Table
// =============================================================================
// The canonical registry of all known AI models across all providers. Each row
// represents a specific model version (e.g., claude-sonnet-4-20250514, gpt-4o,
// gemini-2.5-flash).
//
// Design decisions:
//   - slug is the provider's own model identifier string, used to join with
//     usage records. The composite unique on (provider_id, slug) ensures no
//     duplicates within a provider.
//   - service_category classifies what the model does (text generation,
//     embedding, image generation, etc.) — this drives which pricing rate
//     keys and usage metrics apply.
//   - capabilities stores model-specific features as JSONB (modalities,
//     max token limits, supported parameters) that change frequently and
//     vary dramatically between models.
//   - No deletedAt: models are never soft-deleted. They transition through
//     available -> deprecated -> retired. Historical usage records still
//     reference retired models.
// =============================================================================

import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingServiceCategory, costTrackingModelStatus } from './enums';
import { costTrackingProviders } from './providers';

export const costTrackingModels = pgTable(
  'cost_tracking_models',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    providerId: text('provider_id')
      .notNull()
      .references(() => costTrackingProviders.id),

    // The provider's model identifier (e.g., claude-sonnet-4-20250514)
    slug: text('slug').notNull(),

    displayName: text('display_name').notNull(),

    serviceCategory: costTrackingServiceCategory('service_category').notNull(),

    status: costTrackingModelStatus('status').notNull().default('available'),

    // Model-specific features (modalities, max tokens, etc.)
    capabilities: jsonb('capabilities'),

    // Additional metadata
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One model per provider + slug combination (no soft delete on models)
    uniqueIndex('cost_tracking_models_provider_slug_unique')
      .on(table.providerId, table.slug),

    index('cost_tracking_models_provider_id_idx').on(table.providerId),
    index('cost_tracking_models_service_category_idx').on(table.serviceCategory),
    index('cost_tracking_models_status_idx').on(table.status),
  ],
);
