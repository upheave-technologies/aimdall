type SyncResult = {
  synced: {
    providerSlug: string;
    usageRecordsCreated: number;
    usageRecordsUpdated: number;
  }[];
  failed: { providerSlug: string; error: string }[];
};

export type { SyncResult };

type SyncButtonProps = {
  loading: boolean;
  result: SyncResult | null;
  error: string | null;
  onSync: () => void;
};

export function SyncButton({ loading, result, error, onSync }: SyncButtonProps) {
  const totalCreated = result?.synced.reduce((s, p) => s + p.usageRecordsCreated, 0) ?? 0;
  const totalUpdated = result?.synced.reduce((s, p) => s + p.usageRecordsUpdated, 0) ?? 0;

  return (
    <div className="flex items-center gap-3">
      {result && (
        <p className="text-sm text-foreground/60">
          {totalCreated + totalUpdated > 0
            ? `${totalCreated} new, ${totalUpdated} updated`
            : 'Up to date'}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        onClick={onSync}
        disabled={loading}
        className="rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Syncing...' : 'Sync'}
      </button>
    </div>
  );
}
