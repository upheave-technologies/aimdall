# RFC: Attribution Pipeline Completion

- **Feature ID:** 2
- **Module:** cost-tracking
- **Status:** Draft
- **Created:** 2026-03-20

---

## Problem

The cost-tracking module has two parallel systems for attributing usage to organisational entities: a generic attribution system (groups, rules, rule evaluation) and a purpose-built key-assignments system (dedicated table, repository, five use cases, custom three-way JOIN). The attribution system has domain building blocks but no aggregation pipeline, entity linking, or management surface. Each new attribution need (by team, by project, by environment) would require duplicating the key-assignments pattern with its own custom table, repository, and query. Completing the attribution system and retiring key-assignments unifies cost attribution behind a single, generic mechanism.

## Key Decisions Already Made

1. **Add `user` to GroupType enum.** User-linked groups are a first-class concept in the type system, not a `custom` hack. This enables type-specific filtering and rendering in the UI.
2. **Full cost per group, no splitting.** When a usage record matches multiple groups, each group shows the real total cost. Proportional allocation is deferred.
3. **Hierarchical roll-up deferred.** The parent-child data model stays in the attribution group schema, but MVP reports flat per-group totals only.

## Proposed Architecture

### 1. Entity Linking on Attribution Groups

Attribution groups need a soft-reference mechanism to link to external entities (primarily Principals from the identity package). This follows the existing cross-module pattern: soft links by entity type and entity ID, no foreign key constraints across module boundaries.

- **Rationale:** The cost-tracking module already uses soft links to identity (see key-assignments principalId pattern). Entity linking generalises this so any group can reference a Principal, and future entity types (teams, projects from other modules) can be linked without schema changes.
- **Trade-off:** Soft links sacrifice referential integrity for module independence. This is an accepted pattern in this codebase (Axiom of Data Sovereignty).
- **Schema impact:** Two new nullable columns on the attribution groups table (entity type and entity ID). Requires a database migration.

### 2. Attribution Aggregation Query

The core missing piece. The domain layer already has rule evaluation (matchesRule, resolveAttribution), but no infrastructure query exists to aggregate usage records by attribution group over a date range.

- **Architecture approach:** SQL-level aggregation in the repository layer. The query joins usage records against attribution rules using the rule-matching logic, then groups by attribution group and sums token/cost metrics.
- **Rationale:** Performing attribution at query time (rather than materialising attribution results into a junction table) avoids data staleness when rules change. At current scale (thousands of records per month), this is acceptable. The existing usage record table already has indexes on dimension columns (credential_id, segment_id, provider_id, model_slug) that support the necessary JOINs.
- **Trade-off:** Query-time attribution is simpler but becomes expensive at scale. If data volume grows to millions of records, a materialised attribution cache (precomputed group-to-record mappings) can be introduced without changing the domain or application layers.
- **Alternative considered:** Materialised junction table (usage_record_id, group_id) populated by a batch job. Rejected for MVP because it adds operational complexity (stale cache, rebuild triggers) that isn't needed at current scale.
- **Scope limitation:** Only exact-match and in_list rules on dimension columns that map directly to usage record columns (credential, segment, provider, model, model_slug, service_category) can be evaluated in SQL. Regex and prefix match types require application-level evaluation. For MVP, the aggregation query handles exact and in_list in SQL; other match types fall back to the existing domain-level resolveAttribution function.

### 3. New Aggregation Type for Attribution Summary

A new domain type is needed to represent per-group aggregated results, analogous to the existing UsageSummaryRow but grouped by attribution group instead of by provider/model/credential. This type will include the group's identity, optional linked entity information, and the standard cost metrics (input tokens, output tokens, total cost, request count).

- **Rationale:** Keeps the domain vocabulary explicit. Attribution summaries are a distinct concept from the existing usage summaries.
- **Integration:** The new type will be exported through the module's public type surface (domain/types.ts) for consumption by app-layer pages and components.

### 4. GroupType Enum Extension

Add `user` to the GroupType enum in both the domain layer and the Postgres enum. This requires a database migration to alter the existing pgEnum.

- **Rationale:** User-attributed groups are the primary use case inherited from key-assignments. A dedicated type enables filtering ("show me all user groups") and distinct UI treatment without relying on metadata or naming conventions.
- **Alternative considered:** Using `custom` with a metadata flag. Rejected because it pushes a first-class concept into an untyped side-channel, making queries and UI logic more fragile.

### 5. IAttributionRepository Extensions

The existing IAttributionRepository interface (Section 9 of repositories.ts) supports basic CRUD but lacks the operations needed for the full pipeline:

- **Update and soft-delete for groups:** Currently only create and read exist. The management UI requires update (display name, description, parent, entity link) and soft-delete.
- **Soft-delete for rules:** Same gap. Rules need soft-delete for management.
- **Duplicate rule detection:** Finding an existing rule by (group, dimension, match type, match value) to prevent duplicates.
- **Group-by-type filtering:** Finding groups filtered by group type for the report UI.
- **Attribution aggregation query:** The new SQL aggregation described in section 2.

These are additions to the existing interface, not replacements. The existing methods remain unchanged.

### 6. New Use Cases

The application layer needs new use cases following the established pattern (higher-order factory function, single use case per file, pre-wired instance export):

