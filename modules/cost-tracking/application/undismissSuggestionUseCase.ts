// =============================================================================
// Application — Undismiss Suggestion Use Case
// =============================================================================
// Removes a suggestion dismissal so the suggestion can reappear in future
// auto-discovery runs.
//
// Flow:
//   1. Validate that suggestionId is non-empty
//   2. Hard-delete the dismissal record via repo.undismiss
//      (dismissals have no soft-delete — the table has no deletedAt column)
//
// Pre-wired export: `undismissSuggestion`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { ISuggestionDismissalRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeSuggestionDismissalRepository } from '../infrastructure/repositories/DrizzleSuggestionDismissalRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type UndismissSuggestionInput = {
  suggestionId: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the undismissSuggestion use case.
 *
 * @param dismissalRepo - Repository for managing suggestion dismissals
 * @returns Async use case function
 */
export const makeUndismissSuggestionUseCase = (
  dismissalRepo: ISuggestionDismissalRepository,
) => {
  return async (
    data: UndismissSuggestionInput,
  ): Promise<Result<void, CostTrackingError>> => {
    try {
      // Step 1: Validate input.
      if (!data.suggestionId || data.suggestionId.trim().length === 0) {
        return {
          success: false,
          error: new CostTrackingError('suggestionId cannot be empty', 'VALIDATION_ERROR'),
        };
      }

      // Step 2: Hard-delete the dismissal record.
      await dismissalRepo.undismiss(data.suggestionId.trim());

      return { success: true, value: undefined };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to undismiss suggestion', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const dismissalRepo = makeSuggestionDismissalRepository(db);

export const undismissSuggestion = makeUndismissSuggestionUseCase(dismissalRepo);
