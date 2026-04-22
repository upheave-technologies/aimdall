# RFC: Smart Recommendations / Cost Optimization Engine

> Status: Draft
> PRD: `/docs/features/03-smart-recommendations.md`
> Module: `modules/cost-tracking`
> Author: Rufus (Technical Architect)

## 1. Problem Statement

Users have comprehensive spend visibility through the dashboard, explorer, and anomaly detection surfaces but lack actionable guidance on what to do about their spending patterns. The system collects rich dimensional data -- token distributions by model, cache hit rates, service tier usage, credential activity, and provider concentration -- yet none of this is synthesized into specific, dollar-quantified actions.

The core architectural challenge is designing an analysis engine that: (a) runs six independent analysis strategies against existing usage data, (b) persists recommendations with lifecycle management (active, dismissed, expired), (c) integrates with the existing sync pipeline for freshness, and (d) exposes a new route with dismiss interactivity.

## 2. Proposed Architecture

### 2.1 New Persistence Layer

A new `cost_tracking_recommendations` table is required to store generated recommendations with lifecycle state. This table follows the existing module conventions: soft deletes via `deletedAt`, numeric cost strings with 8 decimal places, and a flexible JSONB column for category-specific analysis data.

Each recommendation record captures its category, estimated savings, confidence metadata (data window size, data quality indicators), lifecycle status, and a JSONB payload containing the raw analysis inputs that produced it. Storing the analysis inputs enables two capabilities: (a) the UI can render specific numbers without re-running analysis, and (b) the system can compare previous analysis inputs against new ones to determine whether a dismissed recommendation should resurface.

**Rationale:** Persisting recommendations rather than computing them on every page load aligns with the PRD requirement that recommendations refresh after each data sync, not on every request. It also enables the dismiss/resurface lifecycle that would be impossible with ephemeral computation.

**Alternative considered:** Computing recommendations on-demand at page load time. Rejected because the six analyzers require multiple aggregation queries across usage records, pricing data, and credential metadata -- too expensive for request-time computation and impossible to support dismiss state without persistence.

### 2.2 Domain Layer -- Analysis Functions

Six pure analysis functions, one per recommendation category, will live in the domain layer. Each function receives pre-fetched aggregated data and returns zero or more recommendation candidates with savings estimates.

**Model Tier Optimization:** Receives per-model token volume distributions (bucketed by output token ranges). Identifies models where a significant percentage of requests produce low output token counts and a cheaper model exists in the same service category. Savings estimate uses the existing `calculateCostFromRates` function to compare rate cards.

**Cache Utilization:** Receives per-provider cached-input-token ratios. Compares against configurable benchmark thresholds. Only produces recommendations when caching is partially used (low hit rate), not when it is entirely absent.

**Batch API Opportunity:** Receives per-model request volume and service tier distribution. Identifies high-volume on-demand usage for models that have batch tier pricing entries in the model pricing table. Savings estimate compares on-demand vs batch rates.

**Dormant Credentials:** Receives credential records with `lastUsedAt` timestamps. Flags credentials with no usage beyond a configurable staleness threshold. This is a security/hygiene recommendation, not a cost savings recommendation.

**Context Tier Analysis:** Receives per-model context tier distribution with associated costs. Identifies usage on expensive extended context tiers where token volumes suggest standard context would suffice.

**Provider Concentration Risk:** Receives per-provider spend totals. Flags when a single provider exceeds a configurable concentration threshold of total spend.

**Key architectural decision:** All six analyzers are pure functions in the domain layer. They receive already-aggregated data (not raw usage records) and return typed recommendation candidates. The aggregation queries that produce their inputs live in the repository layer. This preserves the domain purity rule -- no database access, no side effects -- and makes analyzers independently testable.

**Alternative considered:** A single monolithic analyzer function. Rejected because each category has distinct input data shapes, distinct thresholds, and distinct output structures. Independent functions allow categories to be added, removed, or modified without coupling.

### 2.3 Repository Layer -- New Aggregation Queries

The existing `IUsageRecordRepository` needs new aggregation capabilities to feed the analyzers. These are read-only queries that group and bucket usage data in ways the current interface does not support. Specifically:

