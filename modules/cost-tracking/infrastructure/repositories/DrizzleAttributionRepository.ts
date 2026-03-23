// =============================================================================
// Infrastructure — Drizzle Attribution Repository
// =============================================================================
// Concrete implementation of IAttributionRepository using Drizzle ORM.
//
// Zombie Shield is active on all SELECT operations for groups and rules:
//   isNull(deletedAt) is present in every WHERE clause.
//
// getAttributionSummary uses raw SQL via db.execute() because the conditional
// JOIN logic (matching different dimension columns based on rule dimension) is
// too complex for the Drizzle query builder.
//
// Factory pattern for dependency injection:
//   const attributionRepo = makeAttributionRepository(db);
// =============================================================================

import { eq, and, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as costTrackingSchema from '../../schema';
import * as identitySchema from '@/packages/@core/identity/schema';
import { costTrackingAttributionGroups } from '../../schema/attributionGroups';
import { costTrackingAttributionRules } from '../../schema/attributionRules';
import { AttributionGroup, GroupType } from '../../domain/attributionGroup';
import {
  AttributionRule,
  AttributionDimension,
  MatchType,
} from '../../domain/attributionRule';
import { IAttributionRepository, AttributionSummaryRow } from '../../domain/repositories';

// =============================================================================
// SECTION 1: DATABASE TYPE
// =============================================================================

/**
 * The type of the Drizzle database instance this repository requires.
 *
 * getAttributionSummary LEFT JOINs identity_principals when linkedEntityType
 * is 'principal'. The consuming application must pass a db instance created
 * with both the Cost Tracking schema and the Identity schema merged
 * (e.g., the shared db from lib/db.ts).
 */
export type AttributionDatabase = ReturnType<
  typeof drizzle<typeof costTrackingSchema & typeof identitySchema>
>;

// =============================================================================
// SECTION 2: FACTORY
// =============================================================================

/**
 * Factory function that creates an Attribution repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking AND Identity schemas
 * @returns IAttributionRepository implementation
 */
export const makeAttributionRepository = (db: AttributionDatabase): IAttributionRepository => ({
  /**
   * Find an active attribution group by slug.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findGroupBySlug(slug: string): Promise<AttributionGroup | null> {
    const result = await db
      .select()
      .from(costTrackingAttributionGroups)
      .where(
        and(
          eq(costTrackingAttributionGroups.slug, slug),
          isNull(costTrackingAttributionGroups.deletedAt),
        ),
      )
      .limit(1);

    if (result.length === 0) return null;
    return mapToGroup(result[0]);
  },

  /**
   * Find all active attribution groups.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findAllGroups(): Promise<AttributionGroup[]> {
    const rows = await db
      .select()
      .from(costTrackingAttributionGroups)
      .where(isNull(costTrackingAttributionGroups.deletedAt));

    return rows.map(mapToGroup);
  },

  /** Insert a new attribution group. */
  async createGroup(group: AttributionGroup): Promise<void> {
    await db.insert(costTrackingAttributionGroups).values({
      id: group.id,
      slug: group.slug,
      displayName: group.displayName,
      groupType: group.groupType,
      parentId: group.parentId ?? null,
      description: group.description ?? null,
      metadata: group.metadata ?? null,
      linkedEntityType: group.linkedEntityType ?? null,
      linkedEntityId: group.linkedEntityId ?? null,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      deletedAt: group.deletedAt ?? null,
    });
  },

  /**
   * Update a group's mutable fields.
   * displayName, description, parentId, linkedEntityType, linkedEntityId
   * are the only mutable fields; slug, groupType, and timestamps are managed
   * by the database or creation logic.
   */
  async updateGroup(group: AttributionGroup): Promise<void> {
    await db
      .update(costTrackingAttributionGroups)
      .set({
        displayName: group.displayName,
        description: group.description ?? null,
        parentId: group.parentId ?? null,
        linkedEntityType: group.linkedEntityType ?? null,
        linkedEntityId: group.linkedEntityId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(costTrackingAttributionGroups.id, group.id));
  },

  /**
   * Soft-delete a group by setting its deletedAt timestamp.
   * Never hard-deletes — preserves audit trail.
   */
  async softDeleteGroup(id: string): Promise<void> {
    await db
      .update(costTrackingAttributionGroups)
      .set({ deletedAt: new Date() })
      .where(eq(costTrackingAttributionGroups.id, id));
  },

  /**
   * Find all active attribution rules for a given group.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findRulesByGroup(groupId: string): Promise<AttributionRule[]> {
    const rows = await db
      .select()
      .from(costTrackingAttributionRules)
      .where(
        and(
          eq(costTrackingAttributionRules.groupId, groupId),
          isNull(costTrackingAttributionRules.deletedAt),
        ),
      );

    return rows.map(mapToRule);
  },

  /**
   * Find all active attribution rules across all groups.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findAllRules(): Promise<AttributionRule[]> {
    const rows = await db
      .select()
      .from(costTrackingAttributionRules)
      .where(isNull(costTrackingAttributionRules.deletedAt));

    return rows.map(mapToRule);
  },

  /** Insert a new attribution rule. */
  async createRule(rule: AttributionRule): Promise<void> {
    await db.insert(costTrackingAttributionRules).values({
      id: rule.id,
      groupId: rule.groupId,
      dimension: rule.dimension,
      matchType: rule.matchType,
      matchValue: rule.matchValue,
      priority: rule.priority,
      description: rule.description ?? null,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      deletedAt: rule.deletedAt ?? null,
    });
  },

  /**
   * Soft-delete a rule by setting its deletedAt timestamp.
   * Never hard-deletes — preserves audit trail.
   */
  async softDeleteRule(id: string): Promise<void> {
    await db
      .update(costTrackingAttributionRules)
      .set({ deletedAt: new Date() })
      .where(eq(costTrackingAttributionRules.id, id));
  },

  /**
   * Find all active groups, optionally filtered by group type.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findGroupsByType(groupType?: string): Promise<AttributionGroup[]> {
    const rows = groupType
      ? await db
          .select()
          .from(costTrackingAttributionGroups)
          .where(
            and(
              eq(costTrackingAttributionGroups.groupType, groupType as GroupType),
              isNull(costTrackingAttributionGroups.deletedAt),
            ),
          )
      : await db
          .select()
          .from(costTrackingAttributionGroups)
          .where(isNull(costTrackingAttributionGroups.deletedAt));

    return rows.map(mapToGroup);
  },

  /**
   * Find a group by its linked entity (entityType + entityId).
   * Returns null when no matching active group exists.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findGroupByEntity(entityType: string, entityId: string): Promise<AttributionGroup | null> {
    const result = await db
      .select()
      .from(costTrackingAttributionGroups)
      .where(
        and(
          eq(costTrackingAttributionGroups.linkedEntityType, entityType),
          eq(costTrackingAttributionGroups.linkedEntityId, entityId),
          isNull(costTrackingAttributionGroups.deletedAt),
        ),
      )
      .limit(1);

    if (result.length === 0) return null;
    return mapToGroup(result[0]);
  },

  /**
   * Find an existing rule matching the same group + dimension + matchType + matchValue.
   * Used to prevent duplicate rule creation (mirrors the unique index in the schema).
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findDuplicateRule(
    groupId: string,
    dimension: string,
    matchType: string,
    matchValue: string,
  ): Promise<AttributionRule | null> {
    const result = await db
      .select()
      .from(costTrackingAttributionRules)
      .where(
        and(
          eq(costTrackingAttributionRules.groupId, groupId),
          eq(costTrackingAttributionRules.dimension, dimension as AttributionDimension),
          eq(costTrackingAttributionRules.matchType, matchType as MatchType),
          eq(costTrackingAttributionRules.matchValue, matchValue),
          isNull(costTrackingAttributionRules.deletedAt),
        ),
      )
      .limit(1);

    if (result.length === 0) return null;
    return mapToRule(result[0]);
  },

  /**
   * Aggregate usage by attribution group over a date range.
   *
   * Uses raw SQL via db.execute() because the conditional JOIN logic —
   * matching different dimension columns in usage_records based on the
   * rule's dimension value — cannot be expressed with the Drizzle query builder.
   *
   * JOIN chain:
   *   cost_tracking_attribution_groups (ag)
   *     INNER JOIN cost_tracking_attribution_rules (ar) — exact and in_list only
   *     LEFT JOIN cost_tracking_usage_records (ur)      — dimension-conditional
   *     LEFT JOIN identity_principals (ip)              — when linkedEntityType = 'principal'
   *
   * ZOMBIE SHIELD: all three data tables filtered by deleted_at IS NULL.
   * Regex and prefix rules are silently excluded (INNER JOIN limits to exact/in_list).
   */
  async getAttributionSummary(
    startDate: Date,
    endDate: Date,
    groupType?: string,
  ): Promise<AttributionSummaryRow[]> {
    const groupTypeFilter = groupType
      ? sql`AND ag.group_type = ${groupType}`
      : sql``;

    const query = sql`
      SELECT
        ag.id                                                                   AS group_id,
        ag.slug                                                                 AS group_slug,
        ag.display_name                                                         AS group_display_name,
        ag.group_type,
        ag.linked_entity_type,
        ag.linked_entity_id,
        ip.name                                                                 AS linked_entity_name,
        ip.email                                                                AS linked_entity_email,
        COALESCE(SUM(ur.input_tokens), 0)::bigint                              AS total_input_tokens,
        COALESCE(SUM(ur.output_tokens), 0)::bigint                             AS total_output_tokens,
        COALESCE(SUM(ur.calculated_cost_amount), 0)::numeric(16,8)::text       AS total_cost,
        COUNT(DISTINCT ur.id)::bigint                                           AS record_count,
        COUNT(DISTINCT ar.id)::bigint                                           AS rule_count
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
          (ar.dimension = 'credential'       AND ar.match_type = 'exact'   AND ur.credential_id = ar.match_value)
          OR (ar.dimension = 'credential'    AND ar.match_type = 'in_list' AND ur.credential_id = ANY(string_to_array(ar.match_value, ',')))
          OR (ar.dimension = 'provider'      AND ar.match_type = 'exact'   AND ur.provider_id = ar.match_value)
          OR (ar.dimension = 'provider'      AND ar.match_type = 'in_list' AND ur.provider_id = ANY(string_to_array(ar.match_value, ',')))
          OR (ar.dimension = 'segment'       AND ar.match_type = 'exact'   AND ur.segment_id = ar.match_value)
          OR (ar.dimension = 'segment'       AND ar.match_type = 'in_list' AND ur.segment_id = ANY(string_to_array(ar.match_value, ',')))
          OR (ar.dimension = 'model'         AND ar.match_type = 'exact'   AND ur.model_id = ar.match_value)
          OR (ar.dimension = 'model'         AND ar.match_type = 'in_list' AND ur.model_id = ANY(string_to_array(ar.match_value, ',')))
          OR (ar.dimension = 'model_slug'    AND ar.match_type = 'exact'   AND ur.model_slug = ar.match_value)
          OR (ar.dimension = 'model_slug'    AND ar.match_type = 'in_list' AND ur.model_slug = ANY(string_to_array(ar.match_value, ',')))
          OR (ar.dimension = 'service_category' AND ar.match_type = 'exact'   AND ur.service_category::text = ar.match_value)
          OR (ar.dimension = 'service_category' AND ar.match_type = 'in_list' AND ur.service_category::text = ANY(string_to_array(ar.match_value, ',')))
          OR (ar.dimension = 'service_tier'  AND ar.match_type = 'exact'   AND ur.service_tier = ar.match_value)
          OR (ar.dimension = 'service_tier'  AND ar.match_type = 'in_list' AND ur.service_tier = ANY(string_to_array(ar.match_value, ',')))
          OR (ar.dimension = 'region'        AND ar.match_type = 'exact'   AND ur.region = ar.match_value)
          OR (ar.dimension = 'region'        AND ar.match_type = 'in_list' AND ur.region = ANY(string_to_array(ar.match_value, ',')))
        )
      LEFT JOIN identity_principals ip
        ON ag.linked_entity_type = 'principal'
        AND ip.id = ag.linked_entity_id
        AND ip.deleted_at IS NULL
      WHERE ag.deleted_at IS NULL
        ${groupTypeFilter}
      GROUP BY
        ag.id,
        ag.slug,
        ag.display_name,
        ag.group_type,
        ag.linked_entity_type,
        ag.linked_entity_id,
        ip.name,
        ip.email
      ORDER BY total_cost DESC
    `;

    const result = await db.execute(query);

    return result.rows.map((row) => ({
      groupId: String(row['group_id']),
      groupSlug: String(row['group_slug']),
      groupDisplayName: String(row['group_display_name']),
      groupType: String(row['group_type']),
      linkedEntityType: row['linked_entity_type'] != null ? String(row['linked_entity_type']) : null,
      linkedEntityId: row['linked_entity_id'] != null ? String(row['linked_entity_id']) : null,
      linkedEntityName: row['linked_entity_name'] != null ? String(row['linked_entity_name']) : null,
      linkedEntityEmail: row['linked_entity_email'] != null ? String(row['linked_entity_email']) : null,
      totalInputTokens: Number(row['total_input_tokens']),
      totalOutputTokens: Number(row['total_output_tokens']),
      totalCost: String(row['total_cost']),
      recordCount: Number(row['record_count']),
      ruleCount: Number(row['rule_count']),
    }));
  },
});

// =============================================================================
// SECTION 3: INTERNAL MAPPING
// =============================================================================

function mapToGroup(
  row: typeof costTrackingAttributionGroups.$inferSelect,
): AttributionGroup {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    groupType: row.groupType as GroupType,
    parentId: row.parentId ?? undefined,
    description: row.description ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    linkedEntityType: row.linkedEntityType ?? undefined,
    linkedEntityId: row.linkedEntityId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
  };
}

function mapToRule(row: typeof costTrackingAttributionRules.$inferSelect): AttributionRule {
  return {
    id: row.id,
    groupId: row.groupId,
    dimension: row.dimension as AttributionDimension,
    matchType: row.matchType as MatchType,
    matchValue: row.matchValue,
    priority: row.priority,
    description: row.description ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
  };
}
