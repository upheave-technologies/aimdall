// =============================================================================
// Application — Apply Attribution Template Use Case
// =============================================================================
// Bulk-creates attribution groups and credential-based rules from a template.
//
// Flow:
//   1. Validate template input via validateTemplateInput (domain function)
//   2. Map templateType → groupType via mapTemplateTypeToGroupType
//   3. For each groupName:
//      a. Generate slug via generateGroupSlug
//      b. Check slug uniqueness via findGroupBySlug — fail early on collision
//      c. Assemble a full AttributionGroup (cuid2 ID + timestamps)
//      d. Persist via createGroup
//   4. For each credential assignment:
//      a. Assemble an AttributionRule (dimension='credential', matchType='exact')
//      b. Check for duplicate rule via findDuplicateRule — skip silently if exists
//      c. Persist via createRule
//   5. Return TemplateResult summary
//
// Pre-wired export: `applyAttributionTemplate`
// =============================================================================

import { createId } from '@paralleldrive/cuid2';
import { Result } from '@/packages/shared/lib/result';
import { AttributionGroup } from '../domain/attributionGroup';
import { AttributionRule } from '../domain/attributionRule';
import { IAttributionRepository } from '../domain/repositories';
import {
  TemplateInput,
  TemplateResult,
  validateTemplateInput,
  mapTemplateTypeToGroupType,
  generateGroupSlug,
} from '../domain/attributionTemplate';
import { CostTrackingError } from './costTrackingError';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the applyAttributionTemplate use case.
 *
 * @param attributionRepository - Repository for creating groups and rules
 * @returns Async use case function
 */
export const makeApplyAttributionTemplateUseCase = (
  attributionRepository: IAttributionRepository,
) => {
  return async (
    data: TemplateInput,
  ): Promise<Result<TemplateResult, CostTrackingError>> => {
    try {
      // Step 1: Validate template input
      const validationResult = validateTemplateInput(data);
      if (!validationResult.success) {
        return {
          success: false,
          error: new CostTrackingError(validationResult.error.message, 'VALIDATION_ERROR'),
        };
      }

      // Step 2: Resolve the group type for all groups in this template
      const groupType = mapTemplateTypeToGroupType(data.templateType);

      const now = new Date();
      const createdGroups: TemplateResult['groups'] = [];
      // Track groupName → generated groupId for rule creation
      const groupIdByName = new Map<string, string>();

      // Step 3: Create a group for each name in the template
      for (const groupName of data.groupNames) {
        const slug = generateGroupSlug(groupName);

        // Step 3b: Check slug uniqueness
        const existing = await attributionRepository.findGroupBySlug(slug);
        if (existing) {
          return {
            success: false,
            error: new CostTrackingError(
              `An attribution group with slug "${slug}" already exists — cannot apply template`,
              'ALREADY_EXISTS',
            ),
          };
        }

        // Step 3c: Assemble full entity
        const group: AttributionGroup = {
          id: createId(),
          slug,
          displayName: groupName.trim(),
          groupType: groupType as AttributionGroup['groupType'],
          createdAt: now,
          updatedAt: now,
        };

        // Step 3d: Persist
        await attributionRepository.createGroup(group);

        groupIdByName.set(groupName, group.id);
        createdGroups.push({ slug: group.slug, displayName: group.displayName, groupType });
      }

      // Step 4: Create credential rules for each assignment
      let rulesCreated = 0;

      for (const groupName of data.groupNames) {
        const groupId = groupIdByName.get(groupName);
        if (!groupId) continue;

        const credentialIds = data.credentialAssignments[groupName] ?? [];

        for (const credentialId of credentialIds) {
          // Step 4b: Skip if an identical rule already exists
          const duplicate = await attributionRepository.findDuplicateRule(
            groupId,
            'credential',
            'exact',
            credentialId,
          );
          if (duplicate) continue;

          // Step 4a: Assemble rule
          const rule: AttributionRule = {
            id: createId(),
            groupId,
            dimension: 'credential',
            matchType: 'exact',
            matchValue: credentialId,
            priority: 0,
            createdAt: now,
            updatedAt: now,
          };

          // Step 4c: Persist
          await attributionRepository.createRule(rule);
          rulesCreated += 1;
        }
      }

      // Step 5: Return summary
      return {
        success: true,
        value: {
          groupsCreated: createdGroups.length,
          rulesCreated,
          groups: createdGroups,
        },
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to apply attribution template', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 2: PRE-WIRED INSTANCE
// =============================================================================

const attributionRepository = makeAttributionRepository(db);

export const applyAttributionTemplate =
  makeApplyAttributionTemplateUseCase(attributionRepository);
