// =============================================================================
// Cost Tracking Module — Google Vertex AI Usage Client
// =============================================================================
// Fetches request-count and token-count data from Google Cloud Monitoring
// (which surfaces Vertex AI metrics) and maps it to the RawProviderUsageData
// type.
//
// Authentication:
//   Explicit GCP Service Account credentials (client_email + private_key) parsed
//   from the service account JSON uploaded by the user. No ADC dependency.
//
// Library:
//   @google-cloud/monitoring — MetricServiceClient
//
// Resource:
//   projects/${project_id}  (parsed from service account JSON)
//
// Metrics queried:
//
//   Query A — request counts:
//     aiplatform.googleapis.com/publisher/model/generate_content/request_count
//     filter: metric.type = "..." AND resource.type = "aiplatform.googleapis.com/PublisherModel"
//     grouped by: resource.labels.model_id
//
//   Query B — token counts:
//     aiplatform.googleapis.com/publisher/online_serving/token_count
//     filter: metric.type = "..." AND resource.type = "aiplatform.googleapis.com/PublisherModel"
//     grouped by: resource.labels.model_id, metric.labels.type, metric.labels.is_cache_hit
//     aligner: ALIGN_SUM, period 1h
//
// Merge logic (keyed on model_id × bucketStart):
//   requestCount  ← Query A sum
//   inputTokens   ← Query B sum where type=input
//   outputTokens  ← Query B sum where type=output
//   cachedInputTokens ← Query B sum where is_cache_hit=true (across both types)
//
//   A bucket present in only one query still produces a row; the missing fields
//   are left undefined.
//
// Pagination:
//   All listTimeSeries calls use autoPaginate: false + pageSize: 1000, with
//   manual iteration (up to PAGE_LIMIT pages) to avoid SDK auto-pagination
//   hangs observed on large projects.
//
// Field mapping (merged row → RawProviderUsageData):
//   resource.labels.model_id → modelSlug
//   project_id               → credentialExternalId
//   interval start           → bucketStart
//   interval start + 1h      → bucketEnd
//   "1h"                     → bucketWidth
//   "text_generation"        → serviceCategory
//
// Error handling:
//   Any exception from the Monitoring SDK is caught, logged, and returns the
//   rows collected so far (or empty array). The client never throws.
// =============================================================================

import { MetricServiceClient } from '@google-cloud/monitoring';
import { ServiceAccountJson } from '../../domain/serviceAccountCredential';
import { ProviderUsageClient, RawProviderUsageData } from './types';
import { logger } from '../logger';

// =============================================================================
// SECTION 1: CONSTANTS
// =============================================================================

const REQUEST_COUNT_METRIC =
  'aiplatform.googleapis.com/publisher/model/generate_content/request_count';

const TOKEN_COUNT_METRIC =
  'aiplatform.googleapis.com/publisher/online_serving/token_count';

/** Alignment period of 1 hour in seconds. */
const ALIGNMENT_PERIOD_SECONDS = 3600;

/** Milliseconds in one hour — used to compute bucketEnd from bucketStart. */
const ONE_HOUR_MS = 3_600_000;

/** Number of time-series returned per listTimeSeries page. */
const PAGE_SIZE = 1000;

/** Maximum pages to fetch per query to prevent runaway pagination. */
const PAGE_LIMIT = 50;

// =============================================================================
// SECTION 2: HELPERS
// =============================================================================

type TimeSeriesPoint = {
  interval?: { startTime?: { seconds?: number | Long | null } | null } | null;
  value?: { int64Value?: number | string | Long | null; doubleValue?: number | null } | null;
};

type TimeSeries = {
  resource?: { labels?: Record<string, string> | null } | null;
  metric?: { labels?: Record<string, string> | null } | null;
  points?: TimeSeriesPoint[] | null;
};

// Long is the type used by protobuf-js for int64 fields. We only need .toNumber().
type Long = { toNumber(): number };

function toNumber(v: number | string | Long | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object' && 'toNumber' in v) return v.toNumber();
  return Number(v);
}

