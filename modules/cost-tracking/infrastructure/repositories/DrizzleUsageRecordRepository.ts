// =============================================================================
// Infrastructure — Drizzle Usage Record Repository
// =============================================================================
// Concrete implementation of IUsageRecordRepository using Drizzle ORM.
//
// Zombie Shield is active on all SELECT operations:
//   isNull(costTrackingUsageRecords.deletedAt) is present in every WHERE clause
//   so soft-deleted records never appear in aggregation results.
//
// upsertBatch conflict resolution:
//   ON CONFLICT (dedup_key) WHERE deleted_at IS NULL DO UPDATE — all metric
//   columns, cost columns, and updatedAt are overwritten with incoming values.
//   This supports the polling ingestion pattern where the same bucket may be
//   reported with revised counts.
//
// Batching:
//   Records are chunked into groups of BATCH_SIZE to avoid exceeding
//   Postgres's 65535-parameter hard limit.
//
// Factory pattern for dependency injection:
//   const repository = makeUsageRecordRepository(db);
//   await repository.upsertBatch(records);
// =============================================================================

import { sql, and, isNull, gte, lte, eq } from 'drizzle-orm';
import { costTrackingUsageRecords } from '../../schema/usageRecords';
import { costTrackingProviders } from '../../schema/providers';
import { costTrackingProviderCredentials } from '../../schema/providerCredentials';
import { costTrackingProviderSegments } from '../../schema/providerSegments';
import { UsageRecord } from '../../domain/usageRecord';
import {
  IUsageRecordRepository,
  UsageSummaryRow,
  DailySpendRow,
} from '../../domain/repositories';
import { ServiceCategory } from '../../domain/model';
import { CostTrackingDatabase } from '../database';

// =============================================================================
// SECTION 1: CONSTANTS
// =============================================================================

/**
 * Maximum number of UsageRecord rows inserted per database statement.
 * Each UsageRecord maps to ~25 columns, so 250 records ≈ 6250 parameters —
 * well below Postgres's 65535-parameter hard limit.
 */
const BATCH_SIZE = 250;

// =============================================================================
// SECTION 2: FACTORY
// =============================================================================

/**
 * Factory function that creates a UsageRecord repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking schema
 * @returns IUsageRecordRepository implementation
 */
