// =============================================================================
// Domain — Selected Period Resolver
// =============================================================================
// Maps the unified URL contract (`period`, `from`, `to` searchParams) to a
// concrete UTC date range, preset token, and human-readable label.
//
// This is the single authority for URL → dates mapping in the cost-tracking
// module. Every page that renders time-bounded data calls this resolver.
//
// Preset tokens (RFC Section 3.1):
//   today | 7d | 30d (default) | 90d | mtd | qtd | ytd | custom | all
//
// Edge cases (RFC Section 3.9):
//   - Unknown `period` value → falls back to 30d default. No error.
//   - `period=custom` with missing or invalid `from`/`to` → falls back to 30d.
//   - `from > to` → dates are swapped silently.
//   - `to` in the future → clamped to end-of-day today (UTC).
//   - Stale `window` or `time` params are ignored; callers pass only `period`.
//
// All dates are UTC. End dates are end-of-day-inclusive (23:59:59.999Z),
// matching the convention in `resolveDateRange()` (dateRange.ts:25).
//
// No imports from application/, infrastructure/, app/, or any external
// framework. Pure date math only.
// =============================================================================

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/** Accepted period preset tokens per RFC Section 3.1. */
export type PeriodPreset = 'today' | '7d' | '30d' | '90d' | 'mtd' | 'qtd' | 'ytd' | 'custom' | 'all';

/** The set of accepted preset tokens for fast membership checks. */
const VALID_PRESETS = new Set<string>([
  'today',
  '7d',
  '30d',
  '90d',
  'mtd',
  'qtd',
  'ytd',
  'custom',
  'all',
]);

/** Input shape matching Next.js searchParams (string | undefined for each key). */
export type PeriodSearchParams = {
  period?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

/** The resolved output of the period resolver. */
export type ResolvedPeriod = {
  /** UTC start of the selected period (start-of-day). */
  startDate: Date;
  /** UTC end of the selected period (end-of-day-inclusive: 23:59:59.999Z). */
  endDate: Date;
  /** The canonical preset token. Always a member of `PeriodPreset`. */
  preset: PeriodPreset;
  /** Human-readable label for display in the UI. */
  label: string;
};

// =============================================================================
// SECTION 2: HELPERS
// =============================================================================

/**
 * Returns end-of-day today in UTC (23:59:59.999Z).
 * Used as the upper bound for all preset calculations and future-date clamping.
 */
function endOfDayTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );
}

/**
 * Clamps a date to end-of-day today if it is in the future.
 * Future cost data does not exist, so the upper bound is always today.
 */
function clampToTodayUtc(date: Date, todayEnd: Date): Date {
  return date.getTime() > todayEnd.getTime() ? todayEnd : date;
}

/**
 * Parses a YYYY-MM-DD date-only string as a UTC Date.
 * Returns null if the string is missing, empty, or does not produce a valid Date.
 */
function parseDateOnly(value: string | undefined): Date | null {
  if (!value || value.trim() === '') return null;
  const parsed = new Date(value.trim() + 'T00:00:00Z');
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Sets the time component of a Date to 23:59:59.999 UTC (end-of-day-inclusive).
 */
function toEndOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

// =============================================================================
// SECTION 3: SHARED RANGE HELPERS
// =============================================================================

function resolveDefault(todayEnd: Date): ResolvedPeriod {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29),
  );
  return { startDate: start, endDate: todayEnd, preset: '30d', label: 'Last 30 days' };
}

/**
 * Resolves a custom date range from two already-parsed Date values.
 * Applies end-of-day, clamps future dates, swaps if from > to.
 * Used by both the explicit `period=custom` case and the implicit-custom
 * inference path (absent/unknown period + valid from+to).
 */
