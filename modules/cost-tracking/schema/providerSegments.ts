// =============================================================================
// Cost Tracking Module — Provider Segments Table
// =============================================================================
// A ProviderSegment represents an organizational unit within a provider:
// workspaces (Anthropic), projects (OpenAI/Google), folders (Google Cloud),
// organizational units (AWS), etc.
//
// Design decisions:
//   - Segments form a tree via the self-referential parent_id. This supports
//     providers with deep hierarchies (e.g., AWS: Organization > OU > Account).
//   - external_id is the provider's own identifier for this segment, used for
//     deduplication during sync. The composite unique index on (provider_id,
//     external_id) ensures we never duplicate a segment within a provider.
//   - metadata stores provider-specific attributes (e.g., project number for
//     GCP, organization tier for Anthropic) that vary per provider.
// =============================================================================

import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingSegmentType } from './enums';
import { costTrackingProviders } from './providers';

export const costTrackingProviderSegments = pgTable(
  'cost_tracking_provider_segments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    providerId: text('provider_id')
      .notNull()
      .references(() => costTrackingProviders.id),

    // The provider's own identifier for this segment
    externalId: text('external_id').notNull(),

    displayName: text('display_name').notNull(),

    segmentType: costTrackingSegmentType('segment_type').notNull(),

    // Self-referential FK for hierarchical segments
    parentId: text('parent_id'),

    // Provider-specific attributes
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    // Zombie Shield
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Zombie Shield: one active segment per provider + external_id combination
    uniqueIndex('cost_tracking_provider_segments_provider_external_unique_active')
      .on(table.providerId, table.externalId)
      .where(isNull(table.deletedAt)),

    index('cost_tracking_provider_segments_provider_id_idx').on(table.providerId),
    index('cost_tracking_provider_segments_parent_id_idx').on(table.parentId),
    index('cost_tracking_provider_segments_segment_type_idx').on(table.segmentType),
    index('cost_tracking_provider_segments_deleted_at_idx').on(table.deletedAt),
  ],
);
