# RFC: The Observatory -- Cost Explorer

- **Feature ID:** 3
- **Module:** cost-tracking
- **Status:** Draft
- **Created:** 2026-03-27

---

## 1. Problem

The existing cost-tracking dashboard provides fixed, pre-aggregated views (by provider, by model, by credential, daily spend). Users cannot freely combine dimensions, apply arbitrary filters, or drill down across grouping axes. Any question that does not match the dashboard's rigid layout requires manual data export. The underlying data model already captures 10+ dimensions and 15+ metrics per usage record -- the exploration capability is what is missing.

## 2. Proposed Architecture

### 2.1 New Use Case: Explore Cost Data

A single new use case in the application layer that accepts a structured query (grouping dimension, filters, date range, pagination cursor) and returns aggregated results with time-series data. This replaces the pattern of multiple fixed-axis summary methods with a single, parameterized aggregation pipeline.

**Rationale:** The existing use case fetches all five summary dimensions in parallel and returns them as a bundle. The explorer needs a fundamentally different query shape -- one grouping dimension at a time, with arbitrary filter combinations and pagination. A new use case is cleaner than overloading the existing one.

### 2.2 New Repository Method: Parameterized Aggregation

The existing IUsageRecordRepository exposes fixed-axis methods (findSummaryByProvider, findSummaryByModel, etc.). The explorer requires a new generalized aggregation method that accepts:

- A grouping dimension (or none for flat aggregation)
- A set of dimension filters (any combination)
- A date range
- Pagination parameters (offset/limit)
- Sort direction

This method returns paginated, aggregated rows with total counts and a parallel time-series query. The attribution group dimension requires a JOIN path through the attribution rules table, making it architecturally distinct from the direct-column dimensions.

**Key decision:** One generalized method versus extending the existing per-dimension pattern. The generalized approach is chosen because 9 grouping dimensions with arbitrary filter combinations would require an impractical number of fixed methods.

**Trade-off:** Dynamic query construction is more complex to implement and review than static queries, but the combinatorial explosion of dimensions makes static methods untenable.

### 2.3 Domain Layer: Explorer Query and Result Types

New domain types for the explorer's query shape and result shape. The result type must be richer than the existing UsageSummaryRow because:

- It must carry the full set of metrics (not just tokens + cost) so the UI can adaptively display relevant columns
- It must include a service category distribution per row to enable context-adaptive metric selection
- It must include pagination metadata (total count, total cost across all pages)
- It must include time-series data points alongside the grouped results

### 2.4 Context-Adaptive Metric Selection

A pure domain function that, given the service categories present in a result set (or an active service category filter), returns the list of metrics relevant for display. This encodes the business rules from PRD R5:

- Text generation context: token breakdowns + request count + cost
- Embedding context: character count + request count + cost
- Image generation context: image count + request count + cost
- Audio context: duration + character count + request count + cost
- Mixed context: universal metrics (cost, request count) primary; category-specific metrics secondary

**Rationale:** This is pure business logic (which metrics are meaningful for which service categories) and belongs in the domain layer as a stateless function. The frontend consults this function's output to determine which columns to render.

### 2.5 Server Component Page with URL-Driven State

A new Next.js page at the explore route within the cost-tracking section. All explorer state (date range, grouping dimension, active filters, page number) lives in URL search params. The page is a Server Component that:

1. Parses search params into a typed query
2. Calls the explore use case
3. Passes results to presentational components

**Rationale:** Aligns with the project's server-first React architecture. URL state provides shareability, bookmarkability, and survives page reloads without client-side state management.

### 2.6 Client Components: Minimal Interactive Surface

Client components are needed only for user interactions that modify URL params:

- Grouping dimension selector (changes the groupBy param)
- Filter controls (add/remove dimension filters)
- Drill-down interaction (clicking a result row adds it as a filter)
- Pagination controls (changes the page param)
- Date range selector (reusable from existing dashboard, already a client component)

All data fetching and aggregation remains server-side. Client components only manipulate URL search params and trigger navigation.

### 2.7 Time-Series Data Strategy

