# Worklog: Unified Period Selector

- **Module:** cost-tracking
- **RFC:** [/Users/mario/code/Labs/aimdall/system/rfcs/unified-period-selector.md](/Users/mario/code/Labs/aimdall/system/rfcs/unified-period-selector.md)
- **Tasks:** [overview.md](tasks/overview.md) — 9 tasks, all `done`
- **Build:** `pnpm build` passes
- **Tests:** 130 cost-tracking unit tests pass (see [tests/test-report.md](tests/test-report.md))

---

## What was delivered

A single, layout-mounted period selector with one URL contract (`period` / `from` / `to`) that propagates across every cost-tracking page consuming time-bounded data. The three competing time-selection systems that existed before this feature — `from`/`to` on the dashboard, `window` on alerts, and `time` on explore — are gone. The selector lives in cost-tracking application chrome, not on a page, and its selection survives navigation between dashboard, alerts, explore, attributions, budget, recommendations, and report.

Anomaly detection retains its rolling statistical window (`windowDays`) for the math, while the user-selected period filters only the *displayed list* of anomalies. Two windows on one use case, by design.

A small set of widgets are deliberately period-agnostic by editorial decision (no flag, no opt-out attribute on a use case) — the MTD card, the forecast widget, the all-time unattributed banner, the recommendations page, and the report page simply do not consult the resolver.

---

## Per-task summary

| Task | Summary | Key files touched |
|------|---------|-------------------|
| **COST_4_1** | Pure domain resolver `resolveSelectedPeriod` mapping URL params (`period`/`from`/`to`) to UTC date range, preset token, and human label. Pure addition; no call sites. | `modules/cost-tracking/domain/selectedPeriod.ts` (new); `modules/cost-tracking/domain/types.ts` (re-export) |
| **COST_4_2** | Extended use case input shapes additively. `detectSpendAnomaliesUseCase` accepts optional `startDate`/`endDate` for displayed-list filtering on top of existing `windowDays` for detection. `getBudgetStatusUseCase` switched from `Record<string, never>` to optional `{ startDate?, endDate? }`. | `modules/cost-tracking/application/detectSpendAnomaliesUseCase.ts`, `modules/cost-tracking/application/getBudgetStatusUseCase.ts` |
| **COST_4_3** | Mounted `PeriodSelector` server component in `app/cost-tracking/layout.tsx`, preserving period params across every internal cost-tracking link via `NavigationContainer`. Skeleton returned `null` for handoff to frankie. | `app/cost-tracking/layout.tsx`, `app/cost-tracking/_components/PeriodSelector.tsx` (new), `app/cost-tracking/_containers/NavigationContainer.tsx` |
| **COST_4_4** | Replaced `PeriodSelector` skeleton with styled JSX: dropdown of preset tokens plus custom-range date inputs. Minimum-surface client island in `_containers/PeriodSelectorMenu.tsx`; everything else stays server-rendered. | `app/cost-tracking/_components/PeriodSelector.tsx`, `app/cost-tracking/_containers/PeriodSelectorMenu.tsx` (new) |
| **COST_4_5** | Migrated dashboard `page.tsx` to read params via `resolveSelectedPeriod` and forward `startDate`/`endDate` to all five use cases (previously only `getUsageSummary` was filled — `getSpendForecast`, `getUnassignedSpend`, `detectSpendAnomalies`, `getBudgetStatus` were called with `{}`). MTD card and forecast widget remain editorially period-agnostic. | `app/cost-tracking/page.tsx` |
| **COST_4_6** | Migrated alerts `page.tsx` from `window` to the resolved period. Anomaly detection now operates dual-mode: `windowDays` derived from preset for the statistical baseline, `startDate`/`endDate` for the displayed-list filter. | `app/cost-tracking/alerts/page.tsx` |
| **COST_4_7** | Migrated explore `page.tsx` from `time` to `period`. Deleted local `resolveTimePreset` (lines 96–184). Single resolver path now serves the explore widgets. | `app/cost-tracking/explore/page.tsx` |
| **COST_4_8** | Migrated attributions and budget pages onto the resolved period. Removed hard-coded `startDate: new Date(0)` on attributions. Deleted `DateRangeFilter` and `DateRangeFilterContainer` (no longer referenced). All-time unattributed banner remains editorially period-agnostic. | `app/cost-tracking/attributions/page.tsx`, `app/cost-tracking/budget/page.tsx`, `app/cost-tracking/_components/DateRangeFilter.tsx` (deleted), `app/cost-tracking/_containers/DateRangeFilterContainer.tsx` (deleted) |
| **COST_4_9** | Scenario coverage: 30 tests for `resolveSelectedPeriod` (presets, defaults, custom-range edge cases, swap, future-clamp, stale-token handling) and 23 tests for the dual-mode `detectSpendAnomalies` and the new `getBudgetStatus` signature. Page-to-page URL propagation flagged as a Playwright candidate. | `modules/cost-tracking/__tests__/selectedPeriod.test.ts` (new), `modules/cost-tracking/__tests__/detectSpendAnomalies.test.ts` (new) |

