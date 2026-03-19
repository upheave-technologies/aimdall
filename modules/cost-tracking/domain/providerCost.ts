// =============================================================================
// Domain — ProviderCost Entity
// =============================================================================
// Dollar amounts as reported by provider cost / billing APIs. This entity is
// separate from UsageRecord because provider-reported costs often have
// different granularity, dimensions, and update cadence than usage metrics.
//
// Design decisions:
//   - amount uses string representation to preserve numeric(16,8) precision
//     and avoid IEEE-754 loss.
//   - modelSlug is optional because some provider cost line items are not
//     model-specific (e.g. "web_search" or "code_execution" charges).
//   - costType and tokenType are plain strings (not enums) because providers
//     can introduce new billing categories at any time.
//   - No updatedAt: provider cost records are write-once facts. If a provider
//     revises a cost, the old record is soft-deleted and a new one inserted.
//   - Zero external imports — all values are plain TypeScript primitives.
// =============================================================================

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type ProviderCost = {
  id: string;
  providerId: string;
  segmentId?: string;
  modelSlug?: string;
  costType: string;
  tokenType?: string;
  serviceTier?: string;
  contextTier?: string;
  region?: string;
  bucketStart: Date;
  bucketEnd: Date;
  amount: string; // numeric precision string
  currency: string;
  description?: string;
  dedupKey: string;
  syncId?: string;
  providerMetadata?: Record<string, unknown>;
  syncedAt: Date;
  createdAt: Date;
  deletedAt?: Date;
};
