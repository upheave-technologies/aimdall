// =============================================================================
// PeriodSelectorView — presentational component
// =============================================================================
// Pure props → JSX. No state, no hooks beyond useFormStatus.
// Data attributes remain as stable hook points.
// =============================================================================

import type { PeriodPreset } from '@/modules/cost-tracking/domain/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PresetOption = {
  token: PeriodPreset;
  label: string;
};

export type PeriodSelectorViewProps = {
  /** Human-readable label for the currently active period (e.g. "Last 30 days"). */
  currentLabel: string;
  /** Whether the dropdown is open. */
  open: boolean;
  /** The currently active preset token. */
  currentPeriod: PeriodPreset;
  /** All available preset options (custom excluded — handled separately below). */
  presetOptions: PresetOption[];
  /** Current value of the custom "from" date input. */
  customFrom: string;
  /** Current value of the custom "to" date input. */
  customTo: string;
  /** Upper bound for date inputs (today as YYYY-MM-DD). */
  todayStr: string;
  /** Fired when user clicks the trigger button to open/close the dropdown. */
  onToggle: () => void;
  /** Fired when user selects a non-custom preset. */
  onPresetSelect: (token: PeriodPreset) => void;
  /** Fired when the custom "from" input changes. */
  onCustomFromChange: (value: string) => void;
  /** Fired when the custom "to" input changes. */
  onCustomToChange: (value: string) => void;
  /** Fired when user clicks Apply for a custom range. */
  onCustomSubmit: () => void;
};

// ---------------------------------------------------------------------------
// Chevron icon
// ---------------------------------------------------------------------------

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 text-foreground/40 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Calendar icon for the trigger
// ---------------------------------------------------------------------------

function CalendarIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 text-foreground/40"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Check icon for active preset
// ---------------------------------------------------------------------------

function CheckIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 text-foreground"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PeriodSelectorView({
  currentLabel,
  open,
  currentPeriod,
  presetOptions,
  customFrom,
  customTo,
  todayStr,
  onToggle,
  onPresetSelect,
  onCustomFromChange,
  onCustomToChange,
  onCustomSubmit,
}: PeriodSelectorViewProps) {
  // Non-custom presets
  const standardPresets = presetOptions.filter((o) => o.token !== 'custom');
  // Custom option meta
  const customOption = presetOptions.find((o) => o.token === 'custom');

  const isCustomActive = currentPeriod === 'custom';
  const canApply = Boolean(customFrom && customTo);

  return (
    <div data-period-selector className="relative">
      {/* ------------------------------------------------------------------ */}
      {/* Trigger button                                                       */}
      {/* ------------------------------------------------------------------ */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-period-trigger
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
          open
            ? 'border-foreground/30 bg-foreground/8 text-foreground'
            : 'border-foreground/20 bg-transparent text-foreground/70 hover:border-foreground/30 hover:bg-foreground/5 hover:text-foreground'
        }`}
      >
        <CalendarIcon />
        <span className="font-medium">{currentLabel}</span>
        <ChevronDown open={open} />
      </button>

      {/* ------------------------------------------------------------------ */}
      {/* Dropdown panel                                                       */}
      {/* ------------------------------------------------------------------ */}
      {open && (
        <div
          role="listbox"
          aria-label="Select time period"
          data-period-menu
          className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-2xl border border-foreground/10 bg-background shadow-lg"
        >
          {/* Standard presets */}
          <div className="py-1">
            {standardPresets.map((option) => {
              const isActive = currentPeriod === option.token;
              return (
                <button
                  key={option.token}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => onPresetSelect(option.token)}
                  data-period-option={option.token}
                  className={`flex w-full items-center justify-between px-3.5 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-foreground/6 font-medium text-foreground'
                      : 'text-foreground/70 hover:bg-foreground/5 hover:text-foreground'
                  }`}
                >
                  <span>{option.label}</span>
                  {isActive && <CheckIcon />}
                </button>
              );
            })}
          </div>

          {/* Custom range section — separated by a divider */}
          <div
            data-period-custom
            className={`border-t border-foreground/8 px-3.5 py-3 ${isCustomActive ? 'bg-foreground/[0.02]' : ''}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span
                className={`text-xs font-medium ${isCustomActive ? 'text-foreground' : 'text-foreground/50'}`}
              >
                {customOption?.label ?? 'Custom range'}
              </span>
              {isCustomActive && <CheckIcon />}
            </div>

            {/* From/to inputs */}
            <div className="space-y-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="period-from"
                  className="text-xs text-foreground/40 select-none"
                >
                  From
                </label>
                <input
                  id="period-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => onCustomFromChange(e.target.value)}
                  max={customTo || todayStr}
                  className="w-full rounded border border-foreground/20 bg-transparent px-2 py-1 text-xs text-foreground/80 focus:border-foreground/40 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="period-to"
                  className="text-xs text-foreground/40 select-none"
                >
                  To
                </label>
                <input
                  id="period-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => onCustomToChange(e.target.value)}
                  min={customFrom || undefined}
                  max={todayStr}
                  className="w-full rounded border border-foreground/20 bg-transparent px-2 py-1 text-xs text-foreground/80 focus:border-foreground/40 focus:outline-none"
                />
              </div>
            </div>

            {/* Apply button */}
            <button
              type="button"
              onClick={onCustomSubmit}
              disabled={!canApply}
              data-period-apply
              className="mt-3 w-full rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
