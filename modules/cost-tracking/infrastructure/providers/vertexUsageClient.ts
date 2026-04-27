// =============================================================================
// Cost Tracking Module — Google Vertex AI Usage Client
// =============================================================================
// Fetches token consumption data from Google Cloud Monitoring (which surfaces
// Vertex AI metrics) and maps it to the RawProviderUsageData type.
//
// Library:
//   @google-cloud/monitoring — MetricServiceClient
//
// Metrics queried:
//   aiplatform.googleapis.com/publisher/online_serving/token_count
//   aiplatform.googleapis.com/publisher/online_serving/request_count
//
// Resource:
//   projects/${projectId}
//
// Filter:
//   metric.type = "aiplatform.googleapis.com/publisher/online_serving/token_count"
//   metric.type = "aiplatform.googleapis.com/publisher/online_serving/request_count"
//
// Grouping dimensions (token_count query):
//   resource.labels.model_id     — identifies the model
//   metric.labels.type           — "input" | "output" (distinguishes token kinds)
//   metric.labels.is_cache_hit   — "true" | "false" (context cache hit indicator)
//
// Grouping dimensions (request_count query):
//   resource.labels.model_id     — identifies the model
//
// Aggregation:
//   Per-series alignment to 1-hour periods using ALIGN_SUM so each data point
//   represents total tokens/requests in that bucket.
//
// is_cache_hit label:
//   Added to Vertex AI monitoring in 2024. Older deployments may not emit it;
//   the code defaults to "false" so all tokens are treated as uncached when the
//   label is absent. When "true", input tokens are counted as cachedInputTokens
//   rather than inputTokens to avoid overestimating costs.
//
// Field mapping (time-series row → RawProviderUsageData):
//   resource.labels.model_id                  → modelSlug
//   projectId                                 → credentialExternalId (project is the billing scope)
//   undefined                                 → segmentExternalId    (Vertex has no sub-project segment)
//   interval start                            → bucketStart
//   interval start + 1h                       → bucketEnd
//   "1h"                                      → bucketWidth
//   "text_generation"                         → serviceCategory
//   sum of "input" points (is_cache_hit=false) → inputTokens
//   sum of "input" points (is_cache_hit=true)  → cachedInputTokens
//   sum of "output" points                    → outputTokens
//   sum of request_count points               → requestCount
//
// Error handling:
//   Any exception from the token_count query is caught, logged, and returns the
//   rows collected so far (or empty array). The request_count query failure is
//   treated as non-fatal: a warning is logged and token data is returned without
//   request counts. The client never throws.
// =============================================================================

import { MetricServiceClient } from '@google-cloud/monitoring';
import { ProviderUsageClient, RawProviderUsageData } from './types';
import { logger } from '../logger';

// =============================================================================
// SECTION 1: CONSTANTS
// =============================================================================

const TOKEN_COUNT_METRIC =
  'aiplatform.googleapis.com/publisher/online_serving/token_count';

const REQUEST_COUNT_METRIC =
  'aiplatform.googleapis.com/publisher/online_serving/request_count';

/** Alignment period of 1 hour in seconds. */
const ALIGNMENT_PERIOD_SECONDS = 3600;

// =============================================================================
// SECTION 2: INTERNAL TYPES
// =============================================================================

/** Accumulator for merging input/output/cached token counts and request counts per (model, bucketStart). */
type TokenAccumulator = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  requestCount: number;
};

// =============================================================================
// SECTION 3: FACTORY
// =============================================================================

/**
 * Factory function that creates a Google Vertex AI provider usage client.
 *
 * Application Default Credentials (ADC) are used automatically by the
 * MetricServiceClient when no explicit credentials are provided. The
 * consuming environment (Cloud Run, GKE, local gcloud auth) must have
 * access to the Cloud Monitoring API for the given project.
 *
 * @param projectId - GCP project ID to query. Also used as credentialExternalId.
 * @returns ProviderUsageClient implementation for Google Vertex AI.
 */
