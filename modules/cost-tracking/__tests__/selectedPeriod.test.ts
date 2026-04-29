import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveSelectedPeriod } from '../domain/selectedPeriod';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Pin "now" to a known UTC instant so every test is deterministic.
 *
 * The anchor is 2026-04-28T12:00:00Z (noon UTC on a Tuesday in Q2).
 *   - UTCFullYear : 2026
 *   - UTCMonth    : 3  (April, 0-indexed)
 *   - UTCDate     : 28
 *   - Quarter     : Q2 starts 2026-04-01
 *   - ISO week    : Tuesday → daysSinceMonday = 1 (Mon = Apr 27)
 */
const FIXED_NOW_MS = Date.UTC(2026, 3, 28, 12, 0, 0, 0); // 2026-04-28T12:00:00.000Z

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function endOfDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_NOW_MS));
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// SECTION 1 — Absent / invalid period → 30d default
// =============================================================================

describe('resolveSelectedPeriod — absent / invalid period', () => {
  it('absent period (undefined) → 30d default', () => {
    const result = resolveSelectedPeriod({});
    expect(result.preset).toBe('30d');
    expect(result.label).toBe('Last 30 days');
    // start should be 29 calendar days before today (inclusive window)
    expect(toIsoDate(result.startDate)).toBe('2026-03-30');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 28).toISOString());
  });

  it('empty string period → 30d default', () => {
    const result = resolveSelectedPeriod({ period: '' });
    expect(result.preset).toBe('30d');
    expect(toIsoDate(result.startDate)).toBe('2026-03-30');
  });

  it('whitespace-only period → 30d default', () => {
    const result = resolveSelectedPeriod({ period: '   ' });
    expect(result.preset).toBe('30d');
  });

  it('unknown period string → 30d default', () => {
    const result = resolveSelectedPeriod({ period: 'last_week' });
    expect(result.preset).toBe('30d');
  });

  it('stale "window" param is ignored (not translated)', () => {
    // Callers strip window/time before calling resolver; resolver only reads
    // period/from/to. We still verify that an unknown string → default.
    const result = resolveSelectedPeriod({ period: 'window' });
    expect(result.preset).toBe('30d');
  });

  it('stale "time" param is ignored (not translated)', () => {
    const result = resolveSelectedPeriod({ period: 'time' });
    expect(result.preset).toBe('30d');
  });
});

// =============================================================================
// SECTION 2 — Preset: today
// =============================================================================

describe('resolveSelectedPeriod — preset: today', () => {
  it('returns correct UTC range for today', () => {
    const result = resolveSelectedPeriod({ period: 'today' });
    expect(result.preset).toBe('today');
    expect(result.label).toBe('Today');
    // start = 2026-04-28T00:00:00.000Z
    expect(result.startDate.toISOString()).toBe('2026-04-28T00:00:00.000Z');
    // end = 2026-04-28T23:59:59.999Z
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 28).toISOString());
  });
});

// =============================================================================
// SECTION 3 — Preset: 7d
// =============================================================================

describe('resolveSelectedPeriod — preset: 7d', () => {
  it('returns correct UTC range for last 7 days', () => {
    const result = resolveSelectedPeriod({ period: '7d' });
    expect(result.preset).toBe('7d');
    expect(result.label).toBe('Last 7 days');
    // start = today − 6 = 2026-04-22
    expect(toIsoDate(result.startDate)).toBe('2026-04-22');
    expect(result.startDate.toISOString()).toBe('2026-04-22T00:00:00.000Z');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 28).toISOString());
  });
});

// =============================================================================
// SECTION 4 — Preset: 30d
// =============================================================================

describe('resolveSelectedPeriod — preset: 30d', () => {
  it('returns correct UTC range for last 30 days', () => {
    const result = resolveSelectedPeriod({ period: '30d' });
    expect(result.preset).toBe('30d');
    // start = today − 29 = 2026-03-30
    expect(toIsoDate(result.startDate)).toBe('2026-03-30');
    expect(result.startDate.toISOString()).toBe('2026-03-30T00:00:00.000Z');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 28).toISOString());
  });
});

// =============================================================================
// SECTION 5 — Preset: 90d
// =============================================================================

describe('resolveSelectedPeriod — preset: 90d', () => {
  it('returns correct UTC range for last 90 days', () => {
    const result = resolveSelectedPeriod({ period: '90d' });
    expect(result.preset).toBe('90d');
    expect(result.label).toBe('Last 90 days');
    // start = today − 89 = 2026-01-29
    expect(toIsoDate(result.startDate)).toBe('2026-01-29');
    expect(result.startDate.toISOString()).toBe('2026-01-29T00:00:00.000Z');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 28).toISOString());
  });
});

// =============================================================================
// SECTION 6 — Preset: mtd (month-to-date)
// =============================================================================