- **Group management:** Create group, update group, soft-delete group, list groups (with type filter)
- **Rule management:** Create rule (with duplicate detection), soft-delete rule, list rules by group
- **Attribution report:** Get attribution summary (aggregation query with date range and optional type filter)
- **Entity linking:** Link/unlink a group to an external entity
- **Migration:** One-time migration use case that reads key-assignments and creates equivalent groups and rules

Each use case depends only on domain interfaces (IAttributionRepository, IProviderCredentialRepository, IPrincipalQueryRepository) and is wired to concrete implementations in its pre-wired section.

### 7. Key-Assignments Retirement

After migration verification, the following components are retired:

- **Domain:** keyAssignment.ts entity and its types
- **Schema:** keyAssignments.ts table definition (kept in codebase but marked deprecated; table is soft-deleted, not dropped)
- **Infrastructure:** DrizzleKeyAssignmentRepository.ts
- **Application:** Seven use cases (createUser, listUsers, assignKeyToUser, unassignKeyFromUser, getUsageByUser, listCredentials, listUserAssignments)
- **App layer:** The users/ page and its actions.ts

The main cost-tracking dashboard page (provider/model/credential breakdowns) is unaffected. Only the "Users & Keys" link and page are replaced by the new attribution views.

- **Safety:** The key_assignments database table is preserved (not dropped) until parity is verified. The migration use case should produce results that match the existing getUserUsageSummary query output for the same date range and user set.

### 8. App Layer: New Pages and Server Actions

Two new page routes replace the existing users page:

- **Attribution report page:** Server component that calls the attribution summary use case and renders group-level cost data. Follows the existing pattern in the cost-tracking page (parallel data fetching, Result unwrapping, delegation to presentational components).
- **Attribution management page:** Server component with server actions for group CRUD and rule CRUD. Follows the existing users page pattern (forms with server actions, select pickers for credentials and principals).

Both pages import only from the module's public API surface: use case files from application/ and types from domain/types.

## UI Component Analysis

**Design Files:** None available. Analysis based on PRD functional requirements.

**Key Visual Patterns:**
- Tabular cost data with group-level aggregation (similar to existing UsageSummaryTable)
- Management forms with select pickers (similar to existing users page forms)
- Group type filter controls
- Date range selector (consistent with existing cost tracker)

### Existing Components Available

The existing cost-tracking pages use inline Tailwind-styled elements rather than a shared component library (no /components/ui/ directory exists). The following page-level components exist and establish the visual patterns:

| Component | Purpose | Reuse in Feature |
|-----------|---------|------------------|
| UsageSummaryTable | Renders tabular cost data with column headers | Pattern reference for attribution summary table |
| ProviderCards | Summary stat cards per provider | Pattern reference for group stat display |
| DailySpendTable | Time-series cost data | Not directly applicable |
| SyncButton | Triggers data sync | Not applicable |

### New Components Required

| Component | Purpose | Type | Rationale |
|-----------|---------|------|-----------|
| Attribution summary table | Display per-group cost aggregation with linked entity info | Presentational | Existing UsageSummaryTable groups by provider/model/credential; attribution groups by a different dimension with entity linking display, requiring a distinct component |
| Group management form | Create/edit attribution groups with entity link picker | Presentational | New interaction pattern combining group type selector, optional parent selector, and principal entity linker not present in any existing form |
| Rule management panel | List rules per group with add/delete capability | Presentational | Per-group rule list with credential picker for credential-dimension rules is a new pattern |
| Group type filter | Filter control for selecting one or more group types | Presentational | Shared filter pattern that could be a simple select; follows existing inline form styling |

All new components follow the existing pattern of co-located page components (in an _components directory adjacent to the page) using inline Tailwind classes, consistent with the established cost-tracking UI approach.

## Dependencies

- **Identity package (read-only):** IPrincipalQueryRepository for loading principal records to display linked entity names. Already exists and is in use by the key-assignments feature.
- **Provider credential repository:** IProviderCredentialRepository for the credential picker in rule creation. Already exists.
- **Database migration tooling:** Schema changes require a Drizzle migration (new columns on attribution_groups, enum alteration for GroupType).

## Risks and Trade-offs

| Decision | Trade-off | Mitigation |
|----------|-----------|------------|
| Query-time attribution (no materialised cache) | Performance degrades at scale | Acceptable at current volume; indexes exist on dimension columns; materialised cache can be added later without domain changes |
| Soft-link entity references (no FK) | No referential integrity for linked entities | Established codebase pattern; UI handles missing entities gracefully |
| SQL-only evaluation for exact/in_list rules | Regex and prefix rules require application-level fallback | These match types are rarely used for cost attribution; hybrid approach keeps the common path fast |
| Full cost per group (no splitting) | Groups that share usage records will show overlapping totals | Clearly communicated in the UI as "attributed cost, not allocated cost"; proportional splitting is a deferred enhancement |

## Open Questions

1. **Regex/prefix rule handling in aggregation:** Should the MVP aggregation query silently ignore regex and prefix rules (showing only exact/in_list attributed costs), or should it run a two-pass approach (SQL for exact/in_list, then application-level for the rest)? The two-pass approach is more correct but adds complexity.
2. **Migration reversibility UX:** Should the migration be a one-click action in the UI, or a developer-only operation run from the command line? The PRD implies self-service, but migration is a one-time operation that benefits from manual verification.
3. **Attribution report URL structure:** Should the attribution report replace the existing users page at the same route, or live at a new route with the users page kept temporarily for comparison during migration verification?
