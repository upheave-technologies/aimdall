// =============================================================================
// Route — /cost-tracking/providers
// =============================================================================
// Server Component: fetches provider connection status for all four supported
// AI providers (OpenAI, Anthropic, Google Vertex AI, Google Gemini) and makes
// the data available for Frankie to render via ProvidersPageView.
//
// Data layer responsibilities:
//   - Call listProviderStatus() to retrieve the full catalog with live status
//   - Throw on hard error so the error boundary catches it
//   - Return null — Frankie replaces null with ProvidersPageView
// =============================================================================

import { listProviderStatus } from '@/modules/cost-tracking/application/listProviderStatusUseCase';
import {
  testConnectionAction,
  connectProviderAction,
  disconnectProviderAction,
  triggerSyncAction,
} from './actions';
import { ProvidersPageView } from './_components/ProvidersPageView';
import type { ProviderStatusItem } from './_components/ProvidersPageView';

export const dynamic = 'force-dynamic';

// =============================================================================
// VOID WRAPPERS
// =============================================================================
// Next.js requires form action props to be (formData: FormData) => Promise<void>.
// The exported actions return ActionResult so they can be called programmatically.
// These thin wrappers satisfy the form prop type constraint.

async function connectAction(formData: FormData): Promise<void> {
  'use server';
  await connectProviderAction(formData);
}

async function disconnectAction(formData: FormData): Promise<void> {
  'use server';
  await disconnectProviderAction(formData);
}

// =============================================================================
// Page
// =============================================================================

export default async function ProvidersPage() {
  const statusResult = await listProviderStatus();

  if (!statusResult.success) {
    throw new Error(statusResult.error.message);
  }

  const providers = statusResult.value as ProviderStatusItem[];

  return (
    <ProvidersPageView
      providers={providers}
      connectAction={connectAction}
      disconnectAction={disconnectAction}
      testConnectionAction={testConnectionAction}
      connectProviderAction={connectProviderAction}
      triggerSyncAction={triggerSyncAction}
    />
  );
}
