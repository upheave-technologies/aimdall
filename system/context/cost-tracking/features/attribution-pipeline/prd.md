# PRD: Attribution Pipeline Completion

- **Feature ID:** 2
- **Module:** cost-tracking
- **Status:** Draft
- **Created:** 2026-03-20

---

## Problem Statement

The cost-tracking module has a partially built attribution system (groups, rules, rule evaluation) that was designed to be the generic mechanism for attributing LLM usage to any organisational entity -- users, teams, projects, departments, environments, or arbitrary cost centres.

Instead of completing this system, a parallel "key assignments" feature was built with its own dedicated table, repository, five use cases, and a custom three-way JOIN query. This works for the single case of "which user owns which API key", but it creates a scaling problem: every future attribution need (by team, by project, by environment) would require another custom table, repository, use case set, and JOIN query.

The attribution system already has the domain building blocks (groups, rules, rule matching, priority resolution) but is missing the aggregation pipeline, entity linking, management operations, and user interface needed to make it usable.

## Business Goals

1. **Eliminate per-use-case custom tables.** "Usage by user", "usage by team", "usage by project" should all flow through the same attribution mechanism without new tables or custom JOINs for each.
2. **Replace the key-assignments feature.** The existing user-to-key mapping and per-user reporting should be migrated to use attribution groups and rules, after which the key_assignments table, repository, and associated use cases can be retired.
3. **Enable self-service attribution management.** Administrators should be able to create groups, define rules, and link groups to external entities (like users from the identity system) without engineering work.
4. **Deliver attribution-based reporting.** Aggregated usage and cost data should be viewable broken down by any attribution group, with the same metrics already available in the existing cost tracker (tokens, costs, requests).

## User Personas

**Cost Administrator** -- The person responsible for understanding and controlling LLM spend. They need to assign API keys to people, create team or project groupings, and view cost breakdowns by those groupings. Today this is the only persona; the app is a single-tenant internal tool.

## User Journeys

### Journey 1: Attribute usage to a person

The administrator wants to see how much a specific person is spending on LLM usage.

1. They navigate to attribution management
2. They create a group of type "team" or "custom" representing the person (or the person already exists as a linked group)
3. They create a rule that says "if the credential dimension matches [credential-id], attribute to this group"
4. They navigate to the attribution report and see cost/token totals for that person's group
5. If the group is linked to a Principal from the identity system, the report shows the person's name and email alongside the cost data

### Journey 2: Attribute usage to a team or project

The administrator wants to see total spend for a team that shares multiple API keys.

1. They create a group of type "team" (e.g., "ML Research Team")
2. They create multiple rules: credential X maps to this team, credential Y maps to this team
3. The attribution report shows the combined spend for all credentials attributed to this team
4. They can also create a parent group (e.g., "Engineering Department") and nest the team under it for hierarchical roll-up reporting

### Journey 3: Migrate from existing user-key assignments

An administrator who previously used the user-key assignment feature should experience a seamless transition.

1. Existing key assignments are migrated into attribution groups (one group per user) with rules (one rule per credential assignment)
2. The per-user cost report continues to work with the same data, now powered by the attribution pipeline
3. The old "assign key to user" workflow is replaced by the attribution management interface

### Journey 4: View attribution reports

1. The administrator navigates to the attribution report
2. They see a table of all attribution groups with aggregated spend for a date range
3. They can filter by group type (team, project, department, etc.)
4. They can drill into a group to see which rules are active and the per-rule breakdown
5. Hierarchical groups show both their own direct spend and the rolled-up spend from child groups

## Functional Requirements

### R1: Entity Linking for Attribution Groups

Attribution groups must be able to reference an external entity from another system. The primary use case is linking a group to a Principal (user) from the identity system so that the group inherits the person's name and email for display.

- A group can optionally be linked to one external entity
- The link is a soft reference (no cross-module foreign key) identified by an entity type and entity ID
- When a group is linked, the reporting layer should display the linked entity's name/email alongside the group's own display name
- Unlinking an entity should not delete the group or its rules

### R2: Attribution Aggregation Query

The system must be able to aggregate usage records by attribution group over a date range. This is the core missing piece -- the rules engine can match usage to groups, but no query exists to produce group-level totals.

