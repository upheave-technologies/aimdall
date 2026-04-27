'use server';

// =============================================================================
// Server Actions — /cost-tracking/providers
// =============================================================================
// Thin adapters between the UI and the cost-tracking provider use cases.
// Each action: extracts FormData, validates presence, calls ONE use case,
// returns a typed ActionResult.
//
// Actions:
//   testConnectionAction    — validate credentials without persisting
//   connectProviderAction   — store credentials and register the provider
//   disconnectProviderAction — soft-delete credentials and pause the provider
//   triggerSyncAction        — run an on-demand usage sync for one provider
// =============================================================================

import { revalidatePath } from 'next/cache';
import { testProviderConnection } from '@/modules/cost-tracking/application/testProviderConnectionUseCase';
import { connectProvider } from '@/modules/cost-tracking/application/connectProviderUseCase';
import { disconnectProvider } from '@/modules/cost-tracking/application/disconnectProviderUseCase';
import { listProviderStatus } from '@/modules/cost-tracking/application/listProviderStatusUseCase';
import {
  syncProviderUsage,
  syncProviderUsageFromDb,
} from '@/modules/cost-tracking/application/syncProviderUsageUseCase';

// =============================================================================
// Action Result Type
// =============================================================================

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

// =============================================================================
// testConnectionAction
// =============================================================================

/**
 * Validates provider credentials by pinging the provider API.
 * Nothing is persisted — this is a stateless connection check.
 *
 * Required fields:  providerSlug
 * Credential fields (provider-specific, collected dynamically):
 *   openai        → apiKey
 *   anthropic     → adminApiKey
 *   google_vertex → projectId
 *   google_gemini → projectId (+ optional apiKey)
 */
export async function testConnectionAction(
  formData: FormData,
): Promise<ActionResult<{ detail?: string }>> {
  const providerSlug = formData.get('providerSlug') as string | null;

  if (!providerSlug || providerSlug.trim().length === 0) {
    return { success: false, error: 'Provider is required' };
  }

  // Collect all non-reserved fields as credentials
  const credentials: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key !== 'providerSlug' && typeof value === 'string' && value.trim().length > 0) {
      credentials[key] = value.trim();
    }
  }

  const result = await testProviderConnection({
    providerSlug: providerSlug.trim(),
    credentials,
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  return { success: true, data: result.value };
}

// =============================================================================
// connectProviderAction
// =============================================================================

/**
 * Stores encrypted credentials and registers the provider in the database.
 * Idempotent on the provider level — an existing provider row is reused and a
 * new credential is appended.
 *
 * Required fields:  providerSlug, displayName
 * Optional fields:  label
 * Credential fields (provider-specific, collected dynamically — same as test)
 */
export async function connectProviderAction(
  formData: FormData,
): Promise<ActionResult<{ providerId: string; credentialId: string }>> {
  const providerSlug = formData.get('providerSlug') as string | null;
  const displayName = formData.get('displayName') as string | null;
  const label = formData.get('label') as string | null;

  if (!providerSlug || providerSlug.trim().length === 0) {
    return { success: false, error: 'Provider is required' };
  }
  if (!displayName || displayName.trim().length === 0) {
    return { success: false, error: 'Display name is required' };
  }

  // Collect credential fields, excluding the reserved form fields
  const reservedKeys = new Set(['providerSlug', 'displayName', 'label']);
  const credentials: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!reservedKeys.has(key) && typeof value === 'string' && value.trim().length > 0) {
      credentials[key] = value.trim();
    }
  }

  const result = await connectProvider({
    providerSlug: providerSlug.trim(),
    displayName: displayName.trim(),
    credentials,
    label: label?.trim() || undefined,
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/providers');
  revalidatePath('/cost-tracking');
  return { success: true, data: result.value };
}

// =============================================================================
// disconnectProviderAction
// =============================================================================

/**
 * Soft-deletes all sync credentials for a provider and sets its status to
 * "paused". The provider record is retained to preserve historical data and
 * allow reconnection without data loss.
 *
 * Required fields:  providerId
 */
export async function disconnectProviderAction(
  formData: FormData,
): Promise<ActionResult> {
  const providerId = formData.get('providerId') as string | null;

  if (!providerId || providerId.trim().length === 0) {
    return { success: false, error: 'Provider ID is required' };
  }

  const result = await disconnectProvider({ providerId: providerId.trim() });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/providers');
  revalidatePath('/cost-tracking');
  return { success: true };
}

// =============================================================================
// triggerSyncAction
// =============================================================================

/**
 * Triggers an on-demand usage sync for a single provider.
 *
 * Flow:
 *   1. Resolve provider slug from the supplied providerId via listProviderStatus
 *   2. Build provider clients from DB credentials via syncProviderUsageFromDb
 *   3. Filter to the single client that matches the requested provider
 *   4. Run syncProviderUsage with just that client
 *
 * Required fields:  providerId
 */
export async function triggerSyncAction(
  formData: FormData,
): Promise<ActionResult<{ synced: number }>> {
  const providerId = formData.get('providerId') as string | null;

  if (!providerId || providerId.trim().length === 0) {
    return { success: false, error: 'Provider ID is required' };
  }

  try {
    // Resolve the provider slug so we can filter the client list
    const statusResult = await listProviderStatus();
    if (!statusResult.success) {
      return { success: false, error: 'Failed to look up provider' };
    }

    const provider = statusResult.value.find((p) => p.providerId === providerId.trim());
    if (!provider) {
      return { success: false, error: 'Provider not found' };
    }

    // Build clients from stored DB credentials
    const { clients } = await syncProviderUsageFromDb();

    // Narrow to the single provider's client
    const targetClients = clients.filter((c) => c.providerSlug === provider.slug);
    if (targetClients.length === 0) {
      return { success: false, error: 'No credentials found for this provider' };
    }

    // Run sync with the isolated client
    const result = await syncProviderUsage(targetClients)({});

    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    revalidatePath('/cost-tracking/providers');
    revalidatePath('/cost-tracking');
    return { success: true, data: { synced: targetClients.length } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Sync failed',
    };
  }
}
