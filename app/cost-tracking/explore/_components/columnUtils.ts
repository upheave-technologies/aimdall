// =============================================================================
// Column Visibility Utilities
// =============================================================================
// Shared logic for parsing, serializing, and resolving column visibility from
// the `columns` URL param. The three-tier preset system works as follows:
//
//   core     — totalCost + totalRequestCount only (absolute minimum)
//   detailed — all primary metrics from selectMetricsForContext() (default)
//   full     — every metric with at least one non-zero value in the result set
//
// Individual overrides are appended after the preset with +/- prefixes:
//   "core,+totalInputTokens,+totalOutputTokens"
//   "detailed,-totalCachedInputTokens"
//   "full,-totalStorageBytes,-totalDurationSeconds"
// =============================================================================

import type { ExplorerMetricConfig, ExplorerResultRow } from '@/modules/cost-tracking/domain/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColumnPreset = 'core' | 'detailed' | 'full';

export type ColumnVisibility = {
  preset: ColumnPreset;
  additions: string[];
  removals: string[];
};

// ---------------------------------------------------------------------------
// Parse / serialize
// ---------------------------------------------------------------------------

const VALID_PRESETS: ColumnPreset[] = ['core', 'detailed', 'full'];

/**
 * Parses the raw `columns` URL param into a structured ColumnVisibility.
 * When param is absent or invalid, returns the default (detailed, no overrides).
 */
export function parseColumnsParam(param: string | undefined): ColumnVisibility {
  const defaultVisibility: ColumnVisibility = {
    preset: 'detailed',
    additions: [],
    removals: [],
  };

  if (!param) return defaultVisibility;

  const parts = param.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return defaultVisibility;

  const presetPart = parts[0];
  const preset: ColumnPreset = VALID_PRESETS.includes(presetPart as ColumnPreset)
    ? (presetPart as ColumnPreset)
    : 'detailed';

  const additions: string[] = [];
  const removals: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('+')) {
      const key = part.slice(1);
      if (key) additions.push(key);
    } else if (part.startsWith('-')) {
      const key = part.slice(1);
      if (key) removals.push(key);
    }
  }

  return { preset, additions, removals };
}

/**
 * Serializes a ColumnVisibility back into a URL param string.
 * If preset is 'detailed' and there are no overrides, returns undefined so the
 * param can be omitted (keeping URLs clean for the default state).
 */
export function serializeColumnsParam(vis: ColumnVisibility): string | undefined {
  const { preset, additions, removals } = vis;

  const isDefault = preset === 'detailed' && additions.length === 0 && removals.length === 0;
  if (isDefault) return undefined;

  const parts: string[] = [preset];
  for (const key of additions) parts.push(`+${key}`);
  for (const key of removals) parts.push(`-${key}`);

  return parts.join(',');
}

// ---------------------------------------------------------------------------
// Preset resolution
// ---------------------------------------------------------------------------

/**
 * Returns the base set of metrics for a given preset before overrides are applied.
 *
 * - core:     totalCost and totalRequestCount only
 * - detailed: all primary-priority metrics
 * - full:     ALL metrics passed in (caller is responsible for pre-filtering to
 *             those with data when using the "full" preset)
 */
function resolvePresetMetrics(
  allMetrics: ExplorerMetricConfig[],
  preset: ColumnPreset,
): ExplorerMetricConfig[] {
  switch (preset) {
    case 'core':
      return allMetrics.filter(
        (m) => m.key === 'totalCost' || m.key === 'totalRequestCount',
      );
    case 'detailed':
      return allMetrics.filter((m) => m.priority === 'primary');
    case 'full':
      return allMetrics;
  }
}

/**
 * Resolves the final ordered list of visible metrics given all available
 * metrics and the current column visibility state.
 *
 * The `allMetrics` passed here should already be filtered to those with data
 * when the preset is 'full' (use `metricsWithData` helper below before calling
 * this function).
 */
export function resolveVisibleMetrics(
  allMetrics: ExplorerMetricConfig[],
  visibility: ColumnVisibility,
): ExplorerMetricConfig[] {
  const { preset, additions, removals } = visibility;

  // Start from the preset base
  const base = resolvePresetMetrics(allMetrics, preset);
  const baseKeys = new Set<string>(base.map((m) => m.key));

  // Apply removals
  for (const key of removals) {
    baseKeys.delete(key);
  }

  // Apply additions — only keys that exist in allMetrics
  for (const key of additions) {
    if (allMetrics.some((m) => m.key === key)) {
      baseKeys.add(key);
    }
  }

  // Return in allMetrics order to preserve stable column ordering
  return allMetrics.filter((m) => baseKeys.has(m.key));
}

// ---------------------------------------------------------------------------
// Data presence helper
// ---------------------------------------------------------------------------

/**
 * Filters allMetrics to those that have at least one non-zero value across the
 * current result rows. The two universal metrics (cost and requestCount) are
 * always included regardless.
 *
 * Use this to populate the "full" preset so users don't see empty columns.
 */
export function metricsWithData(
  rows: ExplorerResultRow[],
  allMetrics: ExplorerMetricConfig[],
): ExplorerMetricConfig[] {
  return allMetrics.filter((m) => {
    if (m.key === 'totalCost' || m.key === 'totalRequestCount') return true;
    return rows.some((row) => {
      const val = row[m.key as keyof ExplorerResultRow];
      return typeof val === 'number' ? val > 0 : parseFloat(String(val)) > 0;
    });
  });
}