The time-series is always present (the date range is always active). Two architectural options were considered:

- **Option A (chosen): Parallel query.** The use case issues two queries -- one for the grouped aggregation table and one for the time-series (daily buckets, broken down by grouping dimension if active). Both share the same filters and date range.
- **Option B (rejected): Single query with client-side pivot.** Fetch raw daily buckets and pivot client-side. Rejected because it violates the server-side aggregation principle and does not scale with data volume.

**Time granularity:** The use case selects bucket granularity based on date range length. This is an implementation-time decision but the architecture must support variable granularity in the result type.

## 3. Integration with Existing System

### 3.1 Dashboard Coexistence

The explorer lives at a sibling route to the existing dashboard. The dashboard gains a navigation link to the explorer. The explorer provides a back link to the dashboard. Neither replaces the other.

### 3.2 Reuse of Existing Infrastructure

- **Database schema:** No schema changes required. All dimension columns and metrics already exist in the usage records table with appropriate indexes.
- **Drizzle ORM:** The new repository method uses the same Drizzle query builder patterns and schema imports as existing repository implementations.
- **Attribution pipeline:** The attribution group dimension leverages the existing JOIN path (attribution groups to attribution rules to usage records) already implemented in DrizzleAttributionRepository.
- **Date range filter:** The existing DateRangeFilter client component can be reused directly in the explorer, as it already manages from/to URL params.
- **Zombie shield:** The new aggregation query must apply the same soft-delete filtering (deletedAt IS NULL) enforced across all existing read operations.

### 3.3 Domain Type Exports

New explorer-specific types must be added to the module's public type surface so the app layer can import them. Follows the existing pattern of exporting through the domain types file.

## 4. UI Component Analysis

**No shared component library exists in this project.** Components are built as feature-specific presentational components within each route's _components directory. The explorer follows this same pattern.

### Existing Components Available for Reuse

| Component | Current Location | Usage in Explorer |
|-----------|-----------------|-------------------|
| DateRangeFilter | cost-tracking/_components | Date range selection (direct reuse, already URL-param driven) |
| ProviderCards (pattern) | cost-tracking/_components | The summary headline (R8) follows the same card pattern for total cost display |

### New Components Required

| Component | Type | Rationale |
|-----------|------|-----------|
| Summary headline | Presentational | Displays total cost, total requests, and currency for the active query. Similar pattern to existing ProviderCards total block but with different data shape (no per-provider breakdown, just aggregate totals). |
| Grouping dimension selector | Client (URL interaction) | No existing component handles dimension selection. Needs to render available grouping options and update URL params on selection. |
| Active filter bar | Client (URL interaction) | No existing component manages multi-dimensional filter state in URL. Must display active filters as removable chips and support adding new filters. |
| Result table | Presentational | The existing UsageSummaryTable has a fixed column set. The explorer table must render adaptive columns based on the context-adaptive metric selection. Fundamentally different rendering logic. |
| Time-series chart | Presentational | No chart component exists in the project. Requires a charting approach for spend-over-time visualization. |
| Pagination controls | Client (URL interaction) | No existing pagination component. Needs to display page state and update URL params. |
| Empty state | Presentational | Specific messaging for "no data matches your filters" with suggested actions. |

### Charting Library Decision

The time-series visualization (R4) requires a charting library. This is a new dependency for the project.

- **Recommended: Recharts** -- React-native, composable, well-maintained, server-component-compatible via client wrapper. Lightweight for the line/area chart use case needed here.
- **Alternative considered: Chart.js via react-chartjs-2** -- Heavier, canvas-based, more configuration overhead for a single chart type.
- **Alternative considered: D3 directly** -- Maximum flexibility but excessive complexity for a standard time-series line chart.

## 5. Key Architectural Decisions

### 5.1 Single Generalized Query vs. Per-Dimension Methods

**Decision:** Single generalized aggregation method with dynamic query construction.

**Why:** 9 grouping dimensions with 9 filterable dimensions and pagination creates a combinatorial space that cannot be served by fixed methods. The existing per-dimension pattern (findSummaryByProvider, findSummaryByModel, etc.) was appropriate for the fixed dashboard but does not extend to free-form exploration.

