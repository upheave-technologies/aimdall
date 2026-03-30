# PRD: The Observatory -- Cost Explorer

- **Feature ID:** 3
- **Module:** cost-tracking
- **Status:** Draft
- **Created:** 2026-03-27

---

## Problem Statement

The existing cost-tracking dashboard provides a fixed, pre-aggregated view of LLM spend: summary cards by provider, a daily spend table, a model breakdown, and a credential breakdown. These views are helpful for a quick glance but fail users the moment they need to answer a specific question. "How much did our batch-tier Claude usage cost last week?" requires mentally cross-referencing multiple tables. "What's the cost trend for embeddings across all providers?" is simply unanswerable.

Every cost question that doesn't match the dashboard's fixed layout forces the administrator to export data and pivot in a spreadsheet -- or give up. As the number of providers, models, credentials, segments, and attribution groups grows, the combinatorial space of useful questions expands far beyond what any set of static tables can cover.

The system already captures rich, multi-dimensional usage data (10+ dimensions, 15+ metrics) but exposes only a tiny fraction of it through rigid, pre-baked aggregations. The data is there. The ability to explore it freely is not.

## Business Goals

1. **Unrestricted exploration.** Any combination of dimensions, filters, and time ranges must be queryable without engineering work. The administrator should never need a spreadsheet to answer a cost question.
2. **Anticipatory intelligence.** The explorer should surface the most relevant metrics, breakdowns, and context automatically based on what the user is looking at -- reducing cognitive load and time to insight.
3. **Scalable interaction model.** The interface must remain performant and usable as data volume grows into tens of thousands (or more) of usage records per month, with pagination as the primary scaling mechanism.
4. **Complement, don't replace.** The existing dashboard remains the quick-glance overview. The explorer lives alongside it as the deep-dive tool for when the dashboard raises a question it can't answer.

## User Personas

**Cost Administrator** -- The person responsible for understanding, controlling, and reporting on LLM spend. They are a single user in a single-tenant internal tool. They need to answer ad-hoc cost questions, identify spending anomalies, compare costs across providers/models/teams, and produce breakdowns for internal reporting. They are technically literate but should never need to write queries.

## User Journeys

### Journey 1: Ad-hoc cost investigation

The administrator notices an unexpectedly high total on the main dashboard and wants to understand where the spike came from.

1. They navigate to the explorer from the main dashboard
2. They see total spend for the default date range (last 30 days) with a time-series showing daily spend trends
3. They narrow the date range to the week of the spike
4. They group by provider to see which provider drove the increase
5. They see that one provider accounts for most of the spike
6. They apply that provider as a filter and re-group by model
7. They see that a specific model's cost jumped
8. They apply the model as a filter and re-group by credential to identify which key was responsible
9. They have their answer -- a specific API key drove the spike through a single model during a narrow time window

### Journey 2: Cross-dimensional comparison

The administrator wants to compare embedding costs across all providers for the current month.

1. They navigate to the explorer
2. They filter by service category = "embedding"
3. They group by provider
4. The system recognizes this is an embedding context and shows character counts alongside cost (not token breakdowns, which are irrelevant for some embedding providers)
5. They see a clear comparison of embedding spend by provider with a time-series showing the trend
6. They then switch grouping to model to see which specific embedding models are most expensive

### Journey 3: Attribution group cost analysis

The administrator wants to see how much each team spent last quarter.

1. They set the date range to last quarter
2. They group by attribution group
3. They see total spend per team/project/department with request counts
4. They filter to a specific team and re-group by model to understand what that team is using
5. They switch to group by service category to understand the team's usage pattern (mostly text generation? heavy on embeddings? doing image work?)

### Journey 4: Service tier cost optimization

The administrator wants to understand the cost difference between on-demand and batch tier usage to evaluate whether to push more workloads to batch.

1. They group by service tier
2. They see the cost split between on_demand, batch, and other tiers
3. They filter to batch tier and group by model to see which models are used in batch
4. They compare this with on_demand filtered by the same models to quantify potential savings

### Journey 5: Time-series trend analysis

The administrator wants to understand spending trends over the last 90 days.

1. They set a 90-day date range
2. With just the date range active (no grouping), they see overall spend over time
3. They group by provider -- the time-series now shows per-provider trends over the 90 days
4. They visually identify a provider whose spend is growing and drill into it

## Functional Requirements

### R1: Unrestricted Dimension Grouping

The explorer must allow the user to group usage data by any single dimension at a time. There are no fixed drill-down hierarchies. The user chooses the grouping axis, sees the results, and can change it at any time.

Available grouping dimensions:
- Provider
- Model (slug)
- Credential (API key)
- Segment (workspace/project)
- Service category (text_generation, embedding, image_generation, etc.)
- Service tier (on_demand, batch, priority, flex, provisioned)
- Context tier (standard, extended)
- Region
- Attribution group (teams, departments, projects, cost centers, users)

When no grouping is selected, the explorer shows a single aggregate total for the active date range and filters.

