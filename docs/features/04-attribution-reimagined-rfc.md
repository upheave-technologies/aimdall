# RFC: Attribution Engine Reimagined

- **Feature ID:** 4
- **Module:** cost-tracking
- **Status:** Done
- **Created:** 2026-04-21

---

## 1. Problem

The attribution engine has full-featured rule evaluation (9 dimensions, 4 match types, priority-based resolution, hierarchical groups), but its only entry point is a technical form that expects users to understand dimensions, match types, and credential IDs. Non-technical users face a blank-slate problem and abandon the feature before getting value. The engine needs an accessibility layer that translates common attribution goals into guided workflows, proactively identifies attribution gaps, and shows users what rules will do before they commit.

The underlying engine is unchanged. This feature is purely about accessibility and discoverability -- no new attribution capabilities, no new entity types, no schema changes to the core rule/group tables.

## 2. Proposed Architecture

### 2.1 Attribution Templates as Domain Logic

Templates (track by team, project, environment, individual) are UX shortcuts that create standard attribution groups and rules using the existing schema. A template is a pure domain concept: given a template type and user-provided inputs (group names, credential-to-group assignments), it produces a set of group creation commands and rule creation commands.

**Rationale:** Keeping template logic in the domain layer as pure functions means templates are testable without infrastructure and can be extended (new template types) without touching use cases or repositories. The domain function receives template parameters and returns a batch of group and rule specifications -- it does not persist anything.

**Trade-off:** Templates are intentionally limited to credential-dimension exact-match rules. This covers the 90% use case (map API keys to organizational groups) without introducing multi-dimension template complexity that would complicate the wizard UX.

**Alternative considered:** Templates as configuration files or database-stored definitions. Rejected because the template catalog is small (4 types), changes infrequently, and benefits from type-safe domain logic over runtime configuration.

### 2.2 Batch Group and Rule Creation Use Case

A new use case that accepts template output (a batch of group specifications and their associated rule specifications) and creates them transactionally. This reuses the existing createGroup and createRule repository methods but wraps them in a single orchestrated operation with duplicate detection.

**Rationale:** The existing single-group and single-rule use cases do not support batch creation. The template wizard needs to create multiple groups with multiple rules per group in one action. A dedicated batch use case keeps the existing use cases unchanged while providing the atomic operation templates require.

**Integration:** Depends on the existing IAttributionRepository (createGroup, createRule, findGroupBySlug, findDuplicateRule). No new repository methods needed for creation -- only for the new query capabilities described below.

### 2.3 Auto-Discovery as Domain-Level Analysis Functions

Auto-discovery suggestions (credential clustering by naming patterns, usage pattern detection, provider segmentation) are pure domain functions that analyze credential and usage data to produce suggestion objects. These functions receive data arrays as input and return typed suggestion results -- they do not query databases.

**Rationale:** Discovery heuristics are business logic (naming pattern recognition, usage pattern classification). Keeping them as pure functions in the domain layer means they are testable with synthetic data and can evolve independently of the data source.

**Key architectural decision:** Discovery functions operate on pre-fetched data, not on live queries. The use case fetches credentials and usage summaries from repositories, then passes them to domain functions. This keeps the domain layer free of infrastructure concerns and allows the same discovery logic to be applied to any data source.

**Trade-off:** Pre-fetching all credential and usage data for analysis is acceptable at current scale (tens to hundreds of credentials). If credential volume grows significantly, the use case would need to add pagination or sampling -- but the domain functions remain unchanged.

### 2.4 Coverage Calculation

Coverage (attributed vs total spend) extends the existing getUnassignedSpend use case rather than creating a parallel mechanism. The existing use case already computes total spend, assigned spend, unassigned spend, and the unassigned credential breakdown. The coverage dashboard needs the same data with two additions: a time-series of coverage percentage, and the ability to break down unattributed spend by model and provider in addition to credential.

**Architecture approach:** Extend the existing repository aggregation to support additional grouping dimensions for the unattributed breakdown. The time-series coverage trend requires a new repository query that computes attributed vs total spend bucketed by time period.

