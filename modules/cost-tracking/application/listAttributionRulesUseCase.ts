// =============================================================================
// Application — List Attribution Rules Use Case
// =============================================================================
// Returns all active attribution rules for a given group.
//
// Flow:
//   1. Call repo.findRulesByGroup with the groupId
//   2. Return the list
//
// Pre-wired export: `listAttributionRules`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { AttributionRule } from '../domain/attributionRule';
import { IAttributionRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type ListAttributionRulesInput = {
  groupId: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the listAttributionRules use case.
 *
 * @param attributionRepository - Repository for querying rules
 * @returns Async use case function
 */
export const makeListAttributionRulesUseCase = (
  attributionRepository: IAttributionRepository,
) => {
  return async (
    data: ListAttributionRulesInput,
  ): Promise<Result<AttributionRule[], CostTrackingError>> => {
    try {
      const rules = await attributionRepository.findRulesByGroup(data.groupId);
      return { success: true, value: rules };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to list attribution rules', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const attributionRepository = makeAttributionRepository(db);

export const listAttributionRules = makeListAttributionRulesUseCase(attributionRepository);
