'use client';

import { useState } from 'react';
import { getLastSyncedAt } from '../actions';

type SyncResult = {
  synced: {
    providerSlug: string;
    usageRecordsCreated: number;
    usageRecordsUpdated: number;
  }[];
  failed: { providerSlug: string; error: string }[];
};

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const startTime = await getLastSyncedAt();

      const res = await fetch('/api/cost-tracking/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }

      const data: SyncResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const totalCreated = result?.synced.reduce((s, p) => s + p.usageRecordsCreated, 0) ?? 0;
  const totalUpdated = result?.synced.reduce((s, p) => s + p.usageRecordsUpdated, 0) ?? 0;

  return (
    <div className="flex items-center gap-3">
      {result && (
        <p className="text-sm text-neutral-400">
          {totalCreated + totalUpdated > 0
            ? `${totalCreated} new, ${totalUpdated} updated`
            : 'Up to date'}
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={handleSync}
        disabled={loading}
        className="rounded bg-white px-4 py-1.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Syncing...' : 'Sync'}
      </button>
    </div>
  );
}