**Rationale:** Building on getUnassignedSpend avoids duplicating the assigned-credential-set logic. The existing use case's pattern (fetch credential spend + fetch all rules + classify) is sound and extends cleanly.

**Alternative considered:** A completely separate coverage use case that recomputes everything from scratch. Rejected because it would duplicate the attribution-rule-to-credential classification logic that already exists.

### 2.5 Rule Preview via Existing Explorer Infrastructure

Rule preview ("this rule would match 342 records totaling $2,450") is architecturally a constrained version of the existing cost explorer query. Given a dimension, match type, and match value, rule preview filters the usage records table and returns a count and cost total.

**Architecture approach:** Add a lightweight repository method to the existing IUsageRecordRepository that performs a filtered count + sum query. This is simpler than the full explorer query (no grouping, no pagination, no time-series) but shares the same table and filtering patterns.

**Rationale:** The explorer's parameterized aggregation is too heavy for inline rule preview (it returns grouped rows, time-series, and pagination metadata). A dedicated count-and-sum method is faster and returns exactly the shape the preview UI needs.

**Alternative considered:** Reusing the explorer use case with a "no grouping, page size 0" configuration. Rejected because the explorer's return type is structurally wrong for preview (paginated result rows vs a single aggregate), and the overhead of time-series computation is wasted.

### 2.6 Suggestion Persistence for Dismissed Auto-Discovery

When a user dismisses an auto-discovery suggestion, that dismissal must persist so the suggestion does not reappear. Two architectural options:

**Option A (recommended): Lightweight dismissal tracking in a new table.** A simple table storing (suggestion key, dismissed-at) pairs. The suggestion key is a deterministic hash of the suggestion type and parameters, computed by the domain layer.

**Option B: User preferences or metadata field.** Store dismissed suggestion keys in a JSON column on an existing table (e.g., a user preferences record). Rejected because the cost-tracking module has no user preferences table, and adding a JSON-based key store to an unrelated table is a maintenance risk.

**Schema impact:** One new table for dismissal tracking. This is the only schema addition this feature requires -- everything else operates on existing tables.

**Trade-off:** A dedicated table for what may be a small number of rows. Acceptable because it provides clean querying (not buried in JSON), supports future extension (suggestion state beyond dismissed/not-dismissed), and follows the module's existing pattern of purpose-built tables.

### 2.7 Smart Defaults for New Credentials

When a new credential appears during sync, the system should suggest matching attribution groups. This is a domain function: given a new credential's label and existing attribution rules, find rules whose match patterns would include this credential.

**Architecture approach:** A pure domain function that tests a credential identifier against all existing rules (reusing the existing matchesRule function). The use case calls this during or after sync to flag suggestions. Suggestions surface on the coverage dashboard as "new and unattributed" items with optional group recommendations.

**Integration:** This connects to the existing sync pipeline's post-sync hooks. The sync use case already processes new credentials -- the suggestion logic is an additional step that produces advisory output without blocking the sync.

## 3. Integration with Existing System

### 3.1 No Changes to the Rule Engine

The attribution engine (9 dimensions, 4 match types, resolveAttribution, matchesRule, priority resolution) is completely unchanged. Templates produce the same groups and rules that manual creation produces. There is no template-specific behavior in the engine.

### 3.2 Existing Repository Reuse

- **IAttributionRepository:** createGroup, createRule, findGroupBySlug, findDuplicateRule, findAllRules, findAllGroups, getAttributionSummary -- all reused directly by template and coverage use cases.
- **IUsageRecordRepository:** findSummaryByCredential -- reused by coverage calculation. A new preview-count method is the only addition.
- **IProviderCredentialRepository:** findAllWithProvider -- reused by template wizards and auto-discovery to display credentials.
- **IPrincipalQueryRepository:** findAll -- reused by the "track by individual" template to list principals.

### 3.3 Existing Page Extension

The current attributions page at the existing route gains new sections and sub-routes for templates, coverage, and the use case gallery. The existing group management and attribution summary sections remain -- templates are an additional entry point, not a replacement.

### 3.4 Use Case Gallery as Static Content

