'use client';

import { useState, useEffect } from 'react';
import { GroupDetailView } from '../_components/GroupDetailView';
import { RuleBuilder } from './RuleBuilder';
import { useToast } from './ToastProvider';
import { previewRuleAction } from '../actions';
import type {
  AttributionGroup,
  AttributionRule,
  AttributionSummaryRow,
  CredentialWithProvider,
  PrincipalRecord,
} from '@/modules/cost-tracking/domain/types';
import type { RulePreview } from '../_components/_types';

// =============================================================================
// PROPS
// =============================================================================

type GroupDetailPanelProps = {
  group: AttributionGroup | null;
  rules: AttributionRule[];
  summary: AttributionSummaryRow | null;
  credentials: CredentialWithProvider[];
  users: PrincipalRecord[];
  totalSpend: number;
  onClose: () => void;
  createGroupAction: (formData: FormData) => Promise<void>;
  updateGroupAction: (formData: FormData) => Promise<void>;
  deleteGroupAction: (formData: FormData) => Promise<void>;
  createRuleAction: (formData: FormData) => Promise<void>;
  deleteRuleAction: (formData: FormData) => Promise<void>;
};

// =============================================================================
// CONTAINER
// =============================================================================

export function GroupDetailPanel({
  group,
  rules,
  summary,
  credentials,
  users,
  totalSpend,
  onClose,
  createGroupAction,
  updateGroupAction,
  deleteGroupAction,
  createRuleAction,
  deleteRuleAction,
}: GroupDetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulePreviews, setRulePreviews] = useState<Record<string, RulePreview>>({});

  const { addToast } = useToast();

  // Fetch live previews for all rules when the panel opens with a group
  useEffect(() => {
    if (!group || rules.length === 0) {
      setRulePreviews({});
      return;
    }

    for (const rule of rules) {
      const fd = new FormData();
      fd.set('dimension', rule.dimension);
      fd.set('matchType', rule.matchType);
      fd.set('matchValue', rule.matchValue);
      previewRuleAction(fd).then((result) => {
        const data = result.success ? result.data : null;
        if (data) {
          setRulePreviews((prev) => ({
            ...prev,
            [rule.id]: {
              matchedRecords: data.matchedRecords,
              matchedCost: data.matchedCost,
              sampleValues: data.sampleValues,
            },
          }));
        }
      });
    }
  }, [group?.id]);

  // Toast-wrapped action handlers
  const handleCreateGroup = async (fd: FormData) => {
    await createGroupAction(fd);
    addToast(`Created group "${fd.get('displayName')}"`, 'success');
    onClose();
  };

  const handleUpdateGroup = async (fd: FormData) => {
    await updateGroupAction(fd);
    addToast('Group updated', 'success');
    setEditing(false);
  };

  const handleDeleteGroup = async (fd: FormData) => {
    const name = group?.displayName ?? 'Group';
    await deleteGroupAction(fd);
    addToast(`Deleted ${name} and ${rules.length} rule${rules.length !== 1 ? 's' : ''}`, 'success');
    onClose();
  };

  const handleDeleteRule = async (fd: FormData) => {
    await deleteRuleAction(fd);
    addToast('Rule removed', 'success');
    setConfirmDelete(null);
  };

  const ruleBuilderSlot =
    group !== null ? (
      <RuleBuilder
        groupId={group.id}
        credentials={credentials}
        createRuleAction={createRuleAction}
        onClose={() => setShowAddRule(false)}
      />
    ) : null;

  return (
    <GroupDetailView
      group={group}
      rules={rules}
      summary={summary}
      credentials={credentials}
      users={users}
      totalSpend={totalSpend}
      editing={editing}
      showAddRule={showAddRule}
      confirmDelete={confirmDelete}
      menuOpen={menuOpen}
      rulePreviews={rulePreviews}
      onClose={onClose}
      onEdit={() => { setEditing(true); setMenuOpen(false); }}
      onCancelEdit={() => setEditing(false)}
      onMenuToggle={() => setMenuOpen((v) => !v)}
      onRequestDeleteGroup={() => { setConfirmDelete('group'); setMenuOpen(false); }}
      onRequestDeleteRule={(ruleId) => setConfirmDelete(ruleId)}
      onCancelDelete={() => setConfirmDelete(null)}
      onShowAddRule={() => setShowAddRule(true)}
      onHideAddRule={() => setShowAddRule(false)}
      createGroupAction={handleCreateGroup}
      updateGroupAction={handleUpdateGroup}
      deleteGroupAction={handleDeleteGroup}
      deleteRuleAction={handleDeleteRule}
      ruleBuilderSlot={ruleBuilderSlot}
    />
  );
}
