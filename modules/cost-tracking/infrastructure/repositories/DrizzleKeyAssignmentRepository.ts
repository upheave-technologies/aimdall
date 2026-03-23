// =============================================================================
// Infrastructure — Drizzle Key Assignment Repository
// =============================================================================
// Concrete implementation of IKeyAssignmentRepository using Drizzle ORM.
//
// Zombie Shield is active on all SELECT operations:
//   isNull(costTrackingKeyAssignments.deletedAt) is present in every WHERE clause
//   so soft-deleted assignments never appear in results.
//
// getUserUsageSummary performs a three-way JOIN:
//   identity_principals → cost_tracking_key_assignments → cost_tracking_usage_records
//
//   The db instance passed at runtime is created with both schemas merged
//   (see lib/db.ts), so the identityPrincipals table is available even though
//   the KeyAssignmentDatabase type is expressed using ReturnType on the combined
//   schema. All three zombie shields apply: deletedAt IS NULL on assignments,
//   usage records, and the date-range filter on bucketStart.
//
// Factory pattern for dependency injection:
//   const keyAssignmentRepo = makeKeyAssignmentRepository(db);
//   await keyAssignmentRepo.findByPrincipalId('principal-id');
// =============================================================================

import { sql, eq, and, isNull, gte, lte, countDistinct } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as costTrackingSchema from '../../schema';
import * as identitySchema from '@/packages/@core/identity/schema';
import { costTrackingKeyAssignments } from '../../schema/keyAssignments';
import { costTrackingUsageRecords } from '../../schema/usageRecords';
import { costTrackingProviderCredentials } from '../../schema/providerCredentials';
import { identityPrincipals } from '@/packages/@core/identity/schema/principals';
import { costTrackingProviders } from '../../schema/providers';
import { KeyAssignment } from '../../domain/keyAssignment';
import { IKeyAssignmentRepository, UserUsageRow, EnrichedKeyAssignment } from '../../domain/repositories';

// =============================================================================
// SECTION 1: DATABASE TYPE
// =============================================================================

/**
 * The type of the Drizzle database instance this repository requires.
 *
 * This repository JOINs across both the Cost Tracking schema and the Identity
 * schema (identityPrincipals). The consuming application must pass a db instance
 * created with both schemas merged (e.g., the shared db from lib/db.ts).
 */
export type KeyAssignmentDatabase = ReturnType<
  typeof drizzle<typeof costTrackingSchema & typeof identitySchema>
>;

// =============================================================================
// SECTION 2: FACTORY
// =============================================================================

/**
 * Factory function that creates a KeyAssignment repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking AND Identity schemas
 * @returns IKeyAssignmentRepository implementation
 */