Each grouped result row must display human-readable labels (provider display name, credential label with key hint, segment display name, attribution group name) rather than raw IDs.

### R2: Unrestricted Dimension Filtering

The explorer must allow the user to apply filters on any dimension, independently of the current grouping. Multiple filters can be active simultaneously (AND logic). Filters narrow the dataset before grouping and aggregation occur.

Filterable dimensions are the same as the grouping dimensions listed in R1.

Filter values must be selectable from the actual data (the system must present available values -- not require users to type raw IDs). The filter UI must show human-readable labels.

Filters and grouping are orthogonal: the user can filter by provider = "Anthropic" and group by model, or filter by service category = "text_generation" and group by credential, or any other combination.

### R3: Date Range Selection

The explorer must support date range selection with sensible defaults.

- Default range: last 30 days
- The user can adjust start and end dates
- When a date range is active, the time dimension is always present -- meaning time-series data is always available for the selected period

The date range acts as a universal filter applied before all other operations.

### R4: Time-Series Visualization

When a date range is active (which is always), the explorer must show a time-series representation of spend over the selected period.

- When no grouping is active: a single aggregate time-series of total spend
- When a grouping is active: the time-series breaks down by the grouped dimension (e.g., per-provider spend lines over time)
- The time granularity should adapt sensibly to the selected range (daily granularity for ranges under ~90 days, coarser for longer ranges -- exact thresholds are an implementation decision)

The time-series provides trend context for every view the user creates, making the explorer substantially more valuable than a static table.

### R5: Context-Adaptive Metrics

The explorer must intelligently select which metrics to display based on the data currently in view. This is one of the defining characteristics of the explorer -- it anticipates what the user cares about.

The principle: show what is relevant, hide what is not.

- **When the view contains text_generation data**: Show input tokens, output tokens, cached input tokens, thinking tokens, request count, and cost. These are the metrics that matter for language model usage.
- **When the view contains embedding data**: Show character count (if present), request count, and cost. Token breakdowns may or may not be relevant depending on the provider.
- **When the view contains image_generation data**: Show image count, request count, and cost. Token counts are meaningless here.
- **When the view contains audio_speech or audio_transcription data**: Show duration, character count (for speech), request count, and cost.
- **When the view contains mixed service categories**: Show the union of relevant metrics, with clear indication of what applies where. Cost and request count are always shown as universal metrics.
- **When a specific service category filter is active**: This is the strongest signal. Show only the metrics relevant to that category.
- **When grouping by service category**: Each row shows the metrics appropriate to its own category.

The metric selection must be automatic -- the user never manually chooses which metrics to display. The system reads the data and decides.

### R6: Paginated Result Sets

The explorer must paginate grouped results to remain performant at scale.

- Results are sorted by total cost descending (highest cost first) by default
- The user can navigate through pages of results
- Total count of results and aggregate totals across all pages must be visible (the user needs to know the full picture even when viewing one page)
- Page size should be practical (exact size is an implementation decision)

### R7: Drill-Down Through Filtering

The explorer supports drill-down by converting a grouped result into a filter. This is the "click to explore deeper" interaction.

- The user sees grouped results (e.g., grouped by provider)
- They click/select a specific row (e.g., "Anthropic")
- That row's value becomes an active filter (provider = "Anthropic")
- The grouping resets or the user selects a new grouping dimension
- The user is now exploring within Anthropic's data and can group by model, credential, etc.

This is not a rigid hierarchy. The user can remove any filter at any time, change groupings freely, and navigate in any direction. The drill-down is simply a convenience for "I want to look inside this."

### R8: Summary Headline

At the top of the explorer, regardless of current grouping or filters, the user must always see a summary headline showing:

- Total cost for the active date range and filters
- Total request count
- Currency

This provides constant orientation -- the user always knows the magnitude of what they're looking at.

### R9: Empty and Zero States

When the explorer returns no data for the active combination of date range, filters, and grouping:

- Show a clear, non-alarming empty state that communicates "no usage data matches your current selection"
- Suggest actionable next steps (broaden the date range, remove a filter)

When grouped results contain rows with zero cost, show them -- they indicate activity without cost (e.g., cached responses) and are meaningful to the user.

### R10: Navigation and Integration

The explorer lives at a dedicated route alongside the existing cost-tracking dashboard. It does not replace the dashboard.

- The dashboard should link to the explorer for deeper investigation
- The explorer should provide a way to return to the dashboard
- URL state: the explorer's current state (date range, filters, grouping) should be reflected in the URL so that views are shareable and bookmarkable

## Non-Functional Requirements

- **Performance:** The aggregation queries must support pagination and return results within a reasonable time for the expected data scale (thousands to tens of thousands of records per month). The system should not attempt to load all data at once.
- **URL persistence:** The current explorer state (date range, active filters, selected grouping, current page) must survive page reloads via URL parameters. Users must be able to share or bookmark specific views.
- **Responsiveness:** The explorer must be usable on standard desktop screen sizes. Mobile optimization is not required.