The use case gallery ("Chargebacks," "R&D vs Production," "Cost per feature") is primarily static educational content with links to templates or the rule creation flow. It does not require domain logic, use cases, or data fetching beyond what the existing page already provides. It is a presentational page that links to existing functionality.

## 4. UI Component Analysis

**No design files exist.** Analysis based on PRD functional requirements and the established visual patterns in the cost-tracking section.

**Key Visual Patterns:**
- Multi-step template wizard (name groups, assign credentials, confirm)
- Coverage percentage display with unattributed breakdown
- Suggestion cards for auto-discovery results (dismissible)
- Inline rule preview showing match count and cost
- Gallery of use case scenarios with descriptive cards and action links

### Existing Components Available

The attributions page currently renders all UI inline in the Server Component (no _components or _containers directories). The cost-tracking explore page establishes the module's component patterns. No shared /components/ui/ library exists -- components are co-located with routes.

| Pattern Source | Purpose | Reuse in Feature |
|---------------|---------|------------------|
| Explore page FilterBar | Chip-based filter display with remove action | Pattern reference for active suggestion display |
| Explore page ExplorerTable | Tabular data with adaptive columns | Pattern reference for coverage breakdown table |
| Explore page SummaryStrip | Aggregate stat display | Pattern reference for coverage percentage headline |
| Existing attributions page table | Attribution summary with group/type/cost columns | Direct reuse for the summary section (already built) |
| Existing attributions page forms | Group creation and rule creation forms | Pattern reference for template wizard inputs |

### New Components Required

| Component | Purpose | Type | Rationale |
|-----------|---------|------|-----------|
| Template selection card grid | Display available templates with descriptions and action triggers | Presentational | No existing component displays selectable option cards with icons and descriptions -- the module uses tables and forms, not selection grids |
| Template wizard steps | Multi-step form: name groups, assign credentials, review/confirm | Container (client) | Requires client state for step progression, dynamic group name inputs, and drag-assign credential interaction -- cannot be done with uncontrolled server forms |
| Coverage headline | Coverage percentage with attributed vs total spend | Presentational | Similar to SummaryStrip pattern but with a percentage indicator and color-coded status -- distinct enough to warrant its own component |
| Unattributed breakdown table | Tabular breakdown of unattributed spend by credential/model/provider | Presentational | Extends the pattern from ExplorerTable but with quick-assign actions per row -- a distinct interaction not present in explorer |
| Discovery suggestion card | Dismissible card showing a discovery observation with confirm/dismiss actions | Presentational | No existing component handles dismissible advisory cards with accept/reject actions |
| Rule preview inline | Count and cost preview shown inline during rule creation or editing | Presentational | Small display component that triggers a server action and shows the result -- no existing inline preview pattern |
| Use case gallery cards | Descriptive cards for attribution scenarios with links to templates or rule creation | Presentational | Static educational content cards with action links -- distinct from data-driven table rows |

### Client Interactivity Analysis

The template wizard is the primary client-interactive surface. It requires client state for:
- Step navigation (current step, validation before proceeding)
- Dynamic group name inputs (add/remove team names)
- Credential-to-group assignment (drag or select interaction)

Following the server-first React architecture, the wizard container is a client component in _containers/. All other new components (coverage headline, breakdown table, suggestion cards, gallery cards) are Server Components with server-action-driven forms for dismiss and quick-assign operations.

## 5. Key Architectural Decisions

### 5.1 Templates as Domain Functions, Not Stored Configuration

**Decision:** Templates are pure functions in the domain layer, not database-stored configuration.

**Why:** The template catalog is small and static (4 types). Domain functions provide type safety, testability, and compile-time guarantees. Database-stored templates would add query overhead, schema complexity, and runtime parsing for no benefit at this scale.

### 5.2 Auto-Discovery Operates on Pre-Fetched Data

**Decision:** Discovery functions receive credential and usage arrays as input, not database connections.

**Why:** This keeps discovery logic pure and testable. The use case layer handles data retrieval; the domain layer handles analysis. If discovery needs to scale to larger datasets, only the use case's fetching strategy changes -- the domain functions remain stable.