/**
 * Fetches all pages of a listTimeSeries query using manual pagination.
 * Stops after PAGE_LIMIT pages as a safety net.
 */
async function fetchAllPages(
  client: MetricServiceClient,
  request: Parameters<MetricServiceClient['listTimeSeries']>[0],
): Promise<TimeSeries[]> {
  const allSeries: TimeSeries[] = [];
  let pageToken: string | undefined = undefined;
  let pagesFetched = 0;

  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageReq: any = pageToken ? { ...request, pageToken } : request;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [series, , pageResp] = await (client.listTimeSeries(pageReq, { autoPaginate: false, pageSize: PAGE_SIZE } as any));
    for (const s of series ?? []) {
      allSeries.push(s as TimeSeries);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pageToken = (pageResp as any)?.nextPageToken ?? undefined;
    pagesFetched++;
  } while (pageToken && pagesFetched < PAGE_LIMIT);

  return allSeries;
}

// =============================================================================
// SECTION 3: FACTORY
// =============================================================================

/**
 * Factory function that creates a Google Vertex AI provider usage client.
 *
 * Uses explicit GCP Service Account credentials — no Application Default
 * Credentials (ADC). The service account must have the Monitoring Viewer role
 * on the project and the Cloud Monitoring API must be enabled.
 *
 * @param serviceAccount - Parsed GCP Service Account JSON
 * @returns ProviderUsageClient implementation for Google Vertex AI.
 */
