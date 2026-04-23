import type {
  AttributionGroup,
  AttributionRule,
  AttributionSummaryRow,
  CredentialWithProvider,
  PrincipalRecord,
} from '@/modules/cost-tracking/domain/types';
import { formatCost, formatCostFull } from './_types';
import type { RulePreview } from './_types';

const TYPE_BADGE: Record<string, string> = {
  team: 'bg-blue-500/10 text-blue-600',
  project: 'bg-violet-500/10 text-violet-600',
  environment: 'bg-emerald-500/10 text-emerald-600',
  department: 'bg-amber-500/10 text-amber-600',
  cost_center: 'bg-rose-500/10 text-rose-600',
  business_unit: 'bg-sky-500/10 text-sky-600',
  user: 'bg-indigo-500/10 text-indigo-600',
  custom: 'bg-foreground/10 text-foreground/60',
};

function typeBadge(type: string): string {
  return TYPE_BADGE[type] ?? TYPE_BADGE.custom;
}

// =============================================================================
// PROPS
// =============================================================================

type GroupDetailViewProps = {
  // Data
  group: AttributionGroup | null;
  rules: AttributionRule[];
  summary: AttributionSummaryRow | null;
  credentials: CredentialWithProvider[];
  users: PrincipalRecord[];
  totalSpend: number;
  // UI state (managed by container)
  editing: boolean;
  showAddRule: boolean;
  confirmDelete: string | null; // ruleId | 'group' | null
  menuOpen: boolean;
  // Event handlers
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onMenuToggle: () => void;
  onRequestDeleteGroup: () => void;
  onRequestDeleteRule: (ruleId: string) => void;
  onCancelDelete: () => void;
  onShowAddRule: () => void;
  onHideAddRule: () => void;
  // Actions (void wrappers)
  createGroupAction: (formData: FormData) => Promise<void>;
  updateGroupAction: (formData: FormData) => Promise<void>;
  deleteGroupAction: (formData: FormData) => Promise<void>;
  deleteRuleAction: (formData: FormData) => Promise<void>;
  // Slot for RuleBuilder container
  ruleBuilderSlot: React.ReactNode;
  // Live rule previews keyed by rule id
  rulePreviews: Record<string, RulePreview>;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function GroupDetailView({
  group,
  rules,
  summary,
  users,
  totalSpend,
  editing,
  showAddRule,
  confirmDelete,
  menuOpen,
  rulePreviews,
  onClose,
  onEdit,
  onCancelEdit,
  onMenuToggle,
  onRequestDeleteGroup,
  onRequestDeleteRule,
  onCancelDelete,
  onShowAddRule,
  onHideAddRule,
  createGroupAction,
  updateGroupAction,
  deleteGroupAction,
  deleteRuleAction,
  ruleBuilderSlot,
}: GroupDetailViewProps) {
  const isCreate = group === null;
  const principalById = new Map(users.map((u) => [u.id, u]));

  const totalCost = summary ? parseFloat(summary.totalCost) : 0;
  const proportion = totalSpend > 0 ? (totalCost / totalSpend) * 100 : 0;

  let linkedDisplay = '—';
  if (group?.linkedEntityType === 'principal' && group?.linkedEntityId) {
    const p = principalById.get(group.linkedEntityId);
    linkedDisplay = p
      ? p.email
        ? `${p.name} (${p.email})`
        : p.name
      : group.linkedEntityId;
  } else if (group?.linkedEntityType && group?.linkedEntityId) {
    linkedDisplay = `${group.linkedEntityType}: ${group.linkedEntityId}`;
  }

  return (
    <>
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        style={{ animation: 'fade-in 250ms ease-out' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 z-50 h-full w-full overflow-y-auto border-l border-foreground/10 bg-background sm:w-[480px]"
        style={{ animation: 'slide-in-right 250ms ease-out' }}
      >
        {/* ----------------------------------------------------------------- */}
        {/* DELETE GROUP CONFIRMATION OVERLAY                                  */}
        {/* ----------------------------------------------------------------- */}
        {confirmDelete === 'group' && group !== null && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/95 p-6">
            <div className="w-full max-w-sm space-y-4 rounded-xl border border-foreground/10 bg-background p-6 shadow-xl">
              <h3 className="text-base font-semibold">Delete {group.displayName}?</h3>
              <p className="text-sm text-foreground/60">
                This will remove the group and all {rules.length} rule
                {rules.length !== 1 ? 's' : ''}. {formatCost(totalCost)} in spend will become
                unattributed.
              </p>
              <p className="text-sm font-medium text-red-600">This action cannot be undone.</p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={onCancelDelete}
                  className="flex-1 rounded border border-foreground/15 px-4 py-2 text-sm font-medium hover:bg-foreground/5"
                >
                  Cancel
                </button>
                <form action={deleteGroupAction} className="flex-1">
                  <input type="hidden" name="id" value={group.id} />
                  <button
                    type="submit"
                    className="w-full rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Delete Group
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* CREATE MODE                                                         */}
        {/* ----------------------------------------------------------------- */}
        {isCreate && (
          <div className="p-6">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Group</h2>
              <button
                onClick={onClose}
                className="rounded p-1 text-foreground/50 hover:bg-foreground/5 hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form action={createGroupAction} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground/70">Name</label>
                <input
                  name="displayName"
                  type="text"
                  required
                  placeholder="Engineering Team"
                  className="w-full rounded border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground/70">Type</label>
                <select
                  name="groupType"
                  required
                  className="w-full rounded border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                >
                  <option value="">Select type…</option>
                  <option value="team">Team</option>
                  <option value="department">Department</option>
                  <option value="project">Project</option>
                  <option value="environment">Environment</option>
                  <option value="cost_center">Cost Center</option>
                  <option value="business_unit">Business Unit</option>
                  <option value="user">User</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground/70">
                  Description <span className="text-foreground/40">(optional)</span>
                </label>
                <input
                  name="description"
                  type="text"
                  placeholder="Brief description"
                  className="w-full rounded border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                />
              </div>

              {users.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground/70">
                    Link to User <span className="text-foreground/40">(optional)</span>
                  </label>
                  <select
                    name="linkedPrincipalId"
                    className="w-full rounded border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                  >
                    <option value="">None</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.email ? ` (${u.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
              >
                Create Group
              </button>
            </form>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* VIEW / EDIT MODE                                                    */}
        {/* ----------------------------------------------------------------- */}
        {!isCreate && group !== null && (
          <div className="flex flex-col">
            {/* Section A — Group Info Header */}
            <div className="border-b border-foreground/10 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{group.displayName}</h2>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${typeBadge(group.groupType)}`}>
                      {group.groupType}
                    </span>
                  </div>
                  {group.description && (
                    <p className="mt-1 text-sm text-foreground/60">{group.description}</p>
                  )}
                  <p className="mt-1 text-xs text-foreground/40">
                    Linked: {linkedDisplay} · Slug: {group.slug}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground/30">
                    Created {new Date(group.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  {/* Three-dot menu */}
                  <div className="relative">
                    <button
                      onClick={onMenuToggle}
                      className="rounded p-1.5 text-foreground/50 hover:bg-foreground/5 hover:text-foreground"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-foreground/10 bg-background shadow-lg">
                        <button
                          onClick={onEdit}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-foreground/5"
                        >
                          Edit
                        </button>
                        <button
                          onClick={onRequestDeleteGroup}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          Delete group
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Close */}
                  <button
                    onClick={onClose}
                    className="rounded p-1 text-foreground/50 hover:bg-foreground/5 hover:text-foreground"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Edit Form (inline) */}
              {editing && (
                <form action={updateGroupAction} className="mt-4 space-y-3">
                  <input type="hidden" name="id" value={group.id} />
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground/70">Name</label>
                    <input
                      name="displayName"
                      defaultValue={group.displayName}
                      className="w-full rounded border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground/70">Description</label>
                    <input
                      name="description"
                      defaultValue={group.description ?? ''}
                      placeholder="Optional description"
                      className="w-full rounded border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={onCancelEdit}
                      className="rounded px-3 py-1.5 text-xs font-medium text-foreground/60 hover:bg-foreground/5"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Section B — Cost Summary */}
            {summary && (
              <div className="border-b border-foreground/10 p-6">
                <div className="flex items-baseline justify-between">
                  <p className="text-3xl font-bold tabular-nums tracking-tight">{formatCostFull(totalCost)}</p>
                  <p className="text-sm text-foreground/50">{proportion.toFixed(1)}% of total</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-foreground/50">Input tokens</p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">
                      {summary.totalInputTokens.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground/50">Output tokens</p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">
                      {summary.totalOutputTokens.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground/50">Requests</p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">
                      {summary.recordCount.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Section C — Rules */}
            <div className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Rules ({rules.length})
                </h3>
                {!showAddRule && (
                  <button
                    onClick={onShowAddRule}
                    className="rounded px-2.5 py-1 text-xs font-medium text-foreground/60 hover:bg-foreground/5"
                  >
                    + Add
                  </button>
                )}
              </div>

              {rules.length === 0 && !showAddRule && (
                <p className="text-sm text-foreground/40">No rules yet. Add one below.</p>
              )}

              {rules.length > 0 && (
                <ul className="mb-4 divide-y divide-foreground/10 rounded-lg border border-foreground/10">
                  {rules.map((rule) => (
                    <li key={rule.id} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <span className="font-medium">{rule.dimension}</span>{' '}
                            <span className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-xs text-foreground/50">
                              {rule.matchType}
                            </span>{' '}
                            <span className="font-mono text-xs">{rule.matchValue}</span>
                          </p>
                          {/* Live preview text */}
                          {(() => {
                            const pv = rulePreviews[rule.id];
                            if (pv) {
                              return (
                                <p className={`mt-0.5 text-xs ${pv.matchedRecords === 0 ? 'text-red-500' : 'text-foreground/40'}`}>
                                  {pv.matchedRecords === 0
                                    ? 'This rule matches nothing. Check the value.'
                                    : `Matches ${pv.matchedRecords.toLocaleString()} records (${formatCost(pv.matchedCost)})`}
                                </p>
                              );
                            }
                            if (rule.description) {
                              return <p className="mt-0.5 text-xs text-foreground/40">{rule.description}</p>;
                            }
                            return (
                              <p className="mt-0.5 text-xs text-foreground/30">
                                <span className="inline-block h-3 w-24 animate-pulse rounded bg-foreground/10" />
                              </p>
                            );
                          })()}
                        </div>

                        {/* Delete rule */}
                        {confirmDelete === rule.id ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <form action={deleteRuleAction}>
                              <input type="hidden" name="id" value={rule.id} />
                              <button
                                type="submit"
                                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Delete
                              </button>
                            </form>
                            <button
                              onClick={onCancelDelete}
                              className="rounded px-2 py-1 text-xs text-foreground/50 hover:bg-foreground/5"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => onRequestDeleteRule(rule.id)}
                            className="shrink-0 rounded p-1 text-foreground/30 hover:bg-red-50 hover:text-red-600"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Section D — Add Rule (RuleBuilder slot) */}
              {showAddRule && (
                <div className="mt-2">
                  {ruleBuilderSlot}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
