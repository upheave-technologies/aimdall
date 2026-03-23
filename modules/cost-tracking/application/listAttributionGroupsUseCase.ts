// =============================================================================
// Application — List Attribution Groups Use Case
// =============================================================================
// Returns all active attribution groups, optionally filtered by group type.
//
// Flow:
//   1. Call repo.findGroupsByType with the optional groupType filter
//   2. Return the list
//
// Pre-wired export: `listAttributionGroups`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { AttributionGroup } from '../domain/attributionGroup';
import { IAttributionRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type ListAttributionGroupsInput = {
  groupType?: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the listAttributionGroups use case.
 *
 * @param attributionRepository - Repository for querying groups
 * @returns Async use case function
 */
export const makeListAttributionGroupsUseCase = (
  attributionRepository: IAttributionRepository,
) => {
  return async (
    data: ListAttributionGroupsInput,
  ): Promise<Result<AttributionGroup[], CostTrackingError>> => {
    try {
      const groups = await attributionRepository.findGroupsByType(data.groupType);
      return { success: true, value: groups };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to list attribution groups', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const attributionRepository = makeAttributionRepository(db);

export const listAttributionGroups = makeListAttributionGroupsUseCase(attributionRepository);
