// =============================================================================
// Application — List Recommendations Use Case
// =============================================================================
// Returns all active (non-deleted, non-expired) recommendations sorted by
// estimated monthly savings descending so the highest-value items appear first.
//
// Flow:
//   1. Fetch all active recommendations from the repository
//   2. Sort by estimatedMonthlySavings descending (nulls last)
//   3. Return the sorted list
//
// Pre-wired export: `listRecommendations`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { Recommendation } from '../domain/recommendation';
import { IRecommendationRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeRecommendationRepository } from '../infrastructure/repositories/DrizzleRecommendationRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type ListRecommendationsInput = Record<string, never>;

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the listRecommendations use case.
 *
 * @param recommendationRepo - Repository for reading active recommendations
 * @returns Async use case function
 */
export const makeListRecommendationsUseCase = (
  recommendationRepo: IRecommendationRepository,
) => {
  return async (
    _input: ListRecommendationsInput,
  ): Promise<Result<Recommendation[], CostTrackingError>> => {
    try {
      const active = await recommendationRepo.findActive();

      // Sort by estimatedMonthlySavings descending; recommendations with no
      // dollar savings (risk/hygiene) sort after those with savings.
      const sorted = [...active].sort((a, b) => {
        const aSavings = a.estimatedMonthlySavings != null ? parseFloat(a.estimatedMonthlySavings) : -1;
        const bSavings = b.estimatedMonthlySavings != null ? parseFloat(b.estimatedMonthlySavings) : -1;
        return bSavings - aSavings;
      });

      return { success: true, value: sorted };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to list recommendations', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const recommendationRepo = makeRecommendationRepository(db);

export const listRecommendations = makeListRecommendationsUseCase(recommendationRepo);
