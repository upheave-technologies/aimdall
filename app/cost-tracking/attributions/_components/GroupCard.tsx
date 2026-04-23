import type { AttributionGroup } from '@/modules/cost-tracking/domain/types';
import { formatCost } from './_types';

function typeBadgeColor(type: string): string {
  const map: Record<string, string> = {
    team: 'bg-blue-500/10 text-blue-600',
    project: 'bg-violet-500/10 text-violet-600',
    environment: 'bg-emerald-500/10 text-emerald-600',
    department: 'bg-amber-500/10 text-amber-600',
    cost_center: 'bg-rose-500/10 text-rose-600',
    business_unit: 'bg-sky-500/10 text-sky-600',
    user: 'bg-indigo-500/10 text-indigo-600',
    custom: 'bg-foreground/10 text-foreground/60',
  };
  return map[type] ?? map.custom;
}

function typeBarColor(type: string): string {
  const map: Record<string, string> = {
    team: 'bg-blue-500',
    project: 'bg-violet-500',
    environment: 'bg-emerald-500',
    department: 'bg-amber-500',
    cost_center: 'bg-rose-500',
    business_unit: 'bg-sky-500',
    user: 'bg-indigo-500',
    custom: 'bg-foreground/40',
  };
  return map[type] ?? map.custom;
}

// =============================================================================
// COMPONENT
// =============================================================================

type GroupCardProps = {
  group: AttributionGroup;
  totalCost: number;
  totalSpend: number;
  ruleCount: number;
  credentialCount: number;
};

export function GroupCard({
  group,
  totalCost,
  totalSpend,
  ruleCount,
  credentialCount,
}: GroupCardProps) {
  const proportion = totalSpend > 0 ? (totalCost / totalSpend) * 100 : 0;
  const hasUsage = totalCost > 0;

  return (
    <div className="rounded-xl border border-foreground/10 bg-background p-5 transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-semibold">{group.displayName}</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${typeBadgeColor(group.groupType)}`}
        >
          {group.groupType}
        </span>
      </div>

      {/* Hero cost */}
      <p className="text-3xl font-bold tabular-nums tracking-tight">{formatCost(totalCost)}</p>

      {/* Proportion bar */}
      <div className="mt-3 h-1 w-full rounded-full bg-foreground/10">
        <div
          className={`h-1 rounded-full ${typeBarColor(group.groupType)}`}
          style={{ width: `${proportion}%` }}
        />
      </div>

      {hasUsage ? (
        <p className="mt-1.5 text-sm text-foreground/50">
          {proportion.toFixed(0)}% of total spend
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-foreground/40">No matched usage yet</p>
      )}

      {/* Footer */}
      <p className="mt-3 text-xs text-foreground/40">
        {credentialCount} credential{credentialCount !== 1 ? 's' : ''} · {ruleCount} rule
        {ruleCount !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
