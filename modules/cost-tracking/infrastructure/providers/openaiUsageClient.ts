// =============================================================================
// Cost Tracking Module — OpenAI Usage Client
// =============================================================================
// Fetches token consumption data from the OpenAI Organization Usage API and
// maps it to the RawProviderUsageData type.
//
// API endpoint:
//   GET https://api.openai.com/v1/organization/usage/completions
//
// Query parameters:
//   start_time   — Unix epoch seconds (inclusive)
//   end_time     — Unix epoch seconds (inclusive)
//   group_by     — ["project_id","api_key_id","model"]
//   bucket_width — "1h"  (one-hour aggregation buckets)
//   limit        — 168   (one week of hourly buckets per page)
//   page         — (optional) continuation token when has_more is true
//
// Authentication:
//   Authorization: Bearer ${apiKey}
//
// Pagination:
//   The response includes has_more (boolean) and next_page (string | null).
//   When has_more is true the client issues additional requests with
//   page=${next_page} appended until has_more is false.
//
// Field mapping (response result → RawProviderUsageData):
//   model                  → modelSlug
//   project_id             → segmentExternalId  (nullable)
//   api_key_id             → credentialExternalId
//   parent start_time      → bucketStart         (Unix seconds → Date)
//   parent end_time        → bucketEnd           (Unix seconds → Date)
//   "1h"                   → bucketWidth
//   "text_generation"      → serviceCategory
//   input_tokens           → inputTokens
//   output_tokens          → outputTokens
//   input_cached_tokens    → cachedInputTokens
//   0                      → cacheWriteTokens  (OpenAI does not report this)
//   num_model_requests     → requestCount
//
// Error handling:
//   Non-2xx responses and network errors are caught, logged, and result in an
//   empty array being returned. The client never throws.
// =============================================================================

import { ProviderUsageClient, RawProviderUsageData } from './types';
import { logger } from '../logger';

// =============================================================================
// SECTION 1: RESPONSE SHAPE TYPES
// =============================================================================

type OpenAIUsageResult = {
  project_id: string | null;
  api_key_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  input_cached_tokens: number;
  num_model_requests: number;
};

type OpenAIUsageBucket = {
  results: OpenAIUsageResult[];
  start_time: number;
  end_time: number;
};

type OpenAIUsageResponse = {
  data: OpenAIUsageBucket[];
  has_more: boolean;
  next_page: string | null;
};

// =============================================================================
// SECTION 2: FACTORY
// =============================================================================

/**
 * Factory function that creates an OpenAI provider usage client.
 *
 * @param apiKey - OpenAI organisation-level API key with usage read access.
 * @returns ProviderUsageClient implementation for OpenAI.
 */
export const makeOpenAIUsageClient = (apiKey: string): ProviderUsageClient => ({
  providerSlug: 'openai',

  /**
   * Fetch all completions usage from OpenAI for the given time window.
   * Handles multi-page responses transparently.
   * Returns [] if the API call fails for any reason (logs error).
   */
  async fetchUsage(startTime: Date, endTime: Date): Promise<RawProviderUsageData[]> {
    const BASE_URL = 'https://api.openai.com/v1/organization/usage/completions';
    const startUnix = Math.floor(startTime.getTime() / 1_000);
    const endUnix = Math.floor(endTime.getTime() / 1_000);
    const fetchStart = Date.now();
    const allRows: RawProviderUsageData[] = [];
    let page: string | null = null;
    let hasMore = true;
    let pageCount = 0;

    logger.info('provider.fetch.start', {
      provider: 'openai',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    while (hasMore) {
      pageCount++;
      const params = new URLSearchParams({
        start_time: String(startUnix),
        end_time: String(endUnix),
        bucket_width: '1h',
        limit: '168',
      });

      // OpenAI expects repeated group_by params, not a JSON array
      params.append('group_by', 'project_id');
      params.append('group_by', 'api_key_id');
      params.append('group_by', 'model');

      if (page !== null) {
        params.set('page', page);
      }

      const url = `${BASE_URL}?${params.toString()}`;

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (networkError) {
        logger.error('provider.fetch.network_error', {
          provider: 'openai',
          page: pageCount,
          error: networkError instanceof Error ? networkError.message : String(networkError),
        });
        return allRows;
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        logger.error('provider.fetch.api_error', {
          provider: 'openai',
          status: response.status,
          statusText: response.statusText,
          page: pageCount,
          body: errorBody.slice(0, 500),
        });
        return allRows;
      }

      let body: OpenAIUsageResponse;
      try {
        body = (await response.json()) as OpenAIUsageResponse;
      } catch (parseError) {
        logger.error('provider.fetch.parse_error', {
          provider: 'openai',
          page: pageCount,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        return allRows;
      }

      logger.info('provider.fetch.page', {
        provider: 'openai',
        page: pageCount,
        buckets: body.data.length,
        hasMore: body.has_more,
      });

      // Map each bucket's results to RawProviderUsageData rows
      for (const bucket of body.data) {
        const bucketStart = new Date(bucket.start_time * 1_000);
        const bucketEnd = new Date(bucket.end_time * 1_000);

        for (const result of bucket.results) {
          // OpenAI's input_tokens INCLUDES cached tokens. Deduct to get
          // uncached-only, so cost calculation never double-counts.
          const cachedInput = result.input_cached_tokens ?? 0;
          const uncachedInput = result.input_tokens - cachedInput;

          allRows.push({
            modelSlug: result.model,
            serviceCategory: 'text_generation',
            credentialExternalId: result.api_key_id,
            segmentExternalId: result.project_id ?? undefined,
            bucketStart,
            bucketEnd,
            bucketWidth: '1h',
            inputTokens: uncachedInput,
            outputTokens: result.output_tokens,
            cachedInputTokens: cachedInput,
            cacheWriteTokens: 0,
            requestCount: result.num_model_requests,
          });
        }
      }

      hasMore = body.has_more;
      page = body.next_page;
    }

    logger.info('provider.fetch.complete', {
      provider: 'openai',
      pages: pageCount,
      records: allRows.length,
      durationMs: Date.now() - fetchStart,
    });

    return allRows;
  },
});
