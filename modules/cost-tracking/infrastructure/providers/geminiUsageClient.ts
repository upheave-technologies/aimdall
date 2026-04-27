// =============================================================================
// Cost Tracking Module — Google Gemini (AI Studio) Usage Client
// =============================================================================
// Fetches token consumption data from Google Cloud Monitoring for models
// accessed through the Gemini API (generativelanguage.googleapis.com) and maps
// it to the RawProviderUsageData type.
//
// The Gemini API (AI Studio) does not have a dedicated historical usage report
// endpoint. Usage metrics are surfaced through two Cloud Monitoring metric
// types depending on access path:
//
//   1. aiplatform.googleapis.com/publisher/online_serving/token_count
//      Covers Gemini models routed through AI Platform (Vertex-compatible path).
//      Model IDs use the "gemini-*" prefix. Filtered here to avoid overlap with
//      the Vertex client which queries the same metric without a model prefix
//      filter. This filter is applied via metric.labels.model_id or
//      resource.labels.model_id depending on the region configuration.
//
//   2. serviceruntime.googleapis.com/api/request_count
//      Covers all requests to the Generative Language API service. Does not
//      carry per-model token counts; used to capture request-level data for
//      models not surfaced by metric (1).
//
// Library:
//   @google-cloud/monitoring — MetricServiceClient
//
// Resource:
//   projects/${projectId}
//
// Metric queried (token counts):
//   aiplatform.googleapis.com/publisher/online_serving/token_count
//   with filter: resource.labels.model_id starts_with("gemini")
//
// Metric queried (request counts — supplementary):
//   serviceruntime.googleapis.com/api/request_count
//   with filter: resource.labels.service = "generativelanguage.googleapis.com"
//
// Grouping dimensions (token metric):
//   resource.labels.model_id — identifies the model
//   metric.labels.type       — "input" | "output"
//
// Grouping dimensions (request metric):
//   resource.labels.method   — API method slug (e.g. GenerateContent)
//   resource.labels.version  — API version
//
// Aggregation:
//   Per-series alignment to 1-hour periods using ALIGN_SUM so each data point
//   represents totals in that bucket.
//
// Field mapping (time-series row → RawProviderUsageData):
//   resource.labels.model_id  → modelSlug
//   projectId                 → credentialExternalId (project is the billing scope)
//   undefined                 → segmentExternalId    (no sub-project segment for API keys)
//   interval start            → bucketStart
//   interval start + 1h       → bucketEnd
//   "1h"                      → bucketWidth
//   "text_generation"         → serviceCategory
//   sum of "input" points     → inputTokens
//   sum of "output" points    → outputTokens
//   request_count sum         → requestCount (from supplementary metric, if present)
//
// Authentication:
//   Application Default Credentials (ADC) via MetricServiceClient. The project
//   must have the Cloud Monitoring API enabled and the ADC principal must have
//   the monitoring.timeSeries.list permission.
//   An optional apiKey field is accepted for future use but is not used by the
//   Cloud Monitoring SDK (which exclusively uses ADC or service account JSON).
//
// Error handling:
//   Any exception from the Monitoring SDK is caught, logged, and returns the
//   rows collected so far (or empty array). The client never throws.
// =============================================================================

import { MetricServiceClient } from '@google-cloud/monitoring';
import { ProviderUsageClient, RawProviderUsageData } from './types';
import { logger } from '../logger';

// =============================================================================
// SECTION 1: CONSTANTS
// =============================================================================

/** Token count metric shared with Vertex — filtered to gemini-* models here. */
const TOKEN_COUNT_METRIC =
  'aiplatform.googleapis.com/publisher/online_serving/token_count';

/** Request count metric for all calls to the Generative Language REST API. */
const REQUEST_COUNT_METRIC = 'serviceruntime.googleapis.com/api/request_count';

/** Alignment period of 1 hour in seconds. */
const ALIGNMENT_PERIOD_SECONDS = 3600;

/** Milliseconds in one hour — used to compute bucketEnd from bucketStart. */
const ONE_HOUR_MS = 3_600_000;

// =============================================================================
// SECTION 2: INTERNAL TYPES
// =============================================================================

/** Accumulator for merging input/output/request counts per (model, bucketStart). */
type TokenAccumulator = {
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
};

/** Configuration accepted by the factory function. */
export type GeminiUsageClientConfig = {
  /**
   * GCP project ID that owns the Gemini API usage. This is used both to scope
   * the Cloud Monitoring query and as the credentialExternalId on each row.
   */
  projectId: string;

  /**
   * Optional Google AI Studio API key. Accepted for documentation purposes so
   * callers can associate the config with a specific API key credential, but
   * Cloud Monitoring always authenticates via ADC — this value is not used in
   * any HTTP request.
   */
  apiKey?: string;
};