export const makeVertexUsageClient = (projectId: string): ProviderUsageClient => ({
  providerSlug: 'google_vertex',

  /**
   * Fetch Vertex AI token counts from Cloud Monitoring for the given window.
   * Groups by model_id and token type (input/output), then collapses each
   * (model, bucketStart) pair into a single RawProviderUsageData row.
   * Returns [] if the API call fails for any reason (logs error).
   */
  async fetchUsage(startTime: Date, endTime: Date): Promise<RawProviderUsageData[]> {
    const fetchStart = Date.now();
    const client = new MetricServiceClient();
    const projectName = `projects/${projectId}`;

    logger.info('provider.fetch.start', {
      provider: 'google_vertex',
      projectId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    // Accumulate tokens per (model, bucketStart) key
    const accumulator = new Map<string, TokenAccumulator>();

    // Helper to build a canonical key for deduplication
    const makeKey = (modelId: string, bucketStart: Date): string =>
      `${modelId}::${bucketStart.toISOString()}`;

    try {
      const [timeSeries] = await client.listTimeSeries({
        name: projectName,
        filter: `metric.type = "${TOKEN_COUNT_METRIC}"`,
        interval: {
          startTime: { seconds: Math.floor(startTime.getTime() / 1_000) },
          endTime: { seconds: Math.floor(endTime.getTime() / 1_000) },
        },
        aggregation: {
          alignmentPeriod: { seconds: ALIGNMENT_PERIOD_SECONDS },
          perSeriesAligner: 'ALIGN_SUM',
          crossSeriesReducer: 'REDUCE_NONE',
          groupByFields: ['resource.labels.model_id', 'metric.labels.type', 'metric.labels.is_cache_hit'],
        },
        view: 'FULL',
      });

      for (const series of timeSeries) {
        const modelId =
          (series.resource?.labels as Record<string, string> | null | undefined)?.['model_id'] ??
          'unknown';
        const tokenType =
          (series.metric?.labels as Record<string, string> | null | undefined)?.['type'] ?? '';

        for (const point of series.points ?? []) {
          const startSeconds = point.interval?.startTime?.seconds;
          if (startSeconds === undefined || startSeconds === null) continue;

          const bucketStart = new Date(Number(startSeconds) * 1_000);
          const key = makeKey(modelId, bucketStart);

          if (!accumulator.has(key)) {
            accumulator.set(key, { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, requestCount: 0 });
          }

          const entry = accumulator.get(key)!;
          const tokenValue = Number(point.value?.int64Value ?? point.value?.doubleValue ?? 0);
          const isCacheHit =
            (series.metric?.labels as Record<string, string> | null | undefined)?.['is_cache_hit'] ?? 'false';

          if (tokenType === 'input') {
            if (isCacheHit === 'true') {
              entry.cachedInputTokens += tokenValue;
            } else {
              entry.inputTokens += tokenValue;
            }
          } else if (tokenType === 'output') {
            entry.outputTokens += tokenValue;
          }
        }
      }

      logger.info('provider.fetch.timeseries', {
        provider: 'google_vertex',
        seriesCount: timeSeries.length,
      });
    } catch (error) {
      logger.error('provider.fetch.api_error', {
        provider: 'google_vertex',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - fetchStart,
      });
    }

    // Second query: request counts. Non-fatal — warn and continue with token data if it fails.
    try {
      const [requestTimeSeries] = await client.listTimeSeries({
        name: projectName,
        filter: `metric.type = "${REQUEST_COUNT_METRIC}"`,
        interval: {
          startTime: { seconds: Math.floor(startTime.getTime() / 1_000) },
          endTime: { seconds: Math.floor(endTime.getTime() / 1_000) },
        },
        aggregation: {
          alignmentPeriod: { seconds: ALIGNMENT_PERIOD_SECONDS },
          perSeriesAligner: 'ALIGN_SUM',
          crossSeriesReducer: 'REDUCE_NONE',
          groupByFields: ['resource.labels.model_id'],
        },
        view: 'FULL',
      });

      for (const series of requestTimeSeries) {
        const modelId =
          (series.resource?.labels as Record<string, string> | null | undefined)?.['model_id'] ??
          'unknown';

        for (const point of series.points ?? []) {
          const startSeconds = point.interval?.startTime?.seconds;
          if (startSeconds === undefined || startSeconds === null) continue;

          const bucketStart = new Date(Number(startSeconds) * 1_000);
          const key = makeKey(modelId, bucketStart);

          if (!accumulator.has(key)) {
            accumulator.set(key, { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, requestCount: 0 });
          }

          const entry = accumulator.get(key)!;
          entry.requestCount += Number(point.value?.int64Value ?? point.value?.doubleValue ?? 0);
        }
      }

      logger.info('provider.fetch.request_timeseries', {
        provider: 'google_vertex',
        seriesCount: requestTimeSeries.length,
      });
    } catch (error) {
      logger.warn('provider.fetch.request_count_error', {
        provider: 'google_vertex',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Convert accumulator map to RawProviderUsageData rows
    const rows: RawProviderUsageData[] = [];

    for (const [key, tokens] of accumulator.entries()) {
      // Key format: "{modelId}::{bucketStartISO}"
      const separatorIndex = key.indexOf('::');
      const modelId = key.slice(0, separatorIndex);
      const bucketStart = new Date(key.slice(separatorIndex + 2));

      rows.push({
        modelSlug: modelId,
        serviceCategory: 'text_generation',
        credentialExternalId: projectId,
        bucketStart,
        bucketEnd: new Date(bucketStart.getTime() + 3_600_000),
        bucketWidth: '1h',
        inputTokens: tokens.inputTokens > 0 ? tokens.inputTokens : undefined,
        outputTokens: tokens.outputTokens > 0 ? tokens.outputTokens : undefined,
        cachedInputTokens: tokens.cachedInputTokens > 0 ? tokens.cachedInputTokens : undefined,
        requestCount: tokens.requestCount > 0 ? tokens.requestCount : undefined,
      });
    }

    logger.info('provider.fetch.complete', {
      provider: 'google_vertex',
      records: rows.length,
      durationMs: Date.now() - fetchStart,
    });

    return rows;
  },

  /**
   * Test GCP Application Default Credentials by making a lightweight
   * listTimeSeries call against the project. Returns a structured result —
   * never throws.
   */
  async testConnection(): Promise<{ success: true; detail?: string } | { success: false; error: string }> {
    logger.info('provider.test_connection.start', { provider: 'google_vertex', projectId });

    const client = new MetricServiceClient();
    const projectName = `projects/${projectId}`;

    // Use a 5-minute window ending now so the query is as light as possible.
    const endTime = Date.now();
    const startTime = endTime - 5 * 60 * 1_000;

    // Wrap in a race against a manual timeout promise.
    const timeoutMs = 10_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeoutMs),
    );

    try {
      await Promise.race([
        client.listTimeSeries({
          name: projectName,
          filter: `metric.type = "${TOKEN_COUNT_METRIC}"`,
          interval: {
            startTime: { seconds: Math.floor(startTime / 1_000) },
            endTime: { seconds: Math.floor(endTime / 1_000) },
          },
          aggregation: {
            alignmentPeriod: { seconds: ALIGNMENT_PERIOD_SECONDS },
            perSeriesAligner: 'ALIGN_SUM',
            crossSeriesReducer: 'REDUCE_NONE',
          },
          view: 'FULL',
          pageSize: 1,
        }),
        timeoutPromise,
      ]);

      logger.info('provider.test_connection.success', { provider: 'google_vertex', projectId });
      return { success: true, detail: `Vertex AI metrics accessible for project: ${projectId}` };
    } catch (error) {
      const err = error as { code?: number; message?: string };
      const code = err.code;
      const message = err.message ?? String(error);

      logger.warn('provider.test_connection.failed', {
        provider: 'google_vertex',
        projectId,
        code,
        error: message,
      });

      if (code === 5) {
        return {
          success: false,
          error: `Project "${projectId}" not found. Check the project ID in your Google Cloud Console.`,
        };
      }
      if (code === 7) {
        return {
          success: false,
          error: 'Permission denied. Ensure Application Default Credentials have the Monitoring Viewer role.',
        };
      }
      if (code === 16) {
        return {
          success: false,
          error: 'Not authenticated. Set up Application Default Credentials (run: gcloud auth application-default login).',
        };
      }
      return { success: false, error: `Could not connect to Google Cloud: ${message}` };
    }
  },
});
