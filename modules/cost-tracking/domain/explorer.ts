// =============================================================================
// Domain — Explorer Types and Context-Adaptive Metric Selection
// =============================================================================
// The cost explorer feature allows users to slice and dice usage data across
// nine groupable dimensions with configurable filters, pagination, and sorting.
//
// Design decisions:
//   - ExplorerQuery is a pure input descriptor — no behaviour, no side effects.
//   - ExplorerResult carries both the paginated rows and the full-range time
//     series so a single repository call can feed both table and chart views.
//   - totalCost and totalRequestCount on ExplorerResult are aggregates across
//     ALL rows (not just the current page) so headline KPI cards are always
//     accurate regardless of pagination state.
//   - serviceCategories on ExplorerResult is the union of every category
//     present across ALL rows. This is the input to selectMetricsForContext
//     so headline metric columns reflect the full result set, not just the
//     current page.
//   - totalCost is a string to preserve numeric(16,8) precision; consumers
//     should use the 'cost' format key when displaying it.
//   - selectMetricsForContext is a pure function — same categories always
//     produces the same metric config list. The UI layer never makes this
//     decision itself.
//   - Zero external imports — all values are plain TypeScript primitives or
//     types imported from sibling domain files.
// =============================================================================

import { ServiceCategory } from './model';

// =============================================================================
// SECTION 1: QUERY TYPES
// =============================================================================

/**
 * All dimensions on which results can be grouped or filtered.
 * These correspond to the foreign-key and enum columns on the usage records
 * table that carry meaningful business identity.
 */
export type ExplorerDimension =
  | 'provider'
  | 'model'
  | 'credential'
  | 'segment'
  | 'serviceCategory'
  | 'serviceTier'
  | 'contextTier'
  | 'region'
  | 'attributionGroup';

/**
 * A single equality filter applied to a query.
 * Multiple filters are combined with AND logic.
 */
export type ExplorerFilter = {
  dimension: ExplorerDimension;
  /** The raw ID or slug being filtered on (provider ID, model slug, etc.). */
  value: string;
};

/**
 * The full input descriptor for an explorer query.
 *
 * When groupBy is absent the result is a single flat aggregate row covering
 * the entire filtered date range. When groupBy is present there is one row
 * per distinct value of that dimension.
 */
export type ExplorerQuery = {
  groupBy?: ExplorerDimension;
  /** AND-combined filters applied before grouping. */
  filters: ExplorerFilter[];
  startDate: Date;
  endDate: Date;
  /** 1-based page index. */
  page: number;
  pageSize: number;
  /** Default desc (highest cost first). */
  sortDirection: 'asc' | 'desc';
};

// =============================================================================
// SECTION 2: RESULT TYPES
// =============================================================================

/**
 * A single aggregated row in an explorer result set.
 *
 * groupKey holds the raw dimension value (e.g. a provider UUID, a model slug).
 * groupLabel holds the human-readable display name for that value.
 *
 * Metric fields use number. totalCost is a string to preserve numeric(16,8)
 * precision from the database column. All metric fields are 0 (not optional)
 * so consumers can render tables without null-checking every cell.
 */
export type ExplorerResultRow = {
  groupKey: string;
  groupLabel: string;
  /** Service categories present in this row — drives per-row adaptive metrics. */
  serviceCategories: ServiceCategory[];
  // --- Token metrics ---
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedInputTokens: number;
  totalCacheWriteTokens: number;
  totalThinkingTokens: number;
  totalAudioInputTokens: number;
  totalAudioOutputTokens: number;
  // --- Non-token metrics ---
  totalImageCount: number;
  totalCharacterCount: number;
  totalDurationSeconds: number;
  totalStorageBytes: number;
  totalSessionCount: number;
  totalSearchCount: number;
  totalRequestCount: number;
  // --- Cost ---
  /** Numeric string with up to 8 decimal places. */
  totalCost: string;
  currency: string;
};

/**
 * A single data point in the time-series breakdown.
 *
 * When a groupBy dimension is active, each date may appear multiple times —
 * once per distinct groupKey. The chart layer uses groupKey to split series.
 */
