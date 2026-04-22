// =============================================================================
// Application — Preview Attribution Rule Use Case
// =============================================================================
// Shows what a proposed attribution rule would match in existing usage data,
// so operators can verify rules before saving and catch typos.
//
// Flow:
//   1. Validate inputs (dimension, matchType, matchValue must be non-empty)
//   2. Validate that dimension maps to a supported ExplorerDimension
//   3. Query the explorer to get matching records and total cost for the filter
//   4. Query the explorer with groupBy on the dimension to get sample values
//   5. Return RulePreviewResult
//
// Pre-wired export: `previewAttributionRule`
//
// MVP scope: supports exact match type only. The explorer performs equality
// filtering, so prefix/regex/in_list match types are not supported here.
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IUsageRecordRepository } from '../domain/repositories';
import { ExplorerDimension } from '../domain/explorer';
import { RulePreviewResult } from '../domain/attributionTemplate';
import { CostTrackingError } from './costTrackingError';
import { resolveDateRange } from '../domain/dateRange';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type PreviewAttributionRuleInput = {
  dimension: string;
  matchType: string;
  matchValue: string;
};

// =============================================================================
// SECTION 2: CONSTANTS
// =============================================================================

/**
 * Attribution dimensions that can be mapped 1-to-1 to ExplorerDimension values.
 * Dimensions outside this set cannot be previewed via the explorer.
 */
const PREVIEWABLE_DIMENSIONS: ReadonlySet<ExplorerDimension> = new Set<ExplorerDimension>([
  'credential',
  'provider',
  'model',
  'segment',
  'serviceCategory',
  'serviceTier',
  'region',
]);

/**
 * Maps attribution rule dimension strings to ExplorerDimension values.
 * Keys match AttributionDimension values; values are ExplorerDimension values.
 */
const DIMENSION_MAP: Record<string, ExplorerDimension> = {
  credential: 'credential',
  provider: 'provider',
  model: 'model',
  model_slug: 'model',
  segment: 'segment',
  service_category: 'serviceCategory',
  service_tier: 'serviceTier',
  region: 'region',
};

// =============================================================================
// SECTION 3: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the previewAttributionRule use case.
 *
 * @param usageRecordRepo - Repository for explorer queries
 * @returns Async use case function
 */
export const makePreviewAttributionRuleUseCase = (usageRecordRepo: IUsageRecordRepository) => {
  return async (
    data: PreviewAttributionRuleInput,
  ): Promise<Result<RulePreviewResult, CostTrackingError>> => {
    try {
      // Step 1: Validate inputs
      if (!data.dimension || data.dimension.trim().length === 0) {
        return {
          success: false,
          error: new CostTrackingError('dimension cannot be empty', 'VALIDATION_ERROR'),
        };
      }
      if (!data.matchType || data.matchType.trim().length === 0) {
        return {
          success: false,
          error: new CostTrackingError('matchType cannot be empty', 'VALIDATION_ERROR'),
        };
      }
      if (!data.matchValue || data.matchValue.trim().length === 0) {
        return {
          success: false,
          error: new CostTrackingError('matchValue cannot be empty', 'VALIDATION_ERROR'),
        };
      }

      // Step 2: Validate that the dimension maps to a previewable ExplorerDimension
      const explorerDimension = DIMENSION_MAP[data.dimension.trim()];
      if (!explorerDimension || !PREVIEWABLE_DIMENSIONS.has(explorerDimension)) {
        return {
          success: false,
          error: new CostTrackingError(
            `Dimension "${data.dimension}" is not supported for rule preview`,
            'VALIDATION_ERROR',
          ),
        };
      }

      // Use default last-30-day range for preview queries
      const { startDate, endDate } = resolveDateRange();

      // Step 3: Query matched records and total cost via a filtered explore call
      // No groupBy — we want a single aggregate row for the full filtered dataset
      const matchResult = await usageRecordRepo.explore({
        groupBy: explorerDimension,
        filters: [{ dimension: explorerDimension, value: data.matchValue.trim() }],
        startDate,
        endDate,
        page: 1,
        pageSize: 1,
        sortDirection: 'desc',
      });

      // Aggregate across all rows (explore may return multiple rows for the
      // same dimension value when groupBy is active, but here we filter to one
      // value so there will be at most one row)
      let matchedRecords = 0;
      let matchedCost = 0;

      for (const row of matchResult.rows) {
        matchedRecords += row.totalRequestCount;
        matchedCost += parseFloat(row.totalCost);
      }

      // Step 4: Get sample dimension values — query all rows for this dimension
      // without filtering to reveal the full set of actual values so operators
      // can spot typos (e.g., intended 'prod' but usage data has 'production')
      const sampleResult = await usageRecordRepo.explore({
        groupBy: explorerDimension,
        filters: [],
        startDate,
        endDate,
        page: 1,
        pageSize: 20,
        sortDirection: 'desc',
      });

      const sampleValues = sampleResult.rows.map((row) => row.groupKey).filter(Boolean);

      return {
        success: true,
        value: {
          matchedRecords,
          matchedCost,
          sampleValues,
        },
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to preview attribution rule', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 4: PRE-WIRED INSTANCE
// =============================================================================

const usageRecordRepo = makeUsageRecordRepository(db);

export const previewAttributionRule = makePreviewAttributionRuleUseCase(usageRecordRepo);