export const makeVertexUsageClient = (serviceAccount: ServiceAccountJson): ProviderUsageClient => ({
  providerSlug: 'google_vertex',

  // Google Cloud Monitoring retains most metrics for 6 weeks (42 days).
  // Querying beyond this returns no data but does not error.
  firstSyncLookbackMs: 42 * 24 * 60 * 60 * 1_000,

  /**
   * Fetch Vertex AI request counts and token counts from Cloud Monitoring for
   * the given window.
   *
   * Runs two independent queries (request_count + token_count) and merges
   * them by (model_id, bucketStart). A bucket that appears in only one query
   * still produces a row with the available fields; missing fields are left
   * undefined.
   *
   * Returns [] if the API call fails for any reason (logs error).
   */
  async fetchUsage(startTime: Date, endTime: Date): Promise<RawProviderUsageData[]> {
    const fetchStart = Date.now();
    const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = serviceAccount;

    const client = new MetricServiceClient({
      projectId,
      credentials: { client_email: clientEmail, private_key: privateKey },
    });

    const projectName = `projects/${projectId}`;

    const interval = {
      startTime: { seconds: Math.floor(startTime.getTime() / 1_000) },
      endTime: { seconds: Math.floor(endTime.getTime() / 1_000) },
    };

    logger.info('provider.fetch.start', {
      provider: 'google_vertex',
      projectId,
      clientEmail,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    // Accumulator keyed by "modelId|bucketStartMs"
    type MergedBucket = {
      modelId: string;
      bucketStart: Date;
      requestCount?: number;
      inputTokens?: number;
      outputTokens?: number;
      cachedInputTokens?: number;
    };
    const bucketMap = new Map<string, MergedBucket>();

    const bucketKey = (modelId: string, bucketStart: Date) =>
      `${modelId}|${bucketStart.getTime()}`;

    const getOrCreate = (modelId: string, bucketStart: Date): MergedBucket => {
      const key = bucketKey(modelId, bucketStart);
      let bucket = bucketMap.get(key);
      if (!bucket) {
        bucket = { modelId, bucketStart };
        bucketMap.set(key, bucket);
      }
      return bucket;
    };

    try {
      // ── Query A: request_count ──────────────────────────────────────────────
      const requestSeries = await fetchAllPages(client, {
        name: projectName,
        filter:
          `metric.type = "${REQUEST_COUNT_METRIC}" AND ` +
          `resource.type = "aiplatform.googleapis.com/PublisherModel"`,
        interval,
        aggregation: {
          alignmentPeriod: { seconds: ALIGNMENT_PERIOD_SECONDS },
          perSeriesAligner: 'ALIGN_SUM',
          crossSeriesReducer: 'REDUCE_SUM',
          groupByFields: ['resource.labels.model_id'],
        },
        view: 'FULL',
      });

      logger.info('provider.fetch.timeseries', {
        provider: 'google_vertex',
        metric: 'request_count',
        seriesCount: requestSeries.length,
      });

      for (const series of requestSeries) {
        const modelId = series.resource?.labels?.['model_id'] ?? 'unknown';

        for (const point of series.points ?? []) {
          const startSeconds = point.interval?.startTime?.seconds;
          if (startSeconds === undefined || startSeconds === null) continue;

          const bucketStart = new Date(toNumber(startSeconds) * 1_000);
          const count = toNumber(point.value?.int64Value ?? point.value?.doubleValue);
          if (count === 0) continue;

          getOrCreate(modelId, bucketStart).requestCount = count;
        }
      }

      // ── Query B: token_count ────────────────────────────────────────────────
      const tokenSeries = await fetchAllPages(client, {
        name: projectName,
        filter:
          `metric.type = "${TOKEN_COUNT_METRIC}" AND ` +
          `resource.type = "aiplatform.googleapis.com/PublisherModel"`,
        interval,
        aggregation: {
          alignmentPeriod: { seconds: ALIGNMENT_PERIOD_SECONDS },
          perSeriesAligner: 'ALIGN_SUM',
          crossSeriesReducer: 'REDUCE_SUM',
          groupByFields: [
            'resource.labels.model_id',
            'metric.labels.type',
            'metric.labels.is_cache_hit',
          ],
        },
        view: 'FULL',
      });

      logger.info('provider.fetch.timeseries', {
        provider: 'google_vertex',
        metric: 'token_count',
        seriesCount: tokenSeries.length,
      });

      for (const series of tokenSeries) {
        const modelId = series.resource?.labels?.['model_id'] ?? 'unknown';
        const tokenType = series.metric?.labels?.['type'] ?? '';       // "input" | "output"
        const isCacheHit = series.metric?.labels?.['is_cache_hit'] === 'true';

        for (const point of series.points ?? []) {
          const startSeconds = point.interval?.startTime?.seconds;
          if (startSeconds === undefined || startSeconds === null) continue;

          const bucketStart = new Date(toNumber(startSeconds) * 1_000);
          const count = toNumber(point.value?.int64Value ?? point.value?.doubleValue);
          if (count === 0) continue;

          const bucket = getOrCreate(modelId, bucketStart);

          if (tokenType === 'input') {
            bucket.inputTokens = (bucket.inputTokens ?? 0) + count;
          } else if (tokenType === 'output') {
            bucket.outputTokens = (bucket.outputTokens ?? 0) + count;
          }

          if (isCacheHit) {
            bucket.cachedInputTokens = (bucket.cachedInputTokens ?? 0) + count;
          }
        }
      }
    } catch (error) {
      logger.error('provider.fetch.api_error', {
        provider: 'google_vertex',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - fetchStart,
      });

      logger.info('provider.fetch.complete', {
        provider: 'google_vertex',
        records: 0,
        durationMs: Date.now() - fetchStart,
      });

      try { await client.close(); } catch { /* ignore close errors */ }
      return [];
    }

    try { await client.close(); } catch { /* ignore close errors */ }

    // ── Materialise merged rows ─────────────────────────────────────────────
    const rows: RawProviderUsageData[] = [];

    for (const bucket of bucketMap.values()) {
      const requestCount = bucket.requestCount ?? 0;
      const inputTokens = bucket.inputTokens ?? 0;
      const outputTokens = bucket.outputTokens ?? 0;
      const cachedInputTokens = bucket.cachedInputTokens ?? 0;

      // Skip rows with no signal — all four fields are zero.
      if (requestCount === 0 && inputTokens === 0 && outputTokens === 0 && cachedInputTokens === 0) {
        continue;
      }

      rows.push({
        modelSlug: bucket.modelId,
        serviceCategory: 'text_generation',
        credentialExternalId: projectId,
        bucketStart: bucket.bucketStart,
        bucketEnd: new Date(bucket.bucketStart.getTime() + ONE_HOUR_MS),
        bucketWidth: '1h',
        requestCount,
        inputTokens,
        outputTokens,
        cachedInputTokens,
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
   * Tests the service account credentials by calling listMetricDescriptors with
   * pageSize: 1. This probe verifies project accessibility and that the Cloud
   * Monitoring API is enabled without depending on any specific metric type
   * having data in the project (avoids false NOT_FOUND on new projects with no
   * Vertex AI traffic yet). Returns a structured result — never throws.
   */
  async testConnection(): Promise<{ success: true; detail?: string } | { success: false; error: string }> {
    const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = serviceAccount;

    logger.info('provider.test_connection.start', { provider: 'google_vertex', projectId, clientEmail });

    const client = new MetricServiceClient({
      projectId,
      credentials: { client_email: clientEmail, private_key: privateKey },
    });

    const projectName = `projects/${projectId}`;

    // Single-shot probe: no auto-pagination, no retries, 15-second hard timeout.
    // autoPaginate: false ensures the SDK fetches only the first page (pageSize: 1)
    // instead of silently iterating every descriptor in the project, which hangs
    // on large projects. The gRPC client does silent retries by default; without
    // retryCodes: [] the call can hang for several minutes on auth issues.
    const callOptions = {
      autoPaginate: false,
      retry: { retryCodes: [] as number[] },
    };
    const timeoutMs = 15_000;

    try {
      await Promise.race([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (client.listMetricDescriptors({ name: projectName, pageSize: 1 }, callOptions as any)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        ),
      ]);

      logger.info('provider.test_connection.success', { provider: 'google_vertex', projectId, clientEmail });
      try { await client.close(); } catch { /* ignore close errors */ }
      return { success: true, detail: `Connected as ${clientEmail} (project: ${projectId})` };
    } catch (error) {
      const err = error as { code?: number; message?: string; details?: string };
      const code = err.code;
      const rawMessage = err.message ?? String(error);
      const details = err.details;

      logger.warn('provider.test_connection.failed', {
        provider: 'google_vertex',
        projectId,
        clientEmail,
        code,
        error: rawMessage,
        details,
        raw: String(error),
      });

      try { await client.close(); } catch { /* ignore close errors */ }

      if (code === 5) {
        // NOT_FOUND from listMetricDescriptors means the project itself is
        // inaccessible or the Monitoring API is not enabled — NOT that a specific
        // metric is missing. Surface the GCP message verbatim so the user sees
        // the actionable reason (e.g. API not enabled link from Google).
        return {
          success: false,
          error: `Google Cloud could not find or access this project. Google says: "${rawMessage}". The most common cause is that the Cloud Monitoring API is not enabled in this project, or the project ID in your service account key is wrong.`,
        };
      }
      if (code === 7) {
        return {
          success: false,
          error: `The service account does not have permission to read monitoring data. Add the Monitoring Viewer role to this service account in your GCP project. (Google says: "${rawMessage}")`,
        };
      }
      if (code === 16) {
        return {
          success: false,
          error: `Authentication failed. The service account credentials may be expired or revoked. Download a fresh key from Google Cloud Console. (Google says: "${rawMessage}")`,
        };
      }
      if (code === 14 || code === 4) {
        return {
          success: false,
          error: 'Google Cloud is temporarily unavailable. Try again in a moment.',
        };
      }
      if (rawMessage === 'timeout') {
        return {
          success: false,
          error: "Google Cloud didn't respond within 15 seconds. Check that the Cloud Monitoring API is enabled in this project, the service account has the Monitoring Viewer role, and that this server can reach googleapis.com.",
        };
      }
      return {
        success: false,
        error: `Google Cloud returned an unexpected error: "${rawMessage}"`,
      };
    }
  },
});
