import type { AttributionGroup, AttributionSummaryRow, AttributionRule } from '@/modules/cost-tracking/domain/types';
import type { SortBy } from './_types';
import { GroupCard } from './GroupCard';

// =============================================================================
// PROPS
// =============================================================================

type GroupGridProps = {
  groups: AttributionGroup[];
  summaryRows: AttributionSummaryRow[];
  rulesMap: Record<string, AttributionRule[]>;
  totalSpend: number;
  sortBy: SortBy;
  filterType: string;
  onSelectGroup: (id: string) => void;
  onAddGroup: () => void;
  onSortChange: (value: SortBy) => void;
  onFilterChange: (value: string) => void;
  onSetUp: () => void;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function GroupGrid({
  groups,
  summaryRows,
  rulesMap,
  totalSpend,
  sortBy,
  filterType,
  onSelectGroup,
  onAddGroup,
  onSortChange,
  onFilterChange,
  onSetUp,
}: GroupGridProps) {
  return (
    <>
    <style>{`
      @keyframes card-appear {
        from { opacity: 0; transform: translateY(0.5rem) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `}</style>
    <section>
      {/* Controls bar */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your Groups</h2>
        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortBy)}
            className="rounded border border-foreground/15 bg-background px-2.5 py-1.5 text-xs"
          >
            <option value="cost_desc">Cost (High to Low)</option>
            <option value="cost_asc">Cost (Low to High)</option>
            <option value="name_asc">Name (A to Z)</option>
            <option value="name_desc">Name (Z to A)</option>
            <option value="type">Type</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => onFilterChange(e.target.value)}
            className="rounded border border-foreground/15 bg-background px-2.5 py-1.5 text-xs"
          >
            <option value="all">All types</option>
            <option value="team">Team</option>
            <option value="project">Project</option>
            <option value="environment">Environment</option>
            <option value="department">Department</option>
            <option value="cost_center">Cost Center</option>
            <option value="business_unit">Business Unit</option>
            <option value="user">User</option>
            <option value="custom">Custom</option>
          </select>
          <button
            onClick={onSetUp}
            className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            + Set Up
          </button>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {groups.map((group, index) => {
          const summary = summaryRows.find((r) => r.groupId === group.id);
          const cost = summary ? parseFloat(summary.totalCost) : 0;
          const rules = rulesMap[group.id] ?? [];
          const credCount = rules.filter(
            (r) => r.dimension === 'credential' && r.matchType === 'exact',
          ).length;

          return (
            <button
              key={group.id}
              onClick={() => onSelectGroup(group.id)}
              className="w-full text-left"
              style={{ animation: `card-appear 300ms ease-out ${index * 50}ms backwards` }}
            >
              <GroupCard
                group={group}
                totalCost={cost}
                totalSpend={totalSpend}
                ruleCount={rules.length}
                credentialCount={credCount}
              />
            </button>
          );
        })}

        {/* Add group card */}
        <button
          onClick={onAddGroup}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/20 p-8 text-foreground/40 transition-colors hover:border-foreground/40 hover:text-foreground/60"
        >
          <svg
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="text-sm font-medium">Add a group</span>
        </button>
      </div>
    </section>
    </>
  );
}
