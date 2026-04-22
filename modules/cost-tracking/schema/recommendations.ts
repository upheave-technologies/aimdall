// =============================================================================
// Cost Tracking Module — Recommendations Table
// =============================================================================
// Stores generated cost-optimization recommendations produced by various
// analyzers (model tier, cache utilization, batch API, dormant credentials,
// context tier, provider concentration risk).
//
// Design decisions:
//   - estimatedMonthlySavings and savingsPercentage are nullable because some
//     recommendations are non-cost (security/risk) and have no dollar figure.
//   - data is a JSONB column for category-specific details (model slugs,
//     credential IDs, etc.) since each analyzer produces different payloads.
//   - status tracks the recommendation lifecycle: active recommendations can
//     be dismissed by users or expire automatically when underlying data changes.
//   - Partial indexes on status and category exclude soft-deleted rows, matching
//     the Zombie Shield pattern used throughout the module.
// =============================================================================

import { pgTable, text, timestamp, jsonb, numeric, index } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingRecommendationCategory, costTrackingRecommendationStatus } from './enums';

export const costTrackingRecommendations = pgTable(
  'cost_tracking_recommendations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    category: costTrackingRecommendationCategory('category').notNull(),

    title: text('title').notNull(),

    description: text('description').notNull(),

    // NULL for non-cost recommendations (security/risk)
    estimatedMonthlySavings: numeric('estimated_monthly_savings', { precision: 16, scale: 8 }),

    // Percentage of relevant spend this recommendation addresses
    savingsPercentage: numeric('savings_percentage', { precision: 5, scale: 2 }),

    // e.g., "Based on 30 days of data"
    confidenceBasis: text('confidence_basis'),

    status: costTrackingRecommendationStatus('status').notNull().default('active'),

    // Category-specific details (model slugs, credential IDs, etc.)
    data: jsonb('data'),

    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),

    // Auto-expiration after underlying data changes
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    // Zombie Shield
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('cost_tracking_recommendations_status_idx')
      .on(table.status)
      .where(isNull(table.deletedAt)),

    index('cost_tracking_recommendations_category_idx')
      .on(table.category)
      .where(isNull(table.deletedAt)),

    index('cost_tracking_recommendations_deleted_at_idx').on(table.deletedAt),
  ],
);
