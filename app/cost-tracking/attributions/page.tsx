import Link from 'next/link';
import { listAttributionGroups } from '@/modules/cost-tracking/application/listAttributionGroupsUseCase';
import { listAttributionRules } from '@/modules/cost-tracking/application/listAttributionRulesUseCase';
import { getAttributionSummary } from '@/modules/cost-tracking/application/getAttributionSummaryUseCase';
import { listUsers } from '@/modules/cost-tracking/application/listUsersUseCase';
import { listCredentials } from '@/modules/cost-tracking/application/listCredentialsUseCase';
import type {
  AttributionSummaryRow,
  AttributionGroup,
  AttributionRule,
  CredentialWithProvider,
  PrincipalRecord,
} from '@/modules/cost-tracking/domain/types';
import {
  createGroupAction,
  deleteGroupAction,
  createRuleAction,
  deleteRuleAction,
  runMigrationAction,
} from './actions';

// =============================================================================
// VOID WRAPPERS
// =============================================================================
// Next.js requires form action props to be `(formData: FormData) => void |
// Promise<void>`. The exported actions return ActionResult so they can be
// called programmatically. These thin wrappers satisfy the form prop type
// constraint and are used exclusively inside JSX.

async function createGroupFormAction(formData: FormData): Promise<void> {
  'use server';
  await createGroupAction(formData);
}

async function deleteGroupFormAction(formData: FormData): Promise<void> {
  'use server';
  await deleteGroupAction(formData);
}

async function createRuleFormAction(formData: FormData): Promise<void> {
  'use server';
  await createRuleAction(formData);
}

async function deleteRuleFormAction(formData: FormData): Promise<void> {
  'use server';
  await deleteRuleAction(formData);
}

async function runMigrationFormAction(formData: FormData): Promise<void> {
  'use server';
  await runMigrationAction(formData);
}

// =============================================================================
// CONSTANTS
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
// PAGE
// =============================================================================

