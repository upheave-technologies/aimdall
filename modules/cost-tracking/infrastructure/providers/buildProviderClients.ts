// =============================================================================
// Cost Tracking Module — Provider Client Builder (Environment Variables)
// =============================================================================
// Pure factory that constructs the set of active ProviderUsageClient instances
// from a configuration object. Clients are only included when the required
// credentials are present — absent keys result in the provider being skipped
// rather than causing a runtime error.
//
// GCP providers (google_vertex, google_gemini) share a single
// GCP_SERVICE_ACCOUNT_JSON environment variable containing the full GCP Service
// Account JSON file contents. Both providers are activated when this variable is
// set and the JSON parses successfully.
//
// This module is the single location responsible for wiring environment
// variables to provider client factories. Consumers (use cases, API routes)
// receive the resulting client array without knowing which concrete clients are
// included or how they are constructed.
// =============================================================================

import { parseServiceAccountJson } from '../../domain/serviceAccountCredential';
import { makeOpenAIUsageClient } from './openaiUsageClient';
import { makeAnthropicUsageClient } from './anthropicUsageClient';
import { makeVertexUsageClient } from './vertexUsageClient';
import { makeGeminiUsageClient } from './geminiUsageClient';
import { ProviderUsageClient } from './types';

// =============================================================================
// SECTION 1: CONFIG TYPE
// =============================================================================

/**
 * Credentials and identifiers needed to construct each provider's usage client.
 * All fields are optional — if a field is absent the corresponding client is
 * not included in the returned array.
 *
 * GCP note: both google_vertex and google_gemini use the same
 * gcpServiceAccountJson. If provided and valid, both clients are included.
 */
export type ProviderClientConfig = {
  openaiApiKey?: string;
  anthropicAdminApiKey?: string;
  /**
   * Full GCP Service Account JSON (the file downloaded from GCP Console).
   * Used for both Vertex AI and Gemini providers. Both clients are activated
   * when this is set and the JSON is valid.
   */
  gcpServiceAccountJson?: string;
};

// =============================================================================
// SECTION 2: BUILDER
// =============================================================================

/**
 * Constructs and returns the set of provider usage clients that have the
 * required credentials present in `config`.
 *
 * Rules:
 *   - OpenAI    — requires `openaiApiKey`
 *   - Anthropic — requires `anthropicAdminApiKey`
 *   - Vertex    — requires `gcpServiceAccountJson` (valid GCP Service Account JSON)
 *   - Gemini    — requires `gcpServiceAccountJson` (valid GCP Service Account JSON)
 *
 * If gcpServiceAccountJson is set but fails validation, neither GCP client is
 * included. Validation errors are silently swallowed here — callers that need
 * error details should call parseServiceAccountJson directly.
 *
 * @param config - Provider credentials, typically sourced from process.env
 * @returns Array of constructed clients (may be empty if no credentials are set)
 */
export const buildProviderClients = (config: ProviderClientConfig): ProviderUsageClient[] => {
  const clients: ProviderUsageClient[] = [];

  if (config.openaiApiKey) {
    clients.push(makeOpenAIUsageClient(config.openaiApiKey));
  }

  if (config.anthropicAdminApiKey) {
    clients.push(makeAnthropicUsageClient(config.anthropicAdminApiKey));
  }

  if (config.gcpServiceAccountJson) {
    const parseResult = parseServiceAccountJson(config.gcpServiceAccountJson);
    if (parseResult.success) {
      const sa = parseResult.value;
      clients.push(makeVertexUsageClient(sa));
      clients.push(makeGeminiUsageClient(sa));
    }
    // If parsing fails, both GCP clients are silently skipped.
    // Invalid env var content is treated the same as an absent var.
  }

  return clients;
};
