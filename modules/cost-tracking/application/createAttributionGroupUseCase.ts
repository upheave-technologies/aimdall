// =============================================================================
// Application — Create Attribution Group Use Case
// =============================================================================
// Creates a new AttributionGroup for cost attribution reporting.
//
// Flow:
//   1. Auto-generate slug from displayName if not provided (lowercase, hyphenated)
//   2. Validate entity link consistency (both or neither of linkedEntityType/Id)
//   3. Check slug uniqueness via repo.findGroupBySlug
//   4. Assemble full AttributionGroup with cuid2 ID and timestamps
//   5. Persist via repo.createGroup
//   6. Return the created AttributionGroup
//
// Pre-wired export: `createAttributionGroup`
// =============================================================================

import { createId } from '@paralleldrive/cuid2';
import { Result } from '@/packages/shared/lib/result';
import { AttributionGroup, GroupType, validateEntityLink } from '../domain/attributionGroup';
import { IAttributionRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type CreateAttributionGroupInput = {
  displayName: string;
  slug?: string;
  groupType: GroupType;
  parentId?: string;
  description?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the createAttributionGroup use case.
 *
 * @param attributionRepository - Repository for persisting the group
 * @returns Async use case function
 */
export const makeCreateAttributionGroupUseCase = (
  attributionRepository: IAttributionRepository,
) => {
  return async (
    data: CreateAttributionGroupInput,
  ): Promise<Result<AttributionGroup, CostTrackingError>> => {
    try {
      // Step 1: Validate inputs
      if (!data.displayName || data.displayName.trim().length === 0) {
        return {
          success: false,
          error: new CostTrackingError('displayName cannot be empty', 'VALIDATION_ERROR'),
        };
      }

      // Step 2: Validate entity link consistency
      const linkResult = validateEntityLink(data.linkedEntityType, data.linkedEntityId);
      if (!linkResult.success) {
        return {
          success: false,
          error: new CostTrackingError(linkResult.error.message, 'VALIDATION_ERROR'),
        };
      }

      // Step 3: Generate slug from displayName if not provided
      const slug =
        data.slug?.trim() ||
        data.displayName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

      // Step 4: Check slug uniqueness
      const existing = await attributionRepository.findGroupBySlug(slug);
      if (existing) {
        return {
          success: false,
          error: new CostTrackingError(
            `An attribution group with slug "${slug}" already exists`,
            'ALREADY_EXISTS',
          ),
        };
      }

      // Step 5: Assemble full entity
      const now = new Date();
      const group: AttributionGroup = {
        id: createId(),
        slug,
        displayName: data.displayName.trim(),
        groupType: data.groupType,
        parentId: data.parentId,
        description: data.description,
        linkedEntityType: data.linkedEntityType,
        linkedEntityId: data.linkedEntityId,
        createdAt: now,
        updatedAt: now,
      };

      // Step 6: Persist and return
      await attributionRepository.createGroup(group);
      return { success: true, value: group };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to create attribution group', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const attributionRepository = makeAttributionRepository(db);

export const createAttributionGroup = makeCreateAttributionGroupUseCase(attributionRepository);