### 5.3 Coverage Extends getUnassignedSpend, Not Parallel

**Decision:** Build coverage on the existing getUnassignedSpend pattern rather than creating a separate mechanism.

**Why:** The classification logic (which credentials are attributed via credential-dimension rules) is identical. Duplicating it creates divergence risk. The existing use case's output shape is extended, not replaced.

### 5.4 Rule Preview is a Dedicated Query, Not Explorer Reuse

**Decision:** A purpose-built count-and-sum repository method for rule preview.

**Why:** The explorer's parameterized aggregation returns grouped, paginated, time-series data. Rule preview needs a single aggregate (count + total cost). Using the explorer would waste computation and return an ill-fitting result shape.

### 5.5 One New Table for Dismissal Tracking Only

**Decision:** A single new database table for auto-discovery suggestion dismissals. No other schema changes.

**Why:** Templates create standard groups and rules in existing tables. Coverage and preview query existing tables. Only dismissal state has no existing storage location. A dedicated table is cleaner than overloading an existing table's metadata or adding a JSON preferences column.

## 6. Alternatives Considered

### 6.1 Template Engine with Stored Definitions

Store templates as JSON definitions in the database, with a renderer that interprets them into group/rule creation commands. Rejected because 4 static template types do not justify a template engine's complexity. If the template catalog grows beyond 10+ types with user-created templates, this decision should be revisited.

### 6.2 Real-Time Discovery via Background Jobs

Run auto-discovery analysis as a scheduled background job that materializes suggestions into a table. Rejected because the current data volume does not warrant background processing -- on-demand analysis at page load is fast enough. A background approach can be added later if credential volume grows significantly.

### 6.3 Separate Attribution Wizard Application

Build the template wizard as a standalone page separate from the existing attributions page. Rejected because the wizard's output (groups and rules) should be immediately visible in the existing management view. A separate page would require navigation away from the context where users manage their attribution configuration.

## 7. Dependencies

- **Existing attribution pipeline:** Groups, rules, rule evaluation, and the aggregation query must be operational. This feature is a layer on top of the existing engine.
- **Existing credential registry:** Credential data (labels, key hints, provider associations) is the primary data source for templates and auto-discovery.
- **Existing usage data:** Coverage calculations and rule previews query existing usage records.
- **Identity principals (read-only):** The "track by individual" template needs the principal list from IPrincipalQueryRepository.
- **Database migration tooling:** One new table requires a Drizzle migration.

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Auto-discovery heuristics produce low-quality suggestions (false positives from naming patterns) | Suggestions are advisory only -- every suggestion requires explicit user confirmation. Dismissal persistence prevents repeated bad suggestions. |
| Template wizard complexity drives up client-side JavaScript bundle | Wizard is the only client component. All other surfaces use server-rendered forms with server actions. The wizard is a single _containers/ leaf, not a page-wide client boundary. |
| Coverage calculation performance under high credential count | Coverage reuses the existing getUnassignedSpend pattern which is already proven at current scale. The time-series addition is a single bucketed query. |
| Users create duplicate groups by running the same template twice | The batch creation use case checks for existing groups by slug (using findGroupBySlug) and skips duplicates, matching the existing idempotency patterns. |

## 9. Open Questions

1. **Credential assignment interaction model:** Should the template wizard use drag-and-drop for credential-to-group assignment, or a simpler multi-select dropdown per group? Drag-and-drop is more intuitive but adds significant client-side complexity. Multi-select is simpler but less visual.

2. **Coverage time-series granularity:** Should the coverage trend show daily, weekly, or monthly data points? Daily may be noisy if attribution rules are changed infrequently. Monthly may hide important transitions.

3. **Auto-discovery trigger:** Should discovery analysis run on every attributions page load, or only when explicitly requested by the user? On-load is more proactive but adds latency to page rendering. On-demand is faster but less discoverable.

4. **Template extensibility:** Should the architecture support user-defined templates in the future, or are the 4 built-in templates sufficient? This affects whether templates remain pure domain functions or need a more flexible representation.