describe('resolveSelectedPeriod — preset: mtd', () => {
  it('returns 1st of current month → end-of-day today', () => {
    const result = resolveSelectedPeriod({ period: 'mtd' });
    expect(result.preset).toBe('mtd');
    expect(result.label).toBe('Month to date');
    // April 2026 → start = 2026-04-01
    expect(result.startDate.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 28).toISOString());
  });
});

// =============================================================================
// SECTION 7 — Preset: qtd (quarter-to-date)
// =============================================================================

describe('resolveSelectedPeriod — preset: qtd', () => {
  it('returns 1st day of current quarter → end-of-day today', () => {
    // April 2026 is in Q2 (Apr–Jun), so quarter starts 2026-04-01
    const result = resolveSelectedPeriod({ period: 'qtd' });
    expect(result.preset).toBe('qtd');
    expect(result.label).toBe('Quarter to date');
    expect(result.startDate.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 28).toISOString());
  });

  it('Q1 anchor: returns 2026-01-01 when now is in Q1', () => {
    // Override fake timer to January
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 15, 12, 0, 0, 0))); // Jan 15
    const result = resolveSelectedPeriod({ period: 'qtd' });
    expect(result.preset).toBe('qtd');
    expect(result.startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('Q3 anchor: returns 2026-07-01 when now is in Q3', () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 10, 12, 0, 0, 0))); // Aug 10
    const result = resolveSelectedPeriod({ period: 'qtd' });
    expect(result.preset).toBe('qtd');
    expect(result.startDate.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});

// =============================================================================
// SECTION 8 — Preset: ytd (year-to-date)
// =============================================================================

describe('resolveSelectedPeriod — preset: ytd', () => {
  it('returns Jan 1 of current year → end-of-day today', () => {
    const result = resolveSelectedPeriod({ period: 'ytd' });
    expect(result.preset).toBe('ytd');
    expect(result.label).toBe('Year to date');
    expect(result.startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 28).toISOString());
  });
});

// =============================================================================
// SECTION 9 — Custom range — happy path
// =============================================================================

describe('resolveSelectedPeriod — custom: valid range', () => {
  it('returns parsed from/to with end-of-day applied to to', () => {
    const result = resolveSelectedPeriod({
      period: 'custom',
      from: '2026-03-01',
      to: '2026-04-01',
    });
    expect(result.preset).toBe('custom');
    expect(result.startDate.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    // end-of-day is applied to the `to` param (2026-04-01)
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 1).toISOString());
    expect(result.label).toBe('2026-03-01 – 2026-04-01');
  });
});

// =============================================================================
// SECTION 10 — Custom range — missing dates → 30d default
// =============================================================================

describe('resolveSelectedPeriod — custom: missing from/to', () => {
  it('missing from → 30d default', () => {
    const result = resolveSelectedPeriod({ period: 'custom', to: '2026-04-01' });
    expect(result.preset).toBe('30d');
  });

  it('missing to → 30d default', () => {
    const result = resolveSelectedPeriod({ period: 'custom', from: '2026-03-01' });
    expect(result.preset).toBe('30d');
  });

  it('both from and to absent → 30d default', () => {
    const result = resolveSelectedPeriod({ period: 'custom' });
    expect(result.preset).toBe('30d');
  });

  it('empty string from → 30d default', () => {
    const result = resolveSelectedPeriod({ period: 'custom', from: '', to: '2026-04-01' });
    expect(result.preset).toBe('30d');
  });

  it('empty string to → 30d default', () => {
    const result = resolveSelectedPeriod({ period: 'custom', from: '2026-03-01', to: '' });
    expect(result.preset).toBe('30d');
  });
});

// =============================================================================
// SECTION 11 — Custom range — invalid date strings → 30d default
// =============================================================================

describe('resolveSelectedPeriod — custom: invalid date strings', () => {
  it('non-date from string → 30d default', () => {
    const result = resolveSelectedPeriod({ period: 'custom', from: 'not-a-date', to: '2026-04-01' });
    expect(result.preset).toBe('30d');
  });

  it('non-date to string → 30d default', () => {
    const result = resolveSelectedPeriod({ period: 'custom', from: '2026-03-01', to: 'not-a-date' });
    expect(result.preset).toBe('30d');
  });

  it('both invalid strings → 30d default', () => {
    const result = resolveSelectedPeriod({ period: 'custom', from: 'bad', to: 'also-bad' });
    expect(result.preset).toBe('30d');
  });
});

// =============================================================================
// SECTION 12 — Custom range — to in the future → clamped to today
// =============================================================================

