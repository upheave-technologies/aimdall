# Test Report: COST_4_9

## Executive Summary

- **Tests Created**: 2 new files
- **Tests Updated**: 0
- **Tests Run**: 130 (full cost-tracking suite)
- **Tests Passed**: 130
- **Tests Failed**: 0
- **Overall Status**: PASS

## Code Changes Analyzed

- `modules/cost-tracking/domain/selectedPeriod.ts` — resolver from COST_4_1
- `modules/cost-tracking/application/detectSpendAnomaliesUseCase.ts` — dual-mode contract from COST_4_2
- `modules/cost-tracking/application/getBudgetStatusUseCase.ts` — extended signature from COST_4_2

No new API endpoints were created by this task — the surfaces under test are pure domain and application layer functions. Tests follow the existing project pattern: Vitest unit tests in `modules/cost-tracking/__tests__/`, same `describe`/`it`/`expect` conventions.

## Tests Created

### `modules/cost-tracking/__tests__/selectedPeriod.test.ts`

**What it tests:** The `resolveSelectedPeriod` pure function — the single authority for mapping URL params to UTC date ranges.

Tests are run under a pinned fake clock (`2026-04-28T12:00:00Z` — a Tuesday in Q2) so every date assertion is deterministic.

**Test scenarios (30 tests):**

- Absent period (undefined) → 30d default with correct start/end
- Empty string period → 30d default
- Whitespace-only period → 30d default
- Unknown string (e.g. "last_week") → 30d default
- Stale "window" string as period value → 30d default (not translated)
- Stale "time" string as period value → 30d default (not translated)
- Preset `today` → correct UTC start/end for the anchor date
- Preset `7d` → today minus 6 days at start-of-day
- Preset `30d` → today minus 29 days at start-of-day
- Preset `90d` → today minus 89 days at start-of-day
- Preset `mtd` → first of current month (April 1, 2026)
- Preset `qtd` → first of current quarter (April 1 for Q2); Q1 and Q3 boundary variants
- Preset `ytd` → Jan 1 of current year
- Custom with valid from/to → parsed dates, end-of-day applied to `to`
- Custom with missing `from` → 30d default
- Custom with missing `to` → 30d default
- Custom with both absent → 30d default
- Custom with empty string `from` → 30d default
- Custom with empty string `to` → 30d default
- Custom with non-date `from` string → 30d default
- Custom with non-date `to` string → 30d default
- Custom with both invalid strings → 30d default
- Custom with `to` in the future → clamped to end-of-day today
- Custom with `to` equal to today → not clamped (valid boundary)
- Custom with `from > to` → silently swapped; `startDate < endDate` invariant holds
- Swap does not throw (silent behaviour)
- Extra URL params (window, time) are out of scope of the function signature (documented)

**Discovered implementation detail (important for callers):**
When `from > to` and a swap occurs, `startDate` retains the end-of-day time of the originally-supplied `to` date (because end-of-day is applied before the swap comparison). The `startDate < endDate` invariant always holds after a swap.

### `modules/cost-tracking/__tests__/detectSpendAnomalies.test.ts`

**What it tests:**
1. `makeDetectSpendAnomaliesUseCase` — the dual-mode anomaly detection factory
2. `makeGetBudgetStatusUseCase` — backward-compat and new signature acceptance

The test file mocks `@/lib/db`, `DrizzleUsageRecordRepository`, and `DrizzleBudgetRepository` so the pre-wired singleton exports at the bottom of each use case file do not attempt a real database connection. All tests inject mock repositories directly via the factory functions.

**Test scenarios — No date range (legacy mode, 10 tests):**

- Returns success with anomalies array
- Detects a spike (5x baseline → critical severity, ratio > 3)
- Detects a drop (10% of baseline, > $1 spend → critical drop)
- Does NOT flag spend ≤ $1 as a drop (business rule: `actualSpend > 1`)
- Returns empty anomalies for a flat baseline (no anomaly)
- Handles insufficient baseline history (< 3 days)
- Sorts anomalies by date DESC within the result
- Respects `windowDays=90` for wider detection
- Defaults `windowDays` to 30 when not supplied
- Full list returned (no trimming) when startDate/endDate are absent

**Test scenarios — With date range (dual-mode filter, 9 tests):**

