import type { ExplorerMetricConfig } from '@/modules/cost-tracking/domain/types';
import type { ColumnPreset, ColumnVisibility } from './columnUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ColumnControlProps = {
  allMetrics: ExplorerMetricConfig[];
  visibility: ColumnVisibility;
  visibleKeys: Set<string>;
  onPresetClick: (preset: ColumnPreset) => void;
  onMetricToggle: (metricKey: string) => void;
};

// ---------------------------------------------------------------------------
// Preset config
// ---------------------------------------------------------------------------

const PRESETS: { value: ColumnPreset; label: string }[] = [
  { value: 'core', label: 'Core' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'full', label: 'Full' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ColumnControl({
  allMetrics,
  visibility,
  visibleKeys,
  onPresetClick,
  onMetricToggle,
}: ColumnControlProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Label */}
      <span className="text-xs text-foreground/40 select-none mr-1">Columns</span>

      {/* Preset pills */}
      {PRESETS.map(({ value, label }) => {
        const isActive = visibility.preset === value;
        return (
          <button
            key={value}
            onClick={() => onPresetClick(value)}
            className={
              isActive
                ? 'rounded-full px-3 py-1 text-sm font-medium bg-foreground text-background transition-opacity hover:opacity-90'
                : 'rounded-full px-3 py-1 text-sm font-medium border border-foreground/20 text-foreground/60 transition-colors hover:border-foreground/40 hover:text-foreground/80'
            }
          >
            {label}
          </button>
        );
      })}

      {/* Divider */}
      <span className="h-4 w-px bg-foreground/10" aria-hidden="true" />

      {/* Per-metric toggle pills */}
      {allMetrics.map((metric) => {
        const isVisible = visibleKeys.has(metric.key);
        return (
          <button
            key={metric.key}
            onClick={() => onMetricToggle(metric.key)}
            className={
              isVisible
                ? 'rounded-full px-2 py-0.5 text-xs font-medium bg-foreground/15 text-foreground/80 transition-opacity hover:opacity-80'
                : 'rounded-full px-2 py-0.5 text-xs font-medium border border-foreground/10 text-foreground/40 transition-colors hover:border-foreground/20 hover:text-foreground/60'
            }
          >
            {metric.label}
          </button>
        );
      })}
    </div>
  );
}
