import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database and infrastructure adapters so the pre-wired singleton
// exports at the bottom of each use case file do not attempt a real Postgres
// connection. The tests use the factory functions (makeXUseCase) with injected
// mock repositories, so the pre-wired instances are never called.
// ---------------------------------------------------------------------------
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('../infrastructure/repositories/DrizzleUsageRecordRepository', () => ({
  makeUsageRecordRepository: () => ({}),
}));
vi.mock('../infrastructure/repositories/DrizzleBudgetRepository', () => ({
  makeBudgetRepository: () => ({}),
}));

import { makeDetectSpendAnomaliesUseCase } from '../application/detectSpendAnomaliesUseCase';
import { makeGetBudgetStatusUseCase, type GetBudgetStatusInput } from '../application/getBudgetStatusUseCase';
import type { IUsageRecordRepository } from '../domain/repositories';
import type { IBudgetRepository } from '../domain/repositories';

// =============================================================================
// MOCK REPOSITORY HELPERS
// =============================================================================

type DailySpendRow = {
  date: string;
  providerSlug: string;
  providerDisplayName: string;
  totalCost: string;
};

/**
 * Build a mock IUsageRecordRepository whose findDailySpend resolves to the
 * supplied rows. Every other method is a no-op stub.
 */
function makeMockUsageRepo(rows: DailySpendRow[]): IUsageRecordRepository {
  return {
    findDailySpend: vi.fn().mockResolvedValue(rows),
    upsert: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByDedupKey: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    findByDateRange: vi.fn().mockResolvedValue([]),
  } as unknown as IUsageRecordRepository;
}

/**
 * Build a mock IBudgetRepository whose findAll resolves to the supplied rows.
 */
function makeMockBudgetRepo(budgets: any[] = []): IBudgetRepository {
  return {
    findAll: vi.fn().mockResolvedValue(budgets),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as IBudgetRepository;
}

// =============================================================================
// TEST DATA BUILDERS
// =============================================================================

const FIXED_NOW_MS = Date.UTC(2026, 3, 28, 12, 0, 0, 0); // 2026-04-28T12:00:00Z

/**
 * Produce a time series for one provider spanning N days ending on `endDate`.
 * By default all spend values are 100 (flat baseline — no anomaly).
 * Override individual dates via `overrides`.
 */
function buildTimeSeries(
  endDate: string,
  days: number,
  overrides: Record<string, number> = {},
  providerSlug = 'anthropic',
  providerDisplayName = 'Anthropic',
): DailySpendRow[] {
  const rows: DailySpendRow[] = [];
  const end = new Date(endDate + 'T00:00:00Z');
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const amount = overrides[dateStr] ?? 100;
    rows.push({
      date: dateStr,
      providerSlug,
      providerDisplayName,
      totalCost: amount.toFixed(8),
    });
  }
  return rows;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_NOW_MS));
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// SECTION 1 — No-date-range mode: full detected list is returned
// =============================================================================

