// =============================================================================
// Infrastructure — Dedup Key Hasher
// =============================================================================
// Hashes the deterministic input string produced by the domain's
// buildDedupInput function into a SHA-256 hex digest suitable for storage in
// the dedup_key column.
//
// Why here and not in the domain layer:
//   The domain layer must remain free of Node.js built-ins (node:crypto) so
//   that domain logic is testable in pure JavaScript environments. This small
//   infrastructure utility bridges the domain's string-building function and
//   the concrete SHA-256 hash, keeping each layer in its proper place.
//
// Usage:
//   import { generateDedupKey } from '../infrastructure/dedupKeyHasher';
//   const key = generateDedupKey({ providerId, modelSlug, bucketStart, ... });
// =============================================================================

import { createHash } from 'node:crypto';
import { buildDedupInput, type DedupDimensions } from '../domain/usageRecord';

/**
 * Generates a deterministic SHA-256 dedup key from the given usage record
 * dimensions.
 *
 * Flow:
 *   1. buildDedupInput (domain) → stable pipe-delimited string
 *   2. SHA-256 hash → 64-character hex digest
 *
 * The resulting hex string is used as the dedup_key column value for both
 * usage_records and provider_costs upsert operations.
 */
export const generateDedupKey = (dimensions: DedupDimensions): string => {
  const input = buildDedupInput(dimensions);
  return createHash('sha256').update(input).digest('hex');
};
