// =============================================================================
// Infrastructure — Drizzle Recommendation Repository
// =============================================================================
// Concrete implementation of IRecommendationRepository using Drizzle ORM.
//
// Zombie Shield is active on all SELECT operations:
//   isNull(costTrackingRecommendations.deletedAt) is present in every WHERE clause.
//
// expireAll also excludes already-expired and soft-deleted rows to avoid
// unnecessary writes.
//
// Factory pattern for dependency injection:
//   const recommendationRepo = makeRecommendationRepository(db);
// =============================================================================

import { eq, and, isNull, ne } from 'drizzle-orm';
import { costTrackingRecommendations } from '../../schema/recommendations';
import { Recommendation, RecommendationCategory, RecommendationStatus } from '../../domain/recommendation';
import { IRecommendationRepository } from '../../domain/repositories';
import { CostTrackingDatabase } from '../database';

// =============================================================================
// SECTION 1: FACTORY
// =============================================================================

/**
 * Factory function that creates a Recommendation repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking schema
 * @returns IRecommendationRepository implementation
 */
export const makeRecommendationRepository = (db: CostTrackingDatabase): IRecommendationRepository => ({
  /**
   * Find all active (non-deleted, non-expired) recommendations.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findActive(): Promise<Recommendation[]> {
    const rows = await db
      .select()
      .from(costTrackingRecommendations)
      .where(
        and(
          isNull(costTrackingRecommendations.deletedAt),
          ne(costTrackingRecommendations.status, 'expired'),
        ),
      );

    return rows.map(mapToRecommendation);
  },

  /**
   * Find a recommendation by its internal ID.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findById(id: string): Promise<Recommendation | null> {
    const result = await db
      .select()
      .from(costTrackingRecommendations)
      .where(
        and(
          eq(costTrackingRecommendations.id, id),
          isNull(costTrackingRecommendations.deletedAt),
        ),
      )
      .limit(1);

    if (result.length === 0) return null;
    return mapToRecommendation(result[0]);
  },

  /** Insert a new recommendation. */
  async create(rec: Recommendation): Promise<void> {
    await db.insert(costTrackingRecommendations).values(mapToRow(rec));
  },

  /** Insert a batch of recommendations in a single statement. */
  async createBatch(recs: Recommendation[]): Promise<void> {
    if (recs.length === 0) return;
    await db.insert(costTrackingRecommendations).values(recs.map(mapToRow));
  },

  /** Update a recommendation (e.g., status transition to dismissed). */
  async update(rec: Recommendation): Promise<void> {
    await db
      .update(costTrackingRecommendations)
      .set({
        status: rec.status,
        dismissedAt: rec.dismissedAt ?? null,
        expiresAt: rec.expiresAt ?? null,
        updatedAt: rec.updatedAt,
        deletedAt: rec.deletedAt ?? null,
      })
      .where(eq(costTrackingRecommendations.id, rec.id));
  },

  /**
   * Mark all currently-active (non-expired, non-deleted) recommendations as
   * expired. Called before a fresh generation run so stale recommendations
   * do not appear alongside newly generated ones.
   *
   * Returns the number of rows updated.
   */
  async expireAll(): Promise<number> {
    const result = await db
      .update(costTrackingRecommendations)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(costTrackingRecommendations.status, 'active'),
          isNull(costTrackingRecommendations.deletedAt),
        ),
      );

    return result.rowCount ?? 0;
  },

  /**
   * Soft-delete a recommendation by setting deletedAt.
   * NEVER hard-deletes — preserves audit trail.
   */
  async softDelete(id: string): Promise<void> {
    await db
      .update(costTrackingRecommendations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(costTrackingRecommendations.id, id));
  },
});

// =============================================================================
// SECTION 2: INTERNAL MAPPING
// =============================================================================

type RecommendationRow = typeof costTrackingRecommendations.$inferSelect;

function mapToRecommendation(row: RecommendationRow): Recommendation {
  return {
    id: row.id,
    category: row.category as RecommendationCategory,
    title: row.title,
    description: row.description,
    estimatedMonthlySavings: row.estimatedMonthlySavings ?? undefined,
    savingsPercentage: row.savingsPercentage ?? undefined,
    confidenceBasis: row.confidenceBasis ?? undefined,
    status: row.status as RecommendationStatus,
    data: (row.data as Record<string, unknown> | null) ?? undefined,
    dismissedAt: row.dismissedAt ?? undefined,
    expiresAt: row.expiresAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
  };
}

type InsertRow = typeof costTrackingRecommendations.$inferInsert;

function mapToRow(rec: Recommendation): InsertRow {
  return {
    id: rec.id,
    category: rec.category,
    title: rec.title,
    description: rec.description,
    estimatedMonthlySavings: rec.estimatedMonthlySavings ?? null,
    savingsPercentage: rec.savingsPercentage ?? null,
    confidenceBasis: rec.confidenceBasis ?? null,
    status: rec.status,
    data: rec.data ?? null,
    dismissedAt: rec.dismissedAt ?? null,
    expiresAt: rec.expiresAt ?? null,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    deletedAt: rec.deletedAt ?? null,
  };
}
