// =============================================================================
// Application — Test Provider Connection Use Case
// =============================================================================
// Validates provider credentials by making a lightweight API call without
// persisting anything. Used during the onboarding wizard to verify that the
// credentials the user has entered are correct before saving them.
//
// Flow:
//   1. Validate providerSlug is one of the four supported providers
//   2. Build a temporary ProviderUsageClient from the supplied credentials
//   3. Call client.testConnection()
//   4. Return the structured result (success + optional detail, or error string)
//
// Pre-wired export: `testProviderConnection`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { parseServiceAccountJson } from '../domain/serviceAccountCredential';
import { makeOpenAIUsageClient } from '../infrastructure/providers/openaiUsageClient';
import { makeAnthropicUsageClient } from '../infrastructure/providers/anthropicUsageClient';
import { makeVertexUsageClient } from '../infrastructure/providers/vertexUsageClient';
import { makeGeminiUsageClient } from '../infrastructure/providers/geminiUsageClient';
import { CostTrackingError } from './costTrackingError';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type TestProviderConnectionInput = {
  providerSlug: string;
  /**
   * Provider-specific credentials (not persisted — used only for the probe):
   *   openai        → { apiKey: string }
   *   anthropic     → { adminApiKey: string }
   *   google_vertex → { serviceAccountJson: string }  (raw GCP Service Account JSON)
   *   google_gemini → { serviceAccountJson: string }  (raw GCP Service Account JSON)
   */
  credentials: Record<string, string>;
};

export type TestProviderConnectionOutput = { detail?: string };

type SupportedProviderSlug = 'openai' | 'anthropic' | 'google_vertex' | 'google_gemini';

const SUPPORTED_SLUGS: SupportedProviderSlug[] = [
  'openai',
  'anthropic',
  'google_vertex',
  'google_gemini',
];

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the testProviderConnection use case.
 *
 * No repositories are needed — this use case is stateless. It builds a
 * temporary client from the supplied credentials and pings the provider API.
 *
 * @returns Async use case function
 */
export const makeTestProviderConnectionUseCase = () => {
  return async (
    data: TestProviderConnectionInput,
  ): Promise<Result<TestProviderConnectionOutput, CostTrackingError>> => {
    // 1. Validate slug
    if (!SUPPORTED_SLUGS.includes(data.providerSlug as SupportedProviderSlug)) {
      return {
        success: false,
        error: new CostTrackingError(
          `Unsupported provider slug "${data.providerSlug}". Must be one of: ${SUPPORTED_SLUGS.join(', ')}.`,
          'VALIDATION_ERROR',
        ),
      };
    }

    const slug = data.providerSlug as SupportedProviderSlug;

    // 2. Build temporary client from credentials
    let testConnection: (() => Promise<{ success: true; detail?: string } | { success: false; error: string }>) | undefined;

    try {
      switch (slug) {
        case 'openai': {
          const apiKey = data.credentials.apiKey;
          if (!apiKey) {
            return {
              success: false,
              error: new CostTrackingError('Missing required credential: apiKey', 'VALIDATION_ERROR'),
            };
          }
          testConnection = makeOpenAIUsageClient(apiKey).testConnection;
          break;
        }

        case 'anthropic': {
          const adminApiKey = data.credentials.adminApiKey;
          if (!adminApiKey) {
            return {
              success: false,
              error: new CostTrackingError(
                'Missing required credential: adminApiKey',
                'VALIDATION_ERROR',
              ),
            };
          }
          testConnection = makeAnthropicUsageClient(adminApiKey).testConnection;
          break;
        }

        case 'google_vertex': {
          const rawJson = data.credentials.serviceAccountJson;
          if (!rawJson) {
            return {
              success: false,
              error: new CostTrackingError(
                'Missing required credential: serviceAccountJson',
                'VALIDATION_ERROR',
              ),
            };
          }
          const parseResult = parseServiceAccountJson(rawJson);
          if (!parseResult.success) {
            return {
              success: false,
              error: new CostTrackingError(parseResult.error.message, 'VALIDATION_ERROR'),
            };
          }
          testConnection = makeVertexUsageClient(parseResult.value).testConnection;
          break;
        }

        case 'google_gemini': {
          const rawJson = data.credentials.serviceAccountJson;
          if (!rawJson) {
            return {
              success: false,
              error: new CostTrackingError(
                'Missing required credential: serviceAccountJson',
                'VALIDATION_ERROR',
              ),
            };
          }
          const parseResult = parseServiceAccountJson(rawJson);
          if (!parseResult.success) {
            return {
              success: false,
              error: new CostTrackingError(parseResult.error.message, 'VALIDATION_ERROR'),
            };
          }
          testConnection = makeGeminiUsageClient(parseResult.value).testConnection;
          break;
        }
      }
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to initialise provider client', 'SERVICE_ERROR'),
      };
    }

    // 3. Call testConnection
    if (!testConnection) {
      return {
        success: false,
        error: new CostTrackingError(
          `Provider "${slug}" does not support connection testing`,
          'SERVICE_ERROR',
        ),
      };
    }

    try {
      const result = await testConnection();
      if (result.success) {
        return { success: true, value: { detail: result.detail } };
      }
      return {
        success: false,
        error: new CostTrackingError(result.error, 'VALIDATION_ERROR'),
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError(
          'Connection test failed with an unexpected error',
          'SERVICE_ERROR',
        ),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

export const testProviderConnection = makeTestProviderConnectionUseCase();
