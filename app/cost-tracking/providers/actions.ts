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
//   connectProviderAction   — store credentials, spawn background sync, redirect
//   disconnectProviderAction — soft-delete credentials and pause the provider
//   triggerSyncAction        — run an on-demand usage sync for one provider
//   getSyncStatusAction      — lightweight polling target for client-side sync state
// =============================================================================

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { testProviderConnection } from '@/modules/cost-tracking/application/testProviderConnectionUseCase';
import { connectProvider } from '@/modules/cost-tracking/application/connectProviderUseCase';
import { disconnectProvider } from '@/modules/cost-tracking/application/disconnectProviderUseCase';
import { listProviderStatus } from '@/modules/cost-tracking/application/listProviderStatusUseCase';
import { getSyncStatus } from '@/modules/cost-tracking/application/getSyncStatusUseCase';
import type { ProviderSyncStatus } from '@/modules/cost-tracking/application/getSyncStatusUseCase';
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
 *   google_vertex → serviceAccountJson  (raw GCP Service Account JSON)
 *   google_gemini → serviceAccountJson  (raw GCP Service Account JSON)
 */
export async function testConnectionAction(
  formData: FormData,
): Promise<ActionResult<{ detail?: string }>> {
  const providerSlug = formData.get('providerSlug') as string | null;

  if (!providerSlug || providerSlug.trim().length === 0) {
    return { success: false, error: 'Provider is required' };
  }

  const slug = providerSlug.trim();

  // Collect all non-reserved fields as credentials.
  // serviceAccountJson is treated as opaque — never logged or inspected here.
  const credentials: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key !== 'providerSlug' && typeof value === 'string' && value.trim().length > 0) {
      credentials[key] = value.trim();
    }
  }

  const result = await testProviderConnection({ providerSlug: slug, credentials });

  if (!result.success) {
    const raw = result.error.message;
    const code = result.error.code;

    let userMessage: string;

    if (code === 'VALIDATION_ERROR') {
      // Domain-layer parse errors (serviceAccountJson, apiKey, etc.) are already
      // plain-language — surface them directly.
      if (raw.includes('serviceAccountJson')) {
        userMessage = 'A Service Account JSON key file is required to connect this Google provider. Upload the JSON key file you downloaded from the Google Cloud Console.';
      } else {
        userMessage = raw;
      }
    } else {
      // SERVICE_ERROR — could be network, API not enabled, or insufficient permissions.
      if (slug === 'google_vertex' || slug === 'google_gemini') {
        userMessage =
          "Couldn't reach Google Cloud. Check that the Cloud Monitoring API is enabled on your project and that the service account has the Monitoring Viewer role, then try again.";
      } else {
        userMessage =
          "Couldn't connect to the provider. Check your credentials and try again.";
      }
    }

    return { success: false, error: userMessage };
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
 * On success: spawns a background sync (fire-and-forget), revalidates paths,
 * and redirects the browser to /cost-tracking?connected=<slug>. Because
 * redirect() throws a Next.js signal, the return type is only reached on the
 * error path — callers should handle { success: false } inline.
 *
 * Required fields:  providerSlug, displayName
 * Optional fields:  label
 * Credential fields (provider-specific, collected dynamically):
 *   openai        → apiKey
 *   anthropic     → adminApiKey
 *   google_vertex → serviceAccountJson  (raw GCP Service Account JSON)
 *   google_gemini → serviceAccountJson  (raw GCP Service Account JSON)
 */
export async function connectProviderAction(
  formData: FormData,
): Promise<ActionResult<never>> {
  const providerSlug = formData.get('providerSlug') as string | null;
  const displayName = formData.get('displayName') as string | null;
  const label = formData.get('label') as string | null;

  if (!providerSlug || providerSlug.trim().length === 0) {
    return { success: false, error: 'Provider is required.' };
  }
  if (!displayName || displayName.trim().length === 0) {
    return { success: false, error: 'Display name is required.' };
  }

  const slug = providerSlug.trim();

  // Collect credential fields, excluding the reserved form fields.
  // serviceAccountJson is treated as opaque — never logged or inspected here.
  const reservedKeys = new Set(['providerSlug', 'displayName', 'label']);
  const credentials: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!reservedKeys.has(key) && typeof value === 'string' && value.trim().length > 0) {
      credentials[key] = value.trim();
    }
  }

  const result = await connectProvider({
    providerSlug: slug,
    displayName: displayName.trim(),
    credentials,
    label: label?.trim() || undefined,
  });

  if (!result.success) {
    // Translate internal error messages to plain user-facing language.
    // Never surface credential values, raw exception names, or internal field names.
    const raw = result.error.message;
    let userMessage: string;

    if (result.error.code === 'VALIDATION_ERROR') {
      // Domain-layer validation errors are already plain-language for most cases.
      // Rephrase the "Missing required credential: X" messages to avoid leaking
      // internal field names into the UI.
      if (raw.includes('apiKey')) {
        userMessage = 'An API key is required to connect this provider. Check the form and try again.';
      } else if (raw.includes('adminApiKey')) {
        userMessage = 'An Admin API key is required to connect Anthropic. Check the form and try again.';
      } else if (raw.includes('serviceAccountJson')) {
        userMessage = 'A Service Account JSON key file is required to connect this Google provider. Upload the JSON key file you downloaded from the Google Cloud Console.';
      } else if (raw.includes('Unsupported provider')) {
        userMessage = 'That provider is not supported yet. Please choose a listed provider.';
      } else {
        // Parse errors from serviceAccountCredential domain are already
        // user-facing plain text (e.g. "The file you uploaded is not valid JSON…").
        userMessage = raw;
      }
    } else {
      // SERVICE_ERROR — encryption failure, DB error, or provider-side rejection.
      userMessage =
        'Something went wrong while saving your credentials. Please try again, or contact support if the problem continues.';
    }

    return { success: false, error: userMessage };
  }

  // Spawn a background sync — fire and forget.
  // connectProvider already called markSyncStarted, so the dashboard will show
  // "syncing" immediately on next render. The sync runs asynchronously while
  // the user is redirected to the dashboard.
  // Using .then().catch() guarantees ALL rejections are handled — including any
  // that escape the async body — preventing Node unhandledRejection crashes.
  syncProviderUsageFromDb()
    .then(async ({ clients, sync }) => {
      const targetClients = clients.filter((c) => c.providerSlug === slug);
      if (targetClients.length > 0) {
        await sync({});
      }
    })
    .catch((err) => {
      console.error('[connectProviderAction] Background sync failed', err);
    });

  revalidatePath('/cost-tracking/providers');
  revalidatePath('/cost-tracking');

  // redirect() throws a Next.js NEXT_REDIRECT signal — it never returns normally.
  // The wizard's handleConnect will not receive a return value on success; the
  // browser navigates to the dashboard instead.
  redirect(`/cost-tracking?connected=${encodeURIComponent(slug)}`);
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