export type TimeSeriesPoint = {
  /** ISO date string: YYYY-MM-DD. */
  date: string;
  /** Present when grouping is active — identifies which group this point belongs to. */
  groupKey?: string;
  groupLabel?: string;
  totalCost: string;
  totalRequestCount: number;
};

/**
 * The full response envelope returned by the explorer repository.
 *
 * rows is the current page only. timeSeries covers the full date range
 * and is never paginated. Aggregate fields (totalCost, totalRequestCount,
 * serviceCategories) span ALL rows regardless of pagination.
 */
export type ExplorerResult = {
  rows: ExplorerResultRow[];
  timeSeries: TimeSeriesPoint[];
  /** Total number of distinct group rows (across all pages). */
  totalRows: number;
  /** Aggregate cost across ALL rows, not just the current page. */
  totalCost: string;
  /** Aggregate request count across ALL rows. */
  totalRequestCount: number;
  currency: string;
  page: number;
  pageSize: number;
  /**
   * Union of all service categories present across ALL result rows.
   * Passed to selectMetricsForContext to determine headline metric columns.
   */
  serviceCategories: ServiceCategory[];
};

// =============================================================================
// SECTION 3: METRIC CONFIG TYPES
// =============================================================================

/**
 * Every metric key that can be displayed in the explorer UI.
 * Keys correspond 1-to-1 with numeric fields on ExplorerResultRow and on
 * ExplorerResult (totalCost and totalRequestCount are included here for
 * completeness even though they always appear as primary metrics).
 */
export type ExplorerMetricKey =
  | 'totalInputTokens'
  | 'totalOutputTokens'
  | 'totalCachedInputTokens'
  | 'totalCacheWriteTokens'
  | 'totalThinkingTokens'
  | 'totalAudioInputTokens'
  | 'totalAudioOutputTokens'
  | 'totalImageCount'
  | 'totalCharacterCount'
  | 'totalDurationSeconds'
  | 'totalStorageBytes'
  | 'totalSessionCount'
  | 'totalSearchCount'
  | 'totalRequestCount'
  | 'totalCost';

/**
 * Metadata the UI uses to render a metric column or KPI card.
 *
 * format tells the UI how to format the raw number:
 *   'number'   — plain integer or decimal
 *   'cost'     — monetary value, 8 decimal places
 *   'duration' — seconds, format as Xh Ym Zs
 *   'bytes'    — storage size, format as KB/MB/GB
 *
 * priority determines column visibility when screen space is limited:
 *   'primary'   — always shown in this context
 *   'secondary' — shown when space allows, or on expanded views
 */
export type ExplorerMetricConfig = {
  key: ExplorerMetricKey;
  /** Human-readable column label, e.g. "Input Tokens". */
  label: string;
  format: 'number' | 'cost' | 'duration' | 'bytes';
  priority: 'primary' | 'secondary';
};

// =============================================================================
// SECTION 4: FUNCTIONS
// =============================================================================

/**
 * Returns the ordered list of metric configs appropriate for a given set of
 * service categories.
 *
 * Business rules (PRD R5):
 *   - Cost and request count are ALWAYS included as primary metrics.
 *   - text_generation: inputTokens, outputTokens, cachedInputTokens,
 *     thinkingTokens are primary; cacheWriteTokens is secondary.
 *   - embedding: characterCount is primary.
 *   - image_generation: imageCount is primary.
 *   - audio_speech / audio_transcription: durationSeconds and characterCount
 *     are primary.
 *   - video_generation: durationSeconds is primary.
 *   - web_search: searchCount is primary.
 *   - code_execution: sessionCount is primary.
 *   - vector_storage: storageBytes is primary.
 *   - moderation / reranking / other: only the universal cost + requests.
 *   - Mixed categories (multiple distinct categories in the array): the union
 *     of all relevant metrics is returned; category-specific metrics are
 *     demoted to 'secondary' so cost + requestCount remain the only primaries.
 *   - Single category: that category's specific metrics keep their natural
 *     primary priority.
 *   - Empty array: only cost + requestCount.
 *
 * The result list is ordered: universal metrics first (cost, requestCount),
 * then token metrics, then non-token metrics, in a stable field order.
 */