describe('resolveSelectedPeriod — custom: future to is clamped', () => {
  it('to set in the future is clamped to end-of-day today', () => {
    const result = resolveSelectedPeriod({
      period: 'custom',
      from: '2026-04-01',
      to: '2026-12-31', // far in the future
    });
    expect(result.preset).toBe('custom');
    expect(result.startDate.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    // endDate must equal end-of-day today, not the supplied future date
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 28).toISOString());
  });

  it('to exactly equal to today (same date) is NOT clamped (valid boundary)', () => {
    const result = resolveSelectedPeriod({
      period: 'custom',
      from: '2026-04-01',
      to: '2026-04-28', // today
    });
    expect(result.preset).toBe('custom');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 28).toISOString());
  });
});

// =============================================================================
// SECTION 13 — Custom range — from > to → silently swapped
// =============================================================================

describe('resolveSelectedPeriod — custom: from > to is swapped', () => {
  it('swaps from and to when from is later than to', () => {
    // from = Apr 15, to = Mar 01 (from > to) → should swap silently.
    // Implementation detail: the swap makes resolvedStart the formerly-to
    // date with its end-of-day time already applied (because end-of-day is
    // applied before the swap check), and resolvedEnd becomes end-of-day of
    // the formerly-from date.
    const result = resolveSelectedPeriod({
      period: 'custom',
      from: '2026-04-15',
      to: '2026-03-01',
    });
    expect(result.preset).toBe('custom');
    // startDate = end-of-day of the originally-supplied `to` (after swap)
    expect(result.startDate.toISOString()).toBe(endOfDay(2026, 2, 1).toISOString());
    // endDate = end-of-day of the originally-supplied `from` (after swap)
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 15).toISOString());
  });

  it('startDate is before endDate after the swap', () => {
    const result = resolveSelectedPeriod({
      period: 'custom',
      from: '2026-04-15',
      to: '2026-03-01',
    });
    expect(result.startDate.getTime()).toBeLessThan(result.endDate.getTime());
  });

  it('does not throw on swapped dates — silent behaviour', () => {
    expect(() =>
      resolveSelectedPeriod({ period: 'custom', from: '2026-04-28', to: '2026-01-01' }),
    ).not.toThrow();
  });
});

// =============================================================================
// SECTION 14 — window and time params are ignored
// =============================================================================

describe('resolveSelectedPeriod — stale window/time params are ignored', () => {
  it('extra params in the input object beyond period/from/to are irrelevant', () => {
    // The function signature only reads period, from, to — any extra key is
    // safe to pass but ignored. This test documents the contractual boundary.
    const params = {
      period: '7d',
      // These keys are beyond PeriodSearchParams but TypeScript allows them
      // through excess-property rules in some call sites
    } as Parameters<typeof resolveSelectedPeriod>[0];

    const result = resolveSelectedPeriod(params);
    expect(result.preset).toBe('7d');
    expect(toIsoDate(result.startDate)).toBe('2026-04-22');
  });
});

// =============================================================================
// SECTION 15 — Preset: all (all time)
// =============================================================================

describe('resolveSelectedPeriod — preset: all', () => {
  it('returns Jan 1 2000 UTC as startDate and end-of-day today as endDate', () => {
    const result = resolveSelectedPeriod({ period: 'all' });
    expect(result.preset).toBe('all');
    expect(result.label).toBe('All time');
    expect(result.startDate.toISOString()).toBe('2000-01-01T00:00:00.000Z');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 3, 28).toISOString());
  });
});

// =============================================================================
// SECTION 16 — Implicit custom: absent/unknown period + valid from+to
// =============================================================================

describe('resolveSelectedPeriod — implicit custom (no period, valid from+to)', () => {
  it('no period, both from and to valid → preset=custom, dates match parsed values', () => {
    const result = resolveSelectedPeriod({ from: '2026-03-16', to: '2026-03-16' });
    expect(result.preset).toBe('custom');
    expect(result.startDate.toISOString()).toBe('2026-03-16T00:00:00.000Z');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 2, 16).toISOString());
    expect(result.label).toBe('2026-03-16 – 2026-03-16');
  });

  it('no period, only from valid (to absent) → falls back to 30d default', () => {
    const result = resolveSelectedPeriod({ from: '2026-03-16' });
    expect(result.preset).toBe('30d');
  });

  it('no period, only to valid (from absent) → falls back to 30d default', () => {
    const result = resolveSelectedPeriod({ to: '2026-03-16' });
    expect(result.preset).toBe('30d');
  });

  it('empty period string, both from and to valid → preset=custom', () => {
    const result = resolveSelectedPeriod({ period: '', from: '2026-01-01', to: '2026-03-31' });
    expect(result.preset).toBe('custom');
    expect(result.startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 2, 31).toISOString());
  });

  it('unknown/garbage period, both from and to valid → preset=custom', () => {
    const result = resolveSelectedPeriod({ period: 'garbage', from: '2026-02-01', to: '2026-02-28' });
    expect(result.preset).toBe('custom');
    expect(result.startDate.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(result.endDate.toISOString()).toBe(endOfDay(2026, 1, 28).toISOString());
  });
});
