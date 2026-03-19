// =============================================================================
// Cost Tracking Module — Google Vertex AI Usage Client
// =============================================================================
// Fetches token consumption data from Google Cloud Monitoring (which surfaces
// Vertex AI metrics) and maps it to the RawProviderUsageData type.
//
// Library:
//   @google-cloud/monitoring — MetricServiceClient
//
// Metric queried:
//   aiplatform.googleapis.com/publisher/online_serving/token_count
//
// Resource:
//   projects/${projectId}
//
// Filter:
//   metric.type = "aiplatform.googleapis.com/publisher/online_serving/token_count"
//
// Grouping dimensions:
//   resource.labels.model_id  — identifies the model
//   metric.labels.type        — "input" | "output" (distinguishes token kinds)
//
// Aggregation:
//   Per-series alignment to 1-hour periods using ALIGN_SUM so each data point
//   represents total tokens in that bucket.
//
// Field mapping (time-series row → RawProviderUsageData):
//   resource.labels.model_id  → modelSlug
//   projectId                 → credentialExternalId (project is the billing scope)
//   undefined                 → segmentExternalId    (Vertex has no sub-project segment)
//   interval start            → bucketStart
//   interval start + 1h       → bucketEnd
//   "1h"                      → bucketWidth
//   "text_generation"         → serviceCategory
//   sum of "input" points     → inputTokens
//   sum of "output" points    → outputTokens
//   0                         → requestCount (Vertex token metric has no request count)
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

const TOKEN_COUNT_METRIC =
  'aiplatform.googleapis.com/publisher/online_serving/token_count';

/** Alignment period of 1 hour in seconds. */
const ALIGNMENT_PERIOD_SECONDS = 3600;

// =============================================================================
// SECTION 2: INTERNAL TYPES
// =============================================================================

/** Accumulator for merging input/output token counts per (model, bucketStart). */
type TokenAccumulator = {
  inputTokens: number;
  outputTokens: number;
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
          groupByFields: ['resource.labels.model_id', 'metric.labels.type'],
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
            accumulator.set(key, { inputTokens: 0, outputTokens: 0 });
          }

          const entry = accumulator.get(key)!;
          const tokenValue = Number(point.value?.int64Value ?? point.value?.doubleValue ?? 0);

          if (tokenType === 'input') {
            entry.inputTokens += tokenValue;
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
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        requestCount: 0,
      });
    }

    logger.info('provider.fetch.complete', {
      provider: 'google_vertex',
      records: rows.length,
      durationMs: Date.now() - fetchStart,
    });

    return rows;
  },
});
