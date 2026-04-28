// =============================================================================
// Cost Tracking Module — Provider Usage Client Contract
// =============================================================================
// Defines the shared interface that every AI provider usage client must
// implement. Each provider (OpenAI, Anthropic, Google Vertex) exposes a
// different API for retrieving token consumption data. This contract normalises
// those differences so the ingestion use case works against a single type
// regardless of which provider is being queried.
//
// The fetchUsage method accepts an inclusive time window and returns raw usage
// data rows. fetchCosts is optional — only providers that expose billing APIs
// need to implement it. Clients handle pagination internally and always return
// a flat array; they never throw (errors are logged and return []).
//
// Factory functions (makeOpenAIUsageClient, makeAnthropicUsageClient,
// makeVertexUsageClient) return this type, enabling the ingestion use case to
// accept any provider client without knowing the concrete implementation.
// =============================================================================

import { ServiceCategory } from '../../domain/model';
import { BucketWidth } from '../../domain/usageRecord';

// =============================================================================
// SECTION 1: RAW DATA TYPES
// =============================================================================

/**
 * Raw usage data as returned by a provider's usage API, normalised to a
 * common structure. Every field maps directly to a column on the
 * cost_tracking_usage_records table.
 */
export type RawProviderUsageData = {
  modelSlug: string;
  serviceCategory: ServiceCategory;
  credentialExternalId?: string;
  segmentExternalId?: string;
  serviceTier?: string;
  contextTier?: string;
  region?: string;
  bucketStart: Date;
  bucketEnd: Date;
  bucketWidth: BucketWidth;
  // Token metrics (all optional — not every service category uses tokens)
  // IMPORTANT: inputTokens must be UNCACHED input only. Providers that report
  // input_tokens inclusive of cached (e.g. OpenAI) must deduct cached before
  // setting this field. This ensures cost calculation never double-counts.
  // Total input = inputTokens + cachedInputTokens.
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  thinkingTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
  // Non-token metrics (all optional — service-category-dependent)
  imageCount?: number;
  characterCount?: number;
  durationSeconds?: number;
  storageBytes?: number;
  sessionCount?: number;
  searchCount?: number;
  requestCount?: number;
  // Provider-specific overflow
  providerMetadata?: Record<string, unknown>;
};

/**
 * Raw cost data as returned by a provider's billing / cost API.
 * Maps to the cost_tracking_provider_costs table.
 */
export type RawProviderCostData = {
  segmentExternalId?: string;
  modelSlug?: string;
  costType: string;
  tokenType?: string;
  serviceTier?: string;
  contextTier?: string;
  region?: string;
  bucketStart: Date;
  bucketEnd: Date;
  amount: string;
  currency: string;
  description?: string;
  providerMetadata?: Record<string, unknown>;
};

// =============================================================================
// SECTION 2: CLIENT CONTRACT
// =============================================================================

/**
 * A client that fetches raw usage (and optionally cost) data from a single
 * AI provider.
 *
 * Implementors must:
 *   - Handle pagination internally so callers receive a complete flat list.
 *   - Log errors and return [] (or partial results) rather than throwing.
 *   - Map provider-specific field names to the normalised RawProviderUsageData
 *     and RawProviderCostData shapes.
 */
export type ProviderUsageClient = {
  /** The canonical slug for this provider (e.g. 'anthropic', 'openai'). */
  providerSlug: string;

  /**
   * Maximum historical lookback in milliseconds used on first sync (when no
   * cursor exists). Reflects how far back the provider's usage API actually
   * retains data. Subsequent syncs always use the cursor regardless of this
   * value.
   *
   * Defaults to 30 days if not set (safe fallback for unknown providers).
   *
   * Guidelines per provider:
   *   OpenAI  — 365 days (Organization Usage API retains ~1 year)
   *   Anthropic — 90 days (Admin usage/cost report retention)
   *   Vertex AI / Gemini — 42 days (Cloud Monitoring 6-week retention window)
   */
  firstSyncLookbackMs?: number;

  /**
   * Fetch all usage data for the given time window from the provider API.
   *
   * @param startTime - Inclusive start of the aggregation window (UTC)
   * @param endTime   - Inclusive end of the aggregation window (UTC)
   * @returns Flat array of raw usage rows. Returns [] on API failure.
   */
  fetchUsage: (startTime: Date, endTime: Date) => Promise<RawProviderUsageData[]>;

  /**
   * Fetch cost / billing data for the given time window (optional).
   * Only providers with cost APIs need to implement this.
   *
   * @param startTime - Inclusive start of the billing window (UTC)
   * @param endTime   - Inclusive end of the billing window (UTC)
   * @returns Flat array of raw cost rows. Returns [] on API failure.
   */
  fetchCosts?: (startTime: Date, endTime: Date) => Promise<RawProviderCostData[]>;

  /**
   * Test the credential by making a lightweight API call.
   * Returns a structured result with a human-readable detail on success.
   */
  testConnection?: () => Promise<{ success: true; detail?: string } | { success: false; error: string }>;
};
