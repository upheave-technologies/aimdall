// =============================================================================
// Cost Tracking Module — Attribution Rules Table
// =============================================================================
// Rules that map usage dimensions to attribution groups. Each rule says
// "if dimension X matches value Y, attribute this usage to group Z."
//
// Design decisions:
//   - dimension specifies WHICH usage column to match against (credential,
//     segment, provider, model, etc.).
//   - match_type specifies HOW to compare: exact equality, prefix match,
//     regex, or membership in a list.
//   - match_value is the value to compare against. For 'in_list' match type,
//     this is a comma-separated list of values.
//   - priority resolves conflicts when multiple rules match the same usage
//     record. Higher priority wins.
//   - The composite unique index on (group_id, dimension, match_type,
//     match_value) prevents duplicate rules within a group.
// =============================================================================

import { pgTable, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingAttributionDimension, costTrackingAttributionMatchType } from './enums';
import { costTrackingAttributionGroups } from './attributionGroups';

export const costTrackingAttributionRules = pgTable(
  'cost_tracking_attribution_rules',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    groupId: text('group_id')
      .notNull()
      .references(() => costTrackingAttributionGroups.id),

    // Which usage column to match against
    dimension: costTrackingAttributionDimension('dimension').notNull(),

    // How to compare
    matchType: costTrackingAttributionMatchType('match_type').notNull(),

    // The value to compare against
    matchValue: text('match_value').notNull(),

    // Higher priority wins when multiple rules match
    priority: integer('priority').notNull().default(0),

    description: text('description'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    // Zombie Shield
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Zombie Shield: no duplicate rules within a group
    uniqueIndex('cost_tracking_attribution_rules_combo_unique_active')
      .on(table.groupId, table.dimension, table.matchType, table.matchValue)
      .where(isNull(table.deletedAt)),

    index('cost_tracking_attribution_rules_group_id_idx').on(table.groupId),
    index('cost_tracking_attribution_rules_dimension_idx').on(table.dimension),
    index('cost_tracking_attribution_rules_deleted_at_idx').on(table.deletedAt),
  ],
);
