// =============================================================================
// Shared view-layer types for attribution _components
// These are UI-only types (not domain types). Domain types come from
// @/modules/cost-tracking/domain/types.
// =============================================================================

export type Toast = {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
};

export type SortBy = 'cost_desc' | 'cost_asc' | 'name_asc' | 'name_desc' | 'type';

export type RulePreview = {
  matchedRecords: number;
  matchedCost: number;
  sampleValues: string[];
};

/**
 * Compact cost format for cards, headlines, and inline display.
 * Adapts precision to magnitude so numbers never overflow layouts.
 *
 *   $0         → "$0"
 *   $0.42      → "$0.42"
 *   $12.50     → "$12.50"
 *   $999.99    → "$999.99"
 *   $1,234     → "$1,234"
 *   $12,345    → "$12,345"
 *   $999,456   → "$999,456"
 *   $1,234,567 → "$1.2M"
 *   $12.3M     → "$12.3M"
 */
export function formatCost(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) {
    return `${sign}$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(abs)}`;
  }
  if (abs === 0) return '$0';
  return `${sign}$${abs.toFixed(2)}`;
}

/** Full-precision format for detail views where exact cents matter. */
export function formatCostFull(n: number): string {
  return '$' + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
