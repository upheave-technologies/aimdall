import Link from 'next/link';
import { listUsers } from '@/modules/cost-tracking/application/listUsersUseCase';
import { listCredentials } from '@/modules/cost-tracking/application/listCredentialsUseCase';
import { listUserAssignments } from '@/modules/cost-tracking/application/listUserAssignmentsUseCase';
import { getUsageByUser } from '@/modules/cost-tracking/application/getUsageByUserUseCase';
import type { UserUsageRow, CredentialWithProvider, EnrichedKeyAssignment, PrincipalRecord } from '@/modules/cost-tracking/domain/types';
import {
  createUserAction,
  assignKeyAction,
  unassignKeyAction,
} from './actions';

// =============================================================================
// VOID WRAPPERS
// =============================================================================
// Next.js requires form action props to be `(formData: FormData) => void |
// Promise<void>`. The exported actions return ActionResult so they can be
// called programmatically by client components. These thin wrappers satisfy
// the form prop type constraint and are used exclusively inside JSX.

async function createUserFormAction(formData: FormData): Promise<void> {
  'use server';
  await createUserAction(formData);
}

async function assignKeyFormAction(formData: FormData): Promise<void> {
  'use server';
  await assignKeyAction(formData);
}

async function unassignKeyFormAction(formData: FormData): Promise<void> {
  'use server';
  await unassignKeyAction(formData);
}

// =============================================================================
// PAGE
// =============================================================================

export default async function UsersPage() {
  // -------------------------------------------------------------------------
  // 1. PARALLEL DATA FETCHING
  // -------------------------------------------------------------------------
  const [usersResult, usageResult, credentialsResult] = await Promise.all([
    listUsers(),
    getUsageByUser({}),
    listCredentials(),
  ]);

  // -------------------------------------------------------------------------
  // 2. ERROR HANDLING — users
  // -------------------------------------------------------------------------
  if (!usersResult.success) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold">Users & Key Assignments</h1>
        <p className="mt-4 text-red-500">
          Failed to load users: {usersResult.error.message}
        </p>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // 3. ERROR HANDLING — usage
  // -------------------------------------------------------------------------
  if (!usageResult.success) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold">Users & Key Assignments</h1>
        <p className="mt-4 text-red-500">
          Failed to load usage data: {usageResult.error.message}
        </p>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // 4. ERROR HANDLING — credentials
  // -------------------------------------------------------------------------
  if (!credentialsResult.success) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold">Users & Key Assignments</h1>
        <p className="mt-4 text-red-500">
          Failed to load credentials: {credentialsResult.error.message}
        </p>
      </main>
    );
  }

  const users: PrincipalRecord[] = usersResult.value;
  const usageRows: UserUsageRow[] = usageResult.value;
  const credentials: CredentialWithProvider[] = credentialsResult.value;

  // -------------------------------------------------------------------------
  // 5. FETCH ASSIGNMENTS PER USER (enriched with credential + provider names)
  // -------------------------------------------------------------------------
  const principalIds = users.map((u) => u.id);
  const assignmentsResult = await listUserAssignments({ principalIds });

  const assignmentsByUser: Record<string, EnrichedKeyAssignment[]> =
    assignmentsResult.success ? assignmentsResult.value : {};

  // -------------------------------------------------------------------------
  // 6. BUILD USAGE LOOKUP MAP (principalId → UserUsageRow)
  // -------------------------------------------------------------------------
  const usageByPrincipal = new Map<string, UserUsageRow>(
    usageRows.map((row) => [row.principalId, row]),
  );

  // -------------------------------------------------------------------------
  // 7. RENDER
  // -------------------------------------------------------------------------
  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users &amp; Key Assignments</h1>
        <Link
          href="/cost-tracking"
          className="text-sm text-foreground/60 underline-offset-4 hover:underline"
        >
          ← Cost Tracker
        </Link>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Create User Form                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-lg border border-foreground/10 bg-foreground/5 p-6">
        <h2 className="mb-4 text-lg font-semibold">Add User</h2>
        <form action={createUserFormAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Alice Smith"
              className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="alice@example.com"
              className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Add User
          </button>
        </form>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Assign Key Form                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-lg border border-foreground/10 bg-foreground/5 p-6">
        <h2 className="mb-4 text-lg font-semibold">Assign API Key to User</h2>
        {users.length === 0 || credentials.length === 0 ? (
          <p className="text-sm text-foreground/60">
            {users.length === 0
              ? 'No users yet — add a user above first.'
              : 'No credentials found. Add a provider credential before assigning.'}
          </p>
        ) : (
          <form action={assignKeyFormAction} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="principalId" className="text-sm font-medium">
                User
              </label>
              <select
                id="principalId"
                name="principalId"
                required
                className="rounded border border-foreground/20 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
              >
                <option value="">Select user…</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                    {user.email ? ` (${user.email})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="credentialId" className="text-sm font-medium">
                API Key
              </label>
              <select
                id="credentialId"
                name="credentialId"
                required
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
            <button
              type="submit"
              className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Assign Key
            </button>
          </form>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Usage by User Table                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Usage by User (last 30 days)</h2>
        {usageRows.length === 0 ? (
          <p className="text-sm text-foreground/60">
            No usage data yet for this period.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-foreground/10">
            <table className="w-full text-sm">
              <thead className="border-b border-foreground/10 bg-foreground/5">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-right font-medium">Input Tokens</th>
                  <th className="px-4 py-3 text-right font-medium">Output Tokens</th>
                  <th className="px-4 py-3 text-right font-medium">Cost (USD)</th>
                  <th className="px-4 py-3 text-right font-medium">Requests</th>
                  <th className="px-4 py-3 text-right font-medium">Keys</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {usageRows.map((row) => (
                  <tr key={row.principalId} className="hover:bg-foreground/5">
                    <td className="px-4 py-3 font-medium">{row.principalName}</td>
                    <td className="px-4 py-3 text-foreground/60">
                      {row.principalEmail ?? '—'}
                    </td>
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
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.credentialCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Per-User Key Assignment Panels                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold">Key Assignments per User</h2>
        {users.length === 0 ? (
          <p className="text-sm text-foreground/60">No users yet.</p>
        ) : (
          users.map((user) => {
            const assignments = assignmentsByUser[user.id] ?? [];
            const usage = usageByPrincipal.get(user.id);
            return (
              <div
                key={user.id}
                className="rounded-lg border border-foreground/10 bg-foreground/5 p-5"
              >
                <div className="mb-3 flex items-baseline justify-between">
                  <div>
                    <span className="font-semibold">{user.name}</span>
                    {user.email && (
                      <span className="ml-2 text-sm text-foreground/60">{user.email}</span>
                    )}
                  </div>
                  {usage && (
                    <span className="text-sm text-foreground/60 tabular-nums">
                      ${parseFloat(usage.totalCost).toFixed(4)} in last 30 days
                    </span>
                  )}
                </div>

                {assignments.length === 0 ? (
                  <p className="text-sm text-foreground/60">No keys assigned.</p>
                ) : (
                  <ul className="divide-y divide-foreground/10">
                    {assignments.map((assignment) => (
                      <li
                        key={assignment.id}
                        className="flex items-center justify-between py-2"
                      >
                        <span className="text-sm">
                          <span className="font-medium">
                            {assignment.providerDisplayName}
                          </span>{' '}
                          — {assignment.credentialLabel}
                        </span>
                        <form action={unassignKeyFormAction}>
                          <input type="hidden" name="assignmentId" value={assignment.id} />
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
            );
          })
        )}
      </section>
    </main>
  );
}
