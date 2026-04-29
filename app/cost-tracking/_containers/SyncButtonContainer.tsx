'use client';

import { useState } from 'react';
import { SyncButton, type SyncResult } from '../_components/SyncButton';
import { triggerManualSyncAction } from '../actions';

export function SyncButtonContainer() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const outcome = await triggerManualSyncAction();

      if (!outcome.success) {
        setError(outcome.error);
        return;
      }

      setResult(outcome.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SyncButton
      loading={loading}
      result={result}
      error={error}
      onSync={handleSync}
    />
  );
}
