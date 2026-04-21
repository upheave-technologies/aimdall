// =============================================================================
// Cost Tracking Module — Provider Client Builder
// =============================================================================
// Pure factory that constructs the set of active ProviderUsageClient instances
// from a configuration object. Clients are only included when the required
// credentials are present — absent keys result in the provider being skipped
// rather than causing a runtime error.
//
// This module is the single location responsible for wiring environment
// variables to provider client factories. Consumers (use cases, API routes)
// receive the resulting client array without knowing which concrete clients are
// included or how they are constructed.
// =============================================================================

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
 */
export type ProviderClientConfig = {
  openaiApiKey?: string;
  anthropicAdminApiKey?: string;
  vertexProjectId?: string;
  geminiProjectId?: string;
  geminiApiKey?: string;
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
 *   - Vertex    — requires `vertexProjectId`
 *   - Gemini    — requires `geminiProjectId` (apiKey is optional / ADC-only)
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

  if (config.vertexProjectId) {
    clients.push(makeVertexUsageClient(config.vertexProjectId));
  }

  if (config.geminiProjectId) {
    clients.push(makeGeminiUsageClient({
      projectId: config.geminiProjectId,
      apiKey: config.geminiApiKey,
    }));
  }

  return clients;
};
