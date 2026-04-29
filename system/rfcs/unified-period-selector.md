# RFC: Unified Period Selector

- **Module:** cost-tracking (cross-page chrome)
- **Status:** Implemented
- **Created:** 2026-04-28

---

## 1. Problem

The Aimdall app currently runs three competing time-selection systems and propagation is broken inside the dashboard itself:

- **Dashboard** (`app/cost-tracking/page.tsx`) reads `from`/`to` searchParams via the local `DateRangeFilterContainer` and forwards them only to `getUsageSummary` (line 38). The other four use cases on the same page are called with `{}`:
  - `getSpendForecast({})` — line 40
  - `getUnassignedSpend({})` — line 41
  - `detectSpendAnomalies({})` — line 42
  - `getBudgetStatus({})` — line 43
- **Alerts** (`app/cost-tracking/alerts/page.tsx`) reads `window` (30/90/180) and forwards it as `windowDays` to `detectSpendAnomalies` (line 27). It does not read `from`/`to` at all.
- **Explore** (`app/cost-tracking/explore/page.tsx`) reads a `time` preset plus optional `from`/`to`, with its own local `resolveTimePreset` (lines 96–184) that knows about `today`, `7d`, `30d`, `90d`, `mtd`, `qtd`, `ytd`, `custom`.

Two use cases also have signatures incompatible with a unified period:
- `detectSpendAnomaliesUseCase.ts:30–32` — input is `{ windowDays?: 30 | 90 | 180 }` only. There is no way to pass a display range.
- `getBudgetStatusUseCase.ts:28` — input is `Record<string, never>`. No parameters accepted at all.

The attributions page passes `startDate: new Date(0)` (`app/cost-tracking/attributions/page.tsx:106,110`) — a hard-coded all-time window that ignores any global selection.

The `DateRangeFilterContainer` lives inside the dashboard route, so navigating to alerts, explore, attributions, budget, recommendations, or report drops the user's selection. Nothing carries the time context across pages, and the URL contracts are mutually incompatible (`from`/`to` vs. `window` vs. `time`+`from`+`to`).

The user-facing problem is that the time period feels like an inconsistent per-page widget instead of a property of the application's analytical view.

## 2. Key Decisions Already Made

1. **Anomaly detection math keeps its rolling window.** The statistical baseline in `detectSpendAnomaliesUseCase` (lines 89–138) depends on a fixed-length history (`windowDays * 2` of fetch, then a trailing baseline of `windowDays`). This must not be coupled to the user-selected display period. The selected period filters the *displayed list* of anomalies whose `date` falls inside `[startDate, endDate]`. Two different windows on one use case.
2. **Selector lives in application chrome, not on a page.** The selector belongs in `app/cost-tracking/layout.tsx` (which already wraps every cost-tracking page via `NavigationContainer`). It is not a per-page widget.
3. **Pragmatic opt-out, not a flag.** Widgets that are period-agnostic by their nature simply do not consult the resolver. There is no "ignoresPeriod" flag on use cases. The opt-out is editorial.

## 3. Proposed Architecture

### 3.1 Single URL Contract

One contract for every page that renders time-bounded data:

- **`period`** — a preset token. Accepted values: `today`, `7d`, `30d` (default), `90d`, `mtd`, `qtd`, `ytd`, `custom`.
- **`from`** — date-only string (`YYYY-MM-DD`), required only when `period=custom`. Ignored otherwise.
- **`to`** — date-only string (`YYYY-MM-DD`), required only when `period=custom`. Ignored otherwise.

When `period` is absent, the resolver defaults to `30d`. This matches the current behaviour of `resolveDateRange()` in `modules/cost-tracking/domain/dateRange.ts`. The legacy `window` (alerts) and `time` (explore) parameters are retired with no long-term shim.

**Rationale:** A single contract removes the three-way ambiguity. Encoding the preset name (rather than only `from`/`to`) preserves user intent — "last 7 days" stays "last 7 days" tomorrow without the URL needing to be rewritten. Custom ranges remain expressible.

**Trade-off:** Existing bookmarked URLs using `window` or `time` break. Acceptable per Section 2.3 (no shim).

### 3.2 Single Server-Side Resolver

A pure domain function — `resolveSelectedPeriod(searchParams)` — lives in `modules/cost-tracking/domain/selectedPeriod.ts`. It is the only place that maps the URL contract to concrete UTC dates and a preset label.

**Why domain layer:** This is pure date math with no I/O, no framework dependency, and is shared across pages. It belongs next to `dateRange.ts` in the domain layer, per `.claude/rules/domain-layer.md`. Every cost-tracking page imports this resolver directly.

**Why one resolver:** The current `resolveTimePreset` in `app/cost-tracking/explore/page.tsx:96–184` and `resolveDateRange` in `modules/cost-tracking/domain/dateRange.ts` are duplicate, divergent implementations of the same idea. Both are replaced by this single function.