export const makeUsageRecordRepository = (db: CostTrackingDatabase): IUsageRecordRepository => ({
  /**
   * Idempotently insert or update a batch of UsageRecords.
   * Records are chunked into groups of BATCH_SIZE to avoid exceeding
   * Postgres's parameter limit on large ingestion runs.
   *
   * ON CONFLICT target: dedup_key WHERE deleted_at IS NULL
   * ON CONFLICT action: UPDATE all metric and cost columns + updatedAt.
   */
  async upsertBatch(records: UsageRecord[]): Promise<{ created: number; updated: number }> {
    if (records.length === 0) return { created: 0, updated: 0 };

    let created = 0;
    let updated = 0;

    for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
      const chunk = records.slice(offset, offset + BATCH_SIZE);

      const result = await db
        .insert(costTrackingUsageRecords)
        .values(
          chunk.map((record) => ({
            id: record.id,
            providerId: record.providerId,
            credentialId: record.credentialId ?? null,
            segmentId: record.segmentId ?? null,
            modelId: record.modelId ?? null,
            modelSlug: record.modelSlug,
            serviceCategory: record.serviceCategory,
            serviceTier: record.serviceTier ?? null,
            contextTier: record.contextTier ?? null,
            region: record.region ?? null,
            bucketStart: record.bucketStart,
            bucketEnd: record.bucketEnd,
            bucketWidth: record.bucketWidth,
            // Token metrics
            inputTokens: record.inputTokens ?? null,
            outputTokens: record.outputTokens ?? null,
            cachedInputTokens: record.cachedInputTokens ?? null,
            cacheWriteTokens: record.cacheWriteTokens ?? null,
            thinkingTokens: record.thinkingTokens ?? null,
            audioInputTokens: record.audioInputTokens ?? null,
            audioOutputTokens: record.audioOutputTokens ?? null,
            // Non-token metrics
            imageCount: record.imageCount ?? null,
            characterCount: record.characterCount ?? null,
            durationSeconds: record.durationSeconds ?? null,
            storageBytes: record.storageBytes ?? null,
            sessionCount: record.sessionCount ?? null,
            searchCount: record.searchCount ?? null,
            requestCount: record.requestCount ?? null,
            // Cost
            calculatedCostAmount: record.calculatedCostAmount ?? null,
            calculatedCostCurrency: record.calculatedCostCurrency ?? null,
            costSource: record.costSource,
            // Provider overflow
            providerMetadata: record.providerMetadata ?? null,
            // Sync
            syncId: record.syncId ?? null,
            dedupKey: record.dedupKey,
            syncedAt: record.syncedAt,
            // Timestamps
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            deletedAt: record.deletedAt ?? null,
          })),
        )
        .onConflictDoUpdate({
          target: costTrackingUsageRecords.dedupKey,
          targetWhere: isNull(costTrackingUsageRecords.deletedAt),
          set: {
            // Metric updates (provider may revise counts within a bucket window)
            inputTokens: sql`excluded.input_tokens`,
            outputTokens: sql`excluded.output_tokens`,
            cachedInputTokens: sql`excluded.cached_input_tokens`,
            cacheWriteTokens: sql`excluded.cache_write_tokens`,
            thinkingTokens: sql`excluded.thinking_tokens`,
            audioInputTokens: sql`excluded.audio_input_tokens`,
            audioOutputTokens: sql`excluded.audio_output_tokens`,
            imageCount: sql`excluded.image_count`,
            characterCount: sql`excluded.character_count`,
            durationSeconds: sql`excluded.duration_seconds`,
            storageBytes: sql`excluded.storage_bytes`,
            sessionCount: sql`excluded.session_count`,
            searchCount: sql`excluded.search_count`,
            requestCount: sql`excluded.request_count`,
            // Cost updates
            calculatedCostAmount: sql`excluded.calculated_cost_amount`,
            calculatedCostCurrency: sql`excluded.calculated_cost_currency`,
            costSource: sql`excluded.cost_source`,
            // Sync provenance
            syncId: sql`excluded.sync_id`,
            syncedAt: sql`excluded.synced_at`,
            providerMetadata: sql`excluded.provider_metadata`,
            // Timestamp
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .returning({ id: costTrackingUsageRecords.id, createdAt: costTrackingUsageRecords.createdAt });

      // Rows returned with createdAt matching NOW() were just inserted;
      // others were updated. We use a 1-second window as a heuristic.
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
   * Aggregate token and cost totals grouped by provider.
   * JOINs cost_tracking_providers to enrich each row with slug and displayName.
   * ZOMBIE SHIELD: excludes soft-deleted records (isNull(deletedAt)).
   */
  async findSummaryByProvider(startDate: Date, endDate: Date): Promise<UsageSummaryRow[]> {
    const rows = await db
      .select({
        providerId: costTrackingUsageRecords.providerId,
        providerSlug: costTrackingProviders.slug,
        providerDisplayName: costTrackingProviders.displayName,
        serviceCategory: costTrackingUsageRecords.serviceCategory,
        totalInputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.inputTokens}), 0)::bigint`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.outputTokens}), 0)::bigint`,
        totalCachedInputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.cachedInputTokens}), 0)::bigint`,
        totalRequests: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.requestCount}), 0)::bigint`,
        totalCost: sql<string>`COALESCE(SUM(${costTrackingUsageRecords.calculatedCostAmount}), 0)::numeric(16,8)::text`,
      })
      .from(costTrackingUsageRecords)
      .innerJoin(
        costTrackingProviders,
        eq(costTrackingUsageRecords.providerId, costTrackingProviders.id),
      )
      .where(
        and(
          isNull(costTrackingUsageRecords.deletedAt),
          gte(costTrackingUsageRecords.bucketStart, startDate),
          lte(costTrackingUsageRecords.bucketStart, endDate),
        ),
      )
      .groupBy(
        costTrackingUsageRecords.providerId,
        costTrackingProviders.slug,
        costTrackingProviders.displayName,
        costTrackingUsageRecords.serviceCategory,
      );

    return rows.map((row) => ({
      providerId: row.providerId,
      providerSlug: row.providerSlug,
      providerDisplayName: row.providerDisplayName,
      modelSlug: '*',
      serviceCategory: row.serviceCategory as ServiceCategory,
      totalInputTokens: Number(row.totalInputTokens),
      totalOutputTokens: Number(row.totalOutputTokens),
      totalCachedInputTokens: Number(row.totalCachedInputTokens),
      totalRequests: Number(row.totalRequests),
      totalCost: String(row.totalCost),
      currency: 'USD',
    }));
  },

  /**
   * Aggregate token and cost totals grouped by provider + model slug.
   * JOINs cost_tracking_providers to enrich each row with slug and displayName.
   * ZOMBIE SHIELD: excludes soft-deleted records (isNull(deletedAt)).
   */
  async findSummaryByModel(startDate: Date, endDate: Date): Promise<UsageSummaryRow[]> {
    const rows = await db
      .select({
        providerId: costTrackingUsageRecords.providerId,
        providerSlug: costTrackingProviders.slug,
        providerDisplayName: costTrackingProviders.displayName,
        modelSlug: costTrackingUsageRecords.modelSlug,
        serviceCategory: costTrackingUsageRecords.serviceCategory,
        totalInputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.inputTokens}), 0)::bigint`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.outputTokens}), 0)::bigint`,
        totalCachedInputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.cachedInputTokens}), 0)::bigint`,
        totalRequests: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.requestCount}), 0)::bigint`,
        totalCost: sql<string>`COALESCE(SUM(${costTrackingUsageRecords.calculatedCostAmount}), 0)::numeric(16,8)::text`,
      })
      .from(costTrackingUsageRecords)
      .innerJoin(
        costTrackingProviders,
        eq(costTrackingUsageRecords.providerId, costTrackingProviders.id),
      )
      .where(
        and(
          isNull(costTrackingUsageRecords.deletedAt),
          gte(costTrackingUsageRecords.bucketStart, startDate),
          lte(costTrackingUsageRecords.bucketStart, endDate),
        ),
      )
      .groupBy(
        costTrackingUsageRecords.providerId,
        costTrackingProviders.slug,
        costTrackingProviders.displayName,
        costTrackingUsageRecords.modelSlug,
        costTrackingUsageRecords.serviceCategory,
      );

    return rows.map((row) => ({
      providerId: row.providerId,
      providerSlug: row.providerSlug,
      providerDisplayName: row.providerDisplayName,
      modelSlug: row.modelSlug,
      serviceCategory: row.serviceCategory as ServiceCategory,
      totalInputTokens: Number(row.totalInputTokens),
      totalOutputTokens: Number(row.totalOutputTokens),
      totalCachedInputTokens: Number(row.totalCachedInputTokens),
      totalRequests: Number(row.totalRequests),
      totalCost: String(row.totalCost),
      currency: 'USD',
    }));
  },

  /**
   * Aggregate token and cost totals grouped by credentialId.
   * JOINs cost_tracking_providers (INNER) and cost_tracking_provider_credentials
   * (LEFT — credentialId is nullable) to enrich rows with human-readable labels.
   * ZOMBIE SHIELD: excludes soft-deleted records (isNull(deletedAt)).
   */
  async findSummaryByCredential(startDate: Date, endDate: Date): Promise<UsageSummaryRow[]> {
    const rows = await db
      .select({
        providerId: costTrackingUsageRecords.providerId,
        providerSlug: costTrackingProviders.slug,
        providerDisplayName: costTrackingProviders.displayName,
        modelSlug: costTrackingUsageRecords.modelSlug,
        serviceCategory: costTrackingUsageRecords.serviceCategory,
        credentialId: costTrackingUsageRecords.credentialId,
        credentialLabel: costTrackingProviderCredentials.label,
        credentialKeyHint: costTrackingProviderCredentials.keyHint,
        totalInputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.inputTokens}), 0)::bigint`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.outputTokens}), 0)::bigint`,
        totalCachedInputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.cachedInputTokens}), 0)::bigint`,
        totalRequests: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.requestCount}), 0)::bigint`,
        totalCost: sql<string>`COALESCE(SUM(${costTrackingUsageRecords.calculatedCostAmount}), 0)::numeric(16,8)::text`,
      })
      .from(costTrackingUsageRecords)
      .innerJoin(
        costTrackingProviders,
        eq(costTrackingUsageRecords.providerId, costTrackingProviders.id),
      )
      .leftJoin(
        costTrackingProviderCredentials,
        eq(costTrackingUsageRecords.credentialId, costTrackingProviderCredentials.id),
      )
      .where(
        and(
          isNull(costTrackingUsageRecords.deletedAt),
          gte(costTrackingUsageRecords.bucketStart, startDate),
          lte(costTrackingUsageRecords.bucketStart, endDate),
        ),
      )
      .groupBy(
        costTrackingUsageRecords.providerId,
        costTrackingProviders.slug,
        costTrackingProviders.displayName,
        costTrackingUsageRecords.modelSlug,
        costTrackingUsageRecords.serviceCategory,
        costTrackingUsageRecords.credentialId,
        costTrackingProviderCredentials.label,
        costTrackingProviderCredentials.keyHint,
      );

    return rows.map((row) => ({
      providerId: row.providerId,
      providerSlug: row.providerSlug,
      providerDisplayName: row.providerDisplayName,
      modelSlug: row.modelSlug,
      serviceCategory: row.serviceCategory as ServiceCategory,
      credentialId: row.credentialId ?? undefined,
      credentialLabel: row.credentialLabel ?? undefined,
      credentialKeyHint: row.credentialKeyHint ?? undefined,
      totalInputTokens: Number(row.totalInputTokens),
      totalOutputTokens: Number(row.totalOutputTokens),
      totalCachedInputTokens: Number(row.totalCachedInputTokens),
      totalRequests: Number(row.totalRequests),
      totalCost: String(row.totalCost),
      currency: 'USD',
    }));
  },

  /**
   * Aggregate token and cost totals grouped by segmentId.
   * JOINs cost_tracking_providers (INNER) and cost_tracking_provider_segments
   * (LEFT — segmentId is nullable) to enrich rows with human-readable names.
   * ZOMBIE SHIELD: excludes soft-deleted records (isNull(deletedAt)).
   */
  async findSummaryBySegment(startDate: Date, endDate: Date): Promise<UsageSummaryRow[]> {
    const rows = await db
      .select({
        providerId: costTrackingUsageRecords.providerId,
        providerSlug: costTrackingProviders.slug,
        providerDisplayName: costTrackingProviders.displayName,
        modelSlug: costTrackingUsageRecords.modelSlug,
        serviceCategory: costTrackingUsageRecords.serviceCategory,
        segmentId: costTrackingUsageRecords.segmentId,
        segmentDisplayName: costTrackingProviderSegments.displayName,
        totalInputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.inputTokens}), 0)::bigint`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.outputTokens}), 0)::bigint`,
        totalCachedInputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.cachedInputTokens}), 0)::bigint`,
        totalRequests: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.requestCount}), 0)::bigint`,
        totalCost: sql<string>`COALESCE(SUM(${costTrackingUsageRecords.calculatedCostAmount}), 0)::numeric(16,8)::text`,
      })
      .from(costTrackingUsageRecords)
      .innerJoin(
        costTrackingProviders,
        eq(costTrackingUsageRecords.providerId, costTrackingProviders.id),
      )
      .leftJoin(
        costTrackingProviderSegments,
        eq(costTrackingUsageRecords.segmentId, costTrackingProviderSegments.id),
      )
      .where(
        and(
          isNull(costTrackingUsageRecords.deletedAt),
          gte(costTrackingUsageRecords.bucketStart, startDate),
          lte(costTrackingUsageRecords.bucketStart, endDate),
        ),
      )
      .groupBy(
        costTrackingUsageRecords.providerId,
        costTrackingProviders.slug,
        costTrackingProviders.displayName,
        costTrackingUsageRecords.modelSlug,
        costTrackingUsageRecords.serviceCategory,
        costTrackingUsageRecords.segmentId,
        costTrackingProviderSegments.displayName,
      );

    return rows.map((row) => ({
      providerId: row.providerId,
      providerSlug: row.providerSlug,
      providerDisplayName: row.providerDisplayName,
      modelSlug: row.modelSlug,
      serviceCategory: row.serviceCategory as ServiceCategory,
      segmentId: row.segmentId ?? undefined,
      segmentDisplayName: row.segmentDisplayName ?? undefined,
      totalInputTokens: Number(row.totalInputTokens),
      totalOutputTokens: Number(row.totalOutputTokens),
      totalCachedInputTokens: Number(row.totalCachedInputTokens),
      totalRequests: Number(row.totalRequests),
      totalCost: String(row.totalCost),
      currency: 'USD',
    }));
  },

  /**
   * Return the most recent bucket_start across all active usage records.
   * Returns null when no records exist.
   * ZOMBIE SHIELD: soft-deleted records are excluded.
   */
  async getLatestBucketStart(): Promise<Date | null> {
    const result = await db
      .select({
        latestBucket: sql<Date | null>`MAX(${costTrackingUsageRecords.bucketStart})`,
      })
      .from(costTrackingUsageRecords)
      .where(isNull(costTrackingUsageRecords.deletedAt));

    const value = result[0]?.latestBucket ?? null;
    return value;
  },

  /**
   * Aggregate cost and usage grouped by calendar day and provider.
   * JOINs cost_tracking_providers to enrich each row with slug and displayName.
   * ZOMBIE SHIELD: excludes soft-deleted records (isNull(deletedAt)).
   * Results are ordered chronologically.
   */
  async findDailySpend(startDate: Date, endDate: Date): Promise<DailySpendRow[]> {
    const rows = await db
      .select({
        date: sql<string>`DATE(${costTrackingUsageRecords.bucketStart})::text`,
        providerId: costTrackingUsageRecords.providerId,
        providerSlug: costTrackingProviders.slug,
        providerDisplayName: costTrackingProviders.displayName,
        totalCost: sql<string>`COALESCE(SUM(${costTrackingUsageRecords.calculatedCostAmount}), 0)::numeric(16,8)::text`,
        totalRequests: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.requestCount}), 0)::bigint`,
        totalInputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.inputTokens}), 0)::bigint`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.outputTokens}), 0)::bigint`,
      })
      .from(costTrackingUsageRecords)
      .innerJoin(
        costTrackingProviders,
        eq(costTrackingUsageRecords.providerId, costTrackingProviders.id),
      )
      .where(
        and(
          isNull(costTrackingUsageRecords.deletedAt),
          gte(costTrackingUsageRecords.bucketStart, startDate),
          lte(costTrackingUsageRecords.bucketStart, endDate),
        ),
      )
      .groupBy(
        sql`DATE(${costTrackingUsageRecords.bucketStart})`,
        costTrackingUsageRecords.providerId,
        costTrackingProviders.slug,
        costTrackingProviders.displayName,
      )
      .orderBy(sql`DATE(${costTrackingUsageRecords.bucketStart})`);

    return rows.map((row) => ({
      date: row.date,
      providerId: row.providerId,
      providerSlug: row.providerSlug,
      providerDisplayName: row.providerDisplayName,
      totalCost: String(row.totalCost),
      totalRequests: Number(row.totalRequests),
      totalInputTokens: Number(row.totalInputTokens),
      totalOutputTokens: Number(row.totalOutputTokens),
    }));
  },
});
