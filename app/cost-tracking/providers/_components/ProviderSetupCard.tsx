// =============================================================================
// ProviderSetupCard — Server Component (pure presentational)
// =============================================================================
// Displays a not-yet-connected provider with a "Connect" button.
// The button opens the wizard via an `onConnect` callback passed from the
// ProviderWizard container (which wraps the page as a client boundary leaf).
// =============================================================================

import { ProviderIcon } from './ProviderIcon';

// =============================================================================
// TYPES
// =============================================================================

type ProviderSetupCardProps = {
  slug: string;
  displayName: string;
  description: string;
  onConnect: () => void;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function ProviderSetupCard({
  slug,
  displayName,
  description,
  onConnect,
}: ProviderSetupCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5">
      {/* Icon + name */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/8 text-foreground/60">
          <ProviderIcon slug={slug} className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold">{displayName}</p>
          <p className="text-xs text-foreground/50">{description}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onConnect}
        className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Connect
      </button>
    </div>
  );
}
