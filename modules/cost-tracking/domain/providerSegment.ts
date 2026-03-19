// =============================================================================
// Domain — ProviderSegment Entity
// =============================================================================
// A ProviderSegment represents an organisational unit within a provider:
// workspaces (Anthropic), projects (OpenAI / Google), folders (Google Cloud),
// accounts / organisational units (AWS), etc.
//
// Segments form a tree via parentId to support deep provider hierarchies
// (e.g. AWS: Organisation → OU → Account).
//
// Design decisions:
//   - externalId is the provider's own identifier; uniqueness within a
//     provider is enforced at the infrastructure layer.
//   - metadata stores provider-specific attributes as a flexible map.
//   - Zero external imports — all values are plain TypeScript primitives.
// =============================================================================

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/**
 * The kind of organisational unit a provider exposes.
 * Mirrors the cost_tracking_segment_type Postgres enum.
 */
export type SegmentType =
  | 'organization'
  | 'workspace'
  | 'project'
  | 'folder'
  | 'account'
  | 'organizational_unit'
  | 'other';

export type ProviderSegment = {
  id: string;
  providerId: string;
  externalId: string;
  displayName: string;
  segmentType: SegmentType;
  parentId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};
