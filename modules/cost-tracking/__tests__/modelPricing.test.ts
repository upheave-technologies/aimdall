import { describe, it, expect } from 'vitest';
import {
  findApplicablePricing,
  calculateCostFromRates,
  type ModelPricing,
  type PricingRates,
} from '../domain/modelPricing';

// =============================================================================
// findApplicablePricing
// =============================================================================

describe('findApplicablePricing', () => {
  const now = new Date();
  const basePricing: ModelPricing = {
    id: 'p1',
    modelId: 'm1',
    effectiveFrom: '2026-01-01',
    serviceTier: 'on_demand',
    rates: { inputTokens: { rate: 3.0, per: 1_000_000 } },
    currency: 'USD',
    createdAt: now,
    updatedAt: now,
  };

  it('finds pricing when date falls within range', () => {
    const pricings = [basePricing];
    const result = findApplicablePricing(pricings, new Date('2026-06-15'));
    expect(result).toBeDefined();
    expect(result!.id).toBe('p1');
  });

  it('finds pricing with no effectiveTo (current/forever)', () => {
    const pricings = [{ ...basePricing, effectiveTo: undefined }];
    const result = findApplicablePricing(pricings, new Date('2030-01-01'));
    expect(result).toBeDefined();
  });

  it('excludes pricing when date is before effectiveFrom', () => {
    const pricings = [basePricing];
    const result = findApplicablePricing(pricings, new Date('2025-12-31'));
    expect(result).toBeUndefined();
  });

  it('excludes pricing when date is at or after effectiveTo (half-open)', () => {
    const pricings = [{ ...basePricing, effectiveTo: '2026-06-01' }];
    const result = findApplicablePricing(pricings, new Date('2026-06-01'));
    expect(result).toBeUndefined();
  });

  it('selects pricing within half-open interval (before effectiveTo)', () => {
    const pricings = [{ ...basePricing, effectiveTo: '2026-06-01' }];
    const result = findApplicablePricing(pricings, new Date('2026-05-31'));
    expect(result).toBeDefined();
  });

  it('selects the most recently effective pricing when multiple match', () => {
    const older: ModelPricing = {
      ...basePricing,
      id: 'old',
      effectiveFrom: '2026-01-01',
      effectiveTo: undefined,
    };
    const newer: ModelPricing = {
      ...basePricing,
      id: 'new',
      effectiveFrom: '2026-03-01',
      effectiveTo: undefined,
    };
    const result = findApplicablePricing([older, newer], new Date('2026-06-01'));
    expect(result!.id).toBe('new');
  });

  it('filters by serviceTier when provided', () => {
    const onDemand: ModelPricing = { ...basePricing, id: 'od', serviceTier: 'on_demand' };
    const batch: ModelPricing = { ...basePricing, id: 'batch', serviceTier: 'batch' };
    const result = findApplicablePricing([onDemand, batch], new Date('2026-06-01'), 'batch');
    expect(result!.id).toBe('batch');
  });

  it('filters by contextTier when provided', () => {
    const std: ModelPricing = { ...basePricing, id: 'std', contextTier: 'standard' };
    const ext: ModelPricing = { ...basePricing, id: 'ext', contextTier: 'extended' };
    const result = findApplicablePricing([std, ext], new Date('2026-06-01'), undefined, 'extended');
    expect(result!.id).toBe('ext');
  });

  it('filters by region when provided', () => {
    const global: ModelPricing = { ...basePricing, id: 'g', region: undefined };
    const us: ModelPricing = { ...basePricing, id: 'us', region: 'us' };
    const result = findApplicablePricing([global, us], new Date('2026-06-01'), undefined, undefined, 'us');
    expect(result!.id).toBe('us');
  });

  it('returns undefined when no pricings exist', () => {
    expect(findApplicablePricing([], new Date())).toBeUndefined();
  });
});

// =============================================================================
// calculateCostFromRates
// =============================================================================

