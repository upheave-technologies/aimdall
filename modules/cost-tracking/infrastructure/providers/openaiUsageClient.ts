// =============================================================================
// Cost Tracking Module — OpenAI Usage Client
// =============================================================================
// Fetches token consumption data from the OpenAI Organization Usage API and
// maps it to the RawProviderUsageData type.
//
// Endpoints fetched (all share the same pagination/auth pattern):
//   GET https://api.openai.com/v1/organization/usage/completions
//   GET https://api.openai.com/v1/organization/usage/embeddings
//   GET https://api.openai.com/v1/organization/usage/images
//   GET https://api.openai.com/v1/organization/usage/audio_speeches
//   GET https://api.openai.com/v1/organization/usage/audio_transcriptions
//   GET https://api.openai.com/v1/organization/usage/moderations
//   GET https://api.openai.com/v1/organization/usage/code_interpreter_sessions
//   GET https://api.openai.com/v1/organization/usage/vector_stores
//
// Common query parameters:
//   start_time   — Unix epoch seconds (inclusive)
//   end_time     — Unix epoch seconds (inclusive)
//   group_by     — repeated param (varies per endpoint; see SECTION 4)
//   bucket_width — "1h" for most; "1d" for vector_stores
//   limit        — 168 (one week of hourly buckets per page)
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
// Field mappings per endpoint — see SECTION 3 mapper functions.
//
// completions field mapping (response result → RawProviderUsageData):
//   model                  → modelSlug
//   project_id             → segmentExternalId  (nullable)
//   api_key_id             → credentialExternalId
//   parent start_time      → bucketStart         (Unix seconds → Date)
//   parent end_time        → bucketEnd           (Unix seconds → Date)
//   "1h"                   → bucketWidth
//   "text_generation"      → serviceCategory
//   input_tokens           → inputTokens
//   output_tokens - reasoning_tokens → outputTokens  (reasoning tokens deducted — OpenAI
//                            includes them in output_tokens but they may be priced differently)
//   reasoning_tokens       → thinkingTokens      (o3, o3-mini, o4-mini models)
//   input_cached_tokens    → cachedInputTokens
//   0                      → cacheWriteTokens  (OpenAI does not report this)
//   num_model_requests     → requestCount
//
// Error handling:
//   Non-2xx responses and network errors are caught, logged, and result in
//   partial results collected so far being returned. The client never throws.
// =============================================================================

import { ProviderUsageClient, RawProviderCostData, RawProviderUsageData } from './types';
import { logger } from '../logger';

// =============================================================================
// SECTION 1: RESPONSE SHAPE TYPES
// =============================================================================

type OpenAIUsageBucket<TResult> = {
  results: TResult[];
  start_time: number;
  end_time: number;
};

type OpenAIUsageResponse<TResult> = {
  data: OpenAIUsageBucket<TResult>[];
  has_more: boolean;
  next_page: string | null;
};

// --- completions ---
type CompletionsResult = {
  project_id: string | null;
  api_key_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  input_cached_tokens: number;
  num_model_requests: number;
};

// --- embeddings ---
type EmbeddingsResult = {
  project_id: string | null;
  api_key_id: string;
  model: string;
  input_tokens: number;
  num_model_requests: number;
};

// --- images ---
type ImagesResult = {
  project_id: string | null;
  api_key_id: string;
  model: string;
  num_images: number;
  num_model_requests: number;
  image_size: string | null;
};

// --- audio speeches ---
type AudioSpeechesResult = {
  project_id: string | null;
  api_key_id: string;
  model: string;
  characters: number;
  num_model_requests: number;
};

// --- audio transcriptions ---
type AudioTranscriptionsResult = {
  project_id: string | null;
  api_key_id: string;
  model: string;
  seconds: number;
  num_model_requests: number;
};

// --- moderations ---
type ModerationsResult = {
  project_id: string | null;
  api_key_id: string;
  model: string;
  input_tokens: number;
  num_model_requests: number;
};

