import { DIMENSION_LABELS } from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActiveFilter = {
  dimension: string;
  value: string;
  label?: string;
};

export type FilterDropdownState = 'closed' | 'dimension' | 'value';

export type FilterValue = {
  value: string;
  label: string;
};

type FilterBarProps = {
  filters: ActiveFilter[];
  availableDimensions: string[];
  dropdownState: FilterDropdownState;
  selectedDimension: string | null;
  availableValues: FilterValue[];
  loadingValues: boolean;
  valuesError: string | null;
  onRemoveFilter: (dimension: string) => void;
  onOpenDropdown: () => void;
  onCloseDropdown: () => void;
  onDimensionSelect: (dimension: string) => void;
  onValueSelect: (value: string) => void;
  onBackToDimension: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FilterBar({
  filters,
  availableDimensions,
  dropdownState,
  selectedDimension,
  availableValues,
  loadingValues,
  valuesError,
  onRemoveFilter,
  onOpenDropdown,
  onCloseDropdown,
  onDimensionSelect,
  onValueSelect,
  onBackToDimension,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Active filter chips */}
      {filters.map((filter) => (
        <span
          key={filter.dimension}
          className="inline-flex items-center gap-1 rounded-full border border-foreground/20 bg-foreground/5 px-2.5 py-1 text-xs text-foreground/80"
        >
          <span className="text-foreground/50">{DIMENSION_LABELS[filter.dimension] ?? filter.dimension}:</span>
          <span>{filter.label ?? filter.value}</span>
          <button
            onClick={() => onRemoveFilter(filter.dimension)}
            className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-foreground/40 transition-colors hover:bg-foreground/10 hover:text-foreground/80"
            aria-label={`Remove ${filter.dimension} filter`}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
              <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}

      {/* Add Filter control */}
      {availableDimensions.length > 0 && (
        <div className="relative">
          <button
            onClick={() => dropdownState === 'closed' ? onOpenDropdown() : onCloseDropdown()}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/20 px-2.5 py-1 text-xs text-foreground/60 transition-colors hover:border-foreground/40 hover:text-foreground/80"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M5 1V9M1 5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Add filter
          </button>

          {dropdownState === 'dimension' && (
            <>
              <div className="fixed inset-0 z-10" onClick={onCloseDropdown} />
              <div className="absolute left-0 top-full z-20 mt-1 min-w-36 rounded-lg border border-foreground/10 bg-background py-1 shadow-lg">
                {availableDimensions.map((dim) => (
                  <button
                    key={dim}
                    onClick={() => onDimensionSelect(dim)}
                    className="w-full px-3 py-1.5 text-left text-sm text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
                  >
                    {DIMENSION_LABELS[dim]}
                  </button>
                ))}
              </div>
            </>
          )}

          {dropdownState === 'value' && (
            <>
              <div className="fixed inset-0 z-10" onClick={onCloseDropdown} />
              <div className="absolute left-0 top-full z-20 mt-1 min-w-44 rounded-lg border border-foreground/10 bg-background py-1 shadow-lg">
                {/* Back header */}
                <div className="flex items-center gap-1 border-b border-foreground/10 px-3 py-1.5">
                  <button
                    onClick={onBackToDimension}
                    className="text-xs text-foreground/50 transition-colors hover:text-foreground/80"
                  >
                    ← {selectedDimension ? (DIMENSION_LABELS[selectedDimension] ?? selectedDimension) : ''}
                  </button>
                </div>

                {loadingValues && (
                  <div className="px-3 py-2 text-sm text-foreground/40">Loading...</div>
                )}

                {valuesError && (
                  <div className="px-3 py-2 text-sm text-destructive">{valuesError}</div>
                )}

                {!loadingValues && !valuesError && availableValues.length === 0 && (
                  <div className="px-3 py-2 text-sm text-foreground/40">No values found</div>
                )}

                {availableValues.map((v) => (
                  <button
                    key={v.value}
                    onClick={() => onValueSelect(v.value)}
                    className="w-full px-3 py-1.5 text-left text-sm text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
