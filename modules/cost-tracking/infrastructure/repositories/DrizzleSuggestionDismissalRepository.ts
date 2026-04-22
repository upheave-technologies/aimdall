// =============================================================================
// Infrastructure — Drizzle Suggestion Dismissal Repository
// =============================================================================
// Concrete implementation of ISuggestionDismissalRepository using Drizzle ORM.
//
// Design notes:
//   - NO Zombie Shield: this table has no deletedAt column. Dismissals are
//     permanent rows; undismiss performs a hard delete.
//   - dismiss() uses ON CONFLICT (suggestion_id) DO NOTHING for idempotency.
//     The unique index on suggestion_id guarantees at-most-one row per suggestion.
//
// Factory pattern for dependency injection:
//   const dismissalRepo = makeSuggestionDismissalRepository(db);
// =============================================================================

import { eq } from 'drizzle-orm';
import { costTrackingSuggestionDismissals } from '../../schema/suggestionDismissals';
import { ISuggestionDismissalRepository, SuggestionDismissal } from '../../domain/repositories';
import { CostTrackingDatabase } from '../database';

// =============================================================================
// SECTION 1: FACTORY
// =============================================================================

/**
 * Factory function that creates a SuggestionDismissal repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking schema
 * @returns ISuggestionDismissalRepository implementation
 */
export const makeSuggestionDismissalRepository = (
  db: CostTrackingDatabase,
): ISuggestionDismissalRepository => ({
  /** Find all dismissed suggestions. */
  async findAll(): Promise<SuggestionDismissal[]> {
    const rows = await db.select().from(costTrackingSuggestionDismissals);
    return rows.map(mapToDismissal);
  },

  /** Check if a suggestion has been dismissed. */
  async isDismissed(suggestionId: string): Promise<boolean> {
    const result = await db
      .select({ id: costTrackingSuggestionDismissals.id })
      .from(costTrackingSuggestionDismissals)
      .where(eq(costTrackingSuggestionDismissals.suggestionId, suggestionId))
      .limit(1);

    return result.length > 0;
  },

  /**
   * Dismiss a suggestion (insert row).
   * Idempotent — ON CONFLICT (suggestion_id) DO NOTHING prevents duplicates.
   */
  async dismiss(dismissal: Omit<SuggestionDismissal, 'createdAt'>): Promise<void> {
    await db
      .insert(costTrackingSuggestionDismissals)
      .values({
        id: dismissal.id,
        suggestionId: dismissal.suggestionId,
        suggestionType: dismissal.suggestionType,
        dismissedAt: dismissal.dismissedAt,
      })
      .onConflictDoNothing();
  },

  /** Undismiss a suggestion — hard delete, preserving no trace. */
  async undismiss(suggestionId: string): Promise<void> {
    await db
      .delete(costTrackingSuggestionDismissals)
      .where(eq(costTrackingSuggestionDismissals.suggestionId, suggestionId));
  },

  /** Return all dismissed suggestion IDs as a Set for bulk filtering. */
  async findDismissedIds(): Promise<Set<string>> {
    const rows = await db
      .select({ suggestionId: costTrackingSuggestionDismissals.suggestionId })
      .from(costTrackingSuggestionDismissals);

    return new Set(rows.map((r) => r.suggestionId));
  },
});

// =============================================================================
// SECTION 2: INTERNAL MAPPING
// =============================================================================

type DismissalRow = typeof costTrackingSuggestionDismissals.$inferSelect;

function mapToDismissal(row: DismissalRow): SuggestionDismissal {
  return {
    id: row.id,
    suggestionId: row.suggestionId,
    suggestionType: row.suggestionType,
    dismissedAt: row.dismissedAt,
    createdAt: row.createdAt,
  };
}
