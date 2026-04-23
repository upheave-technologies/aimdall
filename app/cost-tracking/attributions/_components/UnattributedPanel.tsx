import type { CoverageResult, AttributionGroup } from '@/modules/cost-tracking/domain/types';
import { formatCost } from './_types';

// =============================================================================
// HELPERS
// =============================================================================

function providerColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('anthropic')) return 'bg-orange-500';
  if (n.includes('openai')) return 'bg-emerald-500';
  if (n.includes('google')) return 'bg-blue-500';
  return 'bg-foreground/40';
}

// =============================================================================
// COMPONENT
// =============================================================================

type UnattributedPanelProps = {
  breakdown: CoverageResult['unattributedBreakdown'];
  groups: AttributionGroup[];
  assignCredentialAction: (formData: FormData) => Promise<void>;
};

export function UnattributedPanel({
  breakdown,
  groups,
  assignCredentialAction,
}: UnattributedPanelProps) {
  return (
    <div className="rounded-xl border border-foreground/10 p-6 flex flex-col">
      <h2 className="text-lg font-semibold mb-4">Unattributed Spend</h2>

      {breakdown.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center py-10">
          <div>
            <p className="text-sm font-medium text-foreground/60">All spend is attributed.</p>
            <p className="text-xs text-foreground/40 mt-1">Nice work.</p>
          </div>
        </div>
      ) : (
        <div className="max-h-[280px] overflow-y-auto">
          {breakdown.map((row) => (
            <div
              key={row.credentialId}
              className="flex items-center justify-between py-2.5 border-b border-foreground/5 last:border-0"
            >
              {/* Left: provider dot + label */}
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${providerColor(row.providerDisplayName)}`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{row.credentialLabel}</p>
                  {row.keyHint && (
                    <p className="text-xs text-foreground/40 font-mono">**** {row.keyHint}</p>
                  )}
                </div>
              </div>

              {/* Right: cost + assign form */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">{formatCost(row.cost)}</p>
                  <p className="text-xs text-foreground/40 tabular-nums">
                    {row.percentage.toFixed(1)}%
                  </p>
                </div>

                <form action={assignCredentialAction} className="flex items-center gap-1">
                  <input type="hidden" name="credentialId" value={row.credentialId} />
                  <select
                    name="groupId"
                    defaultValue=""
                    className="rounded border border-foreground/15 bg-background px-2 py-1 text-xs"
                  >
                    <option value="" disabled>
                      Assign to...
                    </option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.displayName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded bg-foreground/10 px-2 py-1 text-xs font-medium text-foreground/70 hover:bg-foreground/20"
                  >
                    Go
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
