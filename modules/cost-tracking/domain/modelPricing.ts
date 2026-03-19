// =============================================================================
// Domain — ModelPricing Entity
// =============================================================================
// Time-boxed pricing rates for a model. Each entry covers a specific
// model + service_tier + context_tier + region combination for a date range.
//
// Design decisions:
//   - effectiveFrom / effectiveTo are ISO date strings (YYYY-MM-DD) because
//     pricing changes happen at day boundaries, not mid-day.
//   - A null / undefined effectiveTo means "current / active pricing".
//   - rates is a structured rate card; only the keys relevant to the model's
//     service category are present.
//   - calculateCostFromRates returns a string (8 decimal places) to match the
//     numeric(16,8) storage convention and prevent IEEE-754 precision loss
//     when results are aggregated in SQL.
//   - UsageMetrics captures every possible metric column from usage records so
//     this function can work across all service categories.
//   - Zero external imports — all values are plain TypeScript primitives.
// =============================================================================

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/**
 * The full rate card for a pricing entry.
 * All monetary values are expressed as { rate, per } where:
 *   cost = (quantity / per) * rate
 * e.g. { rate: 3.0, per: 1_000_000 } means $3.00 per million units.
 */
export type PricingRates = {
  inputTokens?: { rate: number; per: number };
  outputTokens?: { rate: number; per: number };
  cachedInputTokens?: { rate: number; per: number };
  cacheWriteTokens?: { rate: number; per: number };
  thinkingTokens?: { rate: number; per: number };
  audioInputTokens?: { rate: number; per: number };
  audioOutputTokens?: { rate: number; per: number };
  images?: { rate: number; per: number };
  characters?: { rate: number; per: number };
  seconds?: { rate: number; per: number };
  bytes?: { rate: number; per: number };
  searches?: { rate: number; per: number };
  requests?: { rate: number; per: number };
};

export type ModelPricing = {
  id: string;
  modelId: string;
  effectiveFrom: string; // ISO date string (YYYY-MM-DD)
  effectiveTo?: string;  // undefined / null = current
  serviceTier: string;
  contextTier?: string;
  region?: string;
  rates: PricingRates;
  currency: string;
  source?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * All measurable metric fields from a usage record.
 * Passed to calculateCostFromRates so it can compute the cost regardless of
 * service category.
 */
export type UsageMetrics = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  thinkingTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
  imageCount?: number;
  characterCount?: number;
  durationSeconds?: number;
  storageBytes?: number;
  sessionCount?: number;
  searchCount?: number;
  requestCount?: number;
};

// =============================================================================
// SECTION 2: FUNCTIONS
// =============================================================================

/**
 * Finds the applicable pricing entry for a given date and optional modifiers.
 *
 * Resolution logic:
 *   1. Filter to entries where effectiveFrom <= date AND (effectiveTo > date OR effectiveTo is absent)
 *   2. Optionally narrow by serviceTier, contextTier, and region when provided
 *   3. Return the entry with the latest effectiveFrom among the survivors
 *
 * Returns undefined when no matching pricing entry exists.
 *
 * Business rules:
 *   - effectiveFrom is inclusive; effectiveTo is exclusive (half-open interval)
 *   - A missing effectiveTo means the entry is "forever current"
 *   - If tier / context / region are provided, only entries that exactly match
 *     are returned. Callers are responsible for fallback logic (e.g. retrying
 *     without region if no region-specific entry is found).
 */
export const findApplicablePricing = (
  pricings: ModelPricing[],
  date: Date,
  tier?: string,
  context?: string,
  region?: string,
): ModelPricing | undefined => {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD

  const candidates = pricings.filter((p) => {
    // Date range check (half-open interval)
    if (p.effectiveFrom > dateStr) return false;
    if (p.effectiveTo !== undefined && p.effectiveTo !== null && p.effectiveTo <= dateStr) {
      return false;
    }

    // Optional dimension filters — undefined arguments skip the filter
    if (tier !== undefined && p.serviceTier !== tier) return false;
    if (context !== undefined && p.contextTier !== context) return false;
    if (region !== undefined && p.region !== region) return false;

    return true;
  });

  if (candidates.length === 0) return undefined;

  // Return the most recently effective entry
  return candidates.reduce((best, current) =>
    current.effectiveFrom > best.effectiveFrom ? current : best,
  );
};

/**
 * Calculates the cost from a rate card and a set of usage metrics.
 *
 * For each metric field that has a corresponding rate entry, the cost
 * contribution is: (quantity / per) * rate
 *
 * All contributions are summed and the result is returned as a string
 * formatted to 8 decimal places to match the numeric(16,8) storage convention.
 *
 * Business rules:
 *   - Missing or undefined metric values contribute zero cost.
 *   - Missing rate entries for a present metric contribute zero cost.
 *   - inputTokens MUST be uncached input only. Provider clients are
 *     responsible for deducting cached tokens before passing metrics here.
 *     Total input = inputTokens + cachedInputTokens (additive, not overlapping).
 */
export const calculateCostFromRates = (
  rates: PricingRates,
  metrics: UsageMetrics,
): string => {
  let total = 0;

  const addCost = (
    rateEntry: { rate: number; per: number } | undefined,
    quantity: number | undefined,
  ): void => {
    if (rateEntry === undefined || quantity === undefined || quantity === 0) return;
    total += (quantity / rateEntry.per) * rateEntry.rate;
  };

  addCost(rates.inputTokens, metrics.inputTokens);
  addCost(rates.outputTokens, metrics.outputTokens);
  addCost(rates.cachedInputTokens, metrics.cachedInputTokens);
  addCost(rates.cacheWriteTokens, metrics.cacheWriteTokens);
  addCost(rates.thinkingTokens, metrics.thinkingTokens);
  addCost(rates.audioInputTokens, metrics.audioInputTokens);
  addCost(rates.audioOutputTokens, metrics.audioOutputTokens);
  addCost(rates.images, metrics.imageCount);
  addCost(rates.characters, metrics.characterCount);
  addCost(rates.seconds, metrics.durationSeconds);
  addCost(rates.bytes, metrics.storageBytes);
  addCost(rates.searches, metrics.searchCount);
  addCost(rates.requests, metrics.requestCount);

  return total.toFixed(8);
};
