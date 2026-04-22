// =============================================================================
// Domain — Recommendation Entity
// =============================================================================
// Smart cost-saving recommendations surfaced by analysing usage data across
// six categories: model tier optimisation, cache utilisation, batch API
// opportunity, dormant credentials, context tier analysis, and provider
// concentration risk.
//
// Design decisions:
//   - Pure analyzer functions receive pre-aggregated data (not raw DB rows)
//     so they remain framework-agnostic and independently testable.
//   - Each analyzer returns RecommendationCandidate[] — candidates have no ID
//     or timestamps. The application layer assigns IDs before persisting.
//   - Monetary fields use number (not string) inside candidates; the application
//     layer converts to string at the persistence boundary.
//   - estimatedMonthlySavings and savingsPercentage are optional — risk/hygiene
//     recommendations (dormant credentials, concentration) carry no dollar value.
//   - deletedAt uses undefined (not null) at the domain level.
//   - Zero external imports — no ORM, no framework, no side effects.
// =============================================================================

// =============================================================================
// SECTION 1: ENTITY TYPES
// =============================================================================

/** The type of insight a recommendation represents. */
export type RecommendationCategory =
  | 'model_tier_optimization'
  | 'cache_utilization'
  | 'batch_api_opportunity'
  | 'dormant_credentials'
  | 'context_tier_analysis'
  | 'provider_concentration_risk';

/** Lifecycle state of a recommendation. */
export type RecommendationStatus = 'active' | 'dismissed' | 'expired';

