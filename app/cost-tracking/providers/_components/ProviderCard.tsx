// =============================================================================
// ProviderCard — Server Component (pure presentational)
// =============================================================================
// Displays a connected provider with status badge, last sync info, key hint,
// sync error banner, and action buttons (via ProviderActions container slot).
//
// All data comes from props — no hooks, no fetches.
// The sync-error banner's "Retry" button uses a plain <form action={...}> which
// works in Server Components without any client boundary.
// =============================================================================

import { ProviderIcon } from './ProviderIcon';

// =============================================================================
// TYPES
// =============================================================================

type ProviderStatus = 'active' | 'paused' | 'error' | 'not_connected';
type ProviderSyncState = 'idle' | 'in_progress' | 'success' | 'error';

type ProviderCardProps = {
  slug: string;
  displayName: string;
  status: ProviderStatus;
  lastSyncAt?: Date;
  credentialHint?: string;
  providerId?: string;
  syncState: ProviderSyncState;
  syncError: string | null;
  // Void wrapper of triggerSyncAction — safe to use directly as <form action>
  syncAction: (formData: FormData) => Promise<void>;
  // Slot: the ProviderActions container for sync/disconnect interactivity
  actionsSlot: React.ReactNode;
};

// =============================================================================
// HELPERS
// =============================================================================

// Key prefix hints per provider slug — purely cosmetic.
const KEY_PREFIX: Record<string, string> = {
  openai: 'sk-…',
  anthropic: 'sk-ant-…',
  google_vertex: 'sa-…',
  google_gemini: 'AIza…',
};

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSecs = Math.floor(diffMs / 1_000);
  if (diffSecs < 60) return 'just now';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} hr ago`;
  // Older: show "MMM D" e.g. "Apr 3"
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function StatusBadge({
  status,
  syncState,
}: {
  status: ProviderStatus;
  syncState: ProviderSyncState;
}) {
  // Syncing overrides all other statuses while in progress
  if (syncState === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-500">
        {/* Animated spinner dot */}
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
        </span>
        Syncing…
      </span>
    );
  }

  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
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

function LastSyncLine({
  lastSyncAt,
  syncState,
}: {
  lastSyncAt: Date | undefined;
  syncState: ProviderSyncState;
}) {
  if (!lastSyncAt && syncState === 'in_progress') {
    return <span>Initial sync in progress…</span>;
  }
  if (!lastSyncAt) {
    return <span>Not yet synced</span>;
  }
  return <span>Synced {formatRelativeTime(lastSyncAt)}</span>;
}

function SyncErrorBanner({
  syncError,
  providerId,
  syncAction,
}: {
  syncError: string;
  providerId?: string;
  syncAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-red-500/8 px-4 py-3">
      {/* Warning icon */}
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-red-500">Sync failed</p>
        <p className="mt-0.5 text-xs text-red-500/80 break-words">{syncError}</p>
      </div>

      {providerId && (
        <form action={syncAction} className="shrink-0">
          <input type="hidden" name="providerId" value={providerId} />
          <button
            type="submit"
            className="rounded-lg border border-red-500/25 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
          >
            Retry
          </button>
        </form>
      )}
    </div>
  );
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
  providerId,
  syncState,
  syncError,
  syncAction,
  actionsSlot,
}: ProviderCardProps) {
  const keyPrefix = KEY_PREFIX[slug];
  const hasError = syncState === 'error' && syncError;

  return (
    <div className="rounded-xl border border-foreground/10 p-5">
      {/* Top row: icon + name + meta + status badge */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/8 text-foreground/60">
            <ProviderIcon slug={slug} className="h-5 w-5" />
          </div>

          <div>
            <p className="font-semibold">{displayName}</p>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground/50">
              {/* Last sync line — hidden when there is an error (banner takes over) */}
              {!hasError && (
                <LastSyncLine lastSyncAt={lastSyncAt} syncState={syncState} />
              )}

              {/* Masked credential hint */}
              {credentialHint && (
                <>
                  {!hasError && <span aria-hidden="true">·</span>}
                  <span className="font-mono">
                    {keyPrefix ? `${keyPrefix}${credentialHint}` : `…${credentialHint}`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <StatusBadge status={status} syncState={syncState} />
      </div>

      {/* Sync error banner — shown only when syncState === 'error' */}
      {hasError && (
        <div className="mt-4">
          <SyncErrorBanner
            syncError={syncError}
            providerId={providerId}
            syncAction={syncAction}
          />
        </div>
      )}

      {/* Actions slot */}
      <div className="mt-4 border-t border-foreground/8 pt-4">
        {actionsSlot}
      </div>
    </div>
  );
}