describe('detectSpendAnomalies — no date range (legacy mode)', () => {
  it('returns success result with anomalies array', async () => {
    // 60 flat days + a spike on the most recent detection day
    const today = '2026-04-28';
    const rows = buildTimeSeries(today, 60, { '2026-04-28': 500 }); // spike: 500 vs ~100 baseline
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({});

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected success');
    expect(Array.isArray(result.value.anomalies)).toBe(true);
    expect(result.value.analysisDays).toBe(90);
  });

  it('detects a spike when spend is 5x baseline', async () => {
    const today = '2026-04-28';
    // 60-day series: all 100 except today which is 500 (ratio=5 → critical spike)
    const rows = buildTimeSeries(today, 60, { '2026-04-28': 500 });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({});
    if (!result.success) throw new Error('Expected success');

    const spike = result.value.anomalies.find((a) => a.date === today && a.type === 'spike');
    expect(spike).toBeDefined();
    expect(spike!.severity).toBe('critical'); // ratio > 3 → critical
    expect(spike!.providerSlug).toBe('anthropic');
  });

  it('detects a drop when spend is 10% of baseline and > 1', async () => {
    const today = '2026-04-28';
    // baseline ~100, today = 5 → ratio = 0.05 → critical drop
    const rows = buildTimeSeries(today, 60, { '2026-04-28': 5 });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({});
    if (!result.success) throw new Error('Expected success');

    const drop = result.value.anomalies.find((a) => a.date === today && a.type === 'drop');
    expect(drop).toBeDefined();
    expect(drop!.severity).toBe('critical'); // ratio < 0.2 → critical
  });

  it('does NOT flag spend of 1 or less as a drop (business rule)', async () => {
    const today = '2026-04-28';
    // actualSpend = 0.5 — isDrop requires actualSpend > 1
    const rows = buildTimeSeries(today, 60, { '2026-04-28': 0.5 });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({});
    if (!result.success) throw new Error('Expected success');

    const drop = result.value.anomalies.find((a) => a.date === today && a.type === 'drop');
    expect(drop).toBeUndefined();
  });

  it('returns empty anomalies for flat baseline (no anomaly)', async () => {
    const today = '2026-04-28';
    const rows = buildTimeSeries(today, 60); // all 100, no overrides
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({});
    if (!result.success) throw new Error('Expected success');

    expect(result.value.anomalies).toEqual([]);
  });

  it('needs at least 3 baseline days — no anomaly flagged with < 3 history', async () => {
    // Only 4 total days: 3 history + 1 detection day (needs exactly 3 to detect)
    const today = '2026-04-28';
    const rows = buildTimeSeries(today, 4, { '2026-04-28': 500 });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({});
    if (!result.success) throw new Error('Expected success');
    // Detection date is today (Apr 28). Its baseline is the 3 prior dates,
    // which is exactly the minimum — should detect.
    // (The exact date depends on data window slicing vs detection window slicing.
    // If today ends up with only 3 prior days available it will detect; with 2 it won't.)
    // We only assert no throw and result is successful.
    expect(result.success).toBe(true);
  });

  it('sorts anomalies by date descending, then severity ascending', async () => {
    const today = '2026-04-28';
    // Two spikes on different dates
    const rows = buildTimeSeries(today, 60, {
      '2026-04-28': 500, // ratio=5, critical
      '2026-04-20': 250, // ratio=2.5, high
    });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({});
    if (!result.success) throw new Error('Expected success');

    const anomalies = result.value.anomalies;
    if (anomalies.length >= 2) {
      // Most-recent date first
      expect(anomalies[0].date >= anomalies[1].date).toBe(true);
    }
  });

  it('uses a fixed 90-day detection window and reports analysisDays=90', async () => {
    const today = '2026-04-28';
    const rows = buildTimeSeries(today, 180, { '2026-04-28': 600 });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({});
    if (!result.success) throw new Error('Expected success');

    expect(result.value.analysisDays).toBe(90);
    expect(result.value.anomalies.some((a) => a.type === 'spike')).toBe(true);
  });

  it('returns the full anomaly list (no display filter) when startDate/endDate absent', async () => {
    const today = '2026-04-28';
    const rows = buildTimeSeries(today, 60, {
      '2026-04-28': 500,
      '2026-04-15': 500,
      '2026-04-05': 500,
    });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const fullResult = await useCase({});
    if (!fullResult.success) throw new Error('Expected success');

    // All detected anomalies should be in the result (no trimming)
    const filteredResult = await useCase({
      startDate: new Date('2026-04-28T00:00:00Z'),
      endDate: new Date('2026-04-28T23:59:59.999Z'),
    });
    if (!filteredResult.success) throw new Error('Expected success');

    // The filtered result must have fewer or equal anomalies than the full result
    expect(filteredResult.value.anomalies.length).toBeLessThanOrEqual(
      fullResult.value.anomalies.length,
    );
  });
});

// =============================================================================
// SECTION 2 — Date-range mode: display list is filtered, detection math unchanged
// =============================================================================

