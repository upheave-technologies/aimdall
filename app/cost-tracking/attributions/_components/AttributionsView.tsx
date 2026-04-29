import Link from 'next/link';
import type {
  AttributionSummaryRow,
  AttributionGroup,
  AttributionRule,
  CredentialWithProvider,
  PrincipalRecord,
  CoverageResult,
  DiscoverySuggestion,
} from '@/modules/cost-tracking/domain/types';

// =============================================================================
// CONSTANTS (rendering concerns — belong here, not in page.tsx)
// =============================================================================

const GROUP_TYPES = [
  { value: 'team', label: 'Team' },
  { value: 'department', label: 'Department' },
  { value: 'project', label: 'Project' },
  { value: 'environment', label: 'Environment' },
  { value: 'cost_center', label: 'Cost Center' },
  { value: 'business_unit', label: 'Business Unit' },
  { value: 'user', label: 'User' },
  { value: 'custom', label: 'Custom' },
] as const;

const DIMENSIONS = [
  { value: 'credential', label: 'Credential' },
  { value: 'segment', label: 'Segment' },
  { value: 'provider', label: 'Provider' },
  { value: 'model', label: 'Model' },
  { value: 'model_slug', label: 'Model Slug' },
  { value: 'service_category', label: 'Service Category' },
  { value: 'service_tier', label: 'Service Tier' },
  { value: 'region', label: 'Region' },
] as const;

const MATCH_TYPES = [
  { value: 'exact', label: 'Exact' },
  { value: 'prefix', label: 'Prefix' },
  { value: 'regex', label: 'Regex' },
  { value: 'in_list', label: 'In List' },
] as const;

// =============================================================================
// TEMPLATE DEFINITIONS
// =============================================================================

const TEMPLATES = [
  {
    type: 'team' as const,
    title: 'Track cost by team',
    description: 'Assign API keys to teams for team-level cost attribution.',
    defaultGroupNames: '',
  },
  {
    type: 'project' as const,
    title: 'Track cost by project',
    description: 'Organize costs by project for project-level tracking.',
    defaultGroupNames: '',
  },
  {
    type: 'environment' as const,
    title: 'Track cost by environment',
    description: 'Separate dev, staging, and production costs.',
    defaultGroupNames: 'Development, Staging, Production',
  },
  {
    type: 'individual' as const,
    title: 'Track cost by individual',
    description: 'Track per-person API usage and costs.',
    defaultGroupNames: '',
  },
] as const;

// =============================================================================
// USE CASE GALLERY ITEMS
// =============================================================================

const USE_CASES = [
  {
    title: 'Chargebacks',
    description:
      'Attribute API costs to customers for accurate billing. Use credential or metadata dimensions to map usage to customer accounts.',
  },
  {
    title: 'R&D vs Production',
    description:
      'Separate experimental model usage from production workloads. Match by service tier or credential patterns to track R&D spend independently.',
  },
  {
    title: 'Cost per Feature',
    description:
      'Understand which product features drive the most AI spend. Use metadata keys or credential groupings to attribute costs to feature teams.',
  },
] as const;

// =============================================================================
// PROPS
// =============================================================================

type AttributionsViewProps = {
  summaryRows: AttributionSummaryRow[];
  groups: AttributionGroup[];
  rulesMap: Record<string, AttributionRule[]>;
  users: PrincipalRecord[];
  credentials: CredentialWithProvider[];
  coverage: CoverageResult | null;
  suggestions: DiscoverySuggestion[];
  // Actions (void wrappers from page.tsx)
  createGroupAction: (formData: FormData) => Promise<void>;
  deleteGroupAction: (formData: FormData) => Promise<void>;
  createRuleAction: (formData: FormData) => Promise<void>;
  deleteRuleAction: (formData: FormData) => Promise<void>;
  runMigrationAction: (formData: FormData) => Promise<void>;
  applyTemplateAction: (formData: FormData) => Promise<void>;
  dismissSuggestionAction: (formData: FormData) => Promise<void>;
};

// =============================================================================
// HELPERS
// =============================================================================

