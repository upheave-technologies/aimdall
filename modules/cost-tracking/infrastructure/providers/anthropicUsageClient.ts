// =============================================================================
// Cost Tracking Module — Anthropic Usage Client
// =============================================================================
// Fetches token consumption data from the Anthropic Admin API and maps it to
// the RawProviderUsageData type.
//
// API endpoints:
//   Usage:  GET https://api.anthropic.com/v1/organizations/usage_report/messages
//   Costs:  GET https://api.anthropic.com/v1/organizations/cost_report
//
// Authentication:
//   x-api-key: ${adminApiKey}        (Admin API key, prefix sk-ant-admin...)
//   anthropic-version: 2023-06-01
//
// Usage endpoint query parameters:
//   starting_at   — RFC 3339 timestamp (inclusive)
//   ending_at     — RFC 3339 timestamp (exclusive)
//   bucket_width  — "1d" (daily aggregation)
//   group_by[]    — repeated params: "api_key_id", "workspace_id", "model"
//   limit         — max buckets per page (31 for daily)
//   page          — continuation token from previous next_page
//
// Cost endpoint query parameters:
//   starting_at   — RFC 3339 timestamp (inclusive)
//   ending_at     — RFC 3339 timestamp (exclusive)
//   bucket_width  — "1d" (only valid value)
//   group_by[]    — "workspace_id", "description"
//   limit         — max buckets per page
//   page          — continuation token
//
// Field mapping (usage response → RawProviderUsageData):
//   model                                    → modelSlug
//   workspace_id                             → segmentExternalId
//   api_key_id                               → credentialExternalId
//   service_tier                             → serviceTier
//   context_window                           → contextTier
//   inference_geo                            → region
//   uncached_input_tokens                    → inputTokens (already uncached)
//   output_tokens                            → outputTokens
//   thinking_tokens                          → thinkingTokens
//   cache_read_input_tokens                  → cachedInputTokens
//   cache_creation.ephemeral_5m_input_tokens
//     + cache_creation.ephemeral_1h_input_tokens → cacheWriteTokens
//   server_tool_use.web_search_requests      → searchCount
//
// IMPORTANT: Anthropic's uncached_input_tokens does NOT include cached tokens,
// so no deduction is needed (unlike OpenAI).
//
// Error handling:
//   Non-2xx responses and network errors are caught, logged, and result in an
//   empty array being returned. The client never throws.
// =============================================================================

import { ProviderUsageClient, RawProviderUsageData, RawProviderCostData } from './types';
import { logger } from '../logger';

// =============================================================================
// SECTION 1: RESPONSE SHAPE TYPES
// =============================================================================

type AnthropicUsageResult = {
  uncached_input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  };
  output_tokens: number;
  thinking_tokens: number;
  server_tool_use: {
    web_search_requests: number;
  };
  model: string | null;
  api_key_id: string | null;
  workspace_id: string | null;
  service_tier: string | null;
  context_window: string | null;
  inference_geo: string | null;
};

type AnthropicUsageBucket = {
  starting_at: string;
  ending_at: string;
  results: AnthropicUsageResult[];
};

type AnthropicUsageResponse = {
  data: AnthropicUsageBucket[];
  has_more: boolean;
  next_page: string | null;
};

type AnthropicCostResult = {
  amount: string;
  currency: string;
  cost_type: string | null;
  description: string | null;
  model: string | null;
  token_type: string | null;
  context_window: string | null;
  service_tier: string | null;
  workspace_id: string | null;
  inference_geo: string | null;
};

type AnthropicCostBucket = {
  starting_at: string;
  ending_at: string;
  results: AnthropicCostResult[];
};

type AnthropicCostResponse = {
  data: AnthropicCostBucket[];
  has_more: boolean;
  next_page: string | null;
};

// =============================================================================
// SECTION 2: FACTORY
// =============================================================================

/**
 * Factory function that creates an Anthropic provider usage client.
 *
 * @param adminApiKey - Anthropic Admin API key (sk-ant-admin...) with usage read access.
 * @returns ProviderUsageClient implementation for Anthropic.
 */
