'use client';

import { useState } from 'react';
import { ProviderActionsView } from '../_components/ProviderActionsView';

// =============================================================================
// TYPES
// =============================================================================

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

type ProviderSyncState = 'idle' | 'in_progress' | 'success' | 'error';

type ProviderActionsProps = {
  providerId: string;
  providerName: string;
  syncState: ProviderSyncState;
  triggerSyncAction: (formData: FormData) => Promise<ActionResult<{ synced: number }>>;
  disconnectAction: (formData: FormData) => Promise<void>;
};

// =============================================================================
// CONTAINER
// =============================================================================

export function ProviderActions({
  providerId,
  providerName,
  syncState,
  triggerSyncAction,
  disconnectAction,
}: ProviderActionsProps) {
  // syncState === 'in_progress' from the server means a server-side sync is
  // running (e.g. triggered by the background job or a recent connect). We
  // reflect this in the UI immediately without waiting for the client handler.
  const serverSyncing = syncState === 'in_progress';
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleSync() {
    setSyncing(true);
    setSyncError('');
    const fd = new FormData();
    fd.set('providerId', providerId);
    const result = await triggerSyncAction(fd);
    setSyncing(false);
    if (!result.success) {
      setSyncError(result.error);
    }
  }

  async function handleDisconnect() {
    const confirmed = window.confirm(
      `Disconnect ${providerName}? Historical data will be preserved.`,
    );
    if (!confirmed) return;
    setDisconnecting(true);
    const fd = new FormData();
    fd.set('providerId', providerId);
    await disconnectAction(fd);
    setDisconnecting(false);
  }

  return (
    <ProviderActionsView
      syncing={syncing || serverSyncing}
      disconnecting={disconnecting}
      syncError={syncError}
      onSync={handleSync}
      onDisconnect={handleDisconnect}
    />
  );
}
