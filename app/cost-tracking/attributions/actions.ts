'use server';

import { revalidatePath } from 'next/cache';
import { createAttributionGroup } from '@/modules/cost-tracking/application/createAttributionGroupUseCase';
import { updateAttributionGroup } from '@/modules/cost-tracking/application/updateAttributionGroupUseCase';
import { deleteAttributionGroup } from '@/modules/cost-tracking/application/deleteAttributionGroupUseCase';
import { createAttributionRule } from '@/modules/cost-tracking/application/createAttributionRuleUseCase';
import { deleteAttributionRule } from '@/modules/cost-tracking/application/deleteAttributionRuleUseCase';
import { migrateKeyAssignments } from '@/modules/cost-tracking/application/migrateKeyAssignmentsUseCase';
import { applyAttributionTemplate } from '@/modules/cost-tracking/application/applyAttributionTemplateUseCase';
import { previewAttributionRule } from '@/modules/cost-tracking/application/previewAttributionRuleUseCase';
import { dismissSuggestion } from '@/modules/cost-tracking/application/dismissSuggestionUseCase';
import type { TemplateType, RulePreviewResult } from '@/modules/cost-tracking/domain/types';

// =============================================================================
// Action Result Type
// =============================================================================

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

// =============================================================================
// createGroupAction
// =============================================================================

/**
 * Creates a new AttributionGroup.
 *
 * Presence validation: displayName and groupType must both be provided.
 * Business rules (slug uniqueness, entity link consistency) are enforced
 * by the domain layer.
 */
