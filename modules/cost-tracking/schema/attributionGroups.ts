// =============================================================================
// Cost Tracking Module — Attribution Groups Table
// =============================================================================
// Custom reporting groups for cost attribution: teams, departments, cost
// centers, environments, business units, or any arbitrary grouping.
//
// Design decisions:
//   - Groups form a tree via the self-referential parent_id, supporting
//     hierarchical rollups (e.g., Department > Team > Project).
//   - slug is the machine-readable identifier for API and query use. The
//     partial unique index ensures uniqueness among active groups while
//     allowing soft-deleted groups to retain their slug.
//   - group_type classifies what kind of organizational entity this group
//     represents, enabling type-specific UI rendering and validation.
// =============================================================================

import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingGroupType } from './enums';

export const costTrackingAttributionGroups = pgTable(
  'cost_tracking_attribution_groups',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    slug: text('slug').notNull(),

    displayName: text('display_name').notNull(),

    groupType: costTrackingGroupType('group_type').notNull(),

    // Self-referential FK for hierarchical groups
    parentId: text('parent_id'),

    description: text('description'),

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
    // Zombie Shield: one active group per slug
    uniqueIndex('cost_tracking_attribution_groups_slug_unique_active')
      .on(table.slug)
      .where(isNull(table.deletedAt)),

    index('cost_tracking_attribution_groups_group_type_idx').on(table.groupType),
    index('cost_tracking_attribution_groups_parent_id_idx').on(table.parentId),
    index('cost_tracking_attribution_groups_deleted_at_idx').on(table.deletedAt),
  ],
);
