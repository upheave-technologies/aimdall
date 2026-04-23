'use client';

import { useState, useMemo } from 'react';
import { GroupGrid } from '../_components/GroupGrid';
import { GroupDetailPanel } from './GroupDetailPanel';
import { TemplateWizard } from './TemplateWizard';
import { ToastProvider } from './ToastProvider';
import type {
  AttributionGroup,
  AttributionSummaryRow,
  AttributionRule,
  CredentialWithProvider,
  PrincipalRecord,
  TemplateType,
} from '@/modules/cost-tracking/domain/types';
import type { SortBy } from '../_components/_types';

// =============================================================================
// PROPS
// =============================================================================

type DashboardShellProps = {
  groups: AttributionGroup[];
  summaryRows: AttributionSummaryRow[];
  rulesMap: Record<string, AttributionRule[]>;
  credentials: CredentialWithProvider[];
  users: PrincipalRecord[];
  totalSpend: number;
  // Actions (void wrappers from page.tsx)
  createGroupAction: (formData: FormData) => Promise<void>;
  updateGroupAction: (formData: FormData) => Promise<void>;
  deleteGroupAction: (formData: FormData) => Promise<void>;
  createRuleAction: (formData: FormData) => Promise<void>;
  deleteRuleAction: (formData: FormData) => Promise<void>;
  runMigrationAction: (formData: FormData) => Promise<void>;
  applyTemplateAction: (formData: FormData) => Promise<void>;
  previewRuleAction: (formData: FormData) => Promise<void>;
};

// =============================================================================
// CONTAINER
// =============================================================================

export function DashboardShell({
  groups,
  summaryRows,
  rulesMap,
  credentials,
  users,
  totalSpend,
  createGroupAction,
  updateGroupAction,
  deleteGroupAction,
  createRuleAction,
  deleteRuleAction,
  applyTemplateAction,
}: DashboardShellProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('cost_desc');
  const [filterType, setFilterType] = useState<string>('all');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardType, setWizardType] = useState<TemplateType | null>(null);

  // Sorted and filtered group list
  const sortedFilteredGroups = useMemo(() => {
    const filtered =
      filterType === 'all' ? groups : groups.filter((g) => g.groupType === filterType);

    return [...filtered].sort((a, b) => {
      const costA = parseFloat(summaryRows.find((r) => r.groupId === a.id)?.totalCost ?? '0');
      const costB = parseFloat(summaryRows.find((r) => r.groupId === b.id)?.totalCost ?? '0');
      switch (sortBy) {
        case 'cost_desc': return costB - costA;
        case 'cost_asc': return costA - costB;
        case 'name_asc': return a.displayName.localeCompare(b.displayName);
        case 'name_desc': return b.displayName.localeCompare(a.displayName);
        case 'type': return a.groupType.localeCompare(b.groupType);
        default: return 0;
      }
    });
  }, [groups, summaryRows, sortBy, filterType]);

  // Resolve selected group and its data
  const selectedGroup =
    selectedGroupId && selectedGroupId !== '__new__'
      ? (groups.find((g) => g.id === selectedGroupId) ?? null)
      : null;

  const selectedRules =
    selectedGroupId && selectedGroupId !== '__new__'
      ? (rulesMap[selectedGroupId] ?? [])
      : [];

  const selectedSummary =
    selectedGroupId && selectedGroupId !== '__new__'
      ? (summaryRows.find((r) => r.groupId === selectedGroupId) ?? null)
      : null;

  return (
    <ToastProvider>
      <GroupGrid
        groups={sortedFilteredGroups}
        summaryRows={summaryRows}
        rulesMap={rulesMap}
        totalSpend={totalSpend}
        sortBy={sortBy}
        filterType={filterType}
        onSelectGroup={(id) => setSelectedGroupId(id)}
        onAddGroup={() => setSelectedGroupId('__new__')}
        onSortChange={setSortBy}
        onFilterChange={setFilterType}
        onSetUp={() => { setWizardType(null); setWizardOpen(true); }}
      />

      {selectedGroupId !== null && (
        <GroupDetailPanel
          group={selectedGroupId === '__new__' ? null : selectedGroup}
          rules={selectedRules}
          summary={selectedSummary}
          credentials={credentials}
          users={users}
          totalSpend={totalSpend}
          onClose={() => setSelectedGroupId(null)}
          createGroupAction={createGroupAction}
          updateGroupAction={updateGroupAction}
          deleteGroupAction={deleteGroupAction}
          createRuleAction={createRuleAction}
          deleteRuleAction={deleteRuleAction}
        />
      )}

      {wizardOpen && (
        <TemplateWizard
          credentials={credentials}
          initialType={wizardType}
          onClose={() => { setWizardOpen(false); setWizardType(null); }}
          applyTemplateAction={applyTemplateAction}
        />
      )}
    </ToastProvider>
  );
}
