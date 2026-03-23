// =============================================================================
// Domain — AttributionGroup Entity
// =============================================================================
// Custom reporting groups for cost attribution: teams, departments, cost
// centres, environments, business units, or any arbitrary grouping.
//
// Design decisions:
//   - Groups form a tree via parentId, supporting hierarchical rollups
//     (e.g. Department → Team → Project).
//   - slug is the machine-readable identifier for API and query use.
//     Uniqueness among active groups is enforced at the infrastructure layer.
//   - groupType classifies what kind of organisational entity this group
//     represents, enabling type-specific UI rendering and validation.
//   - linkedEntityType / linkedEntityId are soft references to external entities
//     (e.g., a Principal from the Identity module). Both fields must be present
//     together or both absent — enforced by validateEntityLink.
//   - deletedAt uses undefined (not null) at the domain level.
// =============================================================================

import { Result } from '@/packages/shared/lib/result';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/** The kind of reporting group. */
export type GroupType =
  | 'team'
  | 'department'
  | 'project'
  | 'environment'
  | 'cost_center'
  | 'business_unit'
  | 'user'
  | 'custom';

export type AttributionGroup = {
  id: string;
  slug: string;
  displayName: string;
  groupType: GroupType;
  parentId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  /**
   * Soft reference to an external entity type (e.g., 'principal').
   * Must be present together with linkedEntityId, or both absent.
   */
  linkedEntityType?: string;
  /**
   * Soft reference to the external entity's ID (e.g., a Principal UUID).
   * Must be present together with linkedEntityType, or both absent.
   */
  linkedEntityId?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

// =============================================================================
// SECTION 2: VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates that entity-linking fields are consistent: both present or both absent.
 *
 * Business rules:
 *   - linkedEntityType and linkedEntityId must either both be present or both be absent.
 *   - Neither field may be an empty string if provided.
 */
export const validateEntityLink = (
  linkedEntityType: string | undefined | null,
  linkedEntityId: string | undefined | null,
): Result<void, Error> => {
  const hasType = linkedEntityType != null && linkedEntityType.trim().length > 0;
  const hasId = linkedEntityId != null && linkedEntityId.trim().length > 0;

  if (hasType && !hasId) {
    return {
      success: false,
      error: new Error('linkedEntityId is required when linkedEntityType is provided'),
    };
  }

  if (hasId && !hasType) {
    return {
      success: false,
      error: new Error('linkedEntityType is required when linkedEntityId is provided'),
    };
  }

  return { success: true, value: undefined };
};
