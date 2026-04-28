// =============================================================================
// ProvidersPageView — Server Component (pure presentational)
// =============================================================================
// Main page layout for /cost-tracking/providers.
// Renders connected providers (with ProviderCard + ProviderActions slot) and
// available providers (via ProviderWizard container which owns the wizard
// state and passes "Connect" callbacks to setup cards).
// =============================================================================

import Link from 'next/link';
import { ProviderCard } from './ProviderCard';
import { ProviderActions } from '../_containers/ProviderActions';
import { ProviderWizard } from '../_containers/ProviderWizard';

// =============================================================================
// TYPES
// =============================================================================

// Mirrors ProviderStatusItem from the use case — defined here to avoid
// importing from the application layer (forbidden in frontend code).
type ProviderStatus = 'active' | 'paused' | 'error' | 'not_connected';
type ProviderSyncState = 'idle' | 'in_progress' | 'success' | 'error';

export type ProviderStatusItem = {
  slug: string;
  displayName: string;
  description: string;
  connected: boolean;
  status: ProviderStatus;
  lastSyncAt?: Date;
  credentialHint?: string;
  providerId?: string;
  credentialId?: string;
  syncState: ProviderSyncState;
  syncStartedAt: Date | null;
  syncError: string | null;
};

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

type ProvidersPageViewProps = {
  providers: ProviderStatusItem[];
  connectAction: (formData: FormData) => Promise<void>;
  disconnectAction: (formData: FormData) => Promise<void>;
  testConnectionAction: (formData: FormData) => Promise<ActionResult<{ detail?: string }>>;
  // On success, connectProviderAction redirects — it never returns a data payload.
  connectProviderAction: (formData: FormData) => Promise<ActionResult<never>>;
  triggerSyncAction: (formData: FormData) => Promise<ActionResult<{ synced: number }>>;
  // Void wrapper of triggerSyncAction — safe to use directly as a form action
  syncAction: (formData: FormData) => Promise<void>;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function ProvidersPageView({
  providers,
  disconnectAction,
  testConnectionAction,
  connectProviderAction,
  triggerSyncAction,
  syncAction,
}: ProvidersPageViewProps) {
  const connectedProviders = providers.filter((p) => p.connected);
  const availableProviders = providers.filter((p) => !p.connected);

  // ----------------------------------------------------------------
  // Empty state: zero providers connected
  // ----------------------------------------------------------------
  if (connectedProviders.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-20 text-center">
        {/* Back link */}
        <div className="mb-10 text-left">
          <Link href="/cost-tracking" className="text-sm text-foreground/50 hover:text-foreground/70">
            ← Cost Tracking
          </Link>
        </div>

        {/* Hero icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-foreground/[0.08]">
          <svg
            className="h-8 w-8 text-foreground/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Connect your first AI provider</h1>
        <p className="mt-3 text-sm text-foreground/60">
          Start tracking costs in under 5 minutes. Connect OpenAI, Anthropic, or Google Cloud.
        </p>

        {/* Provider setup cards rendered through ProviderWizard container */}
        <div className="mt-10">
          <ProviderWizard
            testConnectionAction={testConnectionAction}
            connectProviderAction={connectProviderAction}
            availableProviders={availableProviders.map((p) => ({
              slug: p.slug,
              displayName: p.displayName,
              description: p.description,
            }))}
          />
        </div>
      </main>
    );
  }

  // ----------------------------------------------------------------
  // Full view: some providers connected
  // ----------------------------------------------------------------
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Providers</h1>
          <p className="mt-1 text-sm text-foreground/50">
            Connect your AI providers to start tracking costs.
          </p>
        </div>
        <Link href="/cost-tracking" className="text-sm text-foreground/50 hover:text-foreground/70">
          ← Cost Tracking
        </Link>
      </div>

      {/* Connected section */}
      <section className="mb-10">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-foreground/50">
          Connected
        </h2>
        <div className="grid gap-4">
          {connectedProviders.map((p) => (
            <ProviderCard
              key={p.slug}
              slug={p.slug}
              displayName={p.displayName}
              status={p.status}
              lastSyncAt={p.lastSyncAt}
              credentialHint={p.credentialHint}
              providerId={p.providerId}
              syncState={p.syncState}
              syncError={p.syncError}
              syncAction={syncAction}
              actionsSlot={
                p.providerId ? (
                  <ProviderActions
                    providerId={p.providerId}
                    providerName={p.displayName}
                    syncState={p.syncState}
                    triggerSyncAction={triggerSyncAction}
                    disconnectAction={disconnectAction}
                  />
                ) : null
              }
            />
          ))}
        </div>
      </section>

      {/* Available section — only shown if there are still providers to connect */}
      {availableProviders.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-foreground/50">
            Available
          </h2>
          <ProviderWizard
            testConnectionAction={testConnectionAction}
            connectProviderAction={connectProviderAction}
            availableProviders={availableProviders.map((p) => ({
              slug: p.slug,
              displayName: p.displayName,
              description: p.description,
            }))}
          />
        </section>
      )}
    </main>
  );
}
