// =============================================================================
// Application — Dismiss Suggestion Use Case
// =============================================================================
// Records that a user has dismissed an auto-discovery suggestion so it will
// not resurface in future discovery runs.
//
// Flow:
//   1. Validate that suggestionId is non-empty
//   2. Build a SuggestionDismissal record
//   3. Persist via repo.dismiss (idempotent — repeat calls are safe)
//
// Pre-wired export: `dismissSuggestion`
// =============================================================================

import { createId } from '@paralleldrive/cuid2';
import { Result } from '@/packages/shared/lib/result';
import { ISuggestionDismissalRepository, SuggestionDismissal } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeSuggestionDismissalRepository } from '../infrastructure/repositories/DrizzleSuggestionDismissalRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type DismissSuggestionInput = {
  suggestionId: string;
  suggestionType: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the dismissSuggestion use case.
 *
 * @param dismissalRepo - Repository for persisting suggestion dismissals
 * @returns Async use case function
 */
export const makeDismissSuggestionUseCase = (
  dismissalRepo: ISuggestionDismissalRepository,
) => {
  return async (
    data: DismissSuggestionInput,
  ): Promise<Result<void, CostTrackingError>> => {
    try {
      // Step 1: Validate input.
      if (!data.suggestionId || data.suggestionId.trim().length === 0) {
        return {
          success: false,
          error: new CostTrackingError('suggestionId cannot be empty', 'VALIDATION_ERROR'),
        };
      }

      // Step 2: Build the dismissal record.
      const now = new Date();
      const dismissal: Omit<SuggestionDismissal, 'createdAt'> = {
        id: createId(),
        suggestionId: data.suggestionId.trim(),
        suggestionType: data.suggestionType,
        dismissedAt: now,
      };

      // Step 3: Persist (idempotent — ON CONFLICT DO NOTHING).
      await dismissalRepo.dismiss(dismissal);

      return { success: true, value: undefined };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to dismiss suggestion', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const dismissalRepo = makeSuggestionDismissalRepository(db);

export const dismissSuggestion = makeDismissSuggestionUseCase(dismissalRepo);
