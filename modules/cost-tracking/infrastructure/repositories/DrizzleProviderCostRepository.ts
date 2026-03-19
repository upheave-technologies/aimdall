// =============================================================================
// Infrastructure — Drizzle Provider Cost Repository
// =============================================================================
// Concrete implementation of IProviderCostRepository using Drizzle ORM.
//
// Zombie Shield is active on all SELECT operations:
//   isNull(costTrackingProviderCosts.deletedAt) is present in every WHERE clause.
//
// upsertBatch conflict resolution:
//   ON CONFLICT (dedup_key) WHERE deleted_at IS NULL DO UPDATE — amount,
//   syncId, syncedAt, and providerMetadata are overwritten with incoming values.
//
// Factory pattern for dependency injection:
//   const repository = makeProviderCostRepository(db);
//   await repository.upsertBatch(costs);
// =============================================================================

import { sql, and, isNull, gte, lte, eq } from 'drizzle-orm';
import { costTrackingProviderCosts } from '../../schema/providerCosts';
import { ProviderCost } from '../../domain/providerCost';
import { IProviderCostRepository } from '../../domain/repositories';
import { CostTrackingDatabase } from '../database';

// =============================================================================
// SECTION 1: CONSTANTS
// =============================================================================

/** Maximum rows per INSERT statement. ~20 columns per row. */
const BATCH_SIZE = 500;

// =============================================================================
// SECTION 2: FACTORY
// =============================================================================

/**
 * Factory function that creates a ProviderCost repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking schema
 * @returns IProviderCostRepository implementation
 */
export const makeProviderCostRepository = (db: CostTrackingDatabase): IProviderCostRepository => ({
  /**
   * Idempotently insert or update a batch of ProviderCosts.
   * Conflict resolution is keyed on dedupKey WHERE deletedAt IS NULL.
   */
  async upsertBatch(costs: ProviderCost[]): Promise<{ created: number; updated: number }> {
    if (costs.length === 0) return { created: 0, updated: 0 };

    let created = 0;
    let updated = 0;

    for (let offset = 0; offset < costs.length; offset += BATCH_SIZE) {
      const chunk = costs.slice(offset, offset + BATCH_SIZE);

      const result = await db
        .insert(costTrackingProviderCosts)
        .values(
          chunk.map((cost) => ({
            id: cost.id,
            providerId: cost.providerId,
            segmentId: cost.segmentId ?? null,
            modelSlug: cost.modelSlug ?? null,
            costType: cost.costType,
            tokenType: cost.tokenType ?? null,
            serviceTier: cost.serviceTier ?? null,
            contextTier: cost.contextTier ?? null,
            region: cost.region ?? null,
            bucketStart: cost.bucketStart,
            bucketEnd: cost.bucketEnd,
            amount: cost.amount,
            currency: cost.currency,
            description: cost.description ?? null,
            dedupKey: cost.dedupKey,
            syncId: cost.syncId ?? null,
            providerMetadata: cost.providerMetadata ?? null,
            syncedAt: cost.syncedAt,
            createdAt: cost.createdAt,
            deletedAt: cost.deletedAt ?? null,
          })),
        )
        .onConflictDoUpdate({
          target: costTrackingProviderCosts.dedupKey,
          targetWhere: isNull(costTrackingProviderCosts.deletedAt),
          set: {
            amount: sql`excluded.amount`,
            currency: sql`excluded.currency`,
            description: sql`excluded.description`,
            syncId: sql`excluded.sync_id`,
            syncedAt: sql`excluded.synced_at`,
            providerMetadata: sql`excluded.provider_metadata`,
          },
        })
        .returning({
          id: costTrackingProviderCosts.id,
          createdAt: costTrackingProviderCosts.createdAt,
        });

      const batchTime = Date.now();
      for (const row of result) {
        const age = batchTime - row.createdAt.getTime();
        if (age < 5_000) {
          created++;
        } else {
          updated++;
        }
      }
    }

    return { created, updated };
  },

  /**
   * Find all active provider costs for a given provider and date range.
   * ZOMBIE SHIELD: excludes soft-deleted records (isNull(deletedAt)).
   */
  async findByProvider(
    providerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ProviderCost[]> {
    const rows = await db
      .select()
      .from(costTrackingProviderCosts)
      .where(
        and(
          isNull(costTrackingProviderCosts.deletedAt),
          eq(costTrackingProviderCosts.providerId, providerId),
          gte(costTrackingProviderCosts.bucketStart, startDate),
          lte(costTrackingProviderCosts.bucketStart, endDate),
        ),
      );

    return rows.map(mapToProviderCost);
  },
});

// =============================================================================
// SECTION 3: INTERNAL MAPPING
// =============================================================================

function mapToProviderCost(row: typeof costTrackingProviderCosts.$inferSelect): ProviderCost {
  return {
    id: row.id,
    providerId: row.providerId,
    segmentId: row.segmentId ?? undefined,
    modelSlug: row.modelSlug ?? undefined,
    costType: row.costType,
    tokenType: row.tokenType ?? undefined,
    serviceTier: row.serviceTier ?? undefined,
    contextTier: row.contextTier ?? undefined,
    region: row.region ?? undefined,
    bucketStart: row.bucketStart,
    bucketEnd: row.bucketEnd,
    amount: row.amount,
    currency: row.currency,
    description: row.description ?? undefined,
    dedupKey: row.dedupKey,
    syncId: row.syncId ?? undefined,
    providerMetadata: (row.providerMetadata as Record<string, unknown> | null) ?? undefined,
    syncedAt: row.syncedAt,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt ?? undefined,
  };
}
