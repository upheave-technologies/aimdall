// =============================================================================
// ProviderActionsView — Server Component (pure presentational)
// =============================================================================
// Renders the Sync Now + Disconnect buttons for a connected provider card.
// All state and handlers are managed by ProviderActions container.
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

type ProviderActionsViewProps = {
  syncing: boolean;
  disconnecting: boolean;
  syncError: string;
  onSync: () => void;
  onDisconnect: () => void;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function ProviderActionsView({
  syncing,
  disconnecting,
  syncError,
  onSync,
  onDisconnect,
}: ProviderActionsViewProps) {
  return (
    <div className="flex flex-col gap-2">
      {syncError && (
        <p className="text-xs text-red-500">{syncError}</p>
      )}

      <div className="flex gap-2">
        {/* Sync Now */}
        <button
          type="button"
          onClick={onSync}
          disabled={syncing || disconnecting}
          className="flex items-center gap-1.5 rounded-xl border border-foreground/15 px-4 py-2.5 text-sm text-foreground/60 transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {syncing ? (
            <>
              <svg
                className="h-3.5 w-3.5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8V4" />
              </svg>
              Syncing...
            </>
          ) : (
            <>
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 9A8 8 0 006.93 6.93M4 15a8 8 0 0013.07 2.07" />
              </svg>
              Sync Now
            </>
          )}
        </button>

        {/* Disconnect */}
        <button
          type="button"
          onClick={onDisconnect}
          disabled={syncing || disconnecting}
          className="flex items-center gap-1.5 rounded-xl border border-red-500/20 px-4 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-500/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {disconnecting ? (
            <>
              <svg
                className="h-3.5 w-3.5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8V4" />
              </svg>
              Disconnecting...
            </>
          ) : (
            'Disconnect'
          )}
        </button>
      </div>
    </div>
  );
}