export const makeKeyAssignmentRepository = (db: KeyAssignmentDatabase): IKeyAssignmentRepository => ({
  /**
   * Find an active key assignment by its internal ID.
   * ZOMBIE SHIELD: excludes soft-deleted assignments.
   */
  async findById(id: string): Promise<KeyAssignment | null> {
    const result = await db
      .select()
      .from(costTrackingKeyAssignments)
      .where(
        and(
          eq(costTrackingKeyAssignments.id, id),
          isNull(costTrackingKeyAssignments.deletedAt),
        ),
      )
      .limit(1);

    if (result.length === 0) return null;
    return mapToKeyAssignment(result[0]);
  },

  /**
   * Find all active key assignments for a given principal.
   * ZOMBIE SHIELD: excludes soft-deleted assignments.
   */
  async findByPrincipalId(principalId: string): Promise<KeyAssignment[]> {
    const rows = await db
      .select()
      .from(costTrackingKeyAssignments)
      .where(
        and(
          eq(costTrackingKeyAssignments.principalId, principalId),
          isNull(costTrackingKeyAssignments.deletedAt),
        ),
      );

    return rows.map(mapToKeyAssignment);
  },

  /**
   * Find all active key assignments for a given credential.
   * ZOMBIE SHIELD: excludes soft-deleted assignments.
   */
  async findByCredentialId(credentialId: string): Promise<KeyAssignment[]> {
    const rows = await db
      .select()
      .from(costTrackingKeyAssignments)
      .where(
        and(
          eq(costTrackingKeyAssignments.credentialId, credentialId),
          isNull(costTrackingKeyAssignments.deletedAt),
        ),
      );

    return rows.map(mapToKeyAssignment);
  },

  /**
   * Find a single active assignment for a (principalId, credentialId) pair.
   * ZOMBIE SHIELD: excludes soft-deleted assignments.
   */
  async findByPrincipalAndCredential(
    principalId: string,
    credentialId: string,
  ): Promise<KeyAssignment | null> {
    const result = await db
      .select()
      .from(costTrackingKeyAssignments)
      .where(
        and(
          eq(costTrackingKeyAssignments.principalId, principalId),
          eq(costTrackingKeyAssignments.credentialId, credentialId),
          isNull(costTrackingKeyAssignments.deletedAt),
        ),
      )
      .limit(1);

    if (result.length === 0) return null;
    return mapToKeyAssignment(result[0]);
  },

  /** Persist a new key assignment. */
  async save(assignment: KeyAssignment): Promise<void> {
    await db.insert(costTrackingKeyAssignments).values({
      id: assignment.id,
      principalId: assignment.principalId,
      credentialId: assignment.credentialId,
      assignedAt: assignment.assignedAt,
      deletedAt: assignment.deletedAt,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
    });
  },

  /**
   * Soft-delete a key assignment by setting its deletedAt timestamp.
   * Never hard-deletes — preserves audit trail.
   */
  async softDelete(id: string): Promise<void> {
    await db
      .update(costTrackingKeyAssignments)
      .set({ deletedAt: new Date() })
      .where(eq(costTrackingKeyAssignments.id, id));
  },

  /**
   * Find all active key assignments for a principal, enriched with credential
   * label and provider display name via JOINs.
   *
   * JOIN chain:
   *   cost_tracking_key_assignments (ka)
   *     INNER JOIN cost_tracking_provider_credentials (cred) ON ka.credential_id = cred.id
   *     INNER JOIN cost_tracking_providers (p) ON cred.provider_id = p.id
   *
   * ZOMBIE SHIELD: soft-deleted assignments are excluded.
   */
  async findByPrincipalIdEnriched(principalId: string): Promise<EnrichedKeyAssignment[]> {
    const rows = await db
      .select({
        id: costTrackingKeyAssignments.id,
        principalId: costTrackingKeyAssignments.principalId,
        credentialId: costTrackingKeyAssignments.credentialId,
        assignedAt: costTrackingKeyAssignments.assignedAt,
        deletedAt: costTrackingKeyAssignments.deletedAt,
        createdAt: costTrackingKeyAssignments.createdAt,
        updatedAt: costTrackingKeyAssignments.updatedAt,
        credentialLabel: costTrackingProviderCredentials.label,
        providerDisplayName: costTrackingProviders.displayName,
      })
      .from(costTrackingKeyAssignments)
      .innerJoin(
        costTrackingProviderCredentials,
        eq(costTrackingKeyAssignments.credentialId, costTrackingProviderCredentials.id),
      )
      .innerJoin(
        costTrackingProviders,
        eq(costTrackingProviderCredentials.providerId, costTrackingProviders.id),
      )
      .where(
        and(
          eq(costTrackingKeyAssignments.principalId, principalId),
          isNull(costTrackingKeyAssignments.deletedAt),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      principalId: row.principalId,
      credentialId: row.credentialId,
      assignedAt: row.assignedAt,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      credentialLabel: row.credentialLabel,
      providerDisplayName: row.providerDisplayName,
    }));
  },

  /**
   * Aggregate token and cost totals grouped by principal.
   *
   * JOIN chain:
   *   identity_principals (ip)
   *     INNER JOIN cost_tracking_key_assignments (ka) ON ka.principal_id = ip.id
   *     INNER JOIN cost_tracking_usage_records (ur) ON ur.credential_id = ka.credential_id
   *
   * ZOMBIE SHIELD:
   *   - ka.deleted_at IS NULL  (active assignments only)
   *   - ur.deleted_at IS NULL  (active usage records only)
   *   - ip.deleted_at IS NULL  (active principals only)
   *   - ur.bucket_start in [startDate, endDate]
   */
  async getUserUsageSummary(startDate: Date, endDate: Date): Promise<UserUsageRow[]> {
    const rows = await db
      .select({
        principalId: identityPrincipals.id,
        principalName: identityPrincipals.name,
        principalEmail: identityPrincipals.email,
        totalInputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.inputTokens}), 0)::bigint`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${costTrackingUsageRecords.outputTokens}), 0)::bigint`,
        totalCost: sql<string>`COALESCE(SUM(${costTrackingUsageRecords.calculatedCostAmount}), 0)::numeric(16,8)::text`,
        recordCount: sql<number>`COUNT(${costTrackingUsageRecords.id})::bigint`,
        credentialCount: countDistinct(costTrackingKeyAssignments.credentialId),
      })
      .from(identityPrincipals)
      .innerJoin(
        costTrackingKeyAssignments,
        and(
          eq(costTrackingKeyAssignments.principalId, identityPrincipals.id),
          isNull(costTrackingKeyAssignments.deletedAt),
        ),
      )
      .innerJoin(
        costTrackingUsageRecords,
        and(
          eq(costTrackingUsageRecords.credentialId, costTrackingKeyAssignments.credentialId),
          isNull(costTrackingUsageRecords.deletedAt),
          gte(costTrackingUsageRecords.bucketStart, startDate),
          lte(costTrackingUsageRecords.bucketStart, endDate),
        ),
      )
      .where(isNull(identityPrincipals.deletedAt))
      .groupBy(
        identityPrincipals.id,
        identityPrincipals.name,
        identityPrincipals.email,
      );

    return rows.map((row) => ({
      principalId: row.principalId,
      principalName: row.principalName,
      principalEmail: row.principalEmail ?? null,
      totalInputTokens: Number(row.totalInputTokens),
      totalOutputTokens: Number(row.totalOutputTokens),
      totalCost: String(row.totalCost),
      recordCount: Number(row.recordCount),
      credentialCount: Number(row.credentialCount),
    }));
  },
});

// =============================================================================
// SECTION 3: INTERNAL MAPPING
// =============================================================================

/**
 * Maps a Drizzle query result row to the domain KeyAssignment type.
 *
 * Handles type conversions:
 *   - deletedAt (timestamp | null) → kept as null (domain uses null, not undefined)
 */
function mapToKeyAssignment(
  row: typeof costTrackingKeyAssignments.$inferSelect,
): KeyAssignment {
  return {
    id: row.id,
    principalId: row.principalId,
    credentialId: row.credentialId,
    assignedAt: row.assignedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
