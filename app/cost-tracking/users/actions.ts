'use server';

import { revalidatePath } from 'next/cache';
import { createUser } from '@/modules/cost-tracking/application/createUserUseCase';
import { assignKeyToUser } from '@/modules/cost-tracking/application/assignKeyToUserUseCase';
import { unassignKeyFromUser } from '@/modules/cost-tracking/application/unassignKeyFromUserUseCase';

// =============================================================================
// Action Result Type
// =============================================================================

type ActionResult = { success: true } | { success: false; error: string };

// =============================================================================
// createUserAction
// =============================================================================

/**
 * Creates a new human Principal via the cost-tracking createUser use case.
 *
 * Presence validation: name and email must both be provided.
 * Business rules (uniqueness, email format) are enforced by the domain layer.
 */
export async function createUserAction(formData: FormData): Promise<ActionResult> {
  const name = formData.get('name') as string | null;
  const email = formData.get('email') as string | null;

  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Name is required' };
  }
  if (!email || email.trim().length === 0) {
    return { success: false, error: 'Email is required' };
  }

  const result = await createUser({ name: name.trim(), email: email.trim() });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/users');
  return { success: true };
}

// =============================================================================
// assignKeyAction
// =============================================================================

/**
 * Assigns a ProviderCredential to a Principal via the assignKeyToUser use case.
 *
 * Presence validation: principalId and credentialId must both be provided.
 * Existence and duplicate checks are enforced by the use case.
 */
export async function assignKeyAction(formData: FormData): Promise<ActionResult> {
  const principalId = formData.get('principalId') as string | null;
  const credentialId = formData.get('credentialId') as string | null;

  if (!principalId || principalId.trim().length === 0) {
    return { success: false, error: 'User is required' };
  }
  if (!credentialId || credentialId.trim().length === 0) {
    return { success: false, error: 'Credential is required' };
  }

  const result = await assignKeyToUser({
    principalId: principalId.trim(),
    credentialId: credentialId.trim(),
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/users');
  return { success: true };
}

// =============================================================================
// unassignKeyAction
// =============================================================================

/**
 * Soft-deletes a KeyAssignment via the unassignKeyFromUser use case.
 *
 * Presence validation: assignmentId must be provided.
 * Existence check is enforced by the use case.
 */
export async function unassignKeyAction(formData: FormData): Promise<ActionResult> {
  const assignmentId = formData.get('assignmentId') as string | null;

  if (!assignmentId || assignmentId.trim().length === 0) {
    return { success: false, error: 'Assignment ID is required' };
  }

  const result = await unassignKeyFromUser({ assignmentId: assignmentId.trim() });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/users');
  return { success: true };
}