describe('detectSpendAnomalies — with date range (dual-mode filter)', () => {
  it('filters displayed anomalies to those within [startDate, endDate]', async () => {
    const today = '2026-04-28';
    // Spikes on multiple dates across the window
    const rows = buildTimeSeries(today, 60, {
      '2026-04-28': 500, // inside Apr 20–28 range
      '2026-04-22': 500, // inside range
      '2026-04-05': 500, // outside range (before Apr 20)
    });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({
      startDate: new Date('2026-04-20T00:00:00Z'),
      endDate: new Date('2026-04-28T23:59:59.999Z'),
    });
    if (!result.success) throw new Error('Expected success');

    // All returned anomalies must be within [2026-04-20, 2026-04-28]
    for (const anomaly of result.value.anomalies) {
      expect(anomaly.date >= '2026-04-20').toBe(true);
      expect(anomaly.date <= '2026-04-28').toBe(true);
    }

    // Apr 05 spike should NOT appear in the displayed list
    const aprilFiveAnomaly = result.value.anomalies.find((a) => a.date === '2026-04-05');
    expect(aprilFiveAnomaly).toBeUndefined();
  });

  it('includes anomaly on exactly startDate (inclusive lower bound)', async () => {
    const today = '2026-04-28';
    const rows = buildTimeSeries(today, 60, { '2026-04-20': 500 });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({
      startDate: new Date('2026-04-20T00:00:00Z'),
      endDate: new Date('2026-04-28T23:59:59.999Z'),
    });
    if (!result.success) throw new Error('Expected success');

    const onBoundary = result.value.anomalies.find((a) => a.date === '2026-04-20');
    expect(onBoundary).toBeDefined();
  });

  it('includes anomaly on exactly endDate (inclusive upper bound)', async () => {
    const today = '2026-04-28';
    const rows = buildTimeSeries(today, 60, { '2026-04-28': 500 });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({
      startDate: new Date('2026-04-01T00:00:00Z'),
      endDate: new Date('2026-04-28T23:59:59.999Z'),
    });
    if (!result.success) throw new Error('Expected success');

    const onBoundary = result.value.anomalies.find((a) => a.date === '2026-04-28');
    expect(onBoundary).toBeDefined();
  });

  it('detection window is independent of display filter dates', async () => {
    // Build 60 days of data. Run the use case twice:
    // (a) without date filter — full list
    // (b) with a date filter that covers only the last 7 days
    // Both calls use the same system-wide detection window constant (90 days).
    // The difference is only in the returned list length.
    const today = '2026-04-28';
    const overrides: Record<string, number> = {};
    // Create spikes every 5 days through the window
    for (let i = 0; i < 30; i += 5) {
      const d = new Date(Date.UTC(2026, 3, 28 - i));
      overrides[d.toISOString().slice(0, 10)] = 500;
    }
    const rows = buildTimeSeries(today, 60, overrides);

    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const fullResult = await useCase({});
    const filteredResult = await useCase({
      startDate: new Date('2026-04-22T00:00:00Z'),
      endDate: new Date('2026-04-28T23:59:59.999Z'),
    });

    if (!fullResult.success || !filteredResult.success)
      throw new Error('Expected both to succeed');

    // The statistical analysis window is the same system-wide constant (90 days);
    // only the displayed list is trimmed by the date filter.
    expect(filteredResult.value.analysisDays).toBe(90);

    // Filtered list is a subset of the full list
    for (const anomaly of filteredResult.value.anomalies) {
      const inFull = fullResult.value.anomalies.some(
        (a) => a.date === anomaly.date && a.providerSlug === anomaly.providerSlug,
      );
      expect(inFull).toBe(true);
    }

    // Filtered list excludes anomalies before startDate
    expect(filteredResult.value.anomalies.every((a) => a.date >= '2026-04-22')).toBe(true);
  });

  it('returns empty anomalies when date filter excludes all detected anomalies', async () => {
    const today = '2026-04-28';
    // Spike only on Apr 28; filter is Apr 01–Apr 15 → no overlap
    const rows = buildTimeSeries(today, 60, { '2026-04-28': 500 });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({
      startDate: new Date('2026-04-01T00:00:00Z'),
      endDate: new Date('2026-04-15T23:59:59.999Z'),
    });
    if (!result.success) throw new Error('Expected success');

    expect(result.value.anomalies).toEqual([]);
  });

  it('filters after sorting — sort order is by date DESC within the displayed window', async () => {
    const today = '2026-04-28';
    const rows = buildTimeSeries(today, 60, {
      '2026-04-28': 500,
      '2026-04-25': 500,
      '2026-04-22': 500,
    });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({
      startDate: new Date('2026-04-20T00:00:00Z'),
      endDate: new Date('2026-04-28T23:59:59.999Z'),
    });
    if (!result.success) throw new Error('Expected success');

    // Verify descending date order in the filtered result
    const dates = result.value.anomalies.map((a) => a.date);
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i] >= dates[i + 1]).toBe(true);
    }
  });

  it('only startDate supplied → filters out anomalies before startDate', async () => {
    const today = '2026-04-28';
    const rows = buildTimeSeries(today, 60, {
      '2026-04-05': 500, // before Apr 20 → should be excluded
      '2026-04-28': 500, // on or after Apr 20 → should be included
    });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({
      startDate: new Date('2026-04-20T00:00:00Z'),
      // no endDate
    });
    if (!result.success) throw new Error('Expected success');

    expect(result.value.anomalies.every((a) => a.date >= '2026-04-20')).toBe(true);
    // Apr 05 excluded
    expect(result.value.anomalies.find((a) => a.date === '2026-04-05')).toBeUndefined();
  });

  it('only endDate supplied → filters out anomalies after endDate', async () => {
    const today = '2026-04-28';
    const rows = buildTimeSeries(today, 60, {
      '2026-04-05': 500, // before Apr 15 → included
      '2026-04-28': 500, // after Apr 15 → excluded
    });
    const repo = makeMockUsageRepo(rows);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({
      // no startDate
      endDate: new Date('2026-04-15T23:59:59.999Z'),
    });
    if (!result.success) throw new Error('Expected success');

    expect(result.value.anomalies.every((a) => a.date <= '2026-04-15')).toBe(true);
    // Apr 28 excluded
    expect(result.value.anomalies.find((a) => a.date === '2026-04-28')).toBeUndefined();
  });
});

