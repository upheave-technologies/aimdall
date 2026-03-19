// =============================================================================
// Application — Get Usage Summary Use Case
// =============================================================================
// Retrieves aggregated usage and cost summaries across all dimensions:
// by provider, by model, by credential, by segment, and daily spend.
//
// Flow:
//   1. Set default date range (last 30 days) if not provided
//   2. Fetch all summary dimensions in parallel via Promise.all
//   3. Assemble and return the UsageSummary
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IUsageRecordRepository, UsageSummaryRow, DailySpendRow } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type GetUsageSummaryInput = {
  startDate?: Date;
  endDate?: Date;
};

export type UsageSummary = {
  byProvider: UsageSummaryRow[];
  byModel: UsageSummaryRow[];
  byCredential: UsageSummaryRow[];
  bySegment: UsageSummaryRow[];
  dailySpend: DailySpendRow[];
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the getUsageSummary use case.
 * Follows the factory pattern for dependency injection.
 *
 * All five summary queries execute in parallel for optimal performance.
 */
export const makeGetUsageSummaryUseCase = (repo: IUsageRecordRepository) => {
  return async (
    data: GetUsageSummaryInput,
  ): Promise<Result<UsageSummary, CostTrackingError>> => {
    try {
      // Step 1: Resolve date range defaults (last 30 days)
      const endDate = data.endDate ?? new Date();
      const startDate =
        data.startDate ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1_000);

      // Step 2: Fetch all summary dimensions in parallel
      const [byProvider, byModel, byCredential, bySegment, dailySpend] = await Promise.all([
        repo.findSummaryByProvider(startDate, endDate),
        repo.findSummaryByModel(startDate, endDate),
        repo.findSummaryByCredential(startDate, endDate),
        repo.findSummaryBySegment(startDate, endDate),
        repo.findDailySpend(startDate, endDate),
      ]);

      // Step 3: Return assembled summary
      return {
        success: true,
        value: { byProvider, byModel, byCredential, bySegment, dailySpend },
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to retrieve usage summary', 'SERVICE_ERROR'),
      };
    }
  };
};
