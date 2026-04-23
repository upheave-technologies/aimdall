import type { CredentialWithProvider } from '@/modules/cost-tracking/domain/types';

// =============================================================================
// HELPERS
// =============================================================================

function providerDot(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('anthropic')) return 'bg-orange-500';
  if (n.includes('openai')) return 'bg-emerald-500';
  if (n.includes('google')) return 'bg-blue-500';
  return 'bg-foreground/40';
}

// =============================================================================
// PROPS
// =============================================================================

type CredentialAssignerViewProps = {
  credentials: CredentialWithProvider[];
  groups: string[];
  assignments: Record<string, string[]>;
  onAssign: (credentialId: string, groupName: string) => void;
  onUnassign: (credentialId: string, groupName: string) => void;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function CredentialAssignerView({
  credentials,
  groups,
  assignments,
  onAssign,
  onUnassign,
}: CredentialAssignerViewProps) {
  const assignedIds = new Set(Object.values(assignments).flat());
  const unassigned = credentials.filter((c) => !assignedIds.has(c.id));

  return (
    <div className="space-y-6">
      {/* Unassigned credentials */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-foreground/70">
          Available credentials ({unassigned.length} unassigned)
        </h4>
        {unassigned.length === 0 ? (
          <p className="text-sm text-foreground/40">All credentials assigned.</p>
        ) : (
          <ul className="space-y-2">
            {unassigned.map((cred) => (
              <li key={cred.id} className="flex items-center gap-3 rounded-lg border border-foreground/10 px-3 py-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${providerDot(cred.providerDisplayName)}`} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {cred.providerDisplayName} — {cred.label}
                  {cred.keyHint && (
                    <span className="ml-1 font-mono text-xs text-foreground/40">
                      (**** {cred.keyHint})
                    </span>
                  )}
                </span>
                {groups.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) onAssign(cred.id, e.target.value);
                    }}
                    className="shrink-0 rounded border border-foreground/15 bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Assign to…</option>
                    {groups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Group buckets */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-foreground/70">Group assignments</h4>
        {groups.length === 0 ? (
          <p className="text-sm text-foreground/40">No groups defined yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {groups.map((groupName) => {
              const assignedCredIds = assignments[groupName] ?? [];
              const assignedCreds = assignedCredIds
                .map((id) => credentials.find((c) => c.id === id))
                .filter(Boolean) as CredentialWithProvider[];

              return (
                <div
                  key={groupName}
                  className="min-h-[80px] rounded-lg border border-foreground/10 p-3"
                >
                  <p className="mb-2 text-xs font-semibold text-foreground/70">{groupName}</p>
                  {assignedCreds.length === 0 ? (
                    <p className="text-xs text-foreground/30">No credentials assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {assignedCreds.map((cred) => (
                        <span
                          key={cred.id}
                          className="flex items-center gap-1 rounded-full bg-foreground/10 px-2.5 py-1 text-xs"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${providerDot(cred.providerDisplayName)}`} />
                          {cred.label}
                          <button
                            type="button"
                            onClick={() => onUnassign(cred.id, groupName)}
                            className="ml-0.5 text-foreground/40 hover:text-foreground/70"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