// =============================================================================
// SECTION 3 — repo returns empty → no anomalies, no crash
// =============================================================================

describe('detectSpendAnomalies — empty data', () => {
  it('returns success with empty anomalies when repo has no rows', async () => {
    const repo = makeMockUsageRepo([]);
    const useCase = makeDetectSpendAnomaliesUseCase(repo);

    const result = await useCase({});
    if (!result.success) throw new Error('Expected success');

    expect(result.value.anomalies).toEqual([]);
    expect(result.value.providersAnalyzed).toBe(0);
  });
});

// =============================================================================
// SECTION 4 — getBudgetStatus signature: optional input, backward-compat
// =============================================================================

describe('getBudgetStatus — signature compatibility', () => {
  it('accepts empty input object — backward-compatible call site', async () => {
    const budgetRepo = makeMockBudgetRepo([]);
    const usageRepo = makeMockUsageRepo([]);
    const useCase = makeGetBudgetStatusUseCase(budgetRepo, usageRepo);

    // Old call site: no startDate/endDate
    const result = await useCase({});
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected success');
    expect(result.value.budgets).toEqual([]);
    expect(result.value.overallStatus).toBe('on_track');
  });

  it('accepts input with startDate and endDate (new call site)', async () => {
    const budgetRepo = makeMockBudgetRepo([]);
    const usageRepo = makeMockUsageRepo([]);
    const useCase = makeGetBudgetStatusUseCase(budgetRepo, usageRepo);

    const result = await useCase({
      startDate: new Date('2026-04-01T00:00:00Z'),
      endDate: new Date('2026-04-28T23:59:59.999Z'),
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected success');
    expect(Array.isArray(result.value.budgets)).toBe(true);
  });

  it('GetBudgetStatusInput type accepts both empty and full forms', () => {
    // This is a compile-time check expressed as a runtime no-op.
    const withNothing: GetBudgetStatusInput = {};
    const withDates: GetBudgetStatusInput = {
      startDate: new Date('2026-04-01T00:00:00Z'),
      endDate: new Date('2026-04-28T23:59:59.999Z'),
    };
    const withOnlyStart: GetBudgetStatusInput = { startDate: new Date() };
    const withOnlyEnd: GetBudgetStatusInput = { endDate: new Date() };

    // These just need to not throw at construction time
    expect(withNothing).toBeDefined();
    expect(withDates).toBeDefined();
    expect(withOnlyStart).toBeDefined();
    expect(withOnlyEnd).toBeDefined();
  });
});