## MVP Scope

The MVP delivers the full exploration experience described above. The core value -- unrestricted, intelligent exploration of cost data -- requires all pieces to work together.

**In scope for MVP:**
- Unrestricted dimension grouping (R1)
- Unrestricted dimension filtering (R2)
- Date range selection (R3)
- Time-series visualization (R4)
- Context-adaptive metrics (R5)
- Paginated result sets (R6)
- Drill-down through filtering (R7)
- Summary headline (R8)
- Empty and zero states (R9)
- Navigation and URL state (R10)

**Deferred to post-MVP:**
- Export to CSV/spreadsheet
- Saved/bookmarked views (persisted server-side, beyond URL sharing)
- Comparison mode (side-by-side comparison of two different filter sets)
- Anomaly detection and automatic alerting
- Multi-dimension grouping (group by provider AND model simultaneously)
- Custom metric formulas (e.g., cost per 1K tokens as a computed metric)

## Success Metrics

1. **Zero unanswerable questions.** Any cost question that can be answered from the existing usage data can be answered through the explorer without leaving the application.
2. **Time to insight.** An administrator should be able to go from "I wonder how much X costs" to having the answer in under 30 seconds and no more than 3-4 interactions (filter, group, drill-down).
3. **Metric relevance.** When viewing a specific service category, the user should never see irrelevant metrics cluttering the display (e.g., no token columns when looking at image generation data).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Aggregation queries become slow as data volume grows beyond tens of thousands of records | Explorer feels sluggish, users lose trust | Pagination limits result set size per query. The existing database indexes on dimension columns and time ranges provide a foundation. Further optimization can be addressed post-MVP if needed. |
| The adaptive metric logic produces confusing results for mixed-category views | Users see irrelevant columns or missing data | When data spans multiple service categories without a category filter active, show universal metrics (cost, request count) prominently and service-specific metrics as secondary. When a category filter is active, the signal is unambiguous. |
| Too many dimension/filter combinations create an overwhelming interface | Users feel lost in the explorer | The summary headline (R8) provides constant orientation. The drill-down model (R7) offers a natural exploration path. Default state (no filters, no grouping, last 30 days) is always one click away to reset. |
| Attribution group data depends on the attribution pipeline being fully operational | Explorer shows incomplete attribution data if pipeline is not set up | The attribution group dimension is simply empty when no groups/rules exist. The explorer handles this gracefully via the empty state (R9). This dimension becomes useful organically as the administrator configures attribution. |

## Implementation Tasks

Tasks are defined in `system/context/cost-tracking/features/cost-explorer/tasks/`.

| Requirement | Task(s) | Description |
|-------------|---------|-------------|
| R1: Unrestricted Dimension Grouping | COST_3_1, COST_3_2, COST_3_6 | Domain types define 9 dimensions; repository implements dynamic grouping; UI provides dimension selector |
| R2: Unrestricted Dimension Filtering | COST_3_1, COST_3_2, COST_3_5, COST_3_6 | Domain types define filter shape; repository applies filters; server action populates filter values; UI provides filter controls |
| R3: Date Range Selection | COST_3_3, COST_3_4, COST_3_6 | Use case defaults to 30 days; page parses URL date params; UI reuses existing DateRangeFilter |
| R4: Time-Series Visualization | COST_3_1, COST_3_2, COST_3_3, COST_3_7 | Domain types define time-series shape; repository runs parallel time-series query; use case selects granularity; UI renders chart via Recharts |
| R5: Context-Adaptive Metrics | COST_3_1, COST_3_3, COST_3_7 | Domain function encodes metric selection rules; use case invokes it; UI renders adaptive columns |
| R6: Paginated Result Sets | COST_3_1, COST_3_2, COST_3_4, COST_3_6, COST_3_7 | Domain types include pagination metadata; repository implements OFFSET/LIMIT; page passes page param; UI shows pagination controls and totals |
| R7: Drill-Down Through Filtering | COST_3_6 | Interactive client component converts row click to filter URL param |
| R8: Summary Headline | COST_3_1, COST_3_2, COST_3_7 | Domain types carry aggregate totals; repository computes cross-page totals; UI renders headline |
| R9: Empty and Zero States | COST_3_7 | Presentational component for empty state messaging and zero-cost row display |
| R10: Navigation and Integration | COST_3_4, COST_3_6 | Page at sibling route with URL state; dashboard-to-explorer and explorer-to-dashboard navigation links |

## Open Questions

1. When grouping by attribution group, should hierarchical groups show rolled-up totals from child groups, or only direct attribution? The attribution pipeline PRD deferred hierarchical roll-up to post-MVP. The explorer should align with whatever the attribution pipeline supports at query time.
2. Should the time-series visualization support toggling between cost and other metrics (e.g., show request count over time instead of cost)? MVP could default to cost-over-time and defer metric switching to post-MVP.
