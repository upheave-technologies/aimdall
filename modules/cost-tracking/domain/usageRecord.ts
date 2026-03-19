// =============================================================================
// Domain — UsageRecord Entity
// =============================================================================
// The core fact entity. Every sync operation produces UsageRecords. This is a
// wide-column design with optional metrics — not every service category uses
// every metric field.
//
// Design decisions:
//   - modelSlug always stores the raw string from the provider, even when
//     modelId links to the canonical models table. This ensures we never lose
//     the original identifier if a model hasn't been registered yet.
//   - dedup_key is a SHA-256 hash of all dimension columns, providing the
//     idempotency guarantee. buildDedupInput returns the pre-hash string;
//     the infrastructure layer performs the actual hashing so the domain
//     layer remains free of node:crypto.
//   - durationSeconds is a string to preserve numeric(12,3) precision from
//     the database column.
//   - calculatedCostAmount is a string to preserve numeric(16,8) precision
//     and avoid IEEE-754 loss when aggregated in SQL.
//   - deletedAt uses undefined (not null) at the domain level to stay free of
//     database-specific null semantics.
//   - All functions are pure: same input always produces the same output.
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { ServiceCategory } from './model';
import { UsageMetrics } from './modelPricing';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/** Granularity of a usage aggregation window. */
export type BucketWidth = '1m' | '1h' | '1d';

/** How the cost value was determined. */
export type CostSource = 'provider_reported' | 'calculated' | 'estimated' | 'none';

export type UsageRecord = {
  id: string;
  providerId: string;
  credentialId?: string;
  segmentId?: string;
  modelId?: string;
  modelSlug: string;
  serviceCategory: ServiceCategory;
  serviceTier?: string;
  contextTier?: string;
  region?: string;
  bucketStart: Date;
  bucketEnd: Date;
  bucketWidth: BucketWidth;
  // Token metrics
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  thinkingTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
  // Non-token metrics
  imageCount?: number;
  characterCount?: number;
  durationSeconds?: string; // numeric precision string
  storageBytes?: number;
  sessionCount?: number;
  searchCount?: number;
  requestCount?: number;
  // Cost
  calculatedCostAmount?: string;
  calculatedCostCurrency?: string;
  costSource: CostSource;
  // Provider overflow
  providerMetadata?: Record<string, unknown>;
  // Sync tracking
  syncId?: string;
  dedupKey: string;
  syncedAt: Date;
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

/**
 * The set of dimension columns used to produce a dedup key.
 * These are the columns that uniquely identify a usage bucket in the system.
 */
export type DedupDimensions = {
  providerId: string;
  credentialId?: string;
  modelSlug: string;
  serviceCategory: string;
  serviceTier?: string;
  contextTier?: string;
  region?: string;
  bucketStart: Date;
  bucketWidth: string;
};

// =============================================================================
// SECTION 2: FUNCTIONS
// =============================================================================

/**
 * Produces the deterministic input string that the infrastructure layer will
 * hash with SHA-256 to generate a dedup key.
 *
 * Each dimension is joined by the pipe character "|". Empty / absent values
 * are replaced with the literal string "__" to guarantee a stable token count
 * and prevent accidental collisions between adjacent fields.
 *
 * Business rules:
 *   - The output is deterministic: same input always produces the same string.
 *   - Field order is fixed; changing the order would invalidate existing keys.
 *   - This function does NOT hash — that is the infrastructure layer's job,
 *     so this domain file stays free of node:crypto.
 */
export const buildDedupInput = (dims: DedupDimensions): string => {
  const parts = [
    dims.providerId,
    dims.credentialId ?? '__',
    dims.modelSlug,
    dims.serviceCategory,
    dims.serviceTier ?? '__',
    dims.contextTier ?? '__',
    dims.region ?? '__',
    dims.bucketStart.toISOString(),
    dims.bucketWidth,
  ];
  return parts.join('|');
};

/**
 * Validates the required fields of a UsageRecord.
 *
 * Business rules:
 *   - providerId cannot be empty
 *   - modelSlug cannot be empty
 *   - bucketStart must be a valid Date
 *   - bucketEnd must be a valid Date after bucketStart
 *   - dedupKey cannot be empty
 *
 * Returns the validated UsageRecord unchanged on success.
 */
export const validateUsageRecord = (data: Partial<UsageRecord>): Result<UsageRecord, Error> => {
  if (!data.providerId || data.providerId.trim().length === 0) {
    return { success: false, error: new Error('UsageRecord.providerId cannot be empty') };
  }

  if (!data.modelSlug || data.modelSlug.trim().length === 0) {
    return { success: false, error: new Error('UsageRecord.modelSlug cannot be empty') };
  }

  if (!data.bucketStart || !(data.bucketStart instanceof Date) || isNaN(data.bucketStart.getTime())) {
    return { success: false, error: new Error('UsageRecord.bucketStart must be a valid Date') };
  }

  if (!data.bucketEnd || !(data.bucketEnd instanceof Date) || isNaN(data.bucketEnd.getTime())) {
    return { success: false, error: new Error('UsageRecord.bucketEnd must be a valid Date') };
  }

  if (data.bucketEnd <= data.bucketStart) {
    return { success: false, error: new Error('UsageRecord.bucketEnd must be after bucketStart') };
  }

  if (!data.dedupKey || data.dedupKey.trim().length === 0) {
    return { success: false, error: new Error('UsageRecord.dedupKey cannot be empty') };
  }

  if (!data.costSource) {
    return { success: false, error: new Error('UsageRecord.costSource is required') };
  }

  return { success: true, value: data as UsageRecord };
};

/**
 * Extracts only the metric fields from a UsageRecord into a UsageMetrics
 * object for use with calculateCostFromRates.
 *
 * durationSeconds is stored as a string in UsageRecord for numeric precision
 * but UsageMetrics expects a number; the conversion is safe because the value
 * originates from a numeric(12,3) database column.
 */
export const extractMetrics = (record: UsageRecord): UsageMetrics => ({
  inputTokens: record.inputTokens,
  outputTokens: record.outputTokens,
  cachedInputTokens: record.cachedInputTokens,
  cacheWriteTokens: record.cacheWriteTokens,
  thinkingTokens: record.thinkingTokens,
  audioInputTokens: record.audioInputTokens,
  audioOutputTokens: record.audioOutputTokens,
  imageCount: record.imageCount,
  characterCount: record.characterCount,
  durationSeconds: record.durationSeconds !== undefined ? parseFloat(record.durationSeconds) : undefined,
  storageBytes: record.storageBytes,
  sessionCount: record.sessionCount,
  searchCount: record.searchCount,
  requestCount: record.requestCount,
});

// Re-export UsageMetrics for consumers that import from this file
export type { UsageMetrics } from './modelPricing';