- Aggregate input tokens, output tokens, total cost, and request count per attribution group
- Support a date range filter (start date, end date) with a sensible default (last 30 days)
- Only include active (non-deleted) usage records, groups, and rules
- Handle the case where a usage record matches multiple groups (a record's cost is attributed to each matched group independently -- this is a reporting view, not a financial ledger)
- Support filtering by group type
- Handle groups with zero matched usage gracefully (show the group with zero totals)

### R3: Hierarchical Roll-Up

Groups that have child groups should show both direct spend (usage matched to this group's own rules) and rolled-up spend (sum of all descendant groups' spend).

- The report must distinguish between direct spend and total (rolled-up) spend
- Roll-up must traverse the full depth of the group hierarchy
- Circular parent references must be detected and prevented at creation time

### R4: Attribution Group Management

Administrators must be able to create, view, update, and soft-delete attribution groups.

- Create a group with: display name, slug (auto-generated or manual), group type, optional parent group, optional description, optional entity link
- List all active groups, filterable by group type
- Update a group's display name, description, parent, and entity link
- Soft-delete a group (which also deactivates its rules for reporting purposes)
- Validate that slugs are unique among active groups

### R5: Attribution Rule Management

Administrators must be able to create, view, and soft-delete rules within a group.

- Create a rule with: dimension (credential, segment, provider, model, etc.), match type (exact, prefix, regex, in_list), match value, priority, optional description
- List all active rules for a group
- Soft-delete a rule
- Prevent duplicate rules (same group + dimension + match type + match value)
- When creating a credential-dimension rule, the UI should offer a picker showing available credentials with human-readable labels (provider name, key label, key hint) rather than requiring the user to type raw IDs

### R6: Migration of Existing Key Assignments

All existing data in the key_assignments table must be migrated to equivalent attribution groups and rules.

- Each Principal with key assignments becomes an attribution group (type to be determined -- likely "custom" or a new user-oriented type) linked to that Principal
- Each key assignment becomes an attribution rule on the credential dimension with exact match type, pointing at the credential ID
- After migration, the per-user usage report must produce identical results using the attribution pipeline
- The key_assignments table, its repository, domain entity, and associated use cases should be retired after successful migration and verification

### R7: Attribution Report UI

A new report view that shows cost/usage breakdowns by attribution group.

- Table showing all groups with: group name, group type, linked entity info (if any), total input tokens, total output tokens, total cost, request count for the selected date range
- Ability to filter by group type
- Drill-down into a group to see its rules and per-rule usage breakdown
- For groups linked to a Principal, display the principal's name and email
- Date range selector (consistent with existing cost tracker controls)
- This view replaces the existing "Users & Key Assignments" page once migration is complete

### R8: Attribution Group Management UI

An interface for creating and managing groups and rules.

- Form to create a new group with all required fields
- Form to add rules to a group, with a credential picker for credential-dimension rules
- Ability to link/unlink a group to/from a Principal (with a principal picker)
- Ability to soft-delete groups and rules
- Display of the group hierarchy (parent-child relationships)

## Non-Functional Requirements

- **Performance:** The aggregation query must handle the current data volume (thousands of usage records per month) without noticeable delay. Optimisation for millions of records is not required at this stage but the query design should not preclude future indexing.
- **Data integrity during migration:** The migration from key_assignments to attribution must be reversible. The key_assignments table should be kept (soft-deleted, not dropped) until the new pipeline is verified to produce equivalent results.
- **Backward compatibility:** The main cost tracking dashboard (provider/model/credential breakdowns) is unaffected by this work. Only the "Users & Key Assignments" page is replaced.

## MVP Scope

The MVP delivers the full attribution pipeline as described above, because the core value proposition -- a generic attribution mechanism that replaces single-purpose custom code -- requires all pieces to work end-to-end.

**In scope for MVP:**
- Entity linking on attribution groups (R1)
- Attribution aggregation query (R2)
- Flat group reporting -- hierarchical roll-up (R3) is deferred to post-MVP
- Group CRUD use cases (R4)
- Rule CRUD use cases (R5)
- Migration of key_assignments data (R6)
- Attribution report UI (R7)
- Attribution management UI (R8)

**Deferred to post-MVP:**
- Hierarchical roll-up computation (R3) -- groups can have parents in the data model, but the report will show flat per-group totals only
- Budget integration with attribution groups (setting spend limits per group)
- Scheduled/automated rule evaluation (batch processing of historical records)
- Multi-group cost splitting (proportional allocation when a record matches multiple groups)

## Success Metrics

1. **Parity:** The attribution-based per-user report produces identical cost totals as the current key_assignments-based report for the same date range and user set.
2. **Generality:** A new attribution use case (e.g., "usage by team") can be set up purely through the management UI without any code changes.
3. **Retirement:** The key_assignments table, its domain entity, repository, and five associated use cases are fully removed from the codebase after migration verification.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Attribution aggregation query is slow for large datasets | Report load times degrade | The query only needs to handle current scale (thousands of records). Design should allow future indexing but optimisation is not required now. |
| Migration produces different totals than key_assignments | Loss of trust in the new system | Run both systems in parallel and compare results before retiring key_assignments. Keep key_assignments data (soft-delete, not drop) as a fallback. |
| Rule configuration is error-prone (wrong credential ID, bad regex) | Incorrect attribution results | Provide credential pickers instead of raw ID entry. Show a preview of which usage records a rule would match before saving. |

## Open Questions

1. Should we introduce a dedicated group type for "user" (e.g., add `user` to the GroupType enum), or should user-linked groups use the existing `custom` type? A dedicated type would make it easier to filter and display user groups distinctly.
2. When a usage record matches multiple groups, should the report show the full cost under each group (current design -- helpful for "who is responsible" views) or should it split the cost proportionally? MVP uses full-cost-per-group; proportional splitting is deferred.
