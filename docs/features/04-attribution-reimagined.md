# Attribution Engine Reimagined

> Priority: P0
> Impact: High
> Status: Scoped

## Intent

The attribution engine is the most powerful feature in Aimdall -- 9 matching dimensions, 4 match types, priority-based conflict resolution, hierarchical groups. But it's invisible power. A non-technical user looks at the current rule creation form and has no idea what to do with it. The engine needs to meet users where they are: show them what's possible, set things up for them, and make the value obvious before asking them to configure anything.

## Value

Today: a user who wants to track cost by team needs to understand attribution groups, dimensions, match types, and rule priority. They need to know which credential IDs map to which team members. Most users never get past the blank-slate problem.

After: a user clicks "Track cost by team," names their teams, drags API keys into each team, and sees cost breakdowns immediately. The same user who would have abandoned the feature now has team-level cost attribution running in under 2 minutes -- without understanding a single concept about rule engines.

The advanced engine stays intact for power users. But the 90% use case (track costs by some organizational grouping) becomes effortless.

## Goal

- A new user can set up meaningful cost attribution within 2 minutes using templates, without understanding rules or dimensions.
- The system proactively identifies unattributed spend and suggests how to close the gap.
- At least 3 template-driven attribution scenarios are available out of the box.
- Users who outgrow templates can always access the full rule engine for custom configurations.

## Functionality

### Attribution Templates

Pre-built configurations that solve the most common attribution needs with minimal input. Each template creates the appropriate groups and rules automatically.

**"Track cost by team"**
1. User clicks the template.
2. System asks: "Name your teams" (free-form text inputs, add as many as needed).
3. System shows all active credentials with their provider, label, and key hint.
4. User drags/assigns credentials to teams. Unassigned credentials are highlighted.
5. System creates one attribution group per team (type: team) and one credential-dimension exact-match rule per credential assignment.
6. User sees immediate cost breakdown by team.

**"Track cost by project"**
Same flow as "by team" but creates groups with type: project. Useful for organizations that organize API keys by project rather than team.

**"Track cost by environment"**
Optimized for the dev/staging/production split. System suggests environment names (Development, Staging, Production) pre-filled. User assigns credentials to environments. Particularly useful when teams use separate API keys per environment.

**"Track cost by individual"**
One-click setup for "who is spending what." If principals (users) exist in the identity system, the template offers to create one group per principal, linked to the principal entity, with a credential picker for each person. This directly replaces the legacy key-assignment workflow with a simpler experience.

Templates are not locked-in configurations. After setup, the user can modify the created groups and rules like any other attribution configuration.

### Auto-Discovery

The system scans existing usage data and surfaces observations that can kickstart attribution setup.

**Credential clustering**: "We detected 8 active credentials across 3 providers. 3 credentials have similar naming patterns (prod-*, staging-*, dev-*). Want to group them by environment?"

**Usage pattern detection**: "Credential sk-...7f42 is only used with embedding models. Credential sk-...a1b3 is only used with text generation models. These might represent different use cases -- want to create groups for them?"

**Provider segmentation**: For providers that expose workspace/project/segment data (Google Vertex projects, Anthropic workspaces), suggest attribution groups based on those natural segments.

Auto-discovery is advisory only. The system suggests, the user confirms. No automatic group creation without explicit user action.

### Coverage Dashboard

A persistent indicator showing how much of the user's total spend is attributed to at least one group.

- **Coverage percentage**: "78% of your spend ($11,700 of $15,000) is attributed."
- **Unattributed breakdown**: The remaining 22% is broken down by credential, model, or provider so the user can see exactly where the gaps are.
- **Quick-assign**: From the unattributed breakdown, the user can directly assign an unattributed credential to an existing group or create a new group -- without leaving the coverage view.
- **Trend**: Coverage percentage over time, so the user can see whether attribution completeness is improving.

### Visual Rule Preview

When creating or editing a rule (whether through a template or directly), the system shows a live preview of what the rule matches.

- "This rule matches 342 usage records from the last 30 days, totaling $2,450."
- "This rule matches 0 records. Check the match value -- here are the actual values in your data for this dimension: [list]."
- For regex rules: highlight which of the actual dimension values match the regex pattern.

This prevents the most common rule configuration mistake: creating a rule that matches nothing because of a typo or misunderstanding of the match value format.

### Use Case Gallery

A reference page showing attribution scenarios that users might not think of on their own. Each scenario includes:

- **What it tracks**: "Cost per customer" / "Cost per feature" / "Cost per experiment"
- **How to set it up**: Brief description of which dimensions and rules to use (in plain language, not technical terms)
- **Why it's valuable**: The business question it answers

Examples:
- "Chargebacks: Attribute API costs to customers for billing" (group by customer, match credentials or metadata keys)
- "R&D vs. Production: Separate experimental model usage from production" (match by model or service tier)
- "Cost per feature: Track which product features drive the most LLM spend" (match by metadata key or credential pattern)

The gallery educates users about what's possible and links to relevant templates or the direct rule creation flow.

### Smart Defaults

When a new credential is detected during sync (a new API key appears in usage data for the first time):

- The system flags it as "new and unattributed" on the coverage dashboard.
- If the credential's label or naming pattern matches an existing rule pattern, the system suggests the matching group: "New credential sk-...9c2d (labeled 'ml-team-prod') matches your 'ML Team' group pattern. Add it?"
- If no pattern matches, the credential appears in the "unattributed" section for manual assignment.

## Constraints

- Templates create standard attribution groups and rules. They don't introduce any new entity types or capabilities -- they're UX shortcuts to existing engine functionality.
- Auto-discovery suggestions are heuristic-based (naming patterns, usage patterns). They will sometimes be wrong. Every suggestion requires explicit user confirmation.
- The underlying rule engine (9 dimensions, 4 match types, priority resolution) is unchanged. This feature is purely about accessibility, not capability expansion.
- Hierarchical roll-up reporting is deferred (per the existing attribution pipeline PRD). Templates create flat groups. Nesting can be added later by editing group parent relationships directly.

## Dependencies

- **Attribution pipeline (existing)**: Groups, rules, rule evaluation, and the aggregation query must be operational. This feature builds on top of the existing engine, not alongside it.
- **Credential data (existing)**: The credential registry with labels, key hints, and provider associations is the primary data source for templates and auto-discovery.
- **Usage data (existing)**: Coverage calculations and rule previews query against existing usage records.
