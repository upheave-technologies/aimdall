'use client';

import { CredentialAssignerView } from '../_components/CredentialAssignerView';
import type { CredentialWithProvider } from '@/modules/cost-tracking/domain/types';

// =============================================================================
// PROPS
// =============================================================================

type CredentialAssignerProps = {
  credentials: CredentialWithProvider[];
  groups: string[];
  assignments: Record<string, string[]>;
  onChange: (assignments: Record<string, string[]>) => void;
};

// =============================================================================
// CONTAINER
// =============================================================================

export function CredentialAssigner({
  credentials,
  groups,
  assignments,
  onChange,
}: CredentialAssignerProps) {
  const handleAssign = (credentialId: string, groupName: string) => {
    const current = assignments[groupName] ?? [];
    if (current.includes(credentialId)) return;
    onChange({ ...assignments, [groupName]: [...current, credentialId] });
  };

  const handleUnassign = (credentialId: string, groupName: string) => {
    const current = assignments[groupName] ?? [];
    onChange({
      ...assignments,
      [groupName]: current.filter((id) => id !== credentialId),
    });
  };

  return (
    <CredentialAssignerView
      credentials={credentials}
      groups={groups}
      assignments={assignments}
      onAssign={handleAssign}
      onUnassign={handleUnassign}
    />
  );
}
