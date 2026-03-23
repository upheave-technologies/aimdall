'use server';

import { revalidatePath } from 'next/cache';
import { createAttributionGroup } from '@/modules/cost-tracking/application/createAttributionGroupUseCase';
import { deleteAttributionGroup } from '@/modules/cost-tracking/application/deleteAttributionGroupUseCase';
import { createAttributionRule } from '@/modules/cost-tracking/application/createAttributionRuleUseCase';
import { deleteAttributionRule } from '@/modules/cost-tracking/application/deleteAttributionRuleUseCase';
import { migrateKeyAssignments } from '@/modules/cost-tracking/application/migrateKeyAssignmentsUseCase';

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