- Token volume distribution queries (bucketed by output token ranges per model)
- Cache ratio aggregation (cached input tokens vs total input tokens, grouped by provider)
- Service tier volume aggregation (request counts by model and service tier)
- Context tier cost aggregation (cost by model and context tier)
- Provider spend concentration (total cost grouped by provider)

A new `IRecommendationRepository` provides standard CRUD operations for the recommendations table: create, find active, find by category, update status, and the dismiss operation (setting status and dismissedAt timestamp).

**Key architectural decision:** Aggregation queries are added to the existing `IUsageRecordRepository` rather than creating a separate analysis-specific repository. The data source is the same usage records table -- splitting into a separate repository would create an artificial boundary. The new queries follow the same Drizzle implementation patterns as `findSummaryByModel` and `explore`.

### 2.4 Application Layer -- Use Cases

**Generate Recommendations:** Orchestrates all six analyzers. Fetches aggregated data from repositories, passes it to each domain analyzer, collects candidates, and persists them. Handles the deduplication logic: if an active recommendation of the same category and scope already exists, it updates the existing record rather than creating a duplicate. If a previously dismissed recommendation's underlying data has changed significantly, the recommendation transitions back to active.

**List Recommendations:** Fetches active recommendations sorted by estimated savings descending. Non-cost recommendations (dormant credentials, provider concentration) sort after cost recommendations.

**Dismiss Recommendation:** Marks a recommendation as dismissed with a timestamp. The PRD specifies that dismissed recommendations can resurface when underlying data changes significantly -- the generate use case handles this comparison.

**Sync pipeline integration:** The generate recommendations use case should be invoked at the end of the existing sync pipeline, after usage records are upserted. This ensures recommendations refresh automatically after each data sync without requiring a separate scheduling mechanism.

**Alternative considered:** Triggering recommendation generation on a separate cron schedule independent of the sync pipeline. Rejected because the PRD explicitly ties freshness to data syncs, and decoupling would introduce a window where stale recommendations persist after new data arrives.

### 2.5 Server Layer

A new route under the existing cost-tracking section provides the recommendations page. Following the established nexus-first pattern, the page server component handles authentication, calls the list recommendations use case, and delegates rendering. A server action handles the dismiss mutation.

### 2.6 UI Architecture

The recommendations surface is a dedicated page within the existing cost-tracking navigation. It displays recommendation cards sorted by savings, each showing category, title, explanation with specific numbers, estimated savings, confidence indicator, dismiss action, and a link to the relevant explorer view.

**Existing components available:**

| Component | Purpose | Usage in Feature |
|-----------|---------|------------------|
| Card (pattern from DashboardView) | Content containers with border styling | Recommendation card wrapper |
| SeverityBadge / StatusBadge (pattern from DashboardView) | Status indicators | Confidence and category badges |
| NavigationContainer | Sidebar navigation | Existing -- needs new "Recommendations" nav entry |
| DateRangeFilterContainer | Date filtering | Not needed -- recommendations are not date-filtered |
| Link | Internal navigation | Explorer deep-links from each recommendation |

**New components required:**

| Component | Purpose | Type | Rationale |
|-----------|---------|------|-----------|
| RecommendationsView | Full page layout with sorted recommendation list and empty state | Presentational | Page-level composition of recommendation cards with summary metrics -- no existing page view matches this layout |
| RecommendationCard | Individual recommendation display with category icon, savings, confidence, and actions | Presentational | Unique information density combining savings estimate, confidence metadata, explanation text, and dismiss action -- distinct from any existing card pattern |
| DismissButtonContainer | Handles dismiss server action invocation with optimistic UI | Container (client) | Requires client interactivity for optimistic dismiss feedback |

**Design rationale:** The DashboardView already renders cards for anomalies and budgets but these are summary displays within a multi-section dashboard. Recommendation cards have a fundamentally different information structure (savings estimate, confidence indicator, category-specific explanation, dismiss action, explorer deep-link) that warrants dedicated components rather than forcing the existing card patterns to accommodate this.

The dismiss interaction requires a client container because the user expects immediate visual feedback when dismissing -- the card should visually exit before the server action completes.

## 3. Technology Choices

**Analysis engine:** Pure TypeScript functions in the domain layer. No external ML/statistics libraries are needed -- the six analyzers use straightforward ratio comparisons, threshold checks, and rate card arithmetic that the existing `calculateCostFromRates` function already supports.

