// =============================================================================
// Application — Dismiss Recommendation Use Case
// =============================================================================
// Marks a recommendation as dismissed so it no longer appears in active lists.
//
// Flow:
//   1. Find recommendation by ID — return NOT_FOUND if absent
//   2. Set status = 'dismissed', dismissedAt = now, updatedAt = now
//   3. Persist the update via the repository
//   4. Return the updated recommendation
//
// Pre-wired export: `dismissRecommendation`
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

export type DismissRecommendationInput = {
  id: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the dismissRecommendation use case.
 *
 * @param recommendationRepo - Repository for reading and updating recommendations
 * @returns Async use case function
 */
export const makeDismissRecommendationUseCase = (
  recommendationRepo: IRecommendationRepository,
) => {
  return async (
    data: DismissRecommendationInput,
  ): Promise<Result<Recommendation, CostTrackingError>> => {
    try {
      // Step 1: Find the recommendation.
      const existing = await recommendationRepo.findById(data.id);
      if (!existing) {
        return {
          success: false,
          error: new CostTrackingError(
            `Recommendation with id "${data.id}" not found`,
            'NOT_FOUND',
          ),
        };
      }

      // Step 2: Apply the dismissal.
      const now = new Date();
      const dismissed: Recommendation = {
        ...existing,
        status: 'dismissed',
        dismissedAt: now,
        updatedAt: now,
      };

      // Step 3: Persist the update.
      await recommendationRepo.update(dismissed);

      // Step 4: Return the updated entity.
      return { success: true, value: dismissed };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to dismiss recommendation', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const recommendationRepo = makeRecommendationRepository(db);

export const dismissRecommendation = makeDismissRecommendationUseCase(recommendationRepo);
