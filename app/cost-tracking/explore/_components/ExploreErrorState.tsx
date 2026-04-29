// =============================================================================
// Explore Error State — Presentational Component
// =============================================================================
// Rendered by page.tsx when the main exploreCostData use case fails.
// Frankie is responsible for styling decisions on this component.
// =============================================================================

type ExploreErrorStateProps = {
  message?: string;
};

export function ExploreErrorState({ message }: ExploreErrorStateProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-xl border border-foreground/10 bg-foreground/5 px-8 py-10 text-center">
        <p className="text-base font-medium text-foreground/70">Failed to load explore data.</p>
        <p className="mt-1 text-sm text-foreground/40">{message}</p>
      </div>
    </div>
  );
}
