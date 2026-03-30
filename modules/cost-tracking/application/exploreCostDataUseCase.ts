// =============================================================================
// Application — Explore Cost Data Use Case
// =============================================================================
// Entry point for the cost explorer feature. Accepts a structured query
// (grouping dimension, filters, date range, pagination) and returns
// aggregated results with time-series data and context-adaptive metric config.
//
// Flow:
//   1. Resolve date range defaults (last 30 days)
//   2. Validate and normalize the query
//   3. Call the parameterized aggregation repository method
//   4. Call the domain metric selection function using result service categories
//   5. Return enriched result with metric config
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IUsageRecordRepository } from '../domain/repositories';
import { resolveDateRange } from '../domain/dateRange';
import {
  ExplorerDimension,
  ExplorerFilter,
  ExplorerMetricConfig,
  ExplorerQuery,
  ExplorerResult,
  selectMetricsForContext,
} from '../domain/explorer';
import { ServiceCategory } from '../domain/model';
import { CostTrackingError } from './costTrackingError';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type ExploreCostDataInput = {
  groupBy?: ExplorerDimension;
  filters?: ExplorerFilter[];
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
  sortDirection?: 'asc' | 'desc';
};

export type ExploreCostDataOutput = ExplorerResult & {
  metrics: ExplorerMetricConfig[];
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the exploreCostData use case.
 * Follows the factory pattern for dependency injection.
 *
 * Applies sensible defaults for all optional input fields, delegates the
 * parameterized aggregation to the repository, and enriches the result with
 * context-adaptive metric config produced by the domain function.
 */
export const makeExploreCostDataUseCase = (repo: IUsageRecordRepository) => {
  return async (
    data: ExploreCostDataInput,
  ): Promise<Result<ExploreCostDataOutput, CostTrackingError>> => {
    try {
      // Step 1: Resolve date range (shared logic — see domain/dateRange.ts)
      const { startDate, endDate } = resolveDateRange(data.startDate, data.endDate);
      const page = data.page ?? 1;
      const pageSize = data.pageSize ?? 25;
      const sortDirection = data.sortDirection ?? 'desc';
      const filters = data.filters ?? [];

      // Step 2: Build the query
      const query: ExplorerQuery = {
        groupBy: data.groupBy,
        filters,
        startDate,
        endDate,
        page,
        pageSize,
        sortDirection,
      };

      // Step 3: Execute the parameterized aggregation
      const result = await repo.explore(query);

      // Step 4: Determine context-adaptive metrics
      // If there's a service category filter active, use that as the strongest signal
      const categoryFilter = filters.find((f) => f.dimension === 'serviceCategory');
      const metricsCategories = categoryFilter
        ? [categoryFilter.value as ServiceCategory]
        : result.serviceCategories;
      const metrics = selectMetricsForContext(metricsCategories);

      // Step 5: Return enriched result
      return {
        success: true,
        value: { ...result, metrics },
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to explore cost data', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const usageRecordRepo = makeUsageRecordRepository(db);

export const exploreCostData = makeExploreCostDataUseCase(usageRecordRepo);
