// =============================================================================
// PeriodSelector — server component (structural chrome)
// =============================================================================
// Embeds the PeriodSelectorMenu client island.
//
// Per RFC Section 3.4, layouts do not receive searchParams directly in
// Next.js App Router. The current period label is rendered inside the client
// island, which reads the URL on the client side.
// =============================================================================

import { PeriodSelectorMenu } from '../_containers/PeriodSelectorMenu';

export function PeriodSelector() {
  // The wrapping div provides the bar chrome (padding, right-aligned flex).
  // The outer <div data-period-selector-bar> in layout.tsx has no classes,
  // so this component owns the visual treatment of that bar area.
  return (
    <div className="flex items-center justify-end px-6 py-2 border-b border-foreground/12 bg-foreground/[0.02]">
      <PeriodSelectorMenu />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — rendered by Suspense fallback while the client island hydrates
// ---------------------------------------------------------------------------

export function PeriodSelectorSkeleton() {
  return (
    <div
      className="flex items-center justify-end px-6 py-2 border-b border-foreground/12 bg-foreground/[0.02]"
      aria-hidden="true"
    >
      {/* Trigger button placeholder */}
      <div className="flex items-center gap-2 rounded-lg border border-foreground/20 px-3 py-1.5">
        <div className="h-3.5 w-3.5 rounded bg-foreground/10" />
        <div className="h-3.5 w-24 rounded bg-foreground/10" />
        <div className="h-3.5 w-3.5 rounded bg-foreground/10" />
      </div>
    </div>
  );
}