**Rationale:** The recommendations are deterministic pattern-matching against known data shapes, not probabilistic models. Adding a statistics or ML dependency would be architectural overhead for simple threshold-based analysis.

**Persistence:** Drizzle ORM with the existing PostgreSQL database, following the established schema conventions in `modules/cost-tracking/schema/`.

**Savings calculations:** Reuse the existing `calculateCostFromRates` domain function and `PricingRates` types for all cost comparison logic. This ensures savings estimates use the same calculation path as actual cost tracking, avoiding divergent results.

## 4. Integration Points

**Sync pipeline:** The `syncProviderUsageUseCase` is the integration point for automatic recommendation refresh. After the sync completes, the generate recommendations use case runs. This follows the existing pattern where the sync pipeline is the single trigger for downstream analysis (similar to how budget evaluation could be triggered post-sync).

**Explorer deep-links:** Each recommendation includes pre-computed explorer filter parameters so the UI can render a link to the relevant explorer view showing the data that generated the recommendation. This uses the existing `ExplorerFilter` and `ExplorerDimension` types from the explorer domain.

**Model pricing table:** The batch API opportunity and model tier optimization analyzers read from the existing `cost_tracking_model_pricing` table to compare rate cards across tiers and models. The existing `findApplicablePricing` function handles tier/date resolution.

**Credential metadata:** The dormant credentials analyzer uses the existing `IProviderCredentialRepository` to access `lastUsedAt` timestamps. No new credential queries are needed.

**Navigation:** The existing sidebar navigation in `NavigationContainer` needs a new entry for the recommendations route.

## 5. Key Trade-offs

**Persistence vs computation trade-off:** Persisting recommendations adds a new table and CRUD operations but enables dismiss lifecycle, avoids expensive re-computation on every page load, and supports the "last updated" freshness indicator from the PRD. The cost is schema complexity; the benefit is correctness and performance.

**Sync-coupled vs independent scheduling:** Coupling recommendation generation to the sync pipeline means recommendations only update when data syncs occur. If syncs are infrequent, recommendations could be stale. However, since recommendations are based on usage data, they can only change when usage data changes -- making sync-coupled refresh the logically correct trigger.

**Domain purity vs query efficiency:** Having pure domain analyzers that receive pre-aggregated data means the repository layer must provide multiple specialized aggregation queries. An alternative would be passing raw records to the analyzers and letting them aggregate, but this would violate the pattern of keeping aggregation in the repository layer where SQL can handle it efficiently, and would move non-trivial data volumes through the application layer unnecessarily.

**Configurable thresholds:** The PRD mentions several thresholds (500 output tokens for model tier, 30 days for dormant credentials, 85% for provider concentration, etc.). These should be configurable at the domain function level (function parameters with defaults) rather than stored in the database. They are operational tuning parameters, not user-facing settings.

## 6. Dependencies

- Existing usage record data with sufficient history (minimum 30 days for meaningful analysis)
- Existing model pricing table populated with rate cards for tier comparison
- Existing provider credential metadata (specifically `lastUsedAt`)
- Feature 02 (Model Cost Simulator) shares the same rate comparison logic -- no blocking dependency, but shared calculation patterns should remain in the existing `calculateCostFromRates` domain function

## 7. Open Questions

1. **Recommendation expiration policy:** Should recommendations auto-expire after a configurable period even if the underlying data still supports them? The PRD does not specify a TTL. A reasonable default might be to expire and regenerate on each sync cycle, treating the generate use case as a full refresh rather than incremental.

2. **Recommendation scope boundaries:** When the generate use case runs, should it replace all active recommendations (full refresh) or merge with existing ones (incremental)? Full refresh is simpler and ensures stale recommendations are cleaned up, but incremental preserves recommendation stability between syncs.

3. **Dismissed recommendation resurfacing threshold:** The PRD says dismissed recommendations should resurface when "underlying data changes significantly." What constitutes "significant"? A concrete threshold is needed -- for example, cache hit rate changing by more than 10 percentage points, or savings estimate changing by more than 25%.

4. **Recommendation count limits:** Should there be a maximum number of active recommendations per category or globally? Displaying too many recommendations dilutes their impact. A global cap (e.g., 10-15 active recommendations) with savings-based prioritization may improve the user experience.