export const selectMetricsForContext = (
  categories: ServiceCategory[],
): ExplorerMetricConfig[] => {
  // De-duplicate and remove noise-only categories that contribute no
  // category-specific metrics.
  const meaningful = Array.from(new Set(categories)).filter(
    (c) => c !== 'moderation' && c !== 'reranking' && c !== 'other',
  );

  const isMixed = meaningful.length > 1;

  // Helper: resolve priority based on whether context is mixed or single.
  const priority = (natural: 'primary' | 'secondary'): 'primary' | 'secondary' =>
    isMixed ? 'secondary' : natural;

  // Start with the two universal primaries.
  const configs: ExplorerMetricConfig[] = [
    { key: 'totalCost', label: 'Cost', format: 'cost', priority: 'primary' },
    { key: 'totalRequestCount', label: 'Requests', format: 'number', priority: 'primary' },
  ];

  // Track which keys have already been added to avoid duplicates when multiple
  // categories share a metric (e.g. audio_speech and audio_transcription both
  // use durationSeconds).
  const added = new Set<ExplorerMetricKey>(['totalCost', 'totalRequestCount']);

  const push = (cfg: ExplorerMetricConfig): void => {
    if (!added.has(cfg.key)) {
      added.add(cfg.key);
      configs.push(cfg);
    }
  };

  for (const category of meaningful) {
    switch (category) {
      case 'text_generation':
        push({ key: 'totalInputTokens', label: 'Input Tokens', format: 'number', priority: priority('primary') });
        push({ key: 'totalOutputTokens', label: 'Output Tokens', format: 'number', priority: priority('primary') });
        push({ key: 'totalCachedInputTokens', label: 'Cached Input Tokens', format: 'number', priority: priority('primary') });
        push({ key: 'totalThinkingTokens', label: 'Thinking Tokens', format: 'number', priority: priority('primary') });
        push({ key: 'totalCacheWriteTokens', label: 'Cache Write Tokens', format: 'number', priority: 'secondary' });
        push({ key: 'totalAudioInputTokens', label: 'Audio Input Tokens', format: 'number', priority: 'secondary' });
        push({ key: 'totalAudioOutputTokens', label: 'Audio Output Tokens', format: 'number', priority: 'secondary' });
        break;

      case 'embedding':
        push({ key: 'totalCharacterCount', label: 'Characters', format: 'number', priority: priority('primary') });
        break;

      case 'image_generation':
        push({ key: 'totalImageCount', label: 'Images', format: 'number', priority: priority('primary') });
        break;

      case 'audio_speech':
      case 'audio_transcription':
        push({ key: 'totalDurationSeconds', label: 'Duration', format: 'duration', priority: priority('primary') });
        push({ key: 'totalCharacterCount', label: 'Characters', format: 'number', priority: priority('primary') });
        break;

      case 'video_generation':
        push({ key: 'totalDurationSeconds', label: 'Duration', format: 'duration', priority: priority('primary') });
        break;

      case 'web_search':
        push({ key: 'totalSearchCount', label: 'Searches', format: 'number', priority: priority('primary') });
        break;

      case 'code_execution':
        push({ key: 'totalSessionCount', label: 'Sessions', format: 'number', priority: priority('primary') });
        break;

      case 'vector_storage':
        push({ key: 'totalStorageBytes', label: 'Storage', format: 'bytes', priority: priority('primary') });
        break;

      // moderation, reranking, other — filtered out above; no default needed
    }
  }

  return configs;
};

/**
 * Counts how many days in a time series are statistical anomalies.
 *
 * A day is anomalous when its total spend deviates more than 2 standard
 * deviations from the mean of the entire window.
 *
 * Returns 0 when the series is too short to be statistically meaningful
 * (fewer than 4 distinct date points).
 *
 * This is the canonical anomaly count used across all surfaces — never
 * duplicate this logic elsewhere.
 */
export const computeWindowAnomalyCount = (timeSeries: TimeSeriesPoint[]): number => {
  if (timeSeries.length < 4) return 0;

  const byDate = new Map<string, number>();
  for (const p of timeSeries) {
    byDate.set(p.date, (byDate.get(p.date) ?? 0) + parseFloat(p.totalCost || '0'));
  }

  const values = Array.from(byDate.values());
  if (values.length < 4) return 0;

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return 0;
  return values.filter((v) => Math.abs(v - mean) > 2 * stddev).length;
};
