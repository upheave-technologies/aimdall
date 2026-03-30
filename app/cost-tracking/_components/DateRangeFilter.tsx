export type DateRangePreset = {
  label: string;
  days: number;
};

type DateRangeFilterProps = {
  presets: DateRangePreset[];
  activePresetDays: number | null;
  currentFrom: string;
  currentTo: string;
  todayStr: string;
  onPresetClick: (days: number) => void;
  onFromChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function DateRangeFilter({
  presets,
  activePresetDays,
  currentFrom,
  currentTo,
  todayStr,
  onPresetClick,
  onFromChange,
  onToChange,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Preset pills */}
      <div className="flex items-center gap-1.5">
        {presets.map((preset) => {
          const isActive = activePresetDays === preset.days;
          return (
            <button
              key={preset.days}
              onClick={() => onPresetClick(preset.days)}
              className={
                isActive
                  ? 'rounded-full px-3 py-1 text-sm font-medium bg-foreground text-background transition-opacity hover:opacity-90'
                  : 'rounded-full px-3 py-1 text-sm font-medium border border-foreground/20 text-foreground/60 transition-colors hover:border-foreground/40 hover:text-foreground/80'
              }
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <span className="hidden h-4 w-px bg-foreground/10 sm:block" aria-hidden="true" />

      {/* Custom date inputs */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-foreground/40 select-none">From</label>
        <input
          type="date"
          value={currentFrom}
          onChange={onFromChange}
          max={currentTo || todayStr}
          className="rounded border border-foreground/20 bg-transparent px-2 py-1 text-sm text-foreground/80 focus:border-foreground/40 focus:outline-none"
        />
        <label className="text-xs text-foreground/40 select-none">To</label>
        <input
          type="date"
          value={currentTo}
          onChange={onToChange}
          min={currentFrom || undefined}
          max={todayStr}
          className="rounded border border-foreground/20 bg-transparent px-2 py-1 text-sm text-foreground/80 focus:border-foreground/40 focus:outline-none"
        />
      </div>
    </div>
  );
}