// =============================================================================
// SECTION 3: FACTORY
// =============================================================================

/**
 * Factory function that creates a Google Gemini (AI Studio) provider usage
 * client.
 *
 * The client queries Cloud Monitoring for two metric types:
 *   - Token counts on gemini-* models via the AI Platform serving metric
 *   - Request counts via the serviceruntime metric for the Generative Language
 *     API service
 *
 * Application Default Credentials (ADC) are used automatically. The consuming
 * environment must have the Cloud Monitoring API enabled and the monitoring
 * viewer role (or equivalent) on the given project.
 *
 * @param config.projectId - GCP project ID to query. Also used as credentialExternalId.
 * @param config.apiKey    - Optional AI Studio API key (informational only).
 * @returns ProviderUsageClient implementation for Google Gemini (AI Studio).
 */
export const makeGeminiUsageClient = (config: GeminiUsageClientConfig): ProviderUsageClient => ({
  providerSlug: 'google_gemini',

  /**
   * Fetch Gemini API token and request counts from Cloud Monitoring for the
   * given window. Merges input/output tokens and request counts per
   * (model, bucketStart) into a single RawProviderUsageData row each.
   * Returns [] if the API call fails for any reason (logs error).
   */
  async fetchUsage(startTime: Date, endTime: Date): Promise<RawProviderUsageData[]> {
    const fetchStart = Date.now();
    const { projectId } = config;
    const client = new MetricServiceClient();
    const projectName = `projects/${projectId}`;

    logger.info('provider.fetch.start', {
      provider: 'google_gemini',
      projectId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    // Accumulate tokens and request counts per (model, bucketStart) key.
    // Request counts from the supplementary metric use a synthetic model slug
    // derived from the API method when no model label is available.
    const accumulator = new Map<string, TokenAccumulator>();

    // Build a deduplication key from model ID and bucket start timestamp.
    const makeKey = (modelId: string, bucketStart: Date): string =>
      `${modelId}::${bucketStart.toISOString()}`;

    // Ensure a slot exists in the accumulator and return it.
    const getOrCreate = (key: string): TokenAccumulator => {
      if (!accumulator.has(key)) {
        accumulator.set(key, { inputTokens: 0, outputTokens: 0, requestCount: 0 });
      }
      return accumulator.get(key)!;
    };

    const interval = {
      startTime: { seconds: Math.floor(startTime.getTime() / 1_000) },
      endTime: { seconds: Math.floor(endTime.getTime() / 1_000) },
    };

    // -------------------------------------------------------------------------
    // Query 1: Token counts filtered to gemini-* model IDs
    // -------------------------------------------------------------------------
    try {
      const [tokenSeries] = await client.listTimeSeries({
        name: projectName,
        // Filter to the AI Platform token count metric and limit to Gemini
        // model IDs to avoid double-counting rows the Vertex client handles.
        filter:
          `metric.type = "${TOKEN_COUNT_METRIC}" AND ` +
          `resource.labels.model_id = starts_with("gemini")`,
        interval,
        aggregation: {
          alignmentPeriod: { seconds: ALIGNMENT_PERIOD_SECONDS },
          perSeriesAligner: 'ALIGN_SUM',
          crossSeriesReducer: 'REDUCE_NONE',
          groupByFields: ['resource.labels.model_id', 'metric.labels.type'],
        },
        view: 'FULL',
      });

      logger.info('provider.fetch.timeseries', {
        provider: 'google_gemini',
        metric: 'token_count',
        seriesCount: tokenSeries.length,
      });

      for (const series of tokenSeries) {
        const modelId =
          (series.resource?.labels as Record<string, string> | null | undefined)?.['model_id'] ??
          'unknown';
        const tokenType =
          (series.metric?.labels as Record<string, string> | null | undefined)?.['type'] ?? '';

        for (const point of series.points ?? []) {
          const startSeconds = point.interval?.startTime?.seconds;
          if (startSeconds === undefined || startSeconds === null) continue;

          const bucketStart = new Date(Number(startSeconds) * 1_000);
          const entry = getOrCreate(makeKey(modelId, bucketStart));
          const tokenValue = Number(point.value?.int64Value ?? point.value?.doubleValue ?? 0);

          if (tokenType === 'input') {
            entry.inputTokens += tokenValue;
          } else if (tokenType === 'output') {
            entry.outputTokens += tokenValue;
          }
        }
      }
    } catch (error) {
      logger.error('provider.fetch.api_error', {
        provider: 'google_gemini',
        metric: 'token_count',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - fetchStart,
      });
      // Return what we have so far (empty at this point) rather than throwing.
      return buildRows(accumulator, projectId, fetchStart);
    }

    // -------------------------------------------------------------------------
    // Query 2: Request counts for the Generative Language API service
    // -------------------------------------------------------------------------
    // This supplementary query captures request-level activity for models that
    // do not appear in the AI Platform token count metric (e.g. older REST-only
    // endpoints). The model slug is derived from the method label when present.
    try {
      const [requestSeries] = await client.listTimeSeries({
        name: projectName,
        filter:
          `metric.type = "${REQUEST_COUNT_METRIC}" AND ` +
          `resource.labels.service = "generativelanguage.googleapis.com"`,
        interval,
        aggregation: {
          alignmentPeriod: { seconds: ALIGNMENT_PERIOD_SECONDS },
          perSeriesAligner: 'ALIGN_SUM',
          crossSeriesReducer: 'REDUCE_NONE',
          groupByFields: ['resource.labels.method', 'resource.labels.version'],
        },
        view: 'FULL',
      });

      logger.info('provider.fetch.timeseries', {
        provider: 'google_gemini',
        metric: 'request_count',
        seriesCount: requestSeries.length,
      });

      for (const series of requestSeries) {
        const labels = series.resource?.labels as Record<string, string> | null | undefined;
        // Use the method as a synthetic model slug when no finer model label
        // exists. Prefix ensures it is clearly distinguishable from real slugs.
        const method = labels?.['method'] ?? '';
        const modelId = method ? `_method:${method}` : 'unknown';

        for (const point of series.points ?? []) {
          const startSeconds = point.interval?.startTime?.seconds;
          if (startSeconds === undefined || startSeconds === null) continue;

          const bucketStart = new Date(Number(startSeconds) * 1_000);
          const entry = getOrCreate(makeKey(modelId, bucketStart));
          entry.requestCount += Number(point.value?.int64Value ?? point.value?.doubleValue ?? 0);
        }
      }
    } catch (error) {
      // Request count failure is non-fatal — token data is already collected.
      logger.warn('provider.fetch.api_error', {
        provider: 'google_gemini',
        metric: 'request_count',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return buildRows(accumulator, projectId, fetchStart);
  },

  /**
   * Test GCP Application Default Credentials by making a lightweight
   * listTimeSeries call against the Gemini project. Returns a structured
   * result — never throws.
   */
  async testConnection(): Promise<{ success: true; detail?: string } | { success: false; error: string }> {
    const { projectId } = config;
    logger.info('provider.test_connection.start', { provider: 'google_gemini', projectId });

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

      logger.info('provider.test_connection.success', { provider: 'google_gemini', projectId });
      return { success: true, detail: `Gemini metrics accessible for project: ${projectId}` };
    } catch (error) {
      const err = error as { code?: number; message?: string };
      const code = err.code;
      const message = err.message ?? String(error);

      logger.warn('provider.test_connection.failed', {
        provider: 'google_gemini',
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

// =============================================================================
// SECTION 4: HELPERS
// =============================================================================

/**
 * Convert the accumulator map to a flat array of RawProviderUsageData rows and
 * emit a completion log entry.
 */
function buildRows(
  accumulator: Map<string, TokenAccumulator>,
  projectId: string,
  fetchStart: number,
): RawProviderUsageData[] {
  const rows: RawProviderUsageData[] = [];

  for (const [key, counts] of accumulator.entries()) {
    // Key format: "{modelId}::{bucketStartISO}"
    const separatorIndex = key.indexOf('::');
    const modelId = key.slice(0, separatorIndex);
    const bucketStart = new Date(key.slice(separatorIndex + 2));

    rows.push({
      modelSlug: modelId,
      serviceCategory: 'text_generation',
      credentialExternalId: projectId,
      bucketStart,
      bucketEnd: new Date(bucketStart.getTime() + ONE_HOUR_MS),
      bucketWidth: '1h',
      inputTokens: counts.inputTokens > 0 ? counts.inputTokens : undefined,
      outputTokens: counts.outputTokens > 0 ? counts.outputTokens : undefined,
      requestCount: counts.requestCount > 0 ? counts.requestCount : undefined,
    });
  }

  logger.info('provider.fetch.complete', {
    provider: 'google_gemini',
    records: rows.length,
    durationMs: Date.now() - fetchStart,
  });

  return rows;
}