// --- code interpreter sessions ---
type CodeInterpreterResult = {
  project_id: string | null;
  api_key_id: string;
  model?: string | null;
  num_sessions: number;
};

// --- vector stores ---
type VectorStoresResult = {
  project_id: string | null;
  api_key_id: string;
  model?: string | null;
  usage_bytes: number;
};

// --- costs ---
type CostsAmountResult = {
  amount: { value: number; currency: string };
  line_item: string | null;
  project_id: string | null;
  organization_id: string;
};

// =============================================================================
// SECTION 2: SHARED PAGINATION HELPER
// =============================================================================

/**
 * Fetches all pages from a single OpenAI usage endpoint and returns the
 * combined bucket list along with the total page count.
 *
 * Returns partial results (buckets fetched so far) on network or API errors;
 * logs the error but never throws.
 */
async function fetchOpenAIPaginatedUsage<TResult>(
  baseUrl: string,
  apiKey: string,
  startUnix: number,
  endUnix: number,
  bucketWidth: '1h' | '1d',
  groupBy: string[],
  category: string,
): Promise<{ buckets: OpenAIUsageBucket<TResult>[]; pageCount: number }> {
  const allBuckets: OpenAIUsageBucket<TResult>[] = [];
  let page: string | null = null;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore) {
    pageCount++;

    const params = new URLSearchParams({
      start_time: String(startUnix),
      end_time: String(endUnix),
      bucket_width: bucketWidth,
      limit: '168',
    });

    // OpenAI expects repeated group_by params, not a JSON array
    for (const dim of groupBy) {
      params.append('group_by', dim);
    }

    if (page !== null) {
      params.set('page', page);
    }

    const url = `${baseUrl}?${params.toString()}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (networkError) {
      logger.error('provider.fetch.network_error', {
        provider: 'openai',
        category,
        page: pageCount,
        error: networkError instanceof Error ? networkError.message : String(networkError),
      });
      return { buckets: allBuckets, pageCount };
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.error('provider.fetch.api_error', {
        provider: 'openai',
        category,
        status: response.status,
        statusText: response.statusText,
        page: pageCount,
        body: errorBody.slice(0, 500),
      });
      return { buckets: allBuckets, pageCount };
    }

    let body: OpenAIUsageResponse<TResult>;
    try {
      body = (await response.json()) as OpenAIUsageResponse<TResult>;
    } catch (parseError) {
      logger.error('provider.fetch.parse_error', {
        provider: 'openai',
        category,
        page: pageCount,
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return { buckets: allBuckets, pageCount };
    }

    logger.info('provider.fetch.page', {
      provider: 'openai',
      category,
      page: pageCount,
      buckets: body.data.length,
      hasMore: body.has_more,
    });

    allBuckets.push(...body.data);
    hasMore = body.has_more;
    page = body.next_page;
  }

  return { buckets: allBuckets, pageCount };
}

// =============================================================================
// SECTION 3: PER-ENDPOINT MAPPERS
// =============================================================================

function mapCompletionsBuckets(
  buckets: OpenAIUsageBucket<CompletionsResult>[],
): RawProviderUsageData[] {
  const rows: RawProviderUsageData[] = [];
  for (const bucket of buckets) {
    const bucketStart = new Date(bucket.start_time * 1_000);
    const bucketEnd = new Date(bucket.end_time * 1_000);
    for (const result of bucket.results) {
      try {
        // OpenAI's input_tokens INCLUDES cached tokens. Deduct to get
        // uncached-only, so cost calculation never double-counts.
        const cachedInput = result.input_cached_tokens ?? 0;
        const uncachedInput = (result.input_tokens ?? 0) - cachedInput;

        const reasoningTokens = result.reasoning_tokens ?? 0;

        rows.push({
          modelSlug: result.model,
          serviceCategory: 'text_generation',
          credentialExternalId: result.api_key_id,
          segmentExternalId: result.project_id ?? undefined,
          bucketStart,
          bucketEnd,
          bucketWidth: '1h',
          inputTokens: uncachedInput,
          // OpenAI's output_tokens includes reasoning tokens — deduct so the
          // two metrics are mutually exclusive and cost calculation stays accurate.
          outputTokens: (result.output_tokens ?? 0) - reasoningTokens,
          thinkingTokens: reasoningTokens,
          cachedInputTokens: cachedInput,
          cacheWriteTokens: 0,
          requestCount: result.num_model_requests ?? 0,
        });
      } catch (err) {
        logger.warn('provider.fetch.usage.record.skip', {
          provider: 'openai',
          category: 'completions',
          model: typeof result === 'object' && result !== null ? (result as Record<string, unknown>).model : 'unknown',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return rows;
}

function mapEmbeddingsBuckets(
  buckets: OpenAIUsageBucket<EmbeddingsResult>[],
): RawProviderUsageData[] {
  const rows: RawProviderUsageData[] = [];
  for (const bucket of buckets) {
    const bucketStart = new Date(bucket.start_time * 1_000);
    const bucketEnd = new Date(bucket.end_time * 1_000);
    for (const result of bucket.results) {
      try {
        rows.push({
          modelSlug: result.model,
          serviceCategory: 'embedding',
          credentialExternalId: result.api_key_id,
          segmentExternalId: result.project_id ?? undefined,
          bucketStart,
          bucketEnd,
          bucketWidth: '1h',
          inputTokens: result.input_tokens ?? 0,
          requestCount: result.num_model_requests ?? 0,
        });
      } catch (err) {
        logger.warn('provider.fetch.usage.record.skip', {
          provider: 'openai',
          category: 'embeddings',
          model: typeof result === 'object' && result !== null ? (result as Record<string, unknown>).model : 'unknown',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return rows;
}

function mapImagesBuckets(buckets: OpenAIUsageBucket<ImagesResult>[]): RawProviderUsageData[] {
  const rows: RawProviderUsageData[] = [];
  for (const bucket of buckets) {
    const bucketStart = new Date(bucket.start_time * 1_000);
    const bucketEnd = new Date(bucket.end_time * 1_000);
    for (const result of bucket.results) {
      try {
        rows.push({
          modelSlug: result.model,
          serviceCategory: 'image_generation',
          credentialExternalId: result.api_key_id,
          segmentExternalId: result.project_id ?? undefined,
          bucketStart,
          bucketEnd,
          bucketWidth: '1h',
          imageCount: result.num_images ?? 0,
          requestCount: result.num_model_requests ?? 0,
          providerMetadata:
            result.image_size != null ? { imageSize: result.image_size } : undefined,
        });
      } catch (err) {
        logger.warn('provider.fetch.usage.record.skip', {
          provider: 'openai',
          category: 'images',
          model: typeof result === 'object' && result !== null ? (result as Record<string, unknown>).model : 'unknown',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return rows;
}

function mapAudioSpeechesBuckets(
  buckets: OpenAIUsageBucket<AudioSpeechesResult>[],
): RawProviderUsageData[] {
  const rows: RawProviderUsageData[] = [];
  for (const bucket of buckets) {
    const bucketStart = new Date(bucket.start_time * 1_000);
    const bucketEnd = new Date(bucket.end_time * 1_000);
    for (const result of bucket.results) {
      try {
        rows.push({
          modelSlug: result.model,
          serviceCategory: 'audio_speech',
          credentialExternalId: result.api_key_id,
          segmentExternalId: result.project_id ?? undefined,
          bucketStart,
          bucketEnd,
          bucketWidth: '1h',
          characterCount: result.characters ?? 0,
          requestCount: result.num_model_requests ?? 0,
        });
      } catch (err) {
        logger.warn('provider.fetch.usage.record.skip', {
          provider: 'openai',
          category: 'audio_speeches',
          model: typeof result === 'object' && result !== null ? (result as Record<string, unknown>).model : 'unknown',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return rows;
}

function mapAudioTranscriptionsBuckets(
  buckets: OpenAIUsageBucket<AudioTranscriptionsResult>[],
): RawProviderUsageData[] {
  const rows: RawProviderUsageData[] = [];
  for (const bucket of buckets) {
    const bucketStart = new Date(bucket.start_time * 1_000);
    const bucketEnd = new Date(bucket.end_time * 1_000);
    for (const result of bucket.results) {
      try {
        rows.push({
          modelSlug: result.model,
          serviceCategory: 'audio_transcription',
          credentialExternalId: result.api_key_id,
          segmentExternalId: result.project_id ?? undefined,
          bucketStart,
          bucketEnd,
          bucketWidth: '1h',
          durationSeconds: result.seconds ?? 0,
          requestCount: result.num_model_requests ?? 0,
        });
      } catch (err) {
        logger.warn('provider.fetch.usage.record.skip', {
          provider: 'openai',
          category: 'audio_transcriptions',
          model: typeof result === 'object' && result !== null ? (result as Record<string, unknown>).model : 'unknown',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return rows;
}

function mapModerationsBuckets(
  buckets: OpenAIUsageBucket<ModerationsResult>[],
): RawProviderUsageData[] {
  const rows: RawProviderUsageData[] = [];
  for (const bucket of buckets) {
    const bucketStart = new Date(bucket.start_time * 1_000);
    const bucketEnd = new Date(bucket.end_time * 1_000);
    for (const result of bucket.results) {
      try {
        rows.push({
          modelSlug: result.model,
          serviceCategory: 'moderation',
          credentialExternalId: result.api_key_id,
          segmentExternalId: result.project_id ?? undefined,
          bucketStart,
          bucketEnd,
          bucketWidth: '1h',
          inputTokens: result.input_tokens ?? 0,
          requestCount: result.num_model_requests ?? 0,
        });
      } catch (err) {
        logger.warn('provider.fetch.usage.record.skip', {
          provider: 'openai',
          category: 'moderations',
          model: typeof result === 'object' && result !== null ? (result as Record<string, unknown>).model : 'unknown',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return rows;
}

function mapCodeInterpreterBuckets(
  buckets: OpenAIUsageBucket<CodeInterpreterResult>[],
): RawProviderUsageData[] {
  const rows: RawProviderUsageData[] = [];
  for (const bucket of buckets) {
    const bucketStart = new Date(bucket.start_time * 1_000);
    const bucketEnd = new Date(bucket.end_time * 1_000);
    for (const result of bucket.results) {
      try {
        rows.push({
          // model may be absent for code interpreter sessions
          modelSlug: result.model ?? 'code-interpreter',
          serviceCategory: 'code_execution',
          credentialExternalId: result.api_key_id,
          segmentExternalId: result.project_id ?? undefined,
          bucketStart,
          bucketEnd,
          bucketWidth: '1h',
          sessionCount: result.num_sessions ?? 0,
        });
      } catch (err) {
        logger.warn('provider.fetch.usage.record.skip', {
          provider: 'openai',
          category: 'code_interpreter_sessions',
          model: typeof result === 'object' && result !== null ? (result as Record<string, unknown>).model : 'unknown',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return rows;
}

function mapVectorStoresBuckets(
  buckets: OpenAIUsageBucket<VectorStoresResult>[],
): RawProviderUsageData[] {
  const rows: RawProviderUsageData[] = [];
  for (const bucket of buckets) {
    // Vector stores usage is a point-in-time measurement aggregated daily
    const bucketStart = new Date(bucket.start_time * 1_000);
    const bucketEnd = new Date(bucket.end_time * 1_000);
    for (const result of bucket.results) {
      try {
        rows.push({
          // model may be absent for vector store usage
          modelSlug: result.model ?? 'vector-store',
          serviceCategory: 'vector_storage',
          credentialExternalId: result.api_key_id,
          segmentExternalId: result.project_id ?? undefined,
          bucketStart,
          bucketEnd,
          bucketWidth: '1d',
          storageBytes: result.usage_bytes ?? 0,
        });
      } catch (err) {
        logger.warn('provider.fetch.usage.record.skip', {
          provider: 'openai',
          category: 'vector_stores',
          model: typeof result === 'object' && result !== null ? (result as Record<string, unknown>).model : 'unknown',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return rows;
}

// =============================================================================
// SECTION 4: FACTORY
// =============================================================================

const OPENAI_BASE = 'https://api.openai.com/v1/organization/usage';

/**
 * Aggregate timeout budget for the full multi-endpoint fetch cycle.
 * 8 endpoints × potential pagination × 30s per-request timeout could easily
 * exceed a 120s API route maxDuration. This budget caps the total fetch time
 * and returns partial results when exceeded, leaving 30s margin for use case
 * overhead.
 */
const FETCH_BUDGET_MS = 90_000;

/**
 * Factory function that creates an OpenAI provider usage client.
 *
 * Fetches from all eight OpenAI usage endpoints and merges results into a
 * single flat array. Endpoints are called sequentially to respect the shared
 * organisation-level API key rate limit.
 *
 * @param apiKey - OpenAI organisation-level API key with usage read access.
 * @returns ProviderUsageClient implementation for OpenAI.
 */
export const makeOpenAIUsageClient = (apiKey: string): ProviderUsageClient => ({
  providerSlug: 'openai',

  /**
   * Fetch all usage from all OpenAI endpoints for the given time window.
   * Handles multi-page responses transparently per endpoint.
   * Returns partial results collected so far if any endpoint call fails
   * (errors are logged and collection continues with remaining endpoints).
   */
  async fetchUsage(startTime: Date, endTime: Date): Promise<RawProviderUsageData[]> {
    const startUnix = Math.floor(startTime.getTime() / 1_000);
    const endUnix = Math.floor(endTime.getTime() / 1_000);
    const fetchStart = Date.now();
    const deadline = fetchStart + FETCH_BUDGET_MS;
    const allRows: RawProviderUsageData[] = [];

    logger.info('provider.fetch.start', {
      provider: 'openai',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    // -------------------------------------------------------------------------
    // completions — text_generation  [category 1 / 8]
    // -------------------------------------------------------------------------
    if (Date.now() >= deadline) {
      logger.warn('provider.fetch.deadline_exceeded', {
        provider: 'openai',
        completedCategories: 0,
        totalRecords: allRows.length,
        elapsedMs: Date.now() - fetchStart,
      });
      return allRows;
    }
    logger.info('provider.fetch.category.start', { provider: 'openai', category: 'completions' });
    {
      const { buckets, pageCount } = await fetchOpenAIPaginatedUsage<CompletionsResult>(
        `${OPENAI_BASE}/completions`,
        apiKey,
        startUnix,
        endUnix,
        '1h',
        ['project_id', 'api_key_id', 'model'],
        'completions',
      );
      const rows = mapCompletionsBuckets(buckets);
      allRows.push(...rows);
      logger.info('provider.fetch.category.complete', {
        provider: 'openai',
        category: 'completions',
        pages: pageCount,
        records: rows.length,
      });
    }

    // -------------------------------------------------------------------------
    // embeddings — embedding  [category 2 / 8]
    // -------------------------------------------------------------------------
    if (Date.now() >= deadline) {
      logger.warn('provider.fetch.deadline_exceeded', {
        provider: 'openai',
        completedCategories: 1,
        totalRecords: allRows.length,
        elapsedMs: Date.now() - fetchStart,
      });
      return allRows;
    }
    logger.info('provider.fetch.category.start', { provider: 'openai', category: 'embeddings' });
    {
      const { buckets, pageCount } = await fetchOpenAIPaginatedUsage<EmbeddingsResult>(
        `${OPENAI_BASE}/embeddings`,
        apiKey,
        startUnix,
        endUnix,
        '1h',
        ['project_id', 'api_key_id', 'model'],
        'embeddings',
      );
      const rows = mapEmbeddingsBuckets(buckets);
      allRows.push(...rows);
      logger.info('provider.fetch.category.complete', {
        provider: 'openai',
        category: 'embeddings',
        pages: pageCount,
        records: rows.length,
      });
    }

    // -------------------------------------------------------------------------
    // images — image_generation  [category 3 / 8]
    // -------------------------------------------------------------------------
    if (Date.now() >= deadline) {
      logger.warn('provider.fetch.deadline_exceeded', {
        provider: 'openai',
        completedCategories: 2,
        totalRecords: allRows.length,
        elapsedMs: Date.now() - fetchStart,
      });
      return allRows;
    }
    logger.info('provider.fetch.category.start', { provider: 'openai', category: 'images' });
    {
      const { buckets, pageCount } = await fetchOpenAIPaginatedUsage<ImagesResult>(
        `${OPENAI_BASE}/images`,
        apiKey,
        startUnix,
        endUnix,
        '1h',
        ['project_id', 'api_key_id', 'model'],
        'images',
      );
      const rows = mapImagesBuckets(buckets);
      allRows.push(...rows);
      logger.info('provider.fetch.category.complete', {
        provider: 'openai',
        category: 'images',
        pages: pageCount,
        records: rows.length,
      });
    }

    // -------------------------------------------------------------------------
    // audio_speeches — audio_speech  [category 4 / 8]
    // -------------------------------------------------------------------------
    if (Date.now() >= deadline) {
      logger.warn('provider.fetch.deadline_exceeded', {
        provider: 'openai',
        completedCategories: 3,
        totalRecords: allRows.length,
        elapsedMs: Date.now() - fetchStart,
      });
      return allRows;
    }
    logger.info('provider.fetch.category.start', {
      provider: 'openai',
      category: 'audio_speeches',
    });
    {
      const { buckets, pageCount } = await fetchOpenAIPaginatedUsage<AudioSpeechesResult>(
        `${OPENAI_BASE}/audio_speeches`,
        apiKey,
        startUnix,
        endUnix,
        '1h',
        ['project_id', 'api_key_id', 'model'],
        'audio_speeches',
      );
      const rows = mapAudioSpeechesBuckets(buckets);
      allRows.push(...rows);
      logger.info('provider.fetch.category.complete', {
        provider: 'openai',
        category: 'audio_speeches',
        pages: pageCount,
        records: rows.length,
      });
    }

    // -------------------------------------------------------------------------
    // audio_transcriptions — audio_transcription  [category 5 / 8]
    // -------------------------------------------------------------------------
    if (Date.now() >= deadline) {
      logger.warn('provider.fetch.deadline_exceeded', {
        provider: 'openai',
        completedCategories: 4,
        totalRecords: allRows.length,
        elapsedMs: Date.now() - fetchStart,
      });
      return allRows;
    }
    logger.info('provider.fetch.category.start', {
      provider: 'openai',
      category: 'audio_transcriptions',
    });
    {
      const { buckets, pageCount } = await fetchOpenAIPaginatedUsage<AudioTranscriptionsResult>(
        `${OPENAI_BASE}/audio_transcriptions`,
        apiKey,
        startUnix,
        endUnix,
        '1h',
        ['project_id', 'api_key_id', 'model'],
        'audio_transcriptions',
      );
      const rows = mapAudioTranscriptionsBuckets(buckets);
      allRows.push(...rows);
      logger.info('provider.fetch.category.complete', {
        provider: 'openai',
        category: 'audio_transcriptions',
        pages: pageCount,
        records: rows.length,
      });
    }

    // -------------------------------------------------------------------------
    // moderations — moderation  [category 6 / 8]
    // -------------------------------------------------------------------------
    if (Date.now() >= deadline) {
      logger.warn('provider.fetch.deadline_exceeded', {
        provider: 'openai',
        completedCategories: 5,
        totalRecords: allRows.length,
        elapsedMs: Date.now() - fetchStart,
      });
      return allRows;
    }
    logger.info('provider.fetch.category.start', { provider: 'openai', category: 'moderations' });
    {
      const { buckets, pageCount } = await fetchOpenAIPaginatedUsage<ModerationsResult>(
        `${OPENAI_BASE}/moderations`,
        apiKey,
        startUnix,
        endUnix,
        '1h',
        ['project_id', 'api_key_id', 'model'],
        'moderations',
      );
      const rows = mapModerationsBuckets(buckets);
      allRows.push(...rows);
      logger.info('provider.fetch.category.complete', {
        provider: 'openai',
        category: 'moderations',
        pages: pageCount,
        records: rows.length,
      });
    }

    // -------------------------------------------------------------------------
    // code_interpreter_sessions — code_execution  [category 7 / 8]
    // group_by excludes 'model' — this endpoint may not support it
    // -------------------------------------------------------------------------
    if (Date.now() >= deadline) {
      logger.warn('provider.fetch.deadline_exceeded', {
        provider: 'openai',
        completedCategories: 6,
        totalRecords: allRows.length,
        elapsedMs: Date.now() - fetchStart,
      });
      return allRows;
    }
    logger.info('provider.fetch.category.start', {
      provider: 'openai',
      category: 'code_interpreter_sessions',
    });
    {
      const { buckets, pageCount } = await fetchOpenAIPaginatedUsage<CodeInterpreterResult>(
        `${OPENAI_BASE}/code_interpreter_sessions`,
        apiKey,
        startUnix,
        endUnix,
        '1h',
        ['project_id', 'api_key_id'],
        'code_interpreter_sessions',
      );
      const rows = mapCodeInterpreterBuckets(buckets);
      allRows.push(...rows);
      logger.info('provider.fetch.category.complete', {
        provider: 'openai',
        category: 'code_interpreter_sessions',
        pages: pageCount,
        records: rows.length,
      });
    }

    // -------------------------------------------------------------------------
    // vector_stores — vector_storage  [category 8 / 8]
    // Uses daily bucket width — storage is a point-in-time measurement.
    // group_by excludes 'model' — this endpoint does not support it.
    // -------------------------------------------------------------------------
    if (Date.now() >= deadline) {
      logger.warn('provider.fetch.deadline_exceeded', {
        provider: 'openai',
        completedCategories: 7,
        totalRecords: allRows.length,
        elapsedMs: Date.now() - fetchStart,
      });
      return allRows;
    }
    logger.info('provider.fetch.category.start', {
      provider: 'openai',
      category: 'vector_stores',
    });
    {
      const { buckets, pageCount } = await fetchOpenAIPaginatedUsage<VectorStoresResult>(
        `${OPENAI_BASE}/vector_stores`,
        apiKey,
        startUnix,
        endUnix,
        '1d',
        ['project_id', 'api_key_id'],
        'vector_stores',
      );
      const rows = mapVectorStoresBuckets(buckets);
      allRows.push(...rows);
      logger.info('provider.fetch.category.complete', {
        provider: 'openai',
        category: 'vector_stores',
        pages: pageCount,
        records: rows.length,
      });
    }

    logger.info('provider.fetch.complete', {
      provider: 'openai',
      records: allRows.length,
      durationMs: Date.now() - fetchStart,
    });

    return allRows;
  },

  /**
   * Fetch cost/billing data from the OpenAI organization costs endpoint for
   * the given time window. Groups by project_id and line_item for maximum
   * granularity. Uses daily buckets (the only width the costs API supports).
   * Returns partial results collected so far if a page fails (errors are logged,
   * never thrown).
   */
  async fetchCosts(startTime: Date, endTime: Date): Promise<RawProviderCostData[]> {
    const startUnix = Math.floor(startTime.getTime() / 1_000);
    const endUnix = Math.floor(endTime.getTime() / 1_000);
    const fetchStart = Date.now();

    logger.info('provider.fetch.costs.start', {
      provider: 'openai',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    const { buckets, pageCount } = await fetchOpenAIPaginatedUsage<CostsAmountResult>(
      'https://api.openai.com/v1/organization/costs',
      apiKey,
      startUnix,
      endUnix,
      '1d',
      ['project_id', 'line_item'],
      'costs',
    );

    const allRows: RawProviderCostData[] = [];
    for (const bucket of buckets) {
      const bucketStart = new Date(bucket.start_time * 1_000);
      const bucketEnd = new Date(bucket.end_time * 1_000);
      for (const result of bucket.results) {
        try {
          allRows.push({
            segmentExternalId: result.project_id ?? undefined,
            modelSlug: undefined,
            costType: result.line_item ?? 'total',
            bucketStart,
            bucketEnd,
            amount: Number(result.amount.value ?? 0).toFixed(8),
            currency: result.amount.currency,
          });
        } catch (err) {
          logger.warn('provider.fetch.costs.record.skip', {
            provider: 'openai',
            bucketStart: bucketStart.toISOString(),
            bucketEnd: bucketEnd.toISOString(),
            projectId: result.project_id,
            lineItem: result.line_item,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    logger.info('provider.fetch.costs.complete', {
      provider: 'openai',
      pages: pageCount,
      records: allRows.length,
      durationMs: Date.now() - fetchStart,
    });

    return allRows;
  },

  /**
   * Test the OpenAI API key by making a lightweight request to the models
   * endpoint. Returns a structured result — never throws.
   */
  async testConnection(): Promise<{ success: true; detail?: string } | { success: false; error: string }> {
    logger.info('provider.test_connection.start', { provider: 'openai' });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      // Use an actual organization endpoint to validate the admin key.
      // The /v1/models endpoint rejects org admin keys (sk-admin-...) with 403.
      const now = Math.floor(Date.now() / 1000);
      const oneMinuteAgo = now - 60;
      const response = await fetch(
        `https://api.openai.com/v1/organization/usage/completions?start_time=${oneMinuteAgo}&end_time=${now}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          cache: 'no-store',
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        logger.info('provider.test_connection.success', { provider: 'openai' });
        return { success: true, detail: 'OpenAI usage data is accessible' };
      }

      if (response.status === 401) {
        logger.warn('provider.test_connection.failed', { provider: 'openai', status: 401 });
        return { success: false, error: 'Invalid API key. Check that you copied the full key.' };
      }

      if (response.status === 403) {
        logger.warn('provider.test_connection.failed', { provider: 'openai', status: 403 });
        return {
          success: false,
          error: 'This key cannot access organization usage data. Create an admin key at platform.openai.com/settings/organization/admin-keys with the "Usage: Read" permission.',
        };
      }

      const body = await response.text().catch(() => '');
      logger.warn('provider.test_connection.failed', {
        provider: 'openai',
        status: response.status,
        body: body.slice(0, 200),
      });
      return { success: false, error: `OpenAI API returned status ${response.status}.` };
    } catch (networkError) {
      clearTimeout(timeoutId);
      logger.error('provider.test_connection.network_error', {
        provider: 'openai',
        error: networkError instanceof Error ? networkError.message : String(networkError),
      });
      return { success: false, error: 'Could not reach OpenAI API. Check your network connection.' };
    }
  },
});