export type Recommendation = {
  id: string;
  category: RecommendationCategory;
  title: string;
  description: string;
  /** Numeric string, 8 decimal places. Absent for risk/hygiene recommendations. */
  estimatedMonthlySavings?: string;
  /** Numeric string, 2 decimal places. Absent for risk/hygiene recommendations. */
  savingsPercentage?: string;
  confidenceBasis?: string;
  status: RecommendationStatus;
  /** Category-specific detail payload. */
  data?: Record<string, unknown>;
  dismissedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

// =============================================================================
// SECTION 2: ANALYZER INPUT TYPES
// =============================================================================

/**
 * Pre-aggregated data for one model's usage over the analysis window.
 * Used by analyzeModelTierOptimization.
 */
export type ModelTierAnalysisInput = {
  modelSlug: string;
  providerSlug: string;
  providerDisplayName: string;
  serviceCategory: string;
  totalRequests: number;
  totalCost: number;
  /** Requests that produced fewer than 500 output tokens. */
  lowOutputRequests: number;
  /** Cost attributable to those low-output requests. */
  lowOutputCost: number;
  /** A cheaper model that could serve the same workload, if known. */
  cheaperAlternativeSlug?: string;
  /** Estimated monthly cost if the cheaper model were used. */
  cheaperAlternativeCostEstimate?: number;
};

/**
 * Pre-aggregated cache data for one provider+model combination.
 * Used by analyzeCacheUtilization.
 */
export type CacheAnalysisInput = {
  providerSlug: string;
  providerDisplayName: string;
  modelSlug: string;
  totalInputTokens: number;
  cachedInputTokens: number;
  totalInputCost: number;
};

/**
 * Pre-aggregated request volume data for one provider+model combination.
 * Used by analyzeBatchApiOpportunity.
 */
export type BatchAnalysisInput = {
  providerSlug: string;
  providerDisplayName: string;
  modelSlug: string;
  totalRequests: number;
  totalCost: number;
  averageDailyRequests: number;
  /** Fraction saved when using the batch tier, e.g. 0.5 for 50% cheaper. */
  batchTierDiscount: number;
};

/**
 * Usage data for one credential, used to detect dormant (unused) credentials.
 * Used by analyzeDormantCredentials.
 */
export type DormantCredentialInput = {
  credentialId: string;
  credentialLabel: string;
  keyHint: string | null;
  providerDisplayName: string;
  lastUsedAt: Date | null;
  daysSinceLastUse: number;
};

/**
 * Context tier usage breakdown for one provider+model combination.
 * Used by analyzeContextTierUsage.
 */
export type ContextTierAnalysisInput = {
  providerSlug: string;
  providerDisplayName: string;
  modelSlug: string;
  standardTierCost: number;
  extendedTierCost: number;
  extendedTierRequests: number;
  /**
   * Extended-tier requests that used fewer than 50K input tokens —
   * these likely did not need extended context and could have been cheaper.
   */
  extendedTierLowTokenRequests: number;
  /** Cost attributable to those extended-tier low-token requests. */
  extendedTierLowTokenCost: number;
};

/**
 * Spend breakdown across providers for concentration risk analysis.
 * Used by analyzeProviderConcentration.
 */
export type ProviderConcentrationInput = {
  providers: Array<{
    providerSlug: string;
    providerDisplayName: string;
    totalCost: number;
  }>;
  totalSpend: number;
};

// =============================================================================
// SECTION 3: RECOMMENDATION CANDIDATE TYPE
// =============================================================================

/**
 * An unperisted recommendation produced by an analyzer function.
 * The application layer assigns an ID and timestamps before creating the DB record.
 */
export type RecommendationCandidate = {
  category: RecommendationCategory;
  title: string;
  description: string;
  /** Absent for risk/hygiene recommendations that carry no dollar value. */
  estimatedMonthlySavings?: number;
  /** Percentage of current spend that could be saved. Absent when no dollar savings. */
  savingsPercentage?: number;
  confidenceBasis: string;
  data: Record<string, unknown>;
};

// =============================================================================
// SECTION 4: PURE ANALYZER FUNCTIONS
// =============================================================================

/**
 * Identifies models where a significant portion of requests produce low output
 * tokens and the monthly cost exceeds a minimum threshold. These workloads may
 * be candidates for a smaller, cheaper model.
 *
 * Triggers when:
 *   - lowOutputRequests / totalRequests > 30%
 *   - lowOutputCost > $100/month (material spend floor)
 *
 * Estimated savings assumes a 90% cost reduction from switching model tier.
 */
export const analyzeModelTierOptimization = (
  inputs: ModelTierAnalysisInput[],
): RecommendationCandidate[] => {
  const candidates: RecommendationCandidate[] = [];

  for (const input of inputs) {
    if (input.totalRequests === 0) continue;

    const lowOutputRate = input.lowOutputRequests / input.totalRequests;

    if (lowOutputRate <= 0.3 || input.lowOutputCost <= 100) continue;

    const pct = Math.round(lowOutputRate * 100);
    const estimatedMonthlySavings = Math.round(input.lowOutputCost * 0.9 * 100) / 100;
    const savingsPercentage =
      input.totalCost > 0
        ? Math.round((estimatedMonthlySavings / input.totalCost) * 100 * 100) / 100
        : 0;

    const altClause = input.cheaperAlternativeSlug
      ? ` If suitable for ${input.cheaperAlternativeSlug}, savings could reach $${estimatedMonthlySavings.toFixed(2)}/month (${savingsPercentage}% reduction).`
      : ` If suitable for a smaller model, savings could reach $${estimatedMonthlySavings.toFixed(2)}/month (${savingsPercentage}% reduction).`;

    candidates.push({
      category: 'model_tier_optimization',
      title: `Evaluate cheaper model for ${input.modelSlug} low-output requests`,
      description:
        `${pct}% of your ${input.modelSlug} requests produce fewer than 500 output tokens. ` +
        `These cost $${input.lowOutputCost.toFixed(2)}/month.` +
        altClause,
      estimatedMonthlySavings,
      savingsPercentage,
      confidenceBasis: `Based on ${input.totalRequests.toLocaleString()} requests over the analysis window`,
      data: {
        modelSlug: input.modelSlug,
        providerSlug: input.providerSlug,
        providerDisplayName: input.providerDisplayName,
        serviceCategory: input.serviceCategory,
        totalRequests: input.totalRequests,
        totalCost: input.totalCost,
        lowOutputRequests: input.lowOutputRequests,
        lowOutputCost: input.lowOutputCost,
        lowOutputRate: pct,
        cheaperAlternativeSlug: input.cheaperAlternativeSlug,
      },
    });
  }

  return candidates;
};

/**
 * Identifies provider+model combinations where prompt caching is in use but
 * the cache hit rate is below a 30% threshold — indicating potential for
 * better prompt engineering to improve cache utilisation.
 *
 * Triggers when:
 *   - cachedInputTokens > 0 (caching IS active for this workload)
 *   - cache hit rate < 30%
 *
 * Estimated savings based on the gap between the current rate and a 40%
 * benchmark, assuming cached tokens cost roughly half of uncached tokens.
 */
export const analyzeCacheUtilization = (
  inputs: CacheAnalysisInput[],
): RecommendationCandidate[] => {
  const candidates: RecommendationCandidate[] = [];

  for (const input of inputs) {
    if (input.cachedInputTokens === 0) continue;
    if (input.totalInputTokens === 0) continue;

    const hitRate = input.cachedInputTokens / input.totalInputTokens;
    if (hitRate >= 0.3) continue;

    const currentHitPct = Math.round(hitRate * 100);
    const benchmarkRate = 0.4;
    const additionalCachedFraction = benchmarkRate - hitRate;
    // Savings: additional tokens that would be cached × 50% cost reduction
    const estimatedMonthlySavings =
      Math.round(input.totalInputCost * additionalCachedFraction * 0.5 * 100) / 100;
    const savingsPercentage =
      input.totalInputCost > 0
        ? Math.round((estimatedMonthlySavings / input.totalInputCost) * 100 * 100) / 100
        : 0;

    candidates.push({
      category: 'cache_utilization',
      title: `Low cache hit rate for ${input.providerDisplayName} ${input.modelSlug}`,
      description:
        `Cache is active but only ${currentHitPct}% of input tokens are served from cache. ` +
        `Improving to the 40% benchmark could save approximately $${estimatedMonthlySavings.toFixed(2)}/month. ` +
        `Consider structuring prompts to maximise reusable prefix content.`,
      estimatedMonthlySavings,
      savingsPercentage,
      confidenceBasis: `Based on ${input.totalInputTokens.toLocaleString()} total input tokens with ${input.cachedInputTokens.toLocaleString()} cached`,
      data: {
        providerSlug: input.providerSlug,
        providerDisplayName: input.providerDisplayName,
        modelSlug: input.modelSlug,
        totalInputTokens: input.totalInputTokens,
        cachedInputTokens: input.cachedInputTokens,
        cacheHitRate: currentHitPct,
        totalInputCost: input.totalInputCost,
      },
    });
  }

  return candidates;
};

/**
 * Identifies high-volume workloads where switching to a batch API tier would
 * meaningfully reduce cost. Assumes 50% of requests can be converted to batch.
 *
 * Triggers when:
 *   - averageDailyRequests > 1000
 *   - batchTierDiscount > 0
 */
export const analyzeBatchApiOpportunity = (
  inputs: BatchAnalysisInput[],
): RecommendationCandidate[] => {
  const candidates: RecommendationCandidate[] = [];

  for (const input of inputs) {
    if (input.averageDailyRequests <= 1000) continue;
    if (input.batchTierDiscount <= 0) continue;

    const estimatedMonthlySavings =
      Math.round(input.totalCost * input.batchTierDiscount * 0.5 * 100) / 100;
    const savingsPercentage =
      input.totalCost > 0
        ? Math.round((estimatedMonthlySavings / input.totalCost) * 100 * 100) / 100
        : 0;
    const discountPct = Math.round(input.batchTierDiscount * 100);

    candidates.push({
      category: 'batch_api_opportunity',
      title: `Batch API opportunity for ${input.providerDisplayName} ${input.modelSlug}`,
      description:
        `${Math.round(input.averageDailyRequests).toLocaleString()} average daily requests to ${input.modelSlug}. ` +
        `The batch API tier offers ${discountPct}% lower prices for non-time-sensitive workloads. ` +
        `Converting 50% of requests to batch could save approximately $${estimatedMonthlySavings.toFixed(2)}/month.`,
      estimatedMonthlySavings,
      savingsPercentage,
      confidenceBasis: `Based on ${input.totalRequests.toLocaleString()} total requests`,
      data: {
        providerSlug: input.providerSlug,
        providerDisplayName: input.providerDisplayName,
        modelSlug: input.modelSlug,
        totalRequests: input.totalRequests,
        totalCost: input.totalCost,
        averageDailyRequests: input.averageDailyRequests,
        batchTierDiscount: input.batchTierDiscount,
      },
    });
  }

  return candidates;
};

/**
 * Identifies credentials that have not been used for more than 30 days.
 * This is a security and hygiene recommendation — unused credentials represent
 * unnecessary attack surface. No dollar savings are estimated.
 *
 * Triggers when:
 *   - daysSinceLastUse > 30
 */
export const analyzeDormantCredentials = (
  inputs: DormantCredentialInput[],
): RecommendationCandidate[] => {
  const candidates: RecommendationCandidate[] = [];

  for (const input of inputs) {
    if (input.daysSinceLastUse <= 30) continue;

    const hintSuffix = input.keyHint ? `••••${input.keyHint}` : 'no hint';
    const lastUsedClause =
      input.lastUsedAt === null
        ? 'and has never been used'
        : `for ${input.daysSinceLastUse} days`;

    candidates.push({
      category: 'dormant_credentials',
      title: `Credential ${input.credentialLabel} (${hintSuffix}) unused for ${input.daysSinceLastUse} days`,
      description:
        `The credential "${input.credentialLabel}" on ${input.providerDisplayName} has been inactive ${lastUsedClause}. ` +
        `Unused credentials are unnecessary security exposure. Consider revoking or rotating this key.`,
      // No dollar savings — this is a security/hygiene recommendation
      confidenceBasis: input.lastUsedAt
        ? `Last usage recorded ${input.daysSinceLastUse} days ago`
        : 'No usage ever recorded for this credential',
      data: {
        credentialId: input.credentialId,
        credentialLabel: input.credentialLabel,
        keyHint: input.keyHint,
        providerDisplayName: input.providerDisplayName,
        lastUsedAt: input.lastUsedAt?.toISOString() ?? null,
        daysSinceLastUse: input.daysSinceLastUse,
      },
    });
  }

  return candidates;
};

/**
 * Identifies workloads where requests routed to the extended context tier use
 * fewer than 50K input tokens — suggesting they could have been served by the
 * standard context tier at lower cost.
 *
 * Triggers when:
 *   - extendedTierLowTokenRequests / extendedTierRequests > 20%
 */
export const analyzeContextTierUsage = (
  inputs: ContextTierAnalysisInput[],
): RecommendationCandidate[] => {
  const candidates: RecommendationCandidate[] = [];

  for (const input of inputs) {
    if (input.extendedTierRequests === 0) continue;

    const lowTokenRate = input.extendedTierLowTokenRequests / input.extendedTierRequests;
    if (lowTokenRate <= 0.2) continue;

    const pct = Math.round(lowTokenRate * 100);
    const estimatedMonthlySavings =
      Math.round(input.extendedTierLowTokenCost * 0.2 * 100) / 100;
    const totalCost = input.standardTierCost + input.extendedTierCost;
    const savingsPercentage =
      totalCost > 0
        ? Math.round((estimatedMonthlySavings / totalCost) * 100 * 100) / 100
        : 0;

    candidates.push({
      category: 'context_tier_analysis',
      title: `Extended context tier over-use for ${input.providerDisplayName} ${input.modelSlug}`,
      description:
        `${pct}% of ${input.modelSlug} extended-context-tier requests used fewer than 50K input tokens — ` +
        `these likely didn't require extended context. ` +
        `Routing them to standard tier could save approximately $${estimatedMonthlySavings.toFixed(2)}/month.`,
      estimatedMonthlySavings,
      savingsPercentage,
      confidenceBasis: `Based on ${input.extendedTierRequests.toLocaleString()} extended-tier requests`,
      data: {
        providerSlug: input.providerSlug,
        providerDisplayName: input.providerDisplayName,
        modelSlug: input.modelSlug,
        standardTierCost: input.standardTierCost,
        extendedTierCost: input.extendedTierCost,
        extendedTierRequests: input.extendedTierRequests,
        extendedTierLowTokenRequests: input.extendedTierLowTokenRequests,
        extendedTierLowTokenCost: input.extendedTierLowTokenCost,
        lowTokenRate: pct,
      },
    });
  }

  return candidates;
};

/**
 * Identifies when a single provider accounts for more than 85% of total spend,
 * representing a concentration risk. This is a strategic risk recommendation —
 * no dollar savings are estimated.
 *
 * Triggers when:
 *   - any provider's totalCost / totalSpend > 85%
 */
export const analyzeProviderConcentration = (
  input: ProviderConcentrationInput,
): RecommendationCandidate[] => {
  if (input.totalSpend <= 0) return [];

  const candidates: RecommendationCandidate[] = [];

  for (const provider of input.providers) {
    const share = provider.totalCost / input.totalSpend;
    if (share <= 0.85) continue;

    const pct = Math.round(share * 100);

    candidates.push({
      category: 'provider_concentration_risk',
      title: `${pct}% of spend concentrated on ${provider.providerDisplayName}`,
      description:
        `${pct}% of your AI spend is with ${provider.providerDisplayName}. ` +
        `High concentration on a single provider increases exposure to price changes, outages, and rate limits. ` +
        `Consider evaluating alternative providers for resilience.`,
      // No dollar savings — this is a risk recommendation
      confidenceBasis: `Based on provider breakdown: ${input.providers.length} providers totalling $${input.totalSpend.toFixed(2)}`,
      data: {
        providerSlug: provider.providerSlug,
        providerDisplayName: provider.providerDisplayName,
        providerCost: provider.totalCost,
        totalSpend: input.totalSpend,
        concentrationPct: pct,
        providerCount: input.providers.length,
      },
    });
  }

  return candidates;
};

// =============================================================================
// SECTION 5: SORTING HELPER
// =============================================================================

/**
 * Sort recommendation candidates by estimated monthly savings descending.
 * Candidates with no dollar savings (hygiene/risk recommendations) sort last.
 */
export const sortRecommendationsBySavings = (
  recs: RecommendationCandidate[],
): RecommendationCandidate[] =>
  [...recs].sort((a, b) => (b.estimatedMonthlySavings ?? 0) - (a.estimatedMonthlySavings ?? 0));
