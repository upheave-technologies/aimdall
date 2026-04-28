// =============================================================================
// DashboardSkeleton — Server Component
// =============================================================================
// Animated shimmer skeleton shown while a provider sync is in progress.
// Mirrors the real dashboard layout (KPI tiles + provider breakdown + budget
// status + top cost drivers) so the page looks like it's "filling in" rather
// than loading a different screen.
//
// CSS shimmer is driven by a keyframe defined inline via <style>. No JS or
// 'use client' is needed — CSS animations run in the browser without a client
// bundle.
//
// Accessibility:
//   - Outer wrapper: role="status" aria-live="polite"
//   - Status message region: aria-atomic="true"
//   - Skeleton blocks: aria-hidden="true" (screen readers skip shimmer divs)
// =============================================================================

type DashboardSkeletonProps = {
  /** Display names of providers currently syncing — e.g. ["OpenAI", "Anthropic"] */
  syncingProviderNames: string[];
};

// ---------------------------------------------------------------------------
// Shimmer block — a single skeleton rectangle
// ---------------------------------------------------------------------------

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton-shimmer rounded-lg ${className ?? ''}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Animated dot trio — indeterminate progress indicator
// ---------------------------------------------------------------------------

function PulsingDots() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 [animation:dot-bounce_1.2s_ease-in-out_0s_infinite]" />
      <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 [animation:dot-bounce_1.2s_ease-in-out_0.2s_infinite]" />
      <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 [animation:dot-bounce_1.2s_ease-in-out_0.4s_infinite]" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main skeleton
// ---------------------------------------------------------------------------

export function DashboardSkeleton({ syncingProviderNames }: DashboardSkeletonProps) {
  const providerLabel =
    syncingProviderNames.length === 0
      ? 'your provider'
      : syncingProviderNames.join(', ');

  return (
    <>
      {/* Keyframe definitions — no 'use client' needed */}
      <style>{`
        @keyframes shimmer-sweep {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40%            { transform: scale(1);   opacity: 1;   }
        }
        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            var(--color-foreground, #171717) 0%,
            var(--color-foreground, #171717) 100%
          );
          background: linear-gradient(
            90deg,
            rgba(128,128,128,0.06) 25%,
            rgba(128,128,128,0.14) 50%,
            rgba(128,128,128,0.06) 75%
          );
          background-size: 800px 100%;
          animation: shimmer-sweep 1.6s linear infinite;
        }
      `}</style>

      <main
        role="status"
        aria-live="polite"
        className="mx-auto max-w-7xl px-8 py-8"
      >
        {/* ----------------------------------------------------------------- */}
        {/* Status message                                                      */}
        {/* ----------------------------------------------------------------- */}
        <div
          aria-atomic="true"
          className="mb-8 rounded-2xl border border-foreground/8 bg-foreground/[0.02] px-6 py-5"
        >
          <div className="flex items-start gap-4">
            {/* Animated progress indicator */}
            <div className="mt-0.5 flex-shrink-0">
              <PulsingDots />
            </div>

            <div>
              <p className="text-base font-semibold">
                Connecting to {providerLabel}&hellip;
              </p>
              <p className="mt-1 text-sm text-foreground/55">
                We&apos;re loading everything available from {providerLabel} so your dashboard
                shows patterns, trends, and anomalies from day one. This usually takes
                1&ndash;3 minutes &mdash; feel free to refresh, leave the page, or come back
                later. Your data will be waiting.
              </p>
            </div>
          </div>

          {/* Thin indeterminate progress bar */}
          <div
            aria-hidden="true"
            className="mt-4 h-0.5 w-full overflow-hidden rounded-full bg-foreground/8"
          >
            <div className="h-full w-1/3 rounded-full bg-foreground/25 [animation:shimmer-sweep_1.6s_linear_infinite] skeleton-shimmer" />
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* KPI tile grid — 4 tiles matching the real dashboard               */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-5"
            >
              {/* Label line */}
              <Shimmer className="mb-4 h-3 w-24" />
              {/* Value */}
              <Shimmer className="h-9 w-32" />
              {/* Sub-label */}
              <Shimmer className="mt-2.5 h-3 w-20" />
            </div>
          ))}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Provider breakdown + Budget status — two-column grid               */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Provider breakdown skeleton */}
          <div
            aria-hidden="true"
            className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <Shimmer className="h-4 w-36" />
              <Shimmer className="h-3 w-16" />
            </div>
            <div className="space-y-5">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className="mb-2 flex items-center justify-between">
                    <Shimmer className="h-3.5 w-24" />
                    <Shimmer className="h-3.5 w-16" />
                  </div>
                  <Shimmer className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Budget status skeleton */}
          <div
            aria-hidden="true"
            className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <Shimmer className="h-4 w-28" />
              <Shimmer className="h-3 w-24" />
            </div>
            <div className="space-y-5">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className="mb-2 flex items-center justify-between">
                    <Shimmer className="h-3.5 w-32" />
                    <Shimmer className="h-5 w-16 rounded-full" />
                  </div>
                  <Shimmer className="h-1.5 w-full rounded-full" />
                  <div className="mt-1.5 flex justify-between">
                    <Shimmer className="h-3 w-20" />
                    <Shimmer className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Top cost drivers table skeleton                                    */}
        {/* ----------------------------------------------------------------- */}
        <div
          aria-hidden="true"
          className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-6"
        >
          <div className="mb-5 flex items-center justify-between">
            <Shimmer className="h-4 w-32" />
            <Shimmer className="h-3 w-28" />
          </div>
          <div className="overflow-hidden rounded-xl border border-foreground/8">
            {/* Table header */}
            <div className="border-b border-foreground/8 bg-foreground/[0.02] px-5 py-3">
              <div className="flex items-center gap-8">
                <Shimmer className="h-3 w-16" />
                <Shimmer className="h-3 w-16" />
                <Shimmer className="ml-auto h-3 w-20" />
                <Shimmer className="h-3 w-16" />
                <Shimmer className="h-3 w-16" />
              </div>
            </div>
            {/* Table rows */}
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="border-b border-foreground/5 px-5 py-3 last:border-0"
              >
                <div className="flex items-center gap-8">
                  <Shimmer className="h-3 w-32" />
                  <Shimmer className="h-3 w-20" />
                  <Shimmer className="ml-auto h-3 w-16" />
                  <Shimmer className="h-3 w-14" />
                  <Shimmer className="h-3 w-14" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
