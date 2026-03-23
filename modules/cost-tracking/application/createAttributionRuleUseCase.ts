// =============================================================================
// Application — Create Attribution Rule Use Case
// =============================================================================
// Creates a new AttributionRule mapping a usage dimension to an attribution group.
//
// Flow:
//   1. Verify the group exists — return NOT_FOUND if absent
//   2. Check for a duplicate rule (same group + dimension + matchType + matchValue)
//   3. Assemble full AttributionRule with cuid2 ID and timestamps
//   4. Persist via repo.createRule
//   5. Return the created AttributionRule
//
// Pre-wired export: `createAttributionRule`
// =============================================================================

import { createId } from '@paralleldrive/cuid2';
import { Result } from '@/packages/shared/lib/result';
import { AttributionRule, AttributionDimension, MatchType } from '../domain/attributionRule';
import { IAttributionRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type CreateAttributionRuleInput = {
  groupId: string;
  dimension: AttributionDimension;
  matchType: MatchType;
  matchValue: string;
  priority?: number;
  description?: string;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the createAttributionRule use case.
 *
 * @param attributionRepository - Repository for finding groups, checking duplicates, and persisting
 * @returns Async use case function
 */
export const makeCreateAttributionRuleUseCase = (
  attributionRepository: IAttributionRepository,
) => {
  return async (
    data: CreateAttributionRuleInput,
  ): Promise<Result<AttributionRule, CostTrackingError>> => {
    try {
      // Step 1: Validate inputs
      if (!data.matchValue || data.matchValue.trim().length === 0) {
        return {
          success: false,
          error: new CostTrackingError('matchValue cannot be empty', 'VALIDATION_ERROR'),
        };
      }

      // Step 2: Verify group exists
      const allGroups = await attributionRepository.findAllGroups();
      const group = allGroups.find((g) => g.id === data.groupId) ?? null;

      if (!group) {
        return {
          success: false,
          error: new CostTrackingError(
            `Attribution group "${data.groupId}" not found`,
            'NOT_FOUND',
          ),
        };
      }

      // Step 3: Check for duplicate rule
      const duplicate = await attributionRepository.findDuplicateRule(
        data.groupId,
        data.dimension,
        data.matchType,
        data.matchValue,
      );
      if (duplicate) {
        return {
          success: false,
          error: new CostTrackingError(
            `A rule with dimension "${data.dimension}", matchType "${data.matchType}", and matchValue "${data.matchValue}" already exists for this group`,
            'ALREADY_EXISTS',
          ),
        };
      }

      // Step 4: Assemble full entity
      const now = new Date();
      const rule: AttributionRule = {
        id: createId(),
        groupId: data.groupId,
        dimension: data.dimension,
        matchType: data.matchType,
        matchValue: data.matchValue.trim(),
        priority: data.priority ?? 0,
        description: data.description,
        createdAt: now,
        updatedAt: now,
      };

      // Step 5: Persist and return
      await attributionRepository.createRule(rule);
      return { success: true, value: rule };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to create attribution rule', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const attributionRepository = makeAttributionRepository(db);

export const createAttributionRule = makeCreateAttributionRuleUseCase(attributionRepository);