function confidenceBadgeClass(confidence: DiscoverySuggestion['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'bg-foreground/10 text-foreground/80';
    case 'medium':
      return 'bg-foreground/10 text-foreground/60';
    case 'low':
      return 'bg-foreground/5 text-foreground/40';
  }
}

function suggestionTypelabel(type: DiscoverySuggestion['type']): string {
  switch (type) {
    case 'credential_cluster':
      return 'Pattern Match';
    case 'usage_pattern':
      return 'Usage Pattern';
    case 'provider_segment':
      return 'Provider Segment';
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AttributionsView({
  summaryRows,
  groups,
  rulesMap,
  users,
  credentials,
  coverage,
  suggestions,
  createGroupAction,
  deleteGroupAction,
  createRuleAction,
  deleteRuleAction,
  runMigrationAction,
  applyTemplateAction,
  dismissSuggestionAction,
}: AttributionsViewProps) {
  // Build principal lookup map for entity display
  const principalById = new Map<string, PrincipalRecord>(users.map((u) => [u.id, u]));

  return (
    <div className="space-y-10">

      {/* ------------------------------------------------------------------- */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Attributions</h1>
        <Link
          href="/cost-tracking"
          className="text-sm text-foreground/60 underline-offset-4 hover:underline"
        >
          ← Cost Tracker
        </Link>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Coverage Dashboard                                                   */}
      {/* ------------------------------------------------------------------- */}
      {coverage !== null && (
        <section className="rounded-lg border border-foreground/10 bg-foreground/5 p-6">
          <h2 className="mb-4 text-lg font-semibold">Coverage</h2>

          {/* Large percentage display */}
          <div className="mb-4">
            <span className="text-4xl font-bold tabular-nums">
              {Math.round(coverage.coveragePercentage)}% Attributed
            </span>
          </div>

          {/* Progress bar */}
          <div className="mb-4 h-3 w-full rounded-full bg-foreground/10">
            <div
              className="h-3 rounded-full bg-foreground/80"
              style={{ width: `${coverage.coveragePercentage}%` }}
            />
          </div>

          {/* Dollar breakdown */}
          <p className="mb-6 text-sm text-foreground/60">
            ${coverage.attributedSpend.toFixed(2)} of ${coverage.totalSpend.toFixed(2)} attributed
          </p>

          {/* Unattributed breakdown table */}
          {coverage.unattributedBreakdown.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground/70">
                Unattributed Credentials
              </h3>
              <div className="overflow-x-auto rounded-lg border border-foreground/10">
                <table className="w-full text-sm">
                  <thead className="border-b border-foreground/10 bg-foreground/5">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Credential</th>
                      <th className="px-4 py-3 text-left font-medium">Provider</th>
                      <th className="px-4 py-3 text-right font-medium">Cost</th>
                      <th className="px-4 py-3 text-right font-medium">% of Unattributed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-foreground/10">
                    {coverage.unattributedBreakdown.map((row) => (
                      <tr key={row.credentialId} className="hover:bg-foreground/5">
                        <td className="px-4 py-3 font-medium">
                          {row.credentialLabel}
                          {row.keyHint && (
                            <span className="ml-1 font-mono text-xs text-foreground/40">
                              (•••• {row.keyHint})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground/60">{row.providerDisplayName}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          ${row.cost.toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground/60">
                          {row.percentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Attribution Templates                                                */}
      {/* ------------------------------------------------------------------- */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Quick Setup Templates</h2>
          <p className="mt-1 text-sm text-foreground/60">
            Set up cost attribution in under 2 minutes using templates.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TEMPLATES.map((template) => (
            <div
              key={template.type}
              className="rounded-lg border border-foreground/10 bg-foreground/5 p-6"
            >
              <h3 className="mb-1 font-medium">{template.title}</h3>
              <p className="mb-4 text-sm text-foreground/60">{template.description}</p>
              <form action={applyTemplateAction} className="space-y-3">
                <input type="hidden" name="templateType" value={template.type} />

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`groupNames-${template.type}`}
                    className="text-xs font-medium text-foreground/70"
                  >
                    Group names (comma-separated)
                  </label>
                  <input
                    id={`groupNames-${template.type}`}
                    name="groupNames"
                    type="text"
                    defaultValue={template.defaultGroupNames}
                    placeholder="e.g. Team A, Team B"
                    className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`credentialAssignments-${template.type}`}
                    className="text-xs font-medium text-foreground/70"
                  >
                    Credential assignments (JSON)
                  </label>
                  <textarea
                    id={`credentialAssignments-${template.type}`}
                    name="credentialAssignments"
                    rows={3}
                    placeholder={`{"Team A": ["credId1"], "Team B": ["credId2"]}`}
                    className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                  />
                  <span className="text-xs text-foreground/40">
                    Map group names to credential IDs as JSON
                  </span>
                </div>

                <button
                  type="submit"
                  className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
                >
                  Apply Template
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Auto-Discovery Suggestions                                           */}
      {/* ------------------------------------------------------------------- */}
      {suggestions.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Suggested Groupings</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Based on credential naming patterns and usage data.
            </p>
          </div>

          <div className="space-y-4">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="rounded-lg border border-foreground/10 bg-foreground/5 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* Type badge + confidence badge */}
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-foreground/10 px-2 py-0.5 text-xs font-medium text-foreground/70">
                        {suggestionTypelabel(suggestion.type)}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${confidenceBadgeClass(suggestion.confidence)}`}
                      >
                        {suggestion.confidence} confidence
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold">{suggestion.title}</h3>

                    {/* Description */}
                    <p className="text-sm text-foreground/70">{suggestion.description}</p>

                    {/* Suggested group */}
                    <p className="text-sm text-foreground/60">
                      Suggested group:{' '}
                      <span className="font-medium text-foreground/80">
                        {suggestion.suggestedGroupName}
                      </span>{' '}
                      <span className="text-foreground/40">({suggestion.suggestedGroupType})</span>
                    </p>

                    {/* Credential count */}
                    <p className="text-xs text-foreground/50">
                      Involves {suggestion.credentialIds.length} credential
                      {suggestion.credentialIds.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Dismiss button */}
                  <form action={dismissSuggestionAction} className="shrink-0">
                    <input type="hidden" name="suggestionId" value={suggestion.id} />
                    <input type="hidden" name="suggestionType" value={suggestion.type} />
                    <button
                      type="submit"
                      className="rounded px-3 py-1 text-xs font-medium text-foreground/50 hover:bg-foreground/10 hover:text-foreground/70"
                    >
                      Dismiss
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Attribution Summary Report                                           */}
      {/* ------------------------------------------------------------------- */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Attribution Summary (last 30 days)</h2>
        {summaryRows.length === 0 ? (
          <p className="text-sm text-foreground/60">
            No attribution data yet. Create groups and rules below.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-foreground/10">
            <table className="w-full text-sm">
              <thead className="border-b border-foreground/10 bg-foreground/5">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Group Name</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Linked Entity</th>
                  <th className="px-4 py-3 text-right font-medium">Input Tokens</th>
                  <th className="px-4 py-3 text-right font-medium">Output Tokens</th>
                  <th className="px-4 py-3 text-right font-medium">Cost (USD)</th>
                  <th className="px-4 py-3 text-right font-medium">Requests</th>
                  <th className="px-4 py-3 text-right font-medium">Rules</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {summaryRows.map((row) => {
                  let linkedLabel = '—';
                  if (row.linkedEntityType === 'principal') {
                    const name = row.linkedEntityName;
                    const email = row.linkedEntityEmail;
                    if (name && email) {
                      linkedLabel = `${name} (${email})`;
                    } else if (name) {
                      linkedLabel = name;
                    } else if (row.linkedEntityId) {
                      const principal = principalById.get(row.linkedEntityId);
                      if (principal) {
                        linkedLabel = principal.email
                          ? `${principal.name} (${principal.email})`
                          : principal.name;
                      } else {
                        linkedLabel = row.linkedEntityId;
                      }
                    }
                  } else if (row.linkedEntityType && row.linkedEntityId) {
                    linkedLabel = `${row.linkedEntityType}: ${row.linkedEntityId}`;
                  }

                  return (
                    <tr key={row.groupId} className="hover:bg-foreground/5">
                      <td className="px-4 py-3 font-medium">{row.groupDisplayName}</td>
                      <td className="px-4 py-3 text-foreground/60">{row.groupType}</td>
                      <td className="px-4 py-3 text-foreground/60">{linkedLabel}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.totalInputTokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.totalOutputTokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        ${parseFloat(row.totalCost).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.recordCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.ruleCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Group Management                                                     */}
      {/* ------------------------------------------------------------------- */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold">Group Management</h2>

        {/* Create Group Form */}
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-6">
          <h3 className="mb-4 font-medium">Create New Group</h3>
          <form action={createGroupAction} className="flex flex-wrap items-end gap-3">
            {/* Display Name */}
            <div className="flex flex-col gap-1">
              <label htmlFor="displayName" className="text-sm font-medium">
                Display Name
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                placeholder="Engineering Team"
                className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
              />
            </div>

            {/* Group Type */}
            <div className="flex flex-col gap-1">
              <label htmlFor="groupType" className="text-sm font-medium">
                Group Type
              </label>
              <select
                id="groupType"
                name="groupType"
                required
                className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
              >
                <option value="">Select type…</option>
                {GROUP_TYPES.map((gt) => (
                  <option key={gt.value} value={gt.value}>
                    {gt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <label htmlFor="description" className="text-sm font-medium">
                Description
                <span className="ml-1 text-foreground/40">(optional)</span>
              </label>
              <input
                id="description"
                name="description"
                type="text"
                placeholder="Brief description"
                className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
              />
            </div>

            {/* Link to User */}
            {users.length > 0 && (
              <div className="flex flex-col gap-1">
                <label htmlFor="linkedPrincipalId" className="text-sm font-medium">
                  Link to User
                  <span className="ml-1 text-foreground/40">(optional)</span>
                </label>
                <select
                  id="linkedPrincipalId"
                  name="linkedPrincipalId"
                  className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                >
                  <option value="">None</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                      {user.email ? ` (${user.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Create Group
            </button>
          </form>
        </div>

        {/* Group List */}
        {groups.length === 0 ? (
          <p className="text-sm text-foreground/60">No groups yet. Create one above.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const rules = rulesMap[group.id] ?? [];

              let linkedDisplay = '—';
              if (group.linkedEntityType === 'principal' && group.linkedEntityId) {
                const principal = principalById.get(group.linkedEntityId);
                if (principal) {
                  linkedDisplay = principal.email
                    ? `${principal.name} (${principal.email})`
                    : principal.name;
                } else {
                  linkedDisplay = group.linkedEntityId;
                }
              } else if (group.linkedEntityType && group.linkedEntityId) {
                linkedDisplay = `${group.linkedEntityType}: ${group.linkedEntityId}`;
              }

              return (
                <div
                  key={group.id}
                  className="rounded-lg border border-foreground/10 bg-foreground/5 p-5"
                >
                  {/* Group header */}
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{group.displayName}</span>
                        <span className="rounded bg-foreground/10 px-2 py-0.5 text-xs text-foreground/60">
                          {group.groupType}
                        </span>
                      </div>
                      {group.description && (
                        <p className="mt-0.5 text-sm text-foreground/60">{group.description}</p>
                      )}
                      <p className="mt-0.5 text-xs text-foreground/40">
                        Linked: {linkedDisplay} &middot; Slug: {group.slug}
                      </p>
                    </div>
                    <form action={deleteGroupAction}>
                      <input type="hidden" name="id" value={group.id} />
                      <button
                        type="submit"
                        className="rounded px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
                        Delete Group
                      </button>
                    </form>
                  </div>

                  {/* Existing Rules */}
                  <div className="mb-4">
                    <h4 className="mb-2 text-sm font-medium text-foreground/70">Rules</h4>
                    {rules.length === 0 ? (
                      <p className="text-sm text-foreground/40">No rules yet.</p>
                    ) : (
                      <ul className="divide-y divide-foreground/10 rounded border border-foreground/10">
                        {rules.map((rule) => (
                          <li
                            key={rule.id}
                            className="flex items-center justify-between px-3 py-2"
                          >
                            <span className="text-sm">
                              <span className="font-medium">{rule.dimension}</span>
                              <span className="mx-1 text-foreground/40">{rule.matchType}</span>
                              <span className="font-mono text-xs">{rule.matchValue}</span>
                              {rule.priority !== 0 && (
                                <span className="ml-2 text-xs text-foreground/40">
                                  priority {rule.priority}
                                </span>
                              )}
                              {rule.description && (
                                <span className="ml-2 text-xs text-foreground/40">
                                  — {rule.description}
                                </span>
                              )}
                            </span>
                            <form action={deleteRuleAction}>
                              <input type="hidden" name="id" value={rule.id} />
                              <button
                                type="submit"
                                className="rounded px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                              >
                                Remove
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Add Rule Form */}
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-foreground/70">Add Rule</h4>
                    <form action={createRuleAction} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="groupId" value={group.id} />

                      {/* Dimension */}
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`dimension-${group.id}`}
                          className="text-xs font-medium"
                        >
                          Dimension
                        </label>
                        <select
                          id={`dimension-${group.id}`}
                          name="dimension"
                          required
                          className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                        >
                          <option value="">Select…</option>
                          {DIMENSIONS.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Match Type */}
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`matchType-${group.id}`}
                          className="text-xs font-medium"
                        >
                          Match Type
                        </label>
                        <select
                          id={`matchType-${group.id}`}
                          name="matchType"
                          required
                          className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                        >
                          <option value="">Select…</option>
                          {MATCH_TYPES.map((mt) => (
                            <option key={mt.value} value={mt.value}>
                              {mt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Match Value — free-text input */}
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`matchValue-${group.id}`}
                          className="text-xs font-medium"
                        >
                          Match Value
                        </label>
                        <input
                          id={`matchValue-${group.id}`}
                          name="matchValue"
                          type="text"
                          placeholder="Value (or use credential picker →)"
                          className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                        />
                      </div>

                      {/* Credential Picker (for dimension=credential) */}
                      {credentials.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`credentialPicker-${group.id}`}
                            className="text-xs font-medium text-foreground/60"
                          >
                            Or pick credential
                          </label>
                          <select
                            id={`credentialPicker-${group.id}`}
                            name="credentialMatchValue"
                            className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                          >
                            <option value="">Select credential…</option>
                            {credentials.map((cred) => (
                              <option key={cred.id} value={cred.id}>
                                {cred.providerDisplayName} — {cred.label}
                                {cred.keyHint ? ` (•••• ${cred.keyHint})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Priority */}
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`priority-${group.id}`}
                          className="text-xs font-medium"
                        >
                          Priority
                        </label>
                        <input
                          id={`priority-${group.id}`}
                          name="priority"
                          type="number"
                          defaultValue="0"
                          className="w-20 rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                        />
                      </div>

                      <button
                        type="submit"
                        className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
                      >
                        Add Rule
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Use Case Gallery                                                     */}
      {/* ------------------------------------------------------------------- */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Attribution Scenarios</h2>
          <p className="mt-1 text-sm text-foreground/60">
            Ideas for how to use attribution to answer business questions.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {USE_CASES.map((useCase) => (
            <div
              key={useCase.title}
              className="rounded-lg border border-foreground/10 bg-foreground/5 p-6"
            >
              <h3 className="mb-2 font-semibold">{useCase.title}</h3>
              <p className="text-sm leading-relaxed text-foreground/60">{useCase.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------- */}
      {/* Migration Section                                                    */}
      {/* ------------------------------------------------------------------- */}
      <section className="rounded-lg border border-foreground/10 bg-foreground/5 p-6">
        <h2 className="mb-2 text-lg font-semibold">Migrate Key Assignments</h2>
        <p className="mb-4 text-sm text-foreground/60">
          Convert existing user → key assignments into attribution groups and rules.
          This operation is idempotent: re-running it skips already-migrated records.
        </p>
        <form action={runMigrationAction}>
          <button
            type="submit"
            className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Run Migration
          </button>
        </form>
      </section>

    </div>
  );
}