**Output shape (conceptual, not a contract spec):** the resolved start date (UTC), end date (UTC, end-of-day-inclusive), the preset token, and a human-readable label. No other shape is needed by any consumer.

### 3.3 Component Architecture

The selector is a server component in the cost-tracking layout. It calls the resolver, renders the current selection label, and renders a minimum-surface client island for the dropdown.

- **`PeriodSelector`** — server component in `app/cost-tracking/_components/`. Reads searchParams (passed via the layout, see Section 3.4), calls the resolver, renders the current label, and embeds the client island. Pure JSX otherwise.
- **`PeriodSelectorMenu`** — client component in `app/cost-tracking/_containers/`. The dropdown control. Uses `useRouter` and `useSearchParams` to mutate the URL. Owns no data, only the open/closed state and the navigation handlers. Per `.claude/rules/server-first-react.md`, this is the only piece that must be `'use client'`.

The custom date inputs (when `period=custom`) live inside `PeriodSelectorMenu` because they need to coordinate two values and submit them together as a single navigation. The existing `DateRangeFilter` and `DateRangeFilterContainer` are deleted — their behaviour is fully absorbed.

### 3.4 Layout Integration and Navigation Stickiness

The selector renders inside `app/cost-tracking/layout.tsx`. Next.js layouts do not receive `searchParams` directly; the recommended pattern is to render the selector inside the layout's chrome, with the selector reading params via the client island's `useSearchParams` hook for the dropdown state and via the page-supplied label for the server-rendered label.

**Key decision:** Because `useSearchParams` is a client hook, the visible "current period" label must either (a) be rendered by the client island reading `useSearchParams`, or (b) be passed through the page tree to the selector. The simpler option is (a): the selector's label is rendered inside the client island. The dropdown chrome (icon, container) stays as a server component.

**Rationale for layout placement over per-page placement:** The cost-tracking layout already wraps every page (`NavigationContainer`). Placing the selector here makes period selection feel like part of the application chrome and removes the "page reload loses the filter" problem — searchParams persist across navigation by default in Next.js when a `<Link>` keeps them, but only if every page reads from a common contract. Placing the selector in the layout *and* settling on a single contract together produce stickiness.

**Stickiness mechanism:** Internal navigation links between cost-tracking pages must preserve `period`/`from`/`to` searchParams. The `NavigationContainer` already handles cost-tracking nav; it must be extended to forward the current selection. This is a one-time change to a small client component.

### 3.5 Use Case Signature Changes

Every use case that consumes time-bounded data must accept `startDate`/`endDate`. The table below enumerates the changes.

| Use case | Current input | New input | Change type |
|----------|--------------|-----------|-------------|
| `getUsageSummaryUseCase` | `{ startDate?, endDate? }` | unchanged | none |
| `getUnassignedSpendUseCase` | `{ startDate?, endDate? }` | unchanged | none — call sites must start passing the resolved range |
| `getAttributionSummaryUseCase` | `{ startDate?, endDate?, groupType? }` | unchanged | none — attributions page must stop passing `new Date(0)` |
| `getAttributionCoverageUseCase` | `{ startDate?, endDate? }` | unchanged | none — same as above |
| `detectSpendAnomaliesUseCase` | `{ windowDays? }` | `{ windowDays?, startDate?, endDate? }` | additive — see Section 3.6 |
| `getBudgetStatusUseCase` | `Record<string, never>` | `{ startDate?, endDate? }` | additive |
| `getSpendForecastUseCase` | `{ startDate?, endDate? }` | unchanged, **opt-out** | call sites do not pass the global period |
| `exploreCostDataUseCase` | already accepts dates | unchanged | call site changes only |

**No use case is renamed or has its return type changed.** All edits are input shape extensions or call-site corrections.

### 3.6 Anomalies Dual-Mode Semantics

`detectSpendAnomaliesUseCase` gains two fields without changing its core algorithm:

- `windowDays` (existing) — drives the *detection* statistics. Default 30. Continues to control how much history is fetched and how the trailing baseline is computed (`detectSpendAnomaliesUseCase.ts:89–138`).
- `startDate` / `endDate` (new) — drives the *displayed list*. After the use case computes its full anomaly set, it filters out anomalies whose `date` falls outside `[startDate, endDate]` before returning.

When both are present, `windowDays` controls math and the date range controls display. When only `windowDays` is present (e.g., a future caller that does not consume the global period), the use case behaves exactly as today.

**Rationale:** Detection math is statistically meaningful only with a fixed-length baseline. Display filtering is a presentation concern. Coupling them would make a "last 7 days" period yield zero anomalies because no baseline could be computed. Splitting them keeps the math sound and lets the UI honour the user's selection.

