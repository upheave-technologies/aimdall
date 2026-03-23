// =============================================================================
// Application — Update Attribution Group Use Case
// =============================================================================
// Updates the mutable fields of an existing AttributionGroup.
//
// Flow:
//   1. Find the existing group — return NOT_FOUND if absent
//   2. Apply changes from input (only fields that are explicitly provided)
//   3. Validate entity link consistency on the resulting state
//   4. Persist via repo.updateGroup
//   5. Return the updated AttributionGroup
//
// Pre-wired export: `updateAttributionGroup`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { AttributionGroup, validateEntityLink } from '../domain/attributionGroup';
import { IAttributionRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type UpdateAttributionGroupInput = {
  id: string;
  displayName?: string;
  description?: string | null;
  parentId?: string | null;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the updateAttributionGroup use case.
 *
 * @param attributionRepository - Repository for finding and updating the group
 * @returns Async use case function
 */
export const makeUpdateAttributionGroupUseCase = (
  attributionRepository: IAttributionRepository,
) => {
  return async (
    data: UpdateAttributionGroupInput,
  ): Promise<Result<AttributionGroup, CostTrackingError>> => {
    try {
      // Step 1: Find existing group
      // The repository interface does not expose findGroupById — fetch all active groups
      // and filter by ID. This is a deliberate limitation of the current interface surface.
      const allGroups = await attributionRepository.findAllGroups();
      const group = allGroups.find((g) => g.id === data.id) ?? null;

      if (!group) {
        return {
          success: false,
          error: new CostTrackingError(
            `Attribution group "${data.id}" not found`,
            'NOT_FOUND',
          ),
        };
      }

      // Step 2: Apply changes — undefined means "no change"; null means "clear the field"
      const updatedDisplayName =
        data.displayName !== undefined ? data.displayName.trim() : group.displayName;
      const updatedDescription =
        data.description !== undefined ? data.description ?? undefined : group.description;
      const updatedParentId =
        data.parentId !== undefined ? data.parentId ?? undefined : group.parentId;
      const updatedLinkedEntityType =
        data.linkedEntityType !== undefined
          ? data.linkedEntityType ?? undefined
          : group.linkedEntityType;
      const updatedLinkedEntityId =
        data.linkedEntityId !== undefined
          ? data.linkedEntityId ?? undefined
          : group.linkedEntityId;

      if (!updatedDisplayName || updatedDisplayName.length === 0) {
        return {
          success: false,
          error: new CostTrackingError('displayName cannot be empty', 'VALIDATION_ERROR'),
        };
      }

      // Step 3: Validate entity link consistency on resulting state
      const linkResult = validateEntityLink(updatedLinkedEntityType, updatedLinkedEntityId);
      if (!linkResult.success) {
        return {
          success: false,
          error: new CostTrackingError(linkResult.error.message, 'VALIDATION_ERROR'),
        };
      }

      // Step 4: Assemble updated group
      const updatedGroup: AttributionGroup = {
        ...group,
        displayName: updatedDisplayName,
        description: updatedDescription,
        parentId: updatedParentId,
        linkedEntityType: updatedLinkedEntityType,
        linkedEntityId: updatedLinkedEntityId,
        updatedAt: new Date(),
      };

      // Step 5: Persist and return
      await attributionRepository.updateGroup(updatedGroup);
      return { success: true, value: updatedGroup };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to update attribution group', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const attributionRepository = makeAttributionRepository(db);

export const updateAttributionGroup = makeUpdateAttributionGroupUseCase(attributionRepository);