- Filters displayed anomalies to [startDate, endDate]; anomalies outside range excluded
- Lower bound is inclusive (anomaly on exactly startDate is included)
- Upper bound is inclusive (anomaly on exactly endDate is included)
- Detection `windowDays` is independent of display filter — same statistics, different output list
- Returns empty anomalies when filter excludes all detected anomalies
- Filter happens after sort — sort order is date DESC within the filtered window
- Only `startDate` supplied → anomalies before startDate excluded
- Only `endDate` supplied → anomalies after endDate excluded

**Test scenarios — Edge cases (1 test):**
- Empty repo rows → success, empty anomalies, 0 providers

**Test scenarios — getBudgetStatus signature (3 tests):**
- Accepts `{}` (empty input) — backward-compatible old call site
- Accepts `{ startDate, endDate }` — new extended call site
- `GetBudgetStatusInput` type accepts all four combinations (empty, both dates, only start, only end)

## Test Execution Results

**Command:** `pnpm exec vitest run modules/cost-tracking/__tests__/`

**Output:**
```
 RUN  v4.1.0 /Users/mario/code/Labs/aimdall

 Test Files  7 passed (7)
      Tests  130 passed (130)
   Start at  13:52:34
   Duration  253ms (transform 402ms, setup 0ms, import 524ms, tests 50ms, environment 0ms)
```

**Result:** ALL PASSED

## Coverage Analysis

- [x] All preset tokens covered (`today`, `7d`, `30d`, `90d`, `mtd`, `qtd`, `ytd`, `custom`)
- [x] Each preset returns expected UTC start/end for a known anchor date
- [x] Invalid `period` values fall back to 30d
- [x] `period=custom` with missing `from` falls back to 30d
- [x] `period=custom` with missing `to` falls back to 30d
- [x] `period=custom` with invalid date strings falls back to 30d
- [x] `from > to` is silently swapped; `startDate < endDate` invariant holds
- [x] `to` in the future clamped to end-of-day today (UTC)
- [x] Stale `window` and `time` URL param values do not translate (unknown string → default)
- [x] Anomaly detection math unaffected by `startDate`/`endDate` (statistical window independent)
- [x] Display filter excludes anomalies outside the supplied range
- [x] Inclusive lower bound (date >= startDate)
- [x] Inclusive upper bound (date <= endDate)
- [x] Filter applied after sort
- [x] Legacy call (no dates) returns full list unchanged
- [x] `getBudgetStatus` accepts `{}` (backward-compat) and `{ startDate, endDate }` (new)
- [x] `GetBudgetStatusInput` type is correctly optional for all fields

**Not covered (out of scope per task brief):**
- Page-to-page propagation (NavigationContainer) — no clean unit extraction was feasible without touching production component files; the task brief offered this as an option if cleanly extractable. The `withPeriodParams` helper is embedded in a React Server Component that requires Next.js rendering infrastructure. Smoke-level test would require a running Next.js dev server.
- Editorial opt-out widgets (MTD card, forecast, banner) — these are server-rendered components; testing them without a running server falls outside the integration test scope and the existing test infrastructure (pure vitest, no browser).
- Page-level render smoke tests across all cost-tracking pages — same reason: requires a running Next.js server.

These three areas are noted as integration/E2E candidates that would require a different test harness (Playwright, or a similar browser test setup).

## Cleanup Verification

- Tests are pure unit tests with mocked repositories; no database connections attempted
- Ran full suite 3 times consecutively: all pass each run (deterministic fake timers)
- No external state mutations

## Progression Status

- **Can work proceed?** YES — all tests pass
- **Reason:** Both new test files cover all acceptance criteria that are unit-testable within the existing Vitest infrastructure. No production code was modified.

## Recommendations

1. **Add a vitest config file** — Currently vitest runs with zero configuration, relying on defaults. Adding a `vitest.config.ts` with explicit `include` patterns and path alias resolution (`@/` → `./`) would make the test runner's behavior explicit and support future additions like coverage thresholds.

2. **Consider Playwright for page-level smoke tests** — The three uncovered areas (NavigationContainer propagation, editorial opt-outs, page-render smoke tests) all require rendering. Adding Playwright to the dev dependencies would enable these scenarios with minimal effort; the test patterns are straightforward given the existing URL contract.

3. **Swap behavior clarification** — The `from > to` swap leaves `startDate` with an end-of-day time (23:59:59.999Z) rather than start-of-day (00:00:00.000Z). This is consistent with the implementation but may surprise callers who expect `startDate` to always be a clean midnight boundary. Consider documenting this edge in the resolver's JSDoc or adjusting the swap logic to normalize `startDate` to start-of-day.