**Where the filtering happens:** Inside the use case, after step 5 (sort) and before the return on line 200. This keeps the page thin and prevents leakage of date-range logic into the presentation layer.

### 3.7 Page-by-Page Migration

| Page | Use cases that gain the period | Use cases that opt out (and why) |
|------|-------------------------------|----------------------------------|
| Dashboard (`cost-tracking/page.tsx`) | `getUsageSummary`, `getUnassignedSpend` (period-scoped figure), `detectSpendAnomalies` (display filter), `getBudgetStatus` | `getSpendForecast` (always current month), the MTD hero card (fixed calendar month), the all-time unattributed >5% banner (full history) |
| Alerts (`cost-tracking/alerts/page.tsx`) | `detectSpendAnomalies` (display filter), `getUsageSummary` | none |
| Explore (`cost-tracking/explore/page.tsx`) | `exploreCostData` (main and prior-period queries derive from the resolved range), `getUnassignedSpend` | none — explore is fully period-driven |
| Attributions (`cost-tracking/attributions/page.tsx`) | `getAttributionSummary`, `getAttributionCoverage` | none — replace `new Date(0)` with the resolved range |
| Budget (`cost-tracking/budget/page.tsx`) | `getBudgetStatus` (scopes returned budgets) | budgets whose own `periodType` is fixed (monthly/quarterly/annual) keep using their internal period; the global filter scopes which budgets are listed |
| Recommendations (`cost-tracking/recommendations/page.tsx`) | revisit during migration — only if recommendations carry a time dimension | n/a |
| Report (`cost-tracking/report/page.tsx`) | none — this is a monthly snapshot | entire page opts out by convention |

### 3.8 Opt-Out Mechanism

There is no flag, no metadata, and no marker. A page or widget opts out by *not consulting* `resolveSelectedPeriod`. This is editorial and intentional.

**Concrete examples of correct opt-out:**
- The MTD hero card on the dashboard hard-codes the start of the current calendar month (already does, line 34). Continue.
- `getSpendForecast` is called with `{}` from the dashboard. Continue.
- The unattributed-spend warning banner (the >5% alert) reads full-history attribution coverage. Continue.
- The Report page builds its own monthly window. Continue.

**Why this is acceptable:** A flag-based system invites mis-use ("opt me out for this one weird case"). Editorial opt-out forces the decision into code review where it belongs. Each opt-out is a one-line decision visible at the call site.

### 3.9 Edge Cases

| Case | Behaviour |
|------|-----------|
| `period` value not in the allowed set | Resolver returns the default (30d). No error. |
| `period=custom` with missing or invalid `from`/`to` | Resolver returns the default (30d). No error. |
| `from > to` | Resolver swaps them silently and returns the inverted range as-is. |
| `to` in the future | Clamp `to` to end-of-day today (UTC). Future dates are not meaningful for cost data. |
| Very long ranges (e.g., `ytd` with explore queries) | Explore already varies bucket granularity by range length (`explore/page.tsx:185`). The resolver returns raw dates; the use case decides bucketing. |
| Timezones / DST | All dates are UTC. End dates are end-of-day-inclusive (`23:59:59.999Z`). Matches `resolveDateRange()` (`dateRange.ts:25`). |
| Stale URLs using `window=` or `time=` | Ignored. No silent translation. The first navigation after deploy lands on the default (30d). |

## 4. Integration with Existing System

- **Replaces:** `DateRangeFilter` (`app/cost-tracking/_components/DateRangeFilter.tsx`) and `DateRangeFilterContainer` (`app/cost-tracking/_containers/DateRangeFilterContainer.tsx`) are deleted. The new selector subsumes them.
- **Replaces:** `resolveTimePreset` inside `app/cost-tracking/explore/page.tsx:96–184` is deleted. Its behaviour moves into the resolver.
- **Coexists with:** `resolveDateRange` in `modules/cost-tracking/domain/dateRange.ts` — this is a generic utility used inside use cases for default date handling. The new selector resolver is layered on top: pages call the new resolver to map searchParams to dates; use cases continue to use `resolveDateRange` for their internal defaults when no dates are supplied.
- **Architectural conformance:** Resolver in `modules/cost-tracking/domain/` (per `.claude/rules/domain-layer.md`). Use case input shapes change in `modules/cost-tracking/application/` (per `.claude/rules/application-layer.md`). Selector page integration happens via `app/cost-tracking/layout.tsx` and `_components/`/`_containers/` (per `.claude/rules/page-architecture.md` and `.claude/rules/server-first-react.md`). No barrels (per project structure rule).

## 5. Migration Plan (Order of Operations)

The order matters — the app must remain working at every step.