### 5.2 Attribution Group as a Special Dimension

**Decision:** Treat attribution group as a distinct query path within the generalized method.

**Why:** All other dimensions are direct columns on the usage records table. Attribution groups require a JOIN through attribution rules with dimension-specific match logic. The generalized method must branch internally for this dimension while presenting a uniform interface to the use case.

### 5.3 Server-Side Metric Presence Detection

**Decision:** The aggregation query returns which service categories are present in the result set. The domain-layer metric selection function uses this to determine displayable metrics. This happens server-side before rendering.

**Why:** The UI must know which columns to render before streaming the page. Client-side metric detection would require loading all data first, which contradicts the server-first architecture.

### 5.4 Pagination at the Database Level

**Decision:** OFFSET/LIMIT pagination with a total count query.

**Why:** The explorer's sort order (cost descending) is stable within a single page load. Cursor-based pagination would add complexity without benefit since the data does not change between page navigations in a server-rendered context. The total count is needed for the summary headline (R8) showing aggregate totals across all pages.

**Trade-off:** OFFSET pagination degrades for very deep pages, but the expected data cardinality (hundreds of distinct groups at most) makes this acceptable for MVP.

## 6. Alternatives Considered

### 6.1 Extend Existing Use Case and Repository

Add optional groupBy and filter parameters to the existing getUsageSummaryUseCase and repository methods. Rejected because the return type, query structure, and pagination requirements are fundamentally different from the dashboard's "fetch everything at once" pattern. Mixing both patterns would make the existing code harder to maintain.

### 6.2 Client-Side Aggregation with Full Data Fetch

Fetch all usage records for a date range to the client and aggregate in JavaScript. Rejected because it violates the server-side aggregation principle, does not scale beyond a few thousand records, and contradicts the project's server-first architecture.

### 6.3 Materialized Views for Common Aggregations

Pre-compute common grouping/filter combinations as materialized views. Deferred -- the combinatorial space is too large for pre-computation, and the expected data volume does not yet justify this optimization. Can be revisited post-MVP if query performance becomes an issue.

## 7. Dependencies

- **Charting library:** A new dependency is needed for time-series visualization. Recharts is recommended (see Section 4).
- **Existing attribution pipeline:** The attribution group dimension depends on attribution rules being configured. The explorer handles empty attribution gracefully via the empty state.
- **Existing database indexes:** The usage records table already has indexes on dimension columns and time ranges. No new indexes are anticipated for MVP, but query plan analysis during implementation may reveal needs.

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Dynamic query construction introduces SQL injection or incorrect aggregation | The Drizzle ORM query builder provides parameterized queries by construction. All dimension values are passed as parameters, never interpolated. |
| Attribution group JOIN path performs poorly under complex rule sets | The existing DrizzleAttributionRepository already implements this JOIN pattern. Monitor query plans during implementation. Pagination limits result set size. |
| Context-adaptive metrics confuse users when viewing mixed-category data | When no service category filter is active, show only universal metrics (cost, requests). Category-specific metrics appear only when a category filter narrows the view. |
| URL param space becomes unwieldy with many active filters | Define a compact URL encoding scheme for filters. Consider a maximum active filter count for MVP. |

## 9. Open Questions

1. **Time-series metric axis:** Should the time-series always show cost, or should it support switching to other metrics (e.g., request count over time)? Recommendation: cost-only for MVP, defer metric switching.
2. **Attribution group hierarchy:** When grouping by attribution group, should child groups roll up into parent groups? Recommendation: align with whatever the attribution pipeline currently supports (flat, no rollup for MVP).
3. **Filter value population:** How should the filter UI populate available values for each dimension? Options: (a) separate lightweight query per dimension, (b) derive from current result set. Recommendation: separate query for accuracy -- the result set only shows post-filter values.
4. **Chart library bundle size:** Recharts adds approximately 200KB to the client bundle. Is this acceptable, or should a lighter alternative be explored?
