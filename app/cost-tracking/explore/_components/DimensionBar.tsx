// =============================================================================
// DimensionBar — The control surface for the Explore feature
// =============================================================================
// A sticky horizontal bar with:
//   - One pill per dimension (ungrouped / grouped / filtered states)
//   - Reset button when any non-default state is active
//
// Period selection is handled exclusively by the layout-level PeriodSelector.
// Pure presentational. All state lives in ExploreSurfaceContainer.
// No hooks. No 'use client'.
// =============================================================================

import type { ExplorerDimension } from '@/modules/cost-tracking/domain/types';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

type DimensionState = 'ungrouped' | 'grouped' | 'filtered';

type DimensionEntry = {
  dimension: ExplorerDimension;
  label: string;
  state: DimensionState;
  filterValue?: string;
  filterLabel?: string;
};

export type DimensionBarProps = {
  dimensions: DimensionEntry[];
  onGroupByToggle: (dimension: ExplorerDimension) => void;
  onClearFilter: (dimension: ExplorerDimension) => void;
  onFilterToGrouped: (dimension: ExplorerDimension) => void;

  onReset: () => void;
  isDirty: boolean;
};

// =============================================================================
// SECTION 2: DIMENSION PILL
// =============================================================================

function DimensionPill({
  entry,
  onGroupByToggle,
  onClearFilter,
  onFilterToGrouped,
}: {
  entry: DimensionEntry;
  onGroupByToggle: (dim: ExplorerDimension) => void;
  onClearFilter: (dim: ExplorerDimension) => void;
  onFilterToGrouped: (dim: ExplorerDimension) => void;
}) {
  const { dimension, label, state, filterLabel } = entry;

  if (state === 'filtered') {
    return (
      <div className="flex items-center gap-0.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400">
        <button
          onClick={() => onFilterToGrouped(dimension)}
          aria-label={`Pivot ${label} from filter to grouped view`}
          className="flex items-center gap-1.5 transition-opacity hover:opacity-75"
        >
          <span className="text-blue-500/60 text-xs font-normal">{label}:</span>
          <span className="max-w-[100px] truncate">{filterLabel ?? entry.filterValue}</span>
        </button>
        <button
          onClick={() => onClearFilter(dimension)}
          aria-label={`Clear ${label} filter`}
          className="ml-1 rounded-full p-0.5 transition-colors hover:bg-blue-500/20"
        >
          <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3" aria-hidden="true">
            <path
              d="M3 3L9 9M9 3L3 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    );
  }

  if (state === 'grouped') {
    return (
      <button
        onClick={() => onGroupByToggle(dimension)}
        aria-pressed={true}
        aria-label={`Ungroup by ${label}`}
        className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-80"
      >
        {label}
        <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3 opacity-70" aria-hidden="true">
          <path
            d="M2 4.5L6 2L10 4.5M2 7.5L6 10L10 7.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );
  }

  // ungrouped
  return (
    <button
      onClick={() => onGroupByToggle(dimension)}
      aria-pressed={false}
      aria-label={`Group by ${label}`}
      className="rounded-full px-3 py-1.5 text-sm text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
    >
      {label}
    </button>
  );
}

// =============================================================================
// SECTION 3: DIMENSION BAR
// =============================================================================

export function DimensionBar({
  dimensions,
  onGroupByToggle,
  onClearFilter,
  onFilterToGrouped,
  onReset,
  isDirty,
}: DimensionBarProps) {
  return (
    <div className="sticky top-0 z-40 border-b border-foreground/10 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-1.5 px-6 py-3">
        {/* Dimension pills */}
        {dimensions.map((d) => (
          <DimensionPill
            key={d.dimension}
            entry={d}
            onGroupByToggle={onGroupByToggle}
            onClearFilter={onClearFilter}
            onFilterToGrouped={onFilterToGrouped}
          />
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Reset */}
        {isDirty && (
          <button
            onClick={onReset}
            aria-label="Reset all filters and grouping"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground/70"
          >
            <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3" aria-hidden="true">
              <path
                d="M10 2L8 4H10.5C10.5 6.49 8.49 8.5 6 8.5C4.87 8.5 3.84 8.07 3.07 7.36L2.12 8.31C3.12 9.27 4.49 9.86 6 9.86C9.22 9.86 11.85 7.22 11.85 4H14L10 0V2Z"
                fill="currentColor"
                opacity="0.6"
              />
            </svg>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
