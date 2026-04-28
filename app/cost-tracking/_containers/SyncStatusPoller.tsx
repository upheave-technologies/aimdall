'use client';

// =============================================================================
// SyncStatusPoller — Client Container
// =============================================================================
// Invisible side-effect island. Polls getSyncStatusAction every 5 seconds
// when at least one provider is 'in_progress'. When a provider transitions from
// 'in_progress' to 'success' or 'error':
//   - Calls router.refresh() to trigger a Server Component re-render.
//   - Fires a toast via useToast().
// Stops polling when no provider is in_progress. Cleans up on unmount.
// Renders nothing — return null.
// =============================================================================

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSyncStatusAction } from '../providers/actions';
import { useToast } from './ToastProvider';
import type { DashboardProviderSyncItem } from '../_components/DashboardView';

type SyncStatusPollerProps = {
  /** Initial provider sync states passed from the Server Component. */
  initialProviders: DashboardProviderSyncItem[];
};

const POLL_INTERVAL_MS = 5_000;

export function SyncStatusPoller({ initialProviders }: SyncStatusPollerProps) {
  const router = useRouter();
  const { addToast } = useToast();

  // Track the last-known state per provider slug so we can detect transitions.
  const prevStatesRef = useRef<Map<string, string>>(
    new Map(initialProviders.map((p) => [p.slug, p.syncState])),
  );

  // Build a display-name lookup from initial props (slugs don't change).
  const displayNamesRef = useRef<Map<string, string>>(
    new Map(initialProviders.map((p) => [p.slug, p.displayName])),
  );

  useEffect(() => {
    // Check immediately whether polling is needed.
    const hasInProgress = () =>
      [...prevStatesRef.current.values()].some((s) => s === 'in_progress');

    if (!hasInProgress()) {
      // Nothing to watch right now — no interval needed.
      return;
    }

    const intervalId = setInterval(async () => {
      let result;
      try {
        result = await getSyncStatusAction();
      } catch {
        // Network hiccup — skip this tick, keep polling.
        return;
      }

      if (!result.ok) {
        // Server-side error — skip tick.
        return;
      }

      let didTransition = false;

      for (const provider of result.providers) {
        const prev = prevStatesRef.current.get(provider.slug) ?? 'idle';
        const next = provider.syncState;

        if (prev === 'in_progress' && next !== 'in_progress') {
          didTransition = true;
          const displayName =
            displayNamesRef.current.get(provider.slug) ?? provider.slug;

          if (next === 'success') {
            addToast('Sync complete — your usage data is ready.', 'success');
          } else if (next === 'error') {
            addToast(
              `Sync failed for ${displayName}. Check the providers page.`,
              'error',
            );
          }
        }

        // Update tracked state.
        prevStatesRef.current.set(provider.slug, next);
      }

      if (didTransition) {
        // Trigger Server Component re-render — skeleton swaps for real dashboard.
        router.refresh();
      }

      // Stop the interval if nothing is in_progress anymore.
      if (!hasInProgress()) {
        clearInterval(intervalId);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [router, addToast]);

  return null;
}
