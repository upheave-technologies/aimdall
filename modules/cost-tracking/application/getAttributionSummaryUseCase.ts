// =============================================================================
// Application — Get Attribution Summary Use Case
// =============================================================================
// Retrieves aggregated cost and usage totals broken down by attribution group.
//
// Flow:
//   1. Default to last 30 days if startDate / endDate not provided
//   2. Call repo.getAttributionSummary with the resolved date range and
//      optional groupType filter
//   3. Return the list of AttributionSummaryRow
//
// Pre-wired export: `getAttributionSummary`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IAttributionRepository, AttributionSummaryRow } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type GetAttributionSummaryInput = {
  startDate?: Date;
  endDate?: Date;
  groupType?: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the getAttributionSummary use case.
 *
 * @param attributionRepository - Repository for querying aggregated attribution data
 * @returns Async use case function
 */
export const makeGetAttributionSummaryUseCase = (
  attributionRepository: IAttributionRepository,
) => {
  return async (
    data: GetAttributionSummaryInput,
  ): Promise<Result<AttributionSummaryRow[], CostTrackingError>> => {
    try {
      // Step 1: Resolve date range defaults (last 30 days)
      const endDate = data.endDate ?? new Date();
      const startDate =
        data.startDate ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1_000);

      // Step 2: Fetch aggregated summary
      const rows = await attributionRepository.getAttributionSummary(
        startDate,
        endDate,
        data.groupType,
      );

      return { success: true, value: rows };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to retrieve attribution summary', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const attributionRepository = makeAttributionRepository(db);

export const getAttributionSummary = makeGetAttributionSummaryUseCase(attributionRepository);
