## Implementation Summary
- **Scope:** Refactored 9 `_components/` files that violated the architecture by containing `'use client'`, `useState`, `useRouter`, `useSearchParams`, and `useCallback`. Each was decomposed into a pure presentational component (in `_components/`) and a client container (in `_containers/`). All parent consumers updated to import from the containers.
- **Nexus Integration:** No Nexus data logic was altered. `page.tsx` files for both `/cost-tracking` and `/cost-tracking/explore` preserve all `await` calls, session checks, and data-fetching logic identically.

## Design Spec Status
- **Spec Found:** No
- **Spec Path:** N/A
- **Adherence:** N/A — refactor task with no visual changes.

## Missing Dependencies
None.

## Decomposition Decisions

### SyncButton
- **Container:** `app/cost-tracking/_containers/SyncButtonContainer.tsx` — owns `useState` (loading, result, error) and the `fetch` call.
- **Component:** `app/cost-tracking/_components/SyncButton.tsx` — receives `loading`, `result`, `error`, `onSync` as props.

### DateRangeFilter
- **Container:** `app/cost-tracking/_containers/DateRangeFilterContainer.tsx` — owns `useRouter`, `useSearchParams`, preset constants, date helpers, and the three `useCallback` handlers.
- **Component:** `app/cost-tracking/_components/DateRangeFilter.tsx` — receives `presets`, `activePresetDays`, `currentFrom`, `currentTo`, `todayStr`, and three callback props.

### GroupBySelector
- **Container:** `app/cost-tracking/explore/_containers/GroupBySelectorContainer.tsx` — owns `useRouter`, `useSearchParams`, `handleSelect`, `handleNone`.
- **Component:** `app/cost-tracking/explore/_components/GroupBySelector.tsx` — receives `current`, `onSelect`, `onNone`.

### FilterBar
- **Container:** `app/cost-tracking/explore/_containers/FilterBarContainer.tsx` — owns all hooks including ephemeral dropdown state (`useState`) and the async `getFilterValuesAction` call.
- **Component:** `app/cost-tracking/explore/_components/FilterBar.tsx` — receives fully resolved props: `filters`, `availableDimensions`, `dropdownState`, `selectedDimension`, `availableValues`, `loadingValues`, `valuesError`, and all event callbacks.

### ColumnControl
- **Container:** `app/cost-tracking/explore/_containers/ColumnControlContainer.tsx` — owns `useRouter`, `useSearchParams`, `pushVisibility`, `handlePresetClick`, `handleMetricToggle`, `computeVisibleKeys`.
- **Component:** `app/cost-tracking/explore/_components/ColumnControl.tsx` — receives `allMetrics`, `visibility`, `visibleKeys`, `onPresetClick`, `onMetricToggle`.

### DrillDownRow
- **No container needed for DrillDownRow itself.** The navigation callback is now owned by `ExplorerTableContainer` and threaded down via `onDrillDown` prop to `ExplorerTable`, which forwards it per-row. `DrillDownRow` receives `isClickable` + `onClick` props only.
- **Component:** `app/cost-tracking/explore/_components/DrillDownRow.tsx` — pure `<tr>` wrapper, no hooks.

### ExplorerTable
- **Container:** `app/cost-tracking/explore/_containers/ExplorerTableContainer.tsx` — owns `useRouter`, `useSearchParams`, `handleDrillDown` callback, passes it into `ExplorerTable` as `onDrillDown`.
- **Component:** `app/cost-tracking/explore/_components/ExplorerTable.tsx` — removed `'use client'`. Added `onDrillDown` prop. Pure server-renderable.

### Pagination
- **Container:** `app/cost-tracking/explore/_containers/PaginationContainer.tsx` — owns `useRouter`, `useSearchParams`, `goToPage`.
- **Component:** `app/cost-tracking/explore/_components/Pagination.tsx` — receives `onGoToPage` callback, no hooks.

### SpendChart
- **Container:** `app/cost-tracking/explore/_containers/SpendChartContainer.tsx` — owns `'use client'` (required by recharts), all chart helpers (`buildChartData`, formatters), and renders into `SpendChartShell`.
- **Component:** `app/cost-tracking/explore/_components/SpendChart.tsx` — renamed export to `SpendChartShell`. Owns only the border/label chrome and the empty-state fallback. No hooks, no library imports.

## Compliance Audit
- [x] **State Separation:** No hooks in `_components/` — confirmed via grep (CLEAN).
- [x] **Design System:** No hardcoded values introduced in the 9 refactored files — confirmed via grep (CLEAN). Pre-existing violations in `DailySpendTable.tsx` are out of scope.
- [x] **Reuse:** No new UI primitives created; all existing presentational structure preserved.
- [x] **Taxonomy:** All containers in `_containers/`, all presentational components in `_components/`.

## Design System Updates
- **New Tokens:** None. Replaced two instances of hardcoded `bg-white text-black` active-pill styles in the new presentational components with `bg-foreground text-background` for semantic correctness.
- **Components Created:** (presentational, modified in-place from violations)
  - `app/cost-tracking/_components/SyncButton.tsx`
  - `app/cost-tracking/_components/DateRangeFilter.tsx`
  - `app/cost-tracking/explore/_components/GroupBySelector.tsx`
  - `app/cost-tracking/explore/_components/ColumnControl.tsx`
  - `app/cost-tracking/explore/_components/DrillDownRow.tsx`
  - `app/cost-tracking/explore/_components/Pagination.tsx`
  - `app/cost-tracking/explore/_components/FilterBar.tsx`
  - `app/cost-tracking/explore/_components/ExplorerTable.tsx`
  - `app/cost-tracking/explore/_components/SpendChart.tsx` (export renamed to `SpendChartShell`)
- **Containers Created:**
  - `app/cost-tracking/_containers/SyncButtonContainer.tsx`
  - `app/cost-tracking/_containers/DateRangeFilterContainer.tsx`
  - `app/cost-tracking/explore/_containers/FilterBarContainer.tsx`
  - `app/cost-tracking/explore/_containers/GroupBySelectorContainer.tsx`
  - `app/cost-tracking/explore/_containers/ColumnControlContainer.tsx`
  - `app/cost-tracking/explore/_containers/PaginationContainer.tsx`
  - `app/cost-tracking/explore/_containers/ExplorerTableContainer.tsx`
  - `app/cost-tracking/explore/_containers/SpendChartContainer.tsx`
