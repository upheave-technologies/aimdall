// =============================================================================
// Cost Tracking Module — Suggestion Dismissals Table
// =============================================================================
// Tracks which auto-discovery suggestions a user has dismissed so they are not
// resurfaced. Each row represents one dismissed suggestion identified by a
// deterministic hash produced by the discovery function.
//
// Design decisions:
//   - suggestionId is a deterministic hash, not an FK. The discovery function
//     computes the same hash for the same grouping every time, so a unique
//     constraint is sufficient to prevent duplicates.
//   - suggestionType is a plain text column (not an enum) because discovery
//     types may expand without requiring a migration.
//   - No deletedAt / soft-delete: dismissals are permanent. If a user wants a
//     suggestion back, the application deletes the row outright.
//   - No updatedAt: dismissals are immutable once created.
// =============================================================================

import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const costTrackingSuggestionDismissals = pgTable(
  'cost_tracking_suggestion_dismissals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    // Deterministic hash from the auto-discovery function
    suggestionId: text('suggestion_id').notNull(),

    // Discovery category: 'credential_cluster' | 'usage_pattern' | 'provider_segment'
    suggestionType: text('suggestion_type').notNull(),

    dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('cost_tracking_suggestion_dismissals_suggestion_id_idx').on(table.suggestionId),
  ],
);