export default async function AttributionsPage() {
  // ---------------------------------------------------------------------------
  // 1. PARALLEL DATA FETCHING
  // ---------------------------------------------------------------------------
  const [summaryResult, groupsResult, usersResult, credentialsResult] = await Promise.all([
    getAttributionSummary({}),
    listAttributionGroups({}),
    listUsers(),
    listCredentials(),
  ]);

  // ---------------------------------------------------------------------------
  // 2. ERROR HANDLING
  // ---------------------------------------------------------------------------
  if (!summaryResult.success) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold">Attributions</h1>
        <p className="mt-4 text-red-500">
          Failed to load attribution summary: {summaryResult.error.message}
        </p>
      </main>
    );
  }

  if (!groupsResult.success) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold">Attributions</h1>
        <p className="mt-4 text-red-500">
          Failed to load attribution groups: {groupsResult.error.message}
        </p>
      </main>
    );
  }

  if (!usersResult.success) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold">Attributions</h1>
        <p className="mt-4 text-red-500">
          Failed to load users: {usersResult.error.message}
        </p>
      </main>
    );
  }

  if (!credentialsResult.success) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold">Attributions</h1>
        <p className="mt-4 text-red-500">
          Failed to load credentials: {credentialsResult.error.message}
        </p>
      </main>
    );
  }

  const summaryRows: AttributionSummaryRow[] = summaryResult.value;
  const groups: AttributionGroup[] = groupsResult.value;
  const users: PrincipalRecord[] = usersResult.value;
  const credentials: CredentialWithProvider[] = credentialsResult.value;

  // ---------------------------------------------------------------------------
  // 3. FETCH RULES PER GROUP IN PARALLEL
  // ---------------------------------------------------------------------------
  const rulesMap: Record<string, AttributionRule[]> = Object.fromEntries(
    await Promise.all(
      groups.map(async (g) => {
        const result = await listAttributionRules({ groupId: g.id });
        return [g.id, result.success ? result.value : []] as const;
      }),
    ),
  );

  // ---------------------------------------------------------------------------
  // 4. SORT SUMMARY BY COST DESCENDING
  // ---------------------------------------------------------------------------
  const sortedSummary = [...summaryRows].sort(
    (a, b) => parseFloat(b.totalCost) - parseFloat(a.totalCost),
  );

  // ---------------------------------------------------------------------------
  // 5. BUILD PRINCIPAL LOOKUP (id → PrincipalRecord) FOR ENTITY DISPLAY
  // ---------------------------------------------------------------------------
  const principalById = new Map<string, PrincipalRecord>(users.map((u) => [u.id, u]));

  // ---------------------------------------------------------------------------
  // 6. RENDER
  // ---------------------------------------------------------------------------
  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">

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
      {/* Attribution Summary Report                                           */}
      {/* ------------------------------------------------------------------- */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Attribution Summary (last 30 days)</h2>
        {sortedSummary.length === 0 ? (
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
                {sortedSummary.map((row) => {
                  // Prefer join-populated names; fall back to principal lookup map
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
          <form action={createGroupFormAction} className="flex flex-wrap items-end gap-3">
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

            {/* Link to User (principal picker — only meaningful for user group type) */}
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
                {/*
                  Hidden inputs carry the linkedEntityType/Id values.
                  When a principal is selected the client-side onChange would
                  normally set these, but since this is a pure server component
                  we embed them as static values. A user group with a principal
                  link should be created via a dedicated client form if dynamic
                  selection is needed; for now the hidden fields are omitted and
                  the server action handles the linkedPrincipalId field directly.
                  We pass the raw principalId as linkedEntityId and set the type.
                */}
              </div>
            )}

            {/* Hidden: linkedEntityType — populated server-side from principalId presence */}
            {/*
              The action reads `linkedPrincipalId` from the form and infers the
              entity type. We add explicit hidden fields so the action works
              without any JS enhancement:
            */}
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

              // Resolve linked entity display
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
                    <form action={deleteGroupFormAction}>
                      <input type="hidden" name="id" value={group.id} />
                      <button
                        type="submit"
                        className="rounded px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        Delete Group
                      </button>
                    </form>
                  </div>

                  {/* -------------------------------------------------------- */}
                  {/* Existing Rules                                            */}
                  {/* -------------------------------------------------------- */}
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
                            <form action={deleteRuleFormAction}>
                              <input type="hidden" name="id" value={rule.id} />
                              <button
                                type="submit"
                                className="rounded px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                              >
                                Remove
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* -------------------------------------------------------- */}
                  {/* Add Rule Form                                             */}
                  {/* -------------------------------------------------------- */}
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-foreground/70">Add Rule</h4>
                    <form action={createRuleFormAction} className="flex flex-wrap items-end gap-3">
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

                      {/* Match Value — credential picker when dimension is 'credential',
                          otherwise a free-text input. Since this is a pure server component
                          we render BOTH a select (credentials) and a text input, and rely on
                          the user choosing the right one based on their dimension choice.
                          A client component could hide/show dynamically, but here we keep it
                          simple: the credential picker is always available as an option. */}
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

                      {/* Credential Picker (for dimension=credential)
                          Uses a distinct name `credentialMatchValue` so it does not
                          collide with the free-text matchValue input. The action
                          prefers credentialMatchValue over matchValue when both are
                          present and credentialMatchValue is non-empty. */}
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
      {/* Migration Section                                                    */}
      {/* ------------------------------------------------------------------- */}
      <section className="rounded-lg border border-foreground/10 bg-foreground/5 p-6">
        <h2 className="mb-2 text-lg font-semibold">Migrate Key Assignments</h2>
        <p className="mb-4 text-sm text-foreground/60">
          Convert existing user → key assignments into attribution groups and rules.
          This operation is idempotent: re-running it skips already-migrated records.
        </p>
        <form action={runMigrationFormAction}>
          <button
            type="submit"
            className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Run Migration
          </button>
        </form>
      </section>

    </main>
  );
}