// =============================================================================
// getSyncStatusAction
// =============================================================================

/**
 * Lightweight polling target for client-side sync state.
 * Returns sync lifecycle fields for all known providers — no aggregations, no
 * credential lookups. Intended to be called every ~5 s by the dashboard.
 *
 * Dates are serialised to ISO strings so they survive the server→client boundary.
 */

export type SyncStatusProvider = {
  slug: string;
  syncState: 'idle' | 'in_progress' | 'success' | 'error';
  syncStartedAt: string | null;
  syncError: string | null;
  lastSyncAt: string | null;
};

export type GetSyncStatusActionResult =
  | { ok: true; providers: SyncStatusProvider[] }
  | { ok: false; error: string };

export async function getSyncStatusAction(): Promise<GetSyncStatusActionResult> {
  const result = await getSyncStatus();

  if (!result.success) {
    return { ok: false, error: 'Unable to retrieve sync status. Please refresh the page.' };
  }

  const providers: SyncStatusProvider[] = result.value.map((p: ProviderSyncStatus) => ({
    slug: p.slug,
    syncState: p.syncState,
    syncStartedAt: p.syncStartedAt ? p.syncStartedAt.toISOString() : null,
    syncError: p.syncError,
    lastSyncAt: p.lastSyncAt ? p.lastSyncAt.toISOString() : null,
  }));

  return { ok: true, providers };
}
