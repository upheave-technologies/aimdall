// =============================================================================
// Infrastructure — Drizzle Attribution Repository
// =============================================================================
// Concrete implementation of IAttributionRepository using Drizzle ORM.
//
// Zombie Shield is active on all SELECT operations for groups and rules:
//   isNull(deletedAt) is present in every WHERE clause.
//
// Factory pattern for dependency injection:
//   const attributionRepo = makeAttributionRepository(db);
// =============================================================================

import { eq, and, isNull } from 'drizzle-orm';
import { costTrackingAttributionGroups } from '../../schema/attributionGroups';
import { costTrackingAttributionRules } from '../../schema/attributionRules';
import { AttributionGroup, GroupType } from '../../domain/attributionGroup';
import {
  AttributionRule,
  AttributionDimension,
  MatchType,
} from '../../domain/attributionRule';
import { IAttributionRepository } from '../../domain/repositories';
import { CostTrackingDatabase } from '../database';

// =============================================================================
// SECTION 1: FACTORY
// =============================================================================

/**
 * Factory function that creates an Attribution repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking schema
 * @returns IAttributionRepository implementation
 */
export const makeAttributionRepository = (db: CostTrackingDatabase): IAttributionRepository => ({
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
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      deletedAt: group.deletedAt ?? null,
    });
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
});

// =============================================================================
// SECTION 2: INTERNAL MAPPING
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
