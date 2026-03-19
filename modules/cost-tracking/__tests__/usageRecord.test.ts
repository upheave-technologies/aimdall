import { describe, it, expect } from 'vitest';
import { buildDedupInput, validateUsageRecord, extractMetrics } from '../domain/usageRecord';

// =============================================================================
// buildDedupInput
// =============================================================================

describe('buildDedupInput', () => {
  const baseDims = {
    providerId: 'prov_123',
    credentialId: 'cred_456',
    modelSlug: 'claude-sonnet-4-6',
    serviceCategory: 'text_generation',
    serviceTier: 'on_demand',
    contextTier: 'standard',
    region: 'us',
    bucketStart: new Date('2026-03-01T00:00:00.000Z'),
    bucketWidth: '1d',
  };

  it('produces a deterministic string for the same input', () => {
    const a = buildDedupInput(baseDims);
    const b = buildDedupInput(baseDims);
    expect(a).toBe(b);
  });

  it('includes all dimension fields separated by pipes', () => {
    const result = buildDedupInput(baseDims);
    const parts = result.split('|');
    expect(parts).toHaveLength(9);
    expect(parts[0]).toBe('prov_123');
    expect(parts[1]).toBe('cred_456');
    expect(parts[2]).toBe('claude-sonnet-4-6');
    expect(parts[3]).toBe('text_generation');
    expect(parts[4]).toBe('on_demand');
    expect(parts[5]).toBe('standard');
    expect(parts[6]).toBe('us');
    expect(parts[7]).toBe('2026-03-01T00:00:00.000Z');
    expect(parts[8]).toBe('1d');
  });

  it('uses __ placeholder for undefined optional fields', () => {
    const result = buildDedupInput({
      providerId: 'prov_1',
      modelSlug: 'gpt-4o',
      serviceCategory: 'text_generation',
      bucketStart: new Date('2026-01-01T00:00:00.000Z'),
      bucketWidth: '1h',
    });
    const parts = result.split('|');
    expect(parts[1]).toBe('__'); // credentialId
    expect(parts[4]).toBe('__'); // serviceTier
    expect(parts[5]).toBe('__'); // contextTier
    expect(parts[6]).toBe('__'); // region
  });

  it('produces different outputs for different inputs', () => {
    const a = buildDedupInput(baseDims);
    const b = buildDedupInput({ ...baseDims, modelSlug: 'gpt-4o' });
    expect(a).not.toBe(b);
  });

  it('differentiates undefined credentialId from empty string', () => {
    const withUndefined = buildDedupInput({ ...baseDims, credentialId: undefined });
    const withEmpty = buildDedupInput({ ...baseDims, credentialId: '' });
    expect(withUndefined).not.toBe(withEmpty);
  });
});

// =============================================================================
// validateUsageRecord
// =============================================================================

describe('validateUsageRecord', () => {
  const validRecord = {
    id: 'rec_1',
    providerId: 'prov_1',
    modelSlug: 'claude-sonnet-4-6',
    serviceCategory: 'text_generation' as const,
    bucketStart: new Date('2026-03-01T00:00:00Z'),
    bucketEnd: new Date('2026-03-02T00:00:00Z'),
    bucketWidth: '1d' as const,
    costSource: 'calculated' as const,
    dedupKey: 'abc123hash',
    syncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('accepts a valid usage record', () => {
    const result = validateUsageRecord(validRecord);
    expect(result.success).toBe(true);
  });

  it('rejects empty providerId', () => {
    const result = validateUsageRecord({ ...validRecord, providerId: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('providerId');
  });

  it('rejects empty modelSlug', () => {
    const result = validateUsageRecord({ ...validRecord, modelSlug: '  ' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('modelSlug');
  });

  it('rejects invalid bucketStart', () => {
    const result = validateUsageRecord({ ...validRecord, bucketStart: new Date('invalid') });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('bucketStart');
  });

  it('rejects bucketEnd before bucketStart', () => {
    const result = validateUsageRecord({
      ...validRecord,
      bucketStart: new Date('2026-03-02T00:00:00Z'),
      bucketEnd: new Date('2026-03-01T00:00:00Z'),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('bucketEnd');
  });

  it('rejects bucketEnd equal to bucketStart', () => {
    const same = new Date('2026-03-01T00:00:00Z');
    const result = validateUsageRecord({ ...validRecord, bucketStart: same, bucketEnd: same });
    expect(result.success).toBe(false);
  });

  it('rejects empty dedupKey', () => {
    const result = validateUsageRecord({ ...validRecord, dedupKey: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('dedupKey');
  });

  it('rejects missing costSource', () => {
    const { costSource: _, ...noCostSource } = validRecord;
    const result = validateUsageRecord(noCostSource);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('costSource');
  });
});

// =============================================================================
// extractMetrics
// =============================================================================

describe('extractMetrics', () => {
  it('extracts all metric fields from a full record', () => {
    const record = {
      id: 'r1',
      providerId: 'p1',
      modelSlug: 'm1',
      serviceCategory: 'text_generation' as const,
      bucketStart: new Date(),
      bucketEnd: new Date(),
      bucketWidth: '1d' as const,
      costSource: 'calculated' as const,
      dedupKey: 'k1',
      syncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      inputTokens: 1000,
      outputTokens: 500,
      cachedInputTokens: 200,
      cacheWriteTokens: 100,
      thinkingTokens: 50,
      audioInputTokens: 25,
      audioOutputTokens: 10,
      imageCount: 3,
      characterCount: 1500,
      durationSeconds: '120.500',
      storageBytes: 1024000,
      sessionCount: 5,
      searchCount: 2,
      requestCount: 10,
    };

    const metrics = extractMetrics(record);
    expect(metrics.inputTokens).toBe(1000);
    expect(metrics.outputTokens).toBe(500);
    expect(metrics.cachedInputTokens).toBe(200);
    expect(metrics.cacheWriteTokens).toBe(100);
    expect(metrics.thinkingTokens).toBe(50);
    expect(metrics.audioInputTokens).toBe(25);
    expect(metrics.audioOutputTokens).toBe(10);
    expect(metrics.imageCount).toBe(3);
    expect(metrics.characterCount).toBe(1500);
    expect(metrics.durationSeconds).toBe(120.5);
    expect(metrics.storageBytes).toBe(1024000);
    expect(metrics.sessionCount).toBe(5);
    expect(metrics.searchCount).toBe(2);
    expect(metrics.requestCount).toBe(10);
  });

  it('returns undefined for metrics not present on the record', () => {
    const record = {
      id: 'r1',
      providerId: 'p1',
      modelSlug: 'm1',
      serviceCategory: 'embedding' as const,
      bucketStart: new Date(),
      bucketEnd: new Date(),
      bucketWidth: '1d' as const,
      costSource: 'none' as const,
      dedupKey: 'k1',
      syncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      inputTokens: 500,
    };

    const metrics = extractMetrics(record);
    expect(metrics.inputTokens).toBe(500);
    expect(metrics.outputTokens).toBeUndefined();
    expect(metrics.imageCount).toBeUndefined();
    expect(metrics.durationSeconds).toBeUndefined();
  });
});
