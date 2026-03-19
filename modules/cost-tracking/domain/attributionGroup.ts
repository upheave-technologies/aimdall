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
//   - deletedAt uses undefined (not null) at the domain level.
//   - Zero external imports — all values are plain TypeScript primitives.
// =============================================================================

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
  | 'custom';

export type AttributionGroup = {
  id: string;
  slug: string;
  displayName: string;
  groupType: GroupType;
  parentId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};
