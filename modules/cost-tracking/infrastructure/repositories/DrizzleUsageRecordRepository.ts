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

import { sql, and, isNull, isNotNull, gte, lte, eq, asc } from 'drizzle-orm';
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
import { ExplorerQuery, ExplorerResult, ExplorerResultRow, TimeSeriesPoint } from '../../domain/explorer';
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

  /**
   * Parameterized aggregation for the cost explorer.
   *
   * Handles ANY grouping dimension, ANY filter combination, pagination, and a
   * parallel time-series. Three queries run concurrently via Promise.all:
   *   Q1 — paginated grouped rows with all metric aggregations
   *   Q2 — grand totals across all pages (for KPI cards)
   *   Q3 — time-series grouped by date (and optionally by dimension key)
   *
   * Uses raw SQL via db.execute() because:
   *   - Dynamic GROUP BY columns depend on the chosen groupBy dimension
   *   - Dynamic WHERE conditions depend on the filter list
   *   - The attributionGroup dimension requires a conditional JOIN across
   *     attribution_rules that the Drizzle query builder cannot express
   *
   * All filter values are passed as bound parameters — never interpolated
   * as raw SQL — to prevent injection.
   *
   * ZOMBIE SHIELD: ur.deleted_at IS NULL on every query.
   */
  async explore(query: ExplorerQuery): Promise<ExplorerResult> {
    const { groupBy, filters, startDate, endDate, page, pageSize, sortDirection } = query;
    const offset = (page - 1) * pageSize;
    const direction = sortDirection === 'asc' ? sql.raw('ASC') : sql.raw('DESC');

    // -------------------------------------------------------------------------
    // BUILD DIMENSION-SPECIFIC FRAGMENTS
    // -------------------------------------------------------------------------

    // Whether the chosen dimension requires the attribution group JOIN path.
    const isAttributionGroup = groupBy === 'attributionGroup';

    // Fragments that vary by groupBy dimension.
    // For the "no groupBy" case we use a static sentinel value.
    let selectGroupKey: ReturnType<typeof sql>;
    let selectGroupLabel: ReturnType<typeof sql>;
    let groupByColumns: ReturnType<typeof sql> | null;
    let dimensionJoin: ReturnType<typeof sql>;

    if (!groupBy) {
      // No grouping — produce a single aggregate row.
      selectGroupKey = sql`'__all__'`;
      selectGroupLabel = sql`'All Usage'`;
      groupByColumns = null;
      dimensionJoin = sql``;
    } else if (isAttributionGroup) {
      // Attribution group: JOIN through attribution_groups → attribution_rules → usage_records.
      selectGroupKey = sql`ag.id`;
      selectGroupLabel = sql`ag.display_name`;
      groupByColumns = sql`ag.id, ag.slug, ag.display_name`;
      dimensionJoin = sql`
        INNER JOIN cost_tracking_attribution_rules ar
          ON ar.group_id = ag.id
          AND ar.deleted_at IS NULL
          AND ar.match_type IN ('exact', 'in_list')
        INNER JOIN cost_tracking_attribution_groups ag
          ON ag.id = ar.group_id
          AND ag.deleted_at IS NULL
      `;
    } else {
      // Direct-column dimensions: derive SQL from the dimension name.
      switch (groupBy) {
        case 'provider':
          selectGroupKey = sql`p.slug`;
          selectGroupLabel = sql`p.display_name`;
          groupByColumns = sql`p.slug, p.display_name`;
          dimensionJoin = sql``; // base join already provides the `p` alias
          break;
        case 'model':
          selectGroupKey = sql`ur.model_slug`;
          selectGroupLabel = sql`ur.model_slug`;
          groupByColumns = sql`ur.model_slug`;
          dimensionJoin = sql``;
          break;
        case 'credential':
          selectGroupKey = sql`ur.credential_id`;
          selectGroupLabel = sql`COALESCE(c.label, 'Unknown') || COALESCE(' (…' || c.key_hint || ')', '')`;
          groupByColumns = sql`ur.credential_id, c.label, c.key_hint`;
          dimensionJoin = sql`LEFT JOIN cost_tracking_provider_credentials c ON c.id = ur.credential_id`;
          break;
        case 'segment':
          selectGroupKey = sql`ur.segment_id`;
          selectGroupLabel = sql`COALESCE(s.display_name, 'Unknown')`;
          groupByColumns = sql`ur.segment_id, s.display_name`;
          dimensionJoin = sql`LEFT JOIN cost_tracking_provider_segments s ON s.id = ur.segment_id`;
          break;
        case 'serviceCategory':
          selectGroupKey = sql`ur.service_category::text`;
          selectGroupLabel = sql`ur.service_category::text`;
          groupByColumns = sql`ur.service_category`;
          dimensionJoin = sql``;
          break;
        case 'serviceTier':
          selectGroupKey = sql`COALESCE(ur.service_tier, 'unknown')`;
          selectGroupLabel = sql`COALESCE(ur.service_tier, 'unknown')`;
          groupByColumns = sql`ur.service_tier`;
          dimensionJoin = sql``;
          break;
        case 'contextTier':
          selectGroupKey = sql`COALESCE(ur.context_tier, 'unknown')`;
          selectGroupLabel = sql`COALESCE(ur.context_tier, 'unknown')`;
          groupByColumns = sql`ur.context_tier`;
          dimensionJoin = sql``;
          break;
        case 'region':
          selectGroupKey = sql`COALESCE(ur.region, 'unknown')`;
          selectGroupLabel = sql`COALESCE(ur.region, 'unknown')`;
          groupByColumns = sql`ur.region`;
          dimensionJoin = sql``;
          break;
        default: {
          // TypeScript exhaustiveness guard — should never reach here.
          const _never: never = groupBy;
          throw new Error(`Unsupported groupBy dimension: ${_never}`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // BUILD FILTER WHERE FRAGMENTS
    // -------------------------------------------------------------------------

    const filterFragments = filters.map((f) => {
      switch (f.dimension) {
        case 'provider':
          return sql`AND ur.provider_id = (SELECT id FROM cost_tracking_providers WHERE slug = ${f.value} AND deleted_at IS NULL LIMIT 1)`;
        case 'model':
          return sql`AND ur.model_slug = ${f.value}`;
        case 'credential':
          return sql`AND ur.credential_id = ${f.value}`;
        case 'segment':
          return sql`AND ur.segment_id = ${f.value}`;
        case 'serviceCategory':
          return sql`AND ur.service_category::text = ${f.value}`;
        case 'serviceTier':
          return sql`AND ur.service_tier = ${f.value}`;
        case 'contextTier':
          return sql`AND ur.context_tier = ${f.value}`;
        case 'region':
          return sql`AND ur.region = ${f.value}`;
        case 'attributionGroup':
          // Subquery: match records touched by any exact/in_list rule in the group.
          return sql`AND ur.id IN (
            SELECT ur2.id
            FROM cost_tracking_usage_records ur2
            INNER JOIN cost_tracking_attribution_rules ar2
              ON ar2.deleted_at IS NULL
              AND ar2.match_type IN ('exact', 'in_list')
              AND ar2.group_id = ${f.value}
              AND (
                (ar2.dimension = 'credential'        AND ar2.match_type = 'exact'   AND ur2.credential_id = ar2.match_value)
                OR (ar2.dimension = 'credential'     AND ar2.match_type = 'in_list' AND ur2.credential_id = ANY(string_to_array(ar2.match_value, ',')))
                OR (ar2.dimension = 'provider'       AND ar2.match_type = 'exact'   AND ur2.provider_id = ar2.match_value)
                OR (ar2.dimension = 'provider'       AND ar2.match_type = 'in_list' AND ur2.provider_id = ANY(string_to_array(ar2.match_value, ',')))
                OR (ar2.dimension = 'segment'        AND ar2.match_type = 'exact'   AND ur2.segment_id = ar2.match_value)
                OR (ar2.dimension = 'segment'        AND ar2.match_type = 'in_list' AND ur2.segment_id = ANY(string_to_array(ar2.match_value, ',')))
                OR (ar2.dimension = 'model'          AND ar2.match_type = 'exact'   AND ur2.model_id = ar2.match_value)
                OR (ar2.dimension = 'model'          AND ar2.match_type = 'in_list' AND ur2.model_id = ANY(string_to_array(ar2.match_value, ',')))
                OR (ar2.dimension = 'model_slug'     AND ar2.match_type = 'exact'   AND ur2.model_slug = ar2.match_value)
                OR (ar2.dimension = 'model_slug'     AND ar2.match_type = 'in_list' AND ur2.model_slug = ANY(string_to_array(ar2.match_value, ',')))
                OR (ar2.dimension = 'service_category' AND ar2.match_type = 'exact'   AND ur2.service_category::text = ar2.match_value)
                OR (ar2.dimension = 'service_category' AND ar2.match_type = 'in_list' AND ur2.service_category::text = ANY(string_to_array(ar2.match_value, ',')))
                OR (ar2.dimension = 'service_tier'   AND ar2.match_type = 'exact'   AND ur2.service_tier = ar2.match_value)
                OR (ar2.dimension = 'service_tier'   AND ar2.match_type = 'in_list' AND ur2.service_tier = ANY(string_to_array(ar2.match_value, ',')))
                OR (ar2.dimension = 'region'         AND ar2.match_type = 'exact'   AND ur2.region = ar2.match_value)
                OR (ar2.dimension = 'region'         AND ar2.match_type = 'in_list' AND ur2.region = ANY(string_to_array(ar2.match_value, ',')))
              )
            WHERE ur2.deleted_at IS NULL
          )`;
        default: {
          const _never: never = f.dimension;
          throw new Error(`Unsupported filter dimension: ${_never}`);
        }
      }
    });

    const whereFilters = filterFragments.length > 0
      ? sql.join(filterFragments, sql` `)
      : sql``;

    // -------------------------------------------------------------------------
    // BASE JOIN
    // -------------------------------------------------------------------------
    //
    // Non-attribution paths always INNER JOIN cost_tracking_providers so that
    // records with broken/missing provider references are excluded — matching
    // the behaviour of the dashboard's Drizzle queries.  The attribution group
    // path starts FROM attribution_groups, so it manages its own JOIN structure.

    const baseJoin = isAttributionGroup
      ? sql``
      : sql`INNER JOIN cost_tracking_providers p ON p.id = ur.provider_id`;

    // -------------------------------------------------------------------------
    // Q1: PAGINATED GROUPED ROWS
    // -------------------------------------------------------------------------
    //
    // The attribution group dimension requires the FROM clause to start from
    // attribution_groups and JOIN to usage_records. All other dimensions start
    // from usage_records directly.

    let q1: ReturnType<typeof sql>;

    if (isAttributionGroup) {
      const groupByClause = groupByColumns
        ? sql`GROUP BY ${groupByColumns}`
        : sql``;

      q1 = sql`
        SELECT
          ${selectGroupKey}                                                           AS group_key,
          ${selectGroupLabel}                                                         AS group_label,
          ARRAY_AGG(DISTINCT ur.service_category::text)                              AS service_categories,
          COALESCE(SUM(ur.input_tokens), 0)::bigint                                  AS total_input_tokens,
          COALESCE(SUM(ur.output_tokens), 0)::bigint                                 AS total_output_tokens,
          COALESCE(SUM(ur.cached_input_tokens), 0)::bigint                           AS total_cached_input_tokens,
          COALESCE(SUM(ur.cache_write_tokens), 0)::bigint                            AS total_cache_write_tokens,
          COALESCE(SUM(ur.thinking_tokens), 0)::bigint                               AS total_thinking_tokens,
          COALESCE(SUM(ur.audio_input_tokens), 0)::bigint                            AS total_audio_input_tokens,
          COALESCE(SUM(ur.audio_output_tokens), 0)::bigint                           AS total_audio_output_tokens,
          COALESCE(SUM(ur.image_count), 0)::bigint                                   AS total_image_count,
          COALESCE(SUM(ur.character_count), 0)::bigint                               AS total_character_count,
          COALESCE(SUM(ur.duration_seconds), 0)::numeric(12,3)                       AS total_duration_seconds,
          COALESCE(SUM(ur.storage_bytes), 0)::bigint                                 AS total_storage_bytes,
          COALESCE(SUM(ur.session_count), 0)::bigint                                 AS total_session_count,
          COALESCE(SUM(ur.search_count), 0)::bigint                                  AS total_search_count,
          COALESCE(SUM(ur.request_count), 0)::bigint                                 AS total_request_count,
          COALESCE(SUM(ur.calculated_cost_amount), 0)::numeric(16,8)::text           AS total_cost
        FROM cost_tracking_attribution_groups ag
        INNER JOIN cost_tracking_attribution_rules ar
          ON ar.group_id = ag.id
          AND ar.deleted_at IS NULL
          AND ar.match_type IN ('exact', 'in_list')
        LEFT JOIN cost_tracking_usage_records ur
          ON ur.deleted_at IS NULL
          AND ur.bucket_start >= ${startDate}
          AND ur.bucket_start <= ${endDate}
          AND (
            (ar.dimension = 'credential'        AND ar.match_type = 'exact'   AND ur.credential_id = ar.match_value)
            OR (ar.dimension = 'credential'     AND ar.match_type = 'in_list' AND ur.credential_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'provider'       AND ar.match_type = 'exact'   AND ur.provider_id = ar.match_value)
            OR (ar.dimension = 'provider'       AND ar.match_type = 'in_list' AND ur.provider_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'segment'        AND ar.match_type = 'exact'   AND ur.segment_id = ar.match_value)
            OR (ar.dimension = 'segment'        AND ar.match_type = 'in_list' AND ur.segment_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'model'          AND ar.match_type = 'exact'   AND ur.model_id = ar.match_value)
            OR (ar.dimension = 'model'          AND ar.match_type = 'in_list' AND ur.model_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'model_slug'     AND ar.match_type = 'exact'   AND ur.model_slug = ar.match_value)
            OR (ar.dimension = 'model_slug'     AND ar.match_type = 'in_list' AND ur.model_slug = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'service_category' AND ar.match_type = 'exact'   AND ur.service_category::text = ar.match_value)
            OR (ar.dimension = 'service_category' AND ar.match_type = 'in_list' AND ur.service_category::text = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'service_tier'   AND ar.match_type = 'exact'   AND ur.service_tier = ar.match_value)
            OR (ar.dimension = 'service_tier'   AND ar.match_type = 'in_list' AND ur.service_tier = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'region'         AND ar.match_type = 'exact'   AND ur.region = ar.match_value)
            OR (ar.dimension = 'region'         AND ar.match_type = 'in_list' AND ur.region = ANY(string_to_array(ar.match_value, ',')))
          )
          ${whereFilters}
        WHERE ag.deleted_at IS NULL
        ${groupByClause}
        ORDER BY total_cost ${direction}
        LIMIT ${pageSize} OFFSET ${offset}
      `;
    } else {
      const groupByClause = groupByColumns
        ? sql`GROUP BY ${groupByColumns}`
        : sql``;

      q1 = sql`
        SELECT
          ${selectGroupKey}                                                           AS group_key,
          ${selectGroupLabel}                                                         AS group_label,
          ARRAY_AGG(DISTINCT ur.service_category::text)                              AS service_categories,
          COALESCE(SUM(ur.input_tokens), 0)::bigint                                  AS total_input_tokens,
          COALESCE(SUM(ur.output_tokens), 0)::bigint                                 AS total_output_tokens,
          COALESCE(SUM(ur.cached_input_tokens), 0)::bigint                           AS total_cached_input_tokens,
          COALESCE(SUM(ur.cache_write_tokens), 0)::bigint                            AS total_cache_write_tokens,
          COALESCE(SUM(ur.thinking_tokens), 0)::bigint                               AS total_thinking_tokens,
          COALESCE(SUM(ur.audio_input_tokens), 0)::bigint                            AS total_audio_input_tokens,
          COALESCE(SUM(ur.audio_output_tokens), 0)::bigint                           AS total_audio_output_tokens,
          COALESCE(SUM(ur.image_count), 0)::bigint                                   AS total_image_count,
          COALESCE(SUM(ur.character_count), 0)::bigint                               AS total_character_count,
          COALESCE(SUM(ur.duration_seconds), 0)::numeric(12,3)                       AS total_duration_seconds,
          COALESCE(SUM(ur.storage_bytes), 0)::bigint                                 AS total_storage_bytes,
          COALESCE(SUM(ur.session_count), 0)::bigint                                 AS total_session_count,
          COALESCE(SUM(ur.search_count), 0)::bigint                                  AS total_search_count,
          COALESCE(SUM(ur.request_count), 0)::bigint                                 AS total_request_count,
          COALESCE(SUM(ur.calculated_cost_amount), 0)::numeric(16,8)::text           AS total_cost
        FROM cost_tracking_usage_records ur
        ${baseJoin}
        ${dimensionJoin}
        WHERE ur.deleted_at IS NULL
          AND ur.bucket_start >= ${startDate}
          AND ur.bucket_start <= ${endDate}
          ${whereFilters}
        ${groupByClause}
        ORDER BY total_cost ${direction}
        LIMIT ${pageSize} OFFSET ${offset}
      `;
    }

    // -------------------------------------------------------------------------
    // Q2: GRAND TOTALS
    // -------------------------------------------------------------------------

    let q2: ReturnType<typeof sql>;

    if (isAttributionGroup) {
      q2 = sql`
        SELECT
          COUNT(DISTINCT ag.id)::bigint                                              AS total_rows,
          COALESCE(SUM(ur.calculated_cost_amount), 0)::numeric(16,8)::text          AS total_cost,
          COALESCE(SUM(ur.request_count), 0)::bigint                                AS total_request_count,
          ARRAY_AGG(DISTINCT ur.service_category::text)                             AS service_categories
        FROM cost_tracking_attribution_groups ag
        INNER JOIN cost_tracking_attribution_rules ar
          ON ar.group_id = ag.id
          AND ar.deleted_at IS NULL
          AND ar.match_type IN ('exact', 'in_list')
        LEFT JOIN cost_tracking_usage_records ur
          ON ur.deleted_at IS NULL
          AND ur.bucket_start >= ${startDate}
          AND ur.bucket_start <= ${endDate}
          AND (
            (ar.dimension = 'credential'        AND ar.match_type = 'exact'   AND ur.credential_id = ar.match_value)
            OR (ar.dimension = 'credential'     AND ar.match_type = 'in_list' AND ur.credential_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'provider'       AND ar.match_type = 'exact'   AND ur.provider_id = ar.match_value)
            OR (ar.dimension = 'provider'       AND ar.match_type = 'in_list' AND ur.provider_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'segment'        AND ar.match_type = 'exact'   AND ur.segment_id = ar.match_value)
            OR (ar.dimension = 'segment'        AND ar.match_type = 'in_list' AND ur.segment_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'model'          AND ar.match_type = 'exact'   AND ur.model_id = ar.match_value)
            OR (ar.dimension = 'model'          AND ar.match_type = 'in_list' AND ur.model_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'model_slug'     AND ar.match_type = 'exact'   AND ur.model_slug = ar.match_value)
            OR (ar.dimension = 'model_slug'     AND ar.match_type = 'in_list' AND ur.model_slug = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'service_category' AND ar.match_type = 'exact'   AND ur.service_category::text = ar.match_value)
            OR (ar.dimension = 'service_category' AND ar.match_type = 'in_list' AND ur.service_category::text = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'service_tier'   AND ar.match_type = 'exact'   AND ur.service_tier = ar.match_value)
            OR (ar.dimension = 'service_tier'   AND ar.match_type = 'in_list' AND ur.service_tier = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'region'         AND ar.match_type = 'exact'   AND ur.region = ar.match_value)
            OR (ar.dimension = 'region'         AND ar.match_type = 'in_list' AND ur.region = ANY(string_to_array(ar.match_value, ',')))
          )
          ${whereFilters}
        WHERE ag.deleted_at IS NULL
      `;
    } else if (!groupBy) {
      // No grouping: there is always exactly 1 group ("All Usage").
      q2 = sql`
        SELECT
          1::bigint                                                                   AS total_rows,
          COALESCE(SUM(ur.calculated_cost_amount), 0)::numeric(16,8)::text          AS total_cost,
          COALESCE(SUM(ur.request_count), 0)::bigint                                AS total_request_count,
          ARRAY_AGG(DISTINCT ur.service_category::text)                             AS service_categories
        FROM cost_tracking_usage_records ur
        ${baseJoin}
        ${dimensionJoin}
        WHERE ur.deleted_at IS NULL
          AND ur.bucket_start >= ${startDate}
          AND ur.bucket_start <= ${endDate}
          ${whereFilters}
      `;
    } else {
      q2 = sql`
        SELECT
          COUNT(DISTINCT ${selectGroupKey})::bigint                                  AS total_rows,
          COALESCE(SUM(ur.calculated_cost_amount), 0)::numeric(16,8)::text          AS total_cost,
          COALESCE(SUM(ur.request_count), 0)::bigint                                AS total_request_count,
          ARRAY_AGG(DISTINCT ur.service_category::text)                             AS service_categories
        FROM cost_tracking_usage_records ur
        ${baseJoin}
        ${dimensionJoin}
        WHERE ur.deleted_at IS NULL
          AND ur.bucket_start >= ${startDate}
          AND ur.bucket_start <= ${endDate}
          ${whereFilters}
      `;
    }

    // -------------------------------------------------------------------------
    // Q3: TIME-SERIES
    // -------------------------------------------------------------------------

    let q3: ReturnType<typeof sql>;

    if (isAttributionGroup) {
      q3 = sql`
        SELECT
          DATE(ur.bucket_start)::text                                                AS date,
          ${selectGroupKey}                                                           AS group_key,
          ${selectGroupLabel}                                                         AS group_label,
          COALESCE(SUM(ur.calculated_cost_amount), 0)::numeric(16,8)::text          AS total_cost,
          COALESCE(SUM(ur.request_count), 0)::bigint                                AS total_request_count
        FROM cost_tracking_attribution_groups ag
        INNER JOIN cost_tracking_attribution_rules ar
          ON ar.group_id = ag.id
          AND ar.deleted_at IS NULL
          AND ar.match_type IN ('exact', 'in_list')
        LEFT JOIN cost_tracking_usage_records ur
          ON ur.deleted_at IS NULL
          AND ur.bucket_start >= ${startDate}
          AND ur.bucket_start <= ${endDate}
          AND (
            (ar.dimension = 'credential'        AND ar.match_type = 'exact'   AND ur.credential_id = ar.match_value)
            OR (ar.dimension = 'credential'     AND ar.match_type = 'in_list' AND ur.credential_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'provider'       AND ar.match_type = 'exact'   AND ur.provider_id = ar.match_value)
            OR (ar.dimension = 'provider'       AND ar.match_type = 'in_list' AND ur.provider_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'segment'        AND ar.match_type = 'exact'   AND ur.segment_id = ar.match_value)
            OR (ar.dimension = 'segment'        AND ar.match_type = 'in_list' AND ur.segment_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'model'          AND ar.match_type = 'exact'   AND ur.model_id = ar.match_value)
            OR (ar.dimension = 'model'          AND ar.match_type = 'in_list' AND ur.model_id = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'model_slug'     AND ar.match_type = 'exact'   AND ur.model_slug = ar.match_value)
            OR (ar.dimension = 'model_slug'     AND ar.match_type = 'in_list' AND ur.model_slug = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'service_category' AND ar.match_type = 'exact'   AND ur.service_category::text = ar.match_value)
            OR (ar.dimension = 'service_category' AND ar.match_type = 'in_list' AND ur.service_category::text = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'service_tier'   AND ar.match_type = 'exact'   AND ur.service_tier = ar.match_value)
            OR (ar.dimension = 'service_tier'   AND ar.match_type = 'in_list' AND ur.service_tier = ANY(string_to_array(ar.match_value, ',')))
            OR (ar.dimension = 'region'         AND ar.match_type = 'exact'   AND ur.region = ar.match_value)
            OR (ar.dimension = 'region'         AND ar.match_type = 'in_list' AND ur.region = ANY(string_to_array(ar.match_value, ',')))
          )
          ${whereFilters}
        WHERE ag.deleted_at IS NULL
          AND ur.id IS NOT NULL
        GROUP BY DATE(ur.bucket_start), ag.id, ag.display_name
        ORDER BY DATE(ur.bucket_start)
      `;
    } else if (!groupBy) {
      q3 = sql`
        SELECT
          DATE(ur.bucket_start)::text                                                AS date,
          COALESCE(SUM(ur.calculated_cost_amount), 0)::numeric(16,8)::text          AS total_cost,
          COALESCE(SUM(ur.request_count), 0)::bigint                                AS total_request_count
        FROM cost_tracking_usage_records ur
        ${baseJoin}
        ${dimensionJoin}
        WHERE ur.deleted_at IS NULL
          AND ur.bucket_start >= ${startDate}
          AND ur.bucket_start <= ${endDate}
          ${whereFilters}
        GROUP BY DATE(ur.bucket_start)
        ORDER BY DATE(ur.bucket_start)
      `;
    } else {
      q3 = sql`
        SELECT
          DATE(ur.bucket_start)::text                                                AS date,
          ${selectGroupKey}                                                           AS group_key,
          ${selectGroupLabel}                                                         AS group_label,
          COALESCE(SUM(ur.calculated_cost_amount), 0)::numeric(16,8)::text          AS total_cost,
          COALESCE(SUM(ur.request_count), 0)::bigint                                AS total_request_count
        FROM cost_tracking_usage_records ur
        ${baseJoin}
        ${dimensionJoin}
        WHERE ur.deleted_at IS NULL
          AND ur.bucket_start >= ${startDate}
          AND ur.bucket_start <= ${endDate}
          ${whereFilters}
        GROUP BY DATE(ur.bucket_start), ${groupByColumns}
        ORDER BY DATE(ur.bucket_start)
      `;
    }

    // -------------------------------------------------------------------------
    // EXECUTE ALL THREE QUERIES IN PARALLEL
    // -------------------------------------------------------------------------

    const [r1, r2, r3] = await Promise.all([
      db.execute(q1),
      db.execute(q2),
      db.execute(q3),
    ]);

    // -------------------------------------------------------------------------
    // MAP RESULTS
    // -------------------------------------------------------------------------

    const rows: ExplorerResultRow[] = r1.rows.map((row) => ({
      groupKey: row['group_key'] != null ? String(row['group_key']) : '__all__',
      groupLabel: row['group_label'] != null ? String(row['group_label']) : 'All Usage',
      serviceCategories: mapServiceCategories(row['service_categories']),
      totalInputTokens: Number(row['total_input_tokens'] ?? 0),
      totalOutputTokens: Number(row['total_output_tokens'] ?? 0),
      totalCachedInputTokens: Number(row['total_cached_input_tokens'] ?? 0),
      totalCacheWriteTokens: Number(row['total_cache_write_tokens'] ?? 0),
      totalThinkingTokens: Number(row['total_thinking_tokens'] ?? 0),
      totalAudioInputTokens: Number(row['total_audio_input_tokens'] ?? 0),
      totalAudioOutputTokens: Number(row['total_audio_output_tokens'] ?? 0),
      totalImageCount: Number(row['total_image_count'] ?? 0),
      totalCharacterCount: Number(row['total_character_count'] ?? 0),
      totalDurationSeconds: Number(row['total_duration_seconds'] ?? 0),
      totalStorageBytes: Number(row['total_storage_bytes'] ?? 0),
      totalSessionCount: Number(row['total_session_count'] ?? 0),
      totalSearchCount: Number(row['total_search_count'] ?? 0),
      totalRequestCount: Number(row['total_request_count'] ?? 0),
      totalCost: String(row['total_cost'] ?? '0.00000000'),
      currency: 'USD',
    }));

    const totalsRow = r2.rows[0] ?? {};
    const totalRows = Number(totalsRow['total_rows'] ?? 0);
    const totalCost = String(totalsRow['total_cost'] ?? '0.00000000');
    const totalRequestCount = Number(totalsRow['total_request_count'] ?? 0);
    const serviceCategories = mapServiceCategories(totalsRow['service_categories']);

    const timeSeries: TimeSeriesPoint[] = r3.rows.map((row) => {
      const point: TimeSeriesPoint = {
        date: String(row['date']),
        totalCost: String(row['total_cost'] ?? '0.00000000'),
        totalRequestCount: Number(row['total_request_count'] ?? 0),
      };
      if (groupBy) {
        point.groupKey = row['group_key'] != null ? String(row['group_key']) : undefined;
        point.groupLabel = row['group_label'] != null ? String(row['group_label']) : undefined;
      }
      return point;
    });

    return {
      rows,
      timeSeries,
      totalRows,
      totalCost,
      totalRequestCount,
      currency: 'USD',
      page,
      pageSize,
      serviceCategories,
    };
  },

  /**
   * Return distinct non-null values for a single dimension column from usage records.
   * The column parameter is from a fixed enum — not user input — so the column
   * reference lookup is safe against injection.
   * ZOMBIE SHIELD: soft-deleted records are excluded.
   */
  async getDistinctValues(
    column: 'model_slug' | 'service_tier' | 'context_tier' | 'region',
  ): Promise<string[]> {
    const columnRef = {
      model_slug: costTrackingUsageRecords.modelSlug,
      service_tier: costTrackingUsageRecords.serviceTier,
      context_tier: costTrackingUsageRecords.contextTier,
      region: costTrackingUsageRecords.region,
    }[column];

    const rows = await db
      .selectDistinct({ value: columnRef })
      .from(costTrackingUsageRecords)
      .where(
        and(
          isNull(costTrackingUsageRecords.deletedAt),
          isNotNull(columnRef),
        ),
      )
      .orderBy(asc(columnRef));

    return rows.map((r) => String(r.value));
  },

  /**
   * Return distinct segment id + display_name pairs referenced by usage records.
   * JOINs cost_tracking_provider_segments to resolve human-readable names.
   * ZOMBIE SHIELD: soft-deleted records are excluded.
   */
  async getDistinctSegments(): Promise<Array<{ id: string; displayName: string }>> {
    const rows = await db
      .selectDistinct({
        id: costTrackingUsageRecords.segmentId,
        displayName: costTrackingProviderSegments.displayName,
      })
      .from(costTrackingUsageRecords)
      .innerJoin(
        costTrackingProviderSegments,
        eq(costTrackingUsageRecords.segmentId, costTrackingProviderSegments.id),
      )
      .where(
        and(
          isNull(costTrackingUsageRecords.deletedAt),
          isNotNull(costTrackingUsageRecords.segmentId),
        ),
      )
      .orderBy(asc(costTrackingProviderSegments.displayName));

    return rows
      .filter((r): r is { id: string; displayName: string } => r.id != null)
      .map((r) => ({ id: r.id, displayName: r.displayName }));
  },
});

// =============================================================================
// SECTION 3: INTERNAL HELPERS
// =============================================================================

/**
 * Convert the raw ARRAY_AGG result from the database into a typed
 * ServiceCategory array. Postgres returns array columns as a JavaScript
 * array of strings; nulls (when no records match) become an empty array.
 */
function mapServiceCategories(raw: unknown): ServiceCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => v != null) as ServiceCategory[];
}