1. **Add the resolver** in `modules/cost-tracking/domain/selectedPeriod.ts`. No call sites yet. Pure addition.
2. **Extend use case inputs** for `detectSpendAnomalies` (add `startDate`/`endDate`, additive) and `getBudgetStatus` (replace `Record<string, never>` with `{ startDate?, endDate? }`). All existing call sites still compile because both are optional.
3. **Add the selector to the layout** (`app/cost-tracking/layout.tsx`). It writes the new `period`/`from`/`to` searchParams. No page consumes them yet, so behaviour is unchanged.
4. **Migrate the dashboard.** Replace `DateRangeFilterContainer` usage with the new selector reference (already in layout). Switch all five use case calls to consume the resolved range, except the documented opt-outs (MTD card, forecast, all-time unattributed banner).
5. **Migrate alerts.** Switch `window` → resolved period. `windowDays` becomes a separate UI control or is dropped; per Section 3.6 it remains an internal default for detection math when not supplied.
6. **Migrate explore.** Delete `resolveTimePreset`. Use the resolver. The `time` param is renamed to `period` everywhere; existing per-dimension filter params (`provider`, `model`, etc.) are untouched.
7. **Migrate attributions.** Replace both `new Date(0)` call sites with the resolved range.
8. **Migrate budget.** Pass the resolved range to `getBudgetStatus`. Scoping semantics (Section 3.7) are confirmed during this step.
9. **Delete `DateRangeFilter` and `DateRangeFilterContainer`.** They have no remaining call sites at this point.

Each step is independently shippable. Steps 4 through 8 can ship in any order after step 3.

## 6. Alternatives Considered

### 6.1 Keep three contracts, add cross-page propagation only

Rejected. Cross-page propagation requires a single contract — otherwise navigation must translate between contracts, which is the same complexity as unifying them, with worse ergonomics.

### 6.2 Persist selection in cookies/session

Rejected. Search-param-driven state is bookmarkable, shareable, and survives page reloads without server state. Cookies introduce hidden state and break "open in new tab" behaviour. URL state is also already the project's pattern (see explore page).

### 6.3 Add a generic period-scope flag to every use case (`{ ignoresPeriod: true }`)

Rejected per Section 3.8. Editorial opt-out keeps the architecture honest.

### 6.4 Server-only selector with no client island

Rejected. The dropdown menu (open/close, custom date inputs that submit together) genuinely needs client state. The minimum-surface principle (`server-first-react.md`) is satisfied by keeping the *island* small, not by eliminating it.

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Stale bookmarks and external links break | Acceptable per Section 2.3. Communicate in release notes. The default (30d) is a reasonable landing. |
| Anomaly display filter hides historically interesting anomalies under tight ranges | The displayed-anomalies page can show the resolved range in its empty state and link to a wider preset. |
| Budget page shows confusing scoping (a quarterly budget under a `7d` period) | Section 3.7 specifies that the global period scopes which budgets are *listed*, not how each budget computes its own internal period. The page header must communicate this clearly. |
| The selector in the layout requires `searchParams` access patterns that vary by Next.js version | The chosen pattern (server-rendered chrome + client island reading `useSearchParams`) works in all current Next.js App Router versions. |
| Dual-mode anomaly use case becomes harder to reason about | Section 3.6 documents the contract explicitly. Tesseract should cover both modes (see Section 9). |

## 8. Open Questions

1. **Should the layout-mounted selector appear on non-cost-tracking app routes?** Today only cost-tracking has time-bounded data. If future modules need the same selector, the resolver moves to a shared spot (e.g. `packages/shared/`). Out of scope for this RFC.
2. **Should `period=today` exist?** The existing explore page supports it (`explore/page.tsx:111`). The dashboard arguably does not need it because daily totals are already exposed via the MTD card. Recommendation: include it for parity with explore.
3. **Should `period` URL param value be human-readable or compact?** Recommendation: human-readable tokens (`30d`, `mtd`) — they are short and self-explanatory.
4. **Granularity coupling on the explore page** — explore today derives default granularity from the preset (`explore/page.tsx:113–183`). The new resolver does not return granularity. Recommendation: explore continues to derive granularity locally from the resolved range length; granularity is an explore-specific concern, not a global one.

## 9. Testing (for tesseract)

Behaviours that need scenario coverage:

- Resolver: each preset returns the expected UTC range; default is `30d`; invalid `period` falls back to default; `period=custom` with missing dates falls back to default; `to > today` is clamped.
- Selector navigation: changing the selector updates the URL contract correctly; navigating between cost-tracking pages preserves the selection.
- Anomalies dual-mode: detection math is unaffected by `startDate`/`endDate`; display filtering trims the returned list to the range; calling without a date range yields today's behaviour.
- Use case signature changes: `getBudgetStatus` accepts the new input; old call sites without dates still work.
- Page migration smoke tests: every cost-tracking page renders under the default period, a preset period, and a custom period.
- Opt-out widgets: MTD card, forecast, and all-time unattributed banner do not change when the global period changes.