export async function createGroupAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const displayName = formData.get('displayName') as string | null;
  const groupType = formData.get('groupType') as string | null;
  const description = formData.get('description') as string | null;

  // Support two naming conventions:
  //   1. Explicit pair: linkedEntityType + linkedEntityId (programmatic callers)
  //   2. Principal picker: linkedPrincipalId (form UI — infers type = 'principal')
  const explicitEntityType = formData.get('linkedEntityType') as string | null;
  const explicitEntityId = formData.get('linkedEntityId') as string | null;
  const linkedPrincipalId = formData.get('linkedPrincipalId') as string | null;

  const linkedEntityType =
    explicitEntityType?.trim() ||
    (linkedPrincipalId?.trim() ? 'principal' : undefined);
  const linkedEntityId =
    explicitEntityId?.trim() || linkedPrincipalId?.trim() || undefined;

  if (!displayName || displayName.trim().length === 0) {
    return { success: false, error: 'Display name is required' };
  }
  if (!groupType || groupType.trim().length === 0) {
    return { success: false, error: 'Group type is required' };
  }

  const result = await createAttributionGroup({
    displayName: displayName.trim(),
    groupType: groupType.trim() as Parameters<typeof createAttributionGroup>[0]['groupType'],
    description: description?.trim() || undefined,
    linkedEntityType: linkedEntityType || undefined,
    linkedEntityId: linkedEntityId || undefined,
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/attributions');
  return { success: true, data: { id: result.value.id } };
}

// =============================================================================
// deleteGroupAction
// =============================================================================

/**
 * Soft-deletes an AttributionGroup by ID.
 *
 * Presence validation: id must be provided.
 * Existence check is enforced by the use case.
 */
export async function deleteGroupAction(
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get('id') as string | null;

  if (!id || id.trim().length === 0) {
    return { success: false, error: 'Group ID is required' };
  }

  const result = await deleteAttributionGroup({ id: id.trim() });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/attributions');
  return { success: true };
}

// =============================================================================
// createRuleAction
// =============================================================================

/**
 * Creates a new AttributionRule attached to a group.
 *
 * Presence validation: groupId, dimension, matchType, and matchValue are
 * required. Priority defaults to 0 if not provided or invalid.
 * Business rules are enforced by the domain layer.
 */
export async function createRuleAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const groupId = formData.get('groupId') as string | null;
  const dimension = formData.get('dimension') as string | null;
  const matchType = formData.get('matchType') as string | null;
  const priorityRaw = formData.get('priority') as string | null;
  const description = formData.get('description') as string | null;

  // credentialMatchValue takes precedence over the free-text matchValue field
  // when the user selects a credential from the picker dropdown.
  const credentialMatchValue = formData.get('credentialMatchValue') as string | null;
  const freeTextMatchValue = formData.get('matchValue') as string | null;
  const matchValue =
    credentialMatchValue?.trim() && credentialMatchValue.trim().length > 0
      ? credentialMatchValue.trim()
      : freeTextMatchValue;

  if (!groupId || groupId.trim().length === 0) {
    return { success: false, error: 'Group ID is required' };
  }
  if (!dimension || dimension.trim().length === 0) {
    return { success: false, error: 'Dimension is required' };
  }
  if (!matchType || matchType.trim().length === 0) {
    return { success: false, error: 'Match type is required' };
  }
  if (!matchValue || matchValue.trim().length === 0) {
    return { success: false, error: 'Match value is required' };
  }

  const priority = priorityRaw ? parseInt(priorityRaw, 10) : 0;

  const result = await createAttributionRule({
    groupId: groupId.trim(),
    dimension: dimension.trim() as Parameters<typeof createAttributionRule>[0]['dimension'],
    matchType: matchType.trim() as Parameters<typeof createAttributionRule>[0]['matchType'],
    matchValue: matchValue.trim(),
    priority: Number.isNaN(priority) ? 0 : priority,
    description: description?.trim() || undefined,
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/attributions');
  return { success: true, data: { id: result.value.id } };
}

// =============================================================================
// deleteRuleAction
// =============================================================================

/**
 * Soft-deletes an AttributionRule by ID.
 *
 * Presence validation: id must be provided.
 * Existence check is enforced by the use case.
 */
export async function deleteRuleAction(
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get('id') as string | null;

  if (!id || id.trim().length === 0) {
    return { success: false, error: 'Rule ID is required' };
  }

  const result = await deleteAttributionRule({ id: id.trim() });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/attributions');
  return { success: true };
}

// =============================================================================
// runMigrationAction
// =============================================================================

/**
 * Runs the key-assignment migration: creates AttributionGroups and Rules for
 * each existing user → credential mapping.
 *
 * No presence validation needed — the use case takes no required input.
 * Returns migration statistics on success.
 */
export async function runMigrationAction(formData: FormData): Promise<
  ActionResult<{ groupsCreated: number; rulesCreated: number; skipped: number }>
> {
  const result = await migrateKeyAssignments();

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/attributions');
  return { success: true, data: result.value };
}

// =============================================================================
// applyTemplateAction
// =============================================================================

/**
 * Bulk-creates attribution groups and credential-based rules from a template.
 *
 * Presence validation: templateType and groupNames must be provided.
 * Business rules (slug uniqueness, duplicate credentials) are enforced by the
 * domain layer via validateTemplateInput.
 */
export async function applyTemplateAction(
  formData: FormData,
): Promise<ActionResult<{ groupsCreated: number; rulesCreated: number }>> {
  const templateType = formData.get('templateType') as string | null;
  const groupNamesRaw = formData.get('groupNames') as string | null;
  const credentialAssignmentsRaw = formData.get('credentialAssignments') as string | null;

  if (!templateType || templateType.trim().length === 0) {
    return { success: false, error: 'Template type is required' };
  }
  if (!groupNamesRaw || groupNamesRaw.trim().length === 0) {
    return { success: false, error: 'Group names are required' };
  }

  // Parse group names: split by comma, trim each, remove empty entries
  const groupNames = groupNamesRaw
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (groupNames.length === 0) {
    return { success: false, error: 'At least one group name is required' };
  }

  // Parse credential assignments: JSON string mapping groupName → credentialId[]
  // Default to empty assignments if not provided or invalid JSON
  let credentialAssignments: Record<string, string[]> = {};
  if (credentialAssignmentsRaw && credentialAssignmentsRaw.trim().length > 0) {
    try {
      credentialAssignments = JSON.parse(credentialAssignmentsRaw);
    } catch {
      return { success: false, error: 'Credential assignments must be valid JSON' };
    }
  }

  const result = await applyAttributionTemplate({
    templateType: templateType.trim() as TemplateType,
    groupNames,
    credentialAssignments,
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/attributions');
  return {
    success: true,
    data: { groupsCreated: result.value.groupsCreated, rulesCreated: result.value.rulesCreated },
  };
}

// =============================================================================
// previewRuleAction
// =============================================================================

/**
 * Previews what a proposed attribution rule would match in existing usage data.
 *
 * Presence validation: dimension, matchType, and matchValue must be provided.
 * Dimension support validation and data querying are handled by the use case.
 */
export async function previewRuleAction(
  formData: FormData,
): Promise<ActionResult<RulePreviewResult>> {
  const dimension = formData.get('dimension') as string | null;
  const matchType = formData.get('matchType') as string | null;
  const matchValue = formData.get('matchValue') as string | null;

  if (!dimension || dimension.trim().length === 0) {
    return { success: false, error: 'Dimension is required' };
  }
  if (!matchType || matchType.trim().length === 0) {
    return { success: false, error: 'Match type is required' };
  }
  if (!matchValue || matchValue.trim().length === 0) {
    return { success: false, error: 'Match value is required' };
  }

  const result = await previewAttributionRule({
    dimension: dimension.trim(),
    matchType: matchType.trim(),
    matchValue: matchValue.trim(),
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/attributions');
  return { success: true, data: result.value };
}

// =============================================================================
// dismissSuggestionAction
// =============================================================================

/**
 * Dismisses an auto-discovery suggestion.
 *
 * Presence validation: suggestionId and suggestionType must be provided.
 * The dismissal record is persisted via the dismissSuggestion use case so the
 * suggestion will not resurface in future discovery runs.
 */
export async function dismissSuggestionAction(
  formData: FormData,
): Promise<ActionResult> {
  const suggestionId = formData.get('suggestionId') as string | null;
  const suggestionType = formData.get('suggestionType') as string | null;

  if (!suggestionId || suggestionId.trim().length === 0) {
    return { success: false, error: 'Suggestion ID is required' };
  }
  if (!suggestionType || suggestionType.trim().length === 0) {
    return { success: false, error: 'Suggestion type is required' };
  }

  const result = await dismissSuggestion({
    suggestionId: suggestionId.trim(),
    suggestionType: suggestionType.trim(),
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/attributions');
  return { success: true };
}

// =============================================================================
// updateGroupAction
// =============================================================================

/**
 * Updates the mutable fields of an existing AttributionGroup.
 *
 * Presence validation: id must be provided. All other fields are optional —
 * undefined means "no change", null means "clear the field".
 * Business rules (entity link consistency, empty displayName) are enforced
 * by the domain layer.
 */
export async function updateGroupAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = formData.get('id') as string | null;
  const displayName = formData.get('displayName') as string | null;
  const description = formData.get('description') as string | null;

  // Support two naming conventions (same as createGroupAction):
  //   1. Explicit pair: linkedEntityType + linkedEntityId (programmatic callers)
  //   2. Principal picker: linkedPrincipalId (form UI — infers type = 'principal')
  const explicitEntityType = formData.get('linkedEntityType') as string | null;
  const explicitEntityId = formData.get('linkedEntityId') as string | null;
  const linkedPrincipalId = formData.get('linkedPrincipalId') as string | null;

  if (!id || id.trim().length === 0) {
    return { success: false, error: 'Group ID is required' };
  }

  const linkedEntityType =
    explicitEntityType?.trim() ||
    (linkedPrincipalId?.trim() ? 'principal' : undefined);
  const linkedEntityId =
    explicitEntityId?.trim() || linkedPrincipalId?.trim() || undefined;

  const result = await updateAttributionGroup({
    id: id.trim(),
    displayName: displayName?.trim() || undefined,
    description: description !== null ? description.trim() || undefined : undefined,
    linkedEntityType: linkedEntityType || undefined,
    linkedEntityId: linkedEntityId || undefined,
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/attributions');
  return { success: true, data: { id: result.value.id } };
}

// =============================================================================
// applySuggestionAction
// =============================================================================

/**
 * Converts an auto-discovery suggestion into a real attribution group.
 *
 * Presence validation: suggestedGroupName, suggestedGroupType, and credentialIds
 * must be provided. credentialIds must be a valid JSON array.
 *
 * Flow:
 *   1. Create a new AttributionGroup from the suggestion
 *   2. Create one credential-scoped AttributionRule per credentialId
 *
 * Returns the new group ID and the count of rules created.
 */
export async function applySuggestionAction(
  formData: FormData,
): Promise<ActionResult<{ groupId: string; rulesCreated: number }>> {
  const suggestedGroupName = formData.get('suggestedGroupName') as string | null;
  const suggestedGroupType = formData.get('suggestedGroupType') as string | null;
  const credentialIdsRaw = formData.get('credentialIds') as string | null;

  if (!suggestedGroupName || suggestedGroupName.trim().length === 0) {
    return { success: false, error: 'Group name is required' };
  }
  if (!suggestedGroupType || suggestedGroupType.trim().length === 0) {
    return { success: false, error: 'Group type is required' };
  }
  if (!credentialIdsRaw || credentialIdsRaw.trim().length === 0) {
    return { success: false, error: 'Credential IDs are required' };
  }

  let credentialIds: string[];
  try {
    credentialIds = JSON.parse(credentialIdsRaw);
  } catch {
    return { success: false, error: 'Credential IDs must be a valid JSON array' };
  }

  if (!Array.isArray(credentialIds) || credentialIds.length === 0) {
    return { success: false, error: 'At least one credential ID is required' };
  }

  // Step 1: Create the group
  const groupResult = await createAttributionGroup({
    displayName: suggestedGroupName.trim(),
    groupType: suggestedGroupType.trim() as Parameters<typeof createAttributionGroup>[0]['groupType'],
  });

  if (!groupResult.success) {
    return { success: false, error: groupResult.error.message };
  }

  const newGroupId = groupResult.value.id;

  // Step 2: Create one rule per credentialId
  let rulesCreated = 0;
  for (const credentialId of credentialIds) {
    const ruleResult = await createAttributionRule({
      groupId: newGroupId,
      dimension: 'credential',
      matchType: 'exact',
      matchValue: credentialId,
    });

    if (ruleResult.success) {
      rulesCreated++;
    }
  }

  revalidatePath('/cost-tracking/attributions');
  return { success: true, data: { groupId: newGroupId, rulesCreated } };
}

// =============================================================================
// assignCredentialAction
// =============================================================================

/**
 * Assigns a single credential to an existing attribution group by creating
 * a credential-scoped exact-match rule.
 *
 * Presence validation: credentialId and groupId must both be provided.
 * Duplicate-rule checks are enforced by the domain layer.
 */
export async function assignCredentialAction(
  formData: FormData,
): Promise<ActionResult<{ ruleId: string }>> {
  const credentialId = formData.get('credentialId') as string | null;
  const groupId = formData.get('groupId') as string | null;

  if (!credentialId || credentialId.trim().length === 0) {
    return { success: false, error: 'Credential ID is required' };
  }
  if (!groupId || groupId.trim().length === 0) {
    return { success: false, error: 'Group ID is required' };
  }

  const result = await createAttributionRule({
    groupId: groupId.trim(),
    dimension: 'credential',
    matchType: 'exact',
    matchValue: credentialId.trim(),
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/attributions');
  return { success: true, data: { ruleId: result.value.id } };
}
