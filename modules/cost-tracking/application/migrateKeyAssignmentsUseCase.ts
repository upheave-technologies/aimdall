// =============================================================================
// Application — Migrate Key Assignments Use Case
// =============================================================================
// One-time migration that converts legacy KeyAssignment records into the new
// AttributionGroup / AttributionRule model.
//
// For each principal that has at least one active key assignment:
//   - Find or create an AttributionGroup with type='user', linked to the principal
//   - For each key assignment, create an AttributionRule with dimension='credential'
//     if one doesn't already exist
//
// This use case is idempotent: re-running it will skip already-migrated groups
// and rules rather than creating duplicates.
//
// Flow:
//   1. List all principals via principalQueryRepository.findAll
//   2. For each principal, list their active key assignments
//   3. If the principal has assignments:
//      a. Check if an attribution group already exists for this principal
//      b. If not, create an AttributionGroup (type='user', linkedEntityType='principal')
//      c. For each assignment, check for duplicate rule and create if absent
//   4. Return migration stats { groupsCreated, rulesCreated, skipped }
//
// Pre-wired export: `migrateKeyAssignments`
// =============================================================================

import { createId } from '@paralleldrive/cuid2';
import { Result } from '@/packages/shared/lib/result';
import { AttributionGroup } from '../domain/attributionGroup';
import { AttributionRule } from '../domain/attributionRule';
import {
  IAttributionRepository,
  IKeyAssignmentRepository,
  IPrincipalQueryRepository,
} from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { makeKeyAssignmentRepository } from '../infrastructure/repositories/DrizzleKeyAssignmentRepository';
import { makePrincipalQueryRepository } from '../infrastructure/repositories/DrizzlePrincipalQueryRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type MigrateKeyAssignmentsInput = Record<string, never>;

export type MigrateKeyAssignmentsResult = {
  groupsCreated: number;
  rulesCreated: number;
  skipped: number;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the migrateKeyAssignments use case.
 *
 * @param attributionRepository    - Repository for creating groups and rules
 * @param principalQueryRepository - Repository for listing all principals
 * @param keyAssignmentRepository  - Repository for listing key assignments per principal
 * @returns Async use case function
 */
export const makeMigrateKeyAssignmentsUseCase = (
  attributionRepository: IAttributionRepository,
  principalQueryRepository: IPrincipalQueryRepository,
  keyAssignmentRepository: IKeyAssignmentRepository,
) => {
  return async (): Promise<Result<MigrateKeyAssignmentsResult, CostTrackingError>> => {
    try {
      let groupsCreated = 0;
      let rulesCreated = 0;
      let skipped = 0;

      // Step 1: List all active principals
      const principals = await principalQueryRepository.findAll();

      for (const principal of principals) {
        // Step 2: List active key assignments for this principal
        const assignments = await keyAssignmentRepository.findByPrincipalId(principal.id);

        if (assignments.length === 0) {
          continue;
        }

        // Step 3a: Find or create attribution group for this principal
        let group = await attributionRepository.findGroupByEntity('principal', principal.id);

        if (!group) {
          // Step 3b: Create attribution group
          // Slug is derived from principal email or ID to keep it human-readable
          const slugBase = principal.email
            ? `user-${principal.email.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
            : `user-${principal.id}`;

          // Ensure the slug is unique — append a short suffix if needed
          let slug = slugBase;
          const existingWithSlug = await attributionRepository.findGroupBySlug(slug);
          if (existingWithSlug) {
            slug = `${slugBase}-${createId().slice(0, 6)}`;
          }

          const now = new Date();
          const newGroup: AttributionGroup = {
            id: createId(),
            slug,
            displayName: principal.name || principal.email || principal.id,
            groupType: 'user',
            linkedEntityType: 'principal',
            linkedEntityId: principal.id,
            createdAt: now,
            updatedAt: now,
          };

          await attributionRepository.createGroup(newGroup);
          group = newGroup;
          groupsCreated++;
        }

        // Step 3c: For each key assignment, create a rule if it doesn't exist
        for (const assignment of assignments) {
          const duplicate = await attributionRepository.findDuplicateRule(
            group.id,
            'credential',
            'exact',
            assignment.credentialId,
          );

          if (duplicate) {
            skipped++;
            continue;
          }

          const now = new Date();
          const rule: AttributionRule = {
            id: createId(),
            groupId: group.id,
            dimension: 'credential',
            matchType: 'exact',
            matchValue: assignment.credentialId,
            priority: 0,
            createdAt: now,
            updatedAt: now,
          };

          await attributionRepository.createRule(rule);
          rulesCreated++;
        }
      }

      return {
        success: true,
        value: { groupsCreated, rulesCreated, skipped },
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to migrate key assignments', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const attributionRepository = makeAttributionRepository(db);
const keyAssignmentRepository = makeKeyAssignmentRepository(db);
const principalQueryRepository = makePrincipalQueryRepository(db);

export const migrateKeyAssignments = makeMigrateKeyAssignmentsUseCase(
  attributionRepository,
  principalQueryRepository,
  keyAssignmentRepository,
);