function resolveCustomRange(
  parsedFrom: Date,
  parsedTo: Date,
  rawFrom: string | undefined,
  rawTo: string | undefined,
  todayEnd: Date,
): ResolvedPeriod {
  // Apply end-of-day to the `to` boundary (it was parsed as start-of-day).
  let resolvedEnd = toEndOfDayUtc(parsedTo);

  // Clamp `to` to end-of-day today — future cost data does not exist.
  resolvedEnd = clampToTodayUtc(resolvedEnd, todayEnd);

  // Swap silently when from > to (after clamping, so the invariant holds).
  const resolvedStart =
    parsedFrom.getTime() <= resolvedEnd.getTime() ? parsedFrom : resolvedEnd;
  const finalEnd =
    parsedFrom.getTime() <= resolvedEnd.getTime() ? resolvedEnd : parsedFrom;

  // When a swap occurred, `finalEnd` is the former `from` (start-of-day).
  // Apply end-of-day to it as well so the convention is preserved.
  const safeEnd =
    finalEnd.getUTCHours() === 0 &&
    finalEnd.getUTCMinutes() === 0 &&
    finalEnd.getUTCSeconds() === 0 &&
    finalEnd.getUTCMilliseconds() === 0
      ? toEndOfDayUtc(finalEnd)
      : finalEnd;

  const fromLabel = rawFrom ?? '';
  const toLabel = rawTo ?? '';
  const label = `${fromLabel} – ${toLabel}`;

  return { startDate: resolvedStart, endDate: safeEnd, preset: 'custom', label };
}

// =============================================================================
// SECTION 4: RESOLVER
// =============================================================================

/**
 * Maps the unified URL contract to a concrete UTC date range, preset token,
 * and human-readable label.
 *
 * This is the sole authority for URL → dates mapping in the cost-tracking
 * module. It is a pure function: same input always produces the same output,
 * no side effects, no I/O.
 *
 * @param searchParams - The raw `period`, `from`, and `to` values from the
 *   Next.js searchParams object. All keys are optional and may be undefined.
 *   Any other params (e.g., `window`, `time`) in the searchParams object are
 *   ignored by callers before passing here — this function only reads the
 *   three named keys.
 *
 * @returns A `ResolvedPeriod` with concrete UTC start/end dates, the canonical
 *   preset token, and a display label. Never throws; always returns a valid
 *   result by falling back to the 30d default on any invalid input.
 */
export function resolveSelectedPeriod(searchParams: PeriodSearchParams): ResolvedPeriod {
  const todayEnd = endOfDayTodayUtc();
  const now = new Date();

  const rawPeriod = searchParams.period?.trim() ?? '';

  // Unknown or absent period: before falling back to 30d default, check if
  // both `from` and `to` are valid dates. If they are, treat the request as a
  // custom range — this handles URLs like ?provider=openai&from=…&to=… where
  // the `period` key was never set (RFC Section 3.9 bug-fix).
  if (rawPeriod === '' || !VALID_PRESETS.has(rawPeriod)) {
    const parsedFrom = parseDateOnly(searchParams.from);
    const parsedTo = parseDateOnly(searchParams.to);
    if (parsedFrom !== null && parsedTo !== null) {
      // Delegate to the custom-range path by falling through with preset='custom'.
      return resolveCustomRange(parsedFrom, parsedTo, searchParams.from, searchParams.to, todayEnd);
    }
    return resolveDefault(todayEnd);
  }

  const preset = rawPeriod as PeriodPreset;

  switch (preset) {
    case 'today': {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      return { startDate: start, endDate: todayEnd, preset, label: 'Today' };
    }

    case '7d': {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6),
      );
      return { startDate: start, endDate: todayEnd, preset, label: 'Last 7 days' };
    }

    case '30d': {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29),
      );
      return { startDate: start, endDate: todayEnd, preset, label: 'Last 30 days' };
    }

    case '90d': {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 89),
      );
      return { startDate: start, endDate: todayEnd, preset, label: 'Last 90 days' };
    }

    case 'mtd': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { startDate: start, endDate: todayEnd, preset, label: 'Month to date' };
    }

    case 'qtd': {
      const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
      const start = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1));
      return { startDate: start, endDate: todayEnd, preset, label: 'Quarter to date' };
    }

    case 'ytd': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      return { startDate: start, endDate: todayEnd, preset, label: 'Year to date' };
    }

    case 'all': {
      // Hard floor: Jan 1, 2000 UTC (well before any LLM provider existed).
      const start = new Date(Date.UTC(2000, 0, 1));
      return { startDate: start, endDate: todayEnd, preset, label: 'All time' };
    }

    case 'custom': {
      const parsedFrom = parseDateOnly(searchParams.from);
      const parsedTo = parseDateOnly(searchParams.to);

      // Missing or invalid dates for a custom range → fall back to default.
      if (parsedFrom === null || parsedTo === null) {
        return resolveDefault(todayEnd);
      }

      return resolveCustomRange(parsedFrom, parsedTo, searchParams.from, searchParams.to, todayEnd);
    }
  }
}
