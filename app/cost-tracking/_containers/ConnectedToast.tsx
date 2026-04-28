'use client';

// =============================================================================
// ConnectedToast — Client Container
// =============================================================================
// Invisible side-effect island. On mount:
//   1. Reads the `connected` search param (slug of the freshly connected provider).
//   2. If present, fires a success toast with the provider's display name.
//   3. Calls router.replace() to strip the query param so a page refresh
//      does not re-fire the toast.
// Renders nothing — return null.
// =============================================================================

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from './ToastProvider';
import type { DashboardProviderSyncItem } from '../_components/DashboardView';

type ConnectedToastProps = {
  /** Slug from the ?connected= query param (null when param absent). */
  connectedSlug: string | null;
  /** Provider list — used to look up the display name for the slug. */
  providerSyncItems: DashboardProviderSyncItem[];
};

export function ConnectedToast({ connectedSlug, providerSyncItems }: ConnectedToastProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();

  useEffect(() => {
    // Use the live searchParam as the source of truth so the effect fires
    // on real navigation arrival (not just on prop change across refreshes).
    const slug = searchParams.get('connected') ?? connectedSlug;
    if (!slug) return;

    const provider = providerSyncItems.find((p) => p.slug === slug);
    const displayName = provider?.displayName ?? slug;

    addToast(`Connected to ${displayName} — pulling your full history…`, 'success');

    // Strip the ?connected param from the URL so a refresh doesn't re-toast.
    const next = new URLSearchParams(searchParams.toString());
    next.delete('connected');
    const clean = next.toString() ? `?${next.toString()}` : window.location.pathname;
    router.replace(clean);
  }, []); // Run once on mount only.

  return null;
}