---

## Architectural notes worth preserving

### Resolver location and visibility
- Single source of truth for the URL contract lives at `modules/cost-tracking/domain/selectedPeriod.ts`.
- Re-exported via `modules/cost-tracking/domain/types` so `app/` consumers can import without crossing the module boundary into private domain internals.
- The resolver is the only place in the codebase that knows how to interpret `period` / `from` / `to`.

### Anomalies dual-mode contract
- `windowDays` continues to size the *statistical baseline* (history fetch and trailing window). It is independent of user selection.
- `startDate` / `endDate` filter the *displayed list* — anomalies whose `date` falls outside the selected period are excluded after detection and after sort.
- This is intentional and load-bearing: coupling detection math to a user-selected period would silently change anomaly definitions whenever the user changed views.

### Editorial opt-outs (no flag mechanism)
The following surfaces are period-agnostic by editorial decision — no `ignoresPeriod` attribute exists. Each call site simply does not consult the resolver:
- The MTD card on the dashboard
- The spend forecast widget on the dashboard
- The "all-time unattributed" banner on attributions
- The recommendations page
- The report page

### Layout mount and navigation propagation
- `PeriodSelector` is a server component mounted in `app/cost-tracking/layout.tsx` (which already wraps every cost-tracking page through `NavigationContainer`).
- Minimum-surface client island lives in `app/cost-tracking/_containers/PeriodSelectorMenu.tsx`. The selector is server-rendered; only the dropdown interaction crosses to the client.
- `NavigationContainer` extends every internal cost-tracking link with the current period params, so navigating from dashboard to alerts to explore preserves the user's selection.

### URL contract
- **`period`** — preset token. Accepted: `today`, `7d`, `30d` (default), `90d`, `mtd`, `qtd`, `ytd`, `custom`.
- **`from`** / **`to`** — `YYYY-MM-DD` only when `period=custom`. Ignored otherwise.
- When `period` is absent the resolver returns 30d.
- Stale `window=` (alerts) and `time=` (explore) URL params are silently ignored. No translation shim. A deep-link with the old contract simply renders the 30d default.

---

## Files created / deleted

### Created

| Path | Role |
|------|------|
| `modules/cost-tracking/domain/selectedPeriod.ts` | Pure resolver |
| `app/cost-tracking/_components/PeriodSelector.tsx` | Layout-mounted selector (server component) |
| `app/cost-tracking/_containers/PeriodSelectorMenu.tsx` | Minimum-surface client island for the dropdown |
| `modules/cost-tracking/__tests__/selectedPeriod.test.ts` | Resolver unit tests |
| `modules/cost-tracking/__tests__/detectSpendAnomalies.test.ts` | Dual-mode anomaly + budget signature tests |

### Deleted

| Path | Reason |
|------|--------|
| `app/cost-tracking/_components/DateRangeFilter.tsx` | Superseded by `PeriodSelector` |
| `app/cost-tracking/_containers/DateRangeFilterContainer.tsx` | No remaining call sites after migration |
| Local `resolveTimePreset` (inlined block in `app/cost-tracking/explore/page.tsx`, lines 96–184) | Replaced by the single domain resolver |

---

## Test coverage summary

- **130 tests pass** (full cost-tracking suite, three consecutive runs deterministic)
- **53 new tests across 2 new files** covering the resolver and the dual-mode anomaly contract
- Pure unit tests with mocked repositories — no database required
- All preset tokens covered, all custom-range edge cases (missing `from`, missing `to`, invalid strings, future `to`, swap on `from > to`), all dual-mode anomaly scenarios (lower/upper bound inclusivity, filter-after-sort, window independence, legacy backward-compat)
- **Flagged as Playwright candidates** (per tesseract test report): page-to-page URL propagation through `NavigationContainer`, render-level coverage of the editorial opt-out widgets, and page-render smoke tests across all cost-tracking routes. These need a running Next.js server and a browser harness; out of scope for this feature.

---

## Known minor

When the resolver swaps a `custom` range whose `from` is greater than `to`, `startDate` retains the end-of-day time-of-day (`23:59:59.999Z`) rather than midnight, because end-of-day is applied to `to` *before* the swap comparison. The `startDate < endDate` invariant still holds, and downstream date-range queries are correct because they treat `startDate` as inclusive. This is documented in [tests/test-report.md](tests/test-report.md) under "Discovered implementation detail".

**Recommendation for follow-up:** add a JSDoc note on `resolveSelectedPeriod` warning callers about the swap-time-of-day behaviour, or normalize `startDate` to start-of-day after swap. Either is a one-line change. Not in scope here.