describe('calculateCostFromRates', () => {
  it('calculates cost for text generation tokens (inputTokens = uncached only)', () => {
    const rates: PricingRates = {
      inputTokens: { rate: 3.0, per: 1_000_000 },
      outputTokens: { rate: 15.0, per: 1_000_000 },
    };
    // inputTokens must be uncached-only per the contract
    const result = calculateCostFromRates(rates, {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });
    // (1M / 1M) * 3.0 + (500K / 1M) * 15.0 = 3.0 + 7.5 = 10.5
    expect(result).toBe('10.50000000');
  });

  it('does NOT double-count cached tokens (inputTokens is uncached, cachedInputTokens is separate)', () => {
    const rates: PricingRates = {
      inputTokens: { rate: 3.0, per: 1_000_000 },      // full rate for uncached
      cachedInputTokens: { rate: 0.30, per: 1_000_000 }, // discounted rate for cached
      outputTokens: { rate: 15.0, per: 1_000_000 },
    };
    // Provider reports 1M total input, of which 200K is cached.
    // Client normalizes: inputTokens=800K (uncached), cachedInputTokens=200K
    const result = calculateCostFromRates(rates, {
      inputTokens: 800_000,        // uncached only
      cachedInputTokens: 200_000,  // cached only
      outputTokens: 100_000,
    });
    // (800K/1M)*3.0 + (200K/1M)*0.30 + (100K/1M)*15.0
    // = 2.4 + 0.06 + 1.5 = 3.96
    expect(result).toBe('3.96000000');
  });

  it('returns 8 decimal places for precision', () => {
    const rates: PricingRates = {
      inputTokens: { rate: 0.001, per: 1000 },
    };
    const result = calculateCostFromRates(rates, { inputTokens: 1 });
    expect(result).toMatch(/^\d+\.\d{8}$/);
  });

  it('handles all metric types simultaneously', () => {
    const rates: PricingRates = {
      inputTokens: { rate: 3.0, per: 1_000_000 },
      outputTokens: { rate: 15.0, per: 1_000_000 },
      cachedInputTokens: { rate: 0.30, per: 1_000_000 },
      cacheWriteTokens: { rate: 3.75, per: 1_000_000 },
      images: { rate: 0.04, per: 1 },
      searches: { rate: 10.0, per: 1000 },
    };
    const result = calculateCostFromRates(rates, {
      inputTokens: 100_000,
      outputTokens: 50_000,
      cachedInputTokens: 20_000,
      cacheWriteTokens: 10_000,
      imageCount: 2,
      searchCount: 5,
    });
    // (100K/1M)*3 + (50K/1M)*15 + (20K/1M)*0.3 + (10K/1M)*3.75 + 2*0.04 + (5/1000)*10
    // = 0.3 + 0.75 + 0.006 + 0.0375 + 0.08 + 0.05
    // = 1.2235
    expect(result).toBe('1.22350000');
  });

  it('ignores metrics that have no matching rate', () => {
    const rates: PricingRates = {
      inputTokens: { rate: 3.0, per: 1_000_000 },
    };
    const result = calculateCostFromRates(rates, {
      inputTokens: 1_000_000,
      outputTokens: 500_000, // no rate for this
      imageCount: 5,         // no rate for this
    });
    expect(result).toBe('3.00000000');
  });

  it('ignores rates that have no matching metric', () => {
    const rates: PricingRates = {
      inputTokens: { rate: 3.0, per: 1_000_000 },
      outputTokens: { rate: 15.0, per: 1_000_000 },
    };
    const result = calculateCostFromRates(rates, {
      inputTokens: 1_000_000,
      // outputTokens is undefined
    });
    expect(result).toBe('3.00000000');
  });

  it('returns zero for empty metrics', () => {
    const rates: PricingRates = {
      inputTokens: { rate: 3.0, per: 1_000_000 },
    };
    const result = calculateCostFromRates(rates, {});
    expect(result).toBe('0.00000000');
  });

  it('returns zero when all metrics are zero', () => {
    const rates: PricingRates = {
      inputTokens: { rate: 3.0, per: 1_000_000 },
    };
    const result = calculateCostFromRates(rates, { inputTokens: 0 });
    expect(result).toBe('0.00000000');
  });

  it('handles sub-cent precision correctly', () => {
    const rates: PricingRates = {
      inputTokens: { rate: 0.15, per: 1_000_000 },
    };
    // 100 tokens at $0.15/1M = $0.000015
    const result = calculateCostFromRates(rates, { inputTokens: 100 });
    expect(result).toBe('0.00001500');
  });
});
