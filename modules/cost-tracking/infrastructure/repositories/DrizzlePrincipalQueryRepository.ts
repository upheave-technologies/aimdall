// =============================================================================
// Infrastructure — Drizzle Principal Query Repository
// =============================================================================
// Read-only query implementation for Principal records, used by the
// cost-tracking module to list users for assignment and reporting.
//
// The Identity package's IPrincipalRepository does not expose a findAll method
// and is nucleus-managed (read-only). This repository fulfils the
// IPrincipalQueryRepository interface defined in the cost-tracking domain,
// querying the identity_principals table directly.
//
// Zombie Shield is active on all SELECT operations:
//   isNull(identityPrincipals.deletedAt) is present in every WHERE clause
//   so soft-deleted principals never appear in results.
//
// Factory pattern for dependency injection:
//   const principalQueryRepo = makePrincipalQueryRepository(db);
//   const principals = await principalQueryRepo.findAll();
// =============================================================================

import { isNull, asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as costTrackingSchema from '../../schema';
import * as identitySchema from '@/packages/@core/identity/schema';
import { identityPrincipals } from '@/packages/@core/identity/schema/principals';
import { IPrincipalQueryRepository, PrincipalRecord } from '../../domain/repositories';

// =============================================================================
// SECTION 1: DATABASE TYPE
// =============================================================================

/**
 * The type of the Drizzle database instance this repository requires.
 *
 * This repository queries the identity_principals table. The consuming
 * application must pass a db instance created with both the Cost Tracking
 * schema and the Identity schema merged (e.g., the shared db from lib/db.ts).
 */
export type PrincipalQueryDatabase = ReturnType<
  typeof drizzle<typeof costTrackingSchema & typeof identitySchema>
>;

// =============================================================================
// SECTION 2: FACTORY
// =============================================================================

/**
 * Factory function that creates a PrincipalQuery repository instance.
 *
 * @param db - Drizzle database instance with Identity schema
 * @returns IPrincipalQueryRepository implementation
 */
export const makePrincipalQueryRepository = (db: PrincipalQueryDatabase): IPrincipalQueryRepository => ({
  /**
   * Find all active principals, ordered by name.
   * ZOMBIE SHIELD: excludes soft-deleted principals.
   */
  async findAll(): Promise<PrincipalRecord[]> {
    const rows = await db
      .select({
        id: identityPrincipals.id,
        type: identityPrincipals.type,
        status: identityPrincipals.status,
        name: identityPrincipals.name,
        email: identityPrincipals.email,
        createdAt: identityPrincipals.createdAt,
        updatedAt: identityPrincipals.updatedAt,
      })
      .from(identityPrincipals)
      .where(isNull(identityPrincipals.deletedAt))
      .orderBy(asc(identityPrincipals.name));

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      name: row.name,
      email: row.email ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },
});
