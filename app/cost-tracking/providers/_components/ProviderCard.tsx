// =============================================================================
// ProviderCard — Server Component (pure presentational)
// =============================================================================
// Displays a connected provider with status badge, last sync info, key hint,
// and action buttons (via ProviderActions container slot).
// =============================================================================

import { ProviderIcon } from './ProviderIcon';

// =============================================================================
// TYPES
// =============================================================================

type ProviderStatus = 'active' | 'paused' | 'error' | 'not_connected';

type ProviderCardProps = {
  slug: string;
  displayName: string;
  status: ProviderStatus;
  lastSyncAt?: Date;
  credentialHint?: string;
  // Slot: the ProviderActions container for sync/disconnect interactivity
  actionsSlot: React.ReactNode;
};

// =============================================================================
// HELPERS
// =============================================================================

function StatusBadge({ status }: { status: ProviderStatus }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Connected
      </span>
    );
  }
  if (status === 'paused') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-500">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Paused
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-500">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Error
      </span>
    );
  }
  return null;
}

function relativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs !== 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProviderCard({
  slug,
  displayName,
  status,
  lastSyncAt,
  credentialHint,
  actionsSlot,
}: ProviderCardProps) {
  return (
    <div className="rounded-xl border border-foreground/10 p-5">
      {/* Top row: icon + name + status */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/8 text-foreground/60">
            <ProviderIcon slug={slug} className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">{displayName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground/50">
              {lastSyncAt ? (
                <span>Last synced {relativeTime(lastSyncAt)}</span>
              ) : (
                <span>Never synced</span>
              )}
              {credentialHint && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Key: ...{credentialHint}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <StatusBadge status={status} />
      </div>

      {/* Actions slot */}
      <div className="mt-4 border-t border-foreground/8 pt-4">
        {actionsSlot}
      </div>
    </div>
  );
}