export const makeAnthropicUsageClient = (adminApiKey: string): ProviderUsageClient => ({
  providerSlug: 'anthropic',

  /**
   * Fetch all usage data from Anthropic for the given time window.
   * Uses daily buckets with group_by on api_key_id, workspace_id, model.
   * Handles multi-page responses transparently.
   * Returns [] if the API call fails for any reason (logs error).
   */
  async fetchUsage(startTime: Date, endTime: Date): Promise<RawProviderUsageData[]> {
    const BASE_URL = 'https://api.anthropic.com/v1/organizations/usage_report/messages';
    const fetchStart = Date.now();
    const allRows: RawProviderUsageData[] = [];
    let page: string | null = null;
    let hasMore = true;
    let pageCount = 0;

    logger.info('provider.fetch.start', {
      provider: 'anthropic',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    while (hasMore) {
      pageCount++;
      const params = new URLSearchParams({
        starting_at: startTime.toISOString(),
        ending_at: endTime.toISOString(),
        bucket_width: '1d',
        limit: '31',
      });

      // Anthropic expects repeated group_by[] params
      params.append('group_by[]', 'api_key_id');
      params.append('group_by[]', 'workspace_id');
      params.append('group_by[]', 'model');
      params.append('group_by[]', 'service_tier');

      if (page !== null) {
        params.set('page', page);
      }

      const url = `${BASE_URL}?${params.toString()}`;

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            'x-api-key': adminApiKey,
            'anthropic-version': '2023-06-01',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(30_000),
        });
      } catch (networkError) {
        logger.error('provider.fetch.network_error', {
          provider: 'anthropic',
          page: pageCount,
          error: networkError instanceof Error ? networkError.message : String(networkError),
        });
        return allRows;
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        logger.error('provider.fetch.api_error', {
          provider: 'anthropic',
          status: response.status,
          statusText: response.statusText,
          page: pageCount,
          body: errorBody.slice(0, 500),
        });
        return allRows;
      }

      let body: AnthropicUsageResponse;
      try {
        body = (await response.json()) as AnthropicUsageResponse;
      } catch (parseError) {
        logger.error('provider.fetch.parse_error', {
          provider: 'anthropic',
          page: pageCount,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        return allRows;
      }

      logger.info('provider.fetch.page', {
        provider: 'anthropic',
        page: pageCount,
        buckets: body.data.length,
        hasMore: body.has_more,
      });

      for (const bucket of body.data) {
        const bucketStart = new Date(bucket.starting_at);
        const bucketEnd = new Date(bucket.ending_at);

        for (const result of bucket.results) {
          try {
            // Skip results with no model (shouldn't happen with group_by model)
            if (!result.model) continue;

            const cacheWriteTokens =
              (result.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
              (result.cache_creation?.ephemeral_1h_input_tokens ?? 0);

            allRows.push({
              modelSlug: result.model,
              serviceCategory: 'text_generation',
              credentialExternalId: result.api_key_id ?? undefined,
              segmentExternalId: result.workspace_id ?? undefined,
              serviceTier: result.service_tier ?? undefined,
              contextTier: result.context_window ?? undefined,
              region: result.inference_geo ?? undefined,
              bucketStart,
              bucketEnd,
              bucketWidth: '1d',
              // Anthropic's uncached_input_tokens is already uncached — no deduction needed
              inputTokens: result.uncached_input_tokens ?? 0,
              outputTokens: result.output_tokens ?? 0,
              thinkingTokens: result.thinking_tokens ?? 0,
              cachedInputTokens: result.cache_read_input_tokens ?? 0,
              cacheWriteTokens,
              searchCount: result.server_tool_use?.web_search_requests ?? 0,
              requestCount: undefined, // Anthropic usage endpoint doesn't report request count
            });
          } catch (err) {
            logger.warn('provider.fetch.usage.record.skip', {
              provider: 'anthropic',
              bucketStart: bucketStart.toISOString(),
              model: typeof result === 'object' && result !== null ? (result as Record<string, unknown>).model : 'unknown',
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      hasMore = body.has_more;
      page = body.next_page;
    }

    logger.info('provider.fetch.complete', {
      provider: 'anthropic',
      pages: pageCount,
      records: allRows.length,
      durationMs: Date.now() - fetchStart,
    });

    return allRows;
  },

  /**
   * Fetch cost data from the Anthropic Cost Report API.
   * Returns provider-reported dollar amounts (daily, grouped by description).
   */
  async fetchCosts(startTime: Date, endTime: Date): Promise<RawProviderCostData[]> {
    const BASE_URL = 'https://api.anthropic.com/v1/organizations/cost_report';
    const allRows: RawProviderCostData[] = [];
    let page: string | null = null;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore) {
      pageCount++;
      const params = new URLSearchParams({
        starting_at: startTime.toISOString(),
        ending_at: endTime.toISOString(),
        bucket_width: '1d',
        limit: '31',
      });

      params.append('group_by[]', 'workspace_id');
      params.append('group_by[]', 'description');

      if (page !== null) {
        params.set('page', page);
      }

      const url = `${BASE_URL}?${params.toString()}`;

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            'x-api-key': adminApiKey,
            'anthropic-version': '2023-06-01',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(30_000),
        });
      } catch (networkError) {
        logger.error('provider.fetch_costs.network_error', {
          provider: 'anthropic',
          page: pageCount,
          error: networkError instanceof Error ? networkError.message : String(networkError),
        });
        return allRows;
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        logger.error('provider.fetch_costs.api_error', {
          provider: 'anthropic',
          status: response.status,
          body: errorBody.slice(0, 500),
        });
        return allRows;
      }

      let body: AnthropicCostResponse;
      try {
        body = (await response.json()) as AnthropicCostResponse;
      } catch {
        return allRows;
      }

      for (const bucket of body.data) {
        const bucketStart = new Date(bucket.starting_at);
        const bucketEnd = new Date(bucket.ending_at);

        for (const result of bucket.results) {
          try {
            // Anthropic cost amounts are in lowest currency units (cents) as a
            // decimal string. Convert to dollars: "12345" cents = $123.45
            const rawAmount = Number(result.amount ?? 0);
            const amountDollars = (Number.isFinite(rawAmount) ? rawAmount / 100 : 0).toFixed(8);

            allRows.push({
              segmentExternalId: result.workspace_id ?? undefined,
              modelSlug: result.model ?? undefined,
              costType: result.cost_type ?? 'tokens',
              tokenType: result.token_type ?? undefined,
              serviceTier: result.service_tier ?? undefined,
              contextTier: result.context_window ?? undefined,
              region: result.inference_geo ?? undefined,
              bucketStart,
              bucketEnd,
              amount: amountDollars,
              currency: result.currency ?? 'USD',
              description: result.description ?? undefined,
            });
          } catch (err) {
            logger.warn('provider.fetch.costs.record.skip', {
              provider: 'anthropic',
              bucketStart: bucketStart.toISOString(),
              bucketEnd: bucketEnd.toISOString(),
              workspaceId: typeof result === 'object' && result !== null ? (result as Record<string, unknown>).workspace_id : undefined,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      hasMore = body.has_more;
      page = body.next_page;
    }

    return allRows;
  },
});
