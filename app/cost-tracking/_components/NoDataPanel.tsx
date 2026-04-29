// =============================================================================
// NoDataPanel — Server Component
// =============================================================================
// Shown when providers are connected, sync is not in progress, but there is
// zero usage spend data. Edge cases: sync completed with zero records, or
// sync errored out.
//
// Renders the connected provider names and a "Sync now" form that calls
// triggerSyncAction. Each provider gets its own form so each button targets
// exactly one provider.
// =============================================================================

import { triggerSyncAction } from '../providers/actions';
import type { DashboardProviderSyncItem } from './DashboardView';

type NoDataPanelProps = {
  connectedProviders: DashboardProviderSyncItem[];
};

// Void wrapper — <form action> requires (formData: FormData) => void | Promise<void>.
async function syncAction(formData: FormData): Promise<void> {
  'use server';
  await triggerSyncAction(formData);
}

export function NoDataPanel({ connectedProviders }: NoDataPanelProps) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-8 text-center">
        {/* Icon */}
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/5">
          <svg
            className="h-7 w-7 text-foreground/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
        </div>

        <h1 className="text-xl font-bold tracking-tight">No usage data yet</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-foreground/50">
          Your{' '}
          {connectedProviders.length === 1
            ? connectedProviders[0].displayName
            : connectedProviders.map((p) => p.displayName).join(', ')}{' '}
          {connectedProviders.length === 1 ? 'connection is' : 'connections are'} active, but
          no usage records have been imported yet. Run a sync to pull your latest data.
        </p>

        {/* Sync buttons — one server-action form per provider */}
        {connectedProviders.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {connectedProviders.map((provider) =>
              provider.providerId ? (
                <form key={provider.slug} action={syncAction}>
                  <input type="hidden" name="providerId" value={provider.providerId} />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                      />
                    </svg>
                    Sync {provider.displayName}
                  </button>
                </form>
              ) : null,
            )}
          </div>
        )}

        {/* Providers page fallback */}
        <p className="mt-6 text-xs text-foreground/40">
          Or visit the{' '}
          <a
            href="/cost-tracking/providers"
            className="underline underline-offset-2 hover:text-foreground/60"
          >
            Providers page
          </a>{' '}
          to manage your connections.
        </p>
      </div>
    </div>
  );
}
