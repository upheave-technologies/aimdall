// =============================================================================
// Cost Tracking Module — Google Gemini (AI Studio) Usage Client
// =============================================================================
// NOTE: AI Studio (Generative Language API) does not expose token-count metrics
// in Cloud Monitoring. Only request counts are available via the consumed_api
// resource. For token-level data, capture per-request usage at the application
// layer instead.
//
// Fetches request-count data from Google Cloud Monitoring for models accessed
// through the Gemini API (generativelanguage.googleapis.com) and maps it to the
// RawProviderUsageData type.
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
// Metric queried (request counts):
//   serviceruntime.googleapis.com/api/request_count
//   filter: metric.type = "serviceruntime.googleapis.com/api/request_count"
//           AND resource.type = "consumed_api"
//           AND metric.labels.service = "generativelanguage.googleapis.com"
//   grouped by: metric.labels.credential_id
//
// Field mapping (time-series row → RawProviderUsageData):
//   metric.labels.credential_id → credentialExternalId
//   project_id                  → (used for client scope only)
//   interval start              → bucketStart
//   interval start + 1h         → bucketEnd
//   "1h"                        → bucketWidth
//   "text_generation"           → serviceCategory
//   request_count sum           → requestCount
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

/** Request count metric for all calls to the Generative Language REST API. */
const REQUEST_COUNT_METRIC = 'serviceruntime.googleapis.com/api/request_count';

/** Alignment period of 1 hour in seconds. */
const ALIGNMENT_PERIOD_SECONDS = 3600;

/** Milliseconds in one hour — used to compute bucketEnd from bucketStart. */
const ONE_HOUR_MS = 3_600_000;

/** Number of time-series returned per listTimeSeries page. */
const PAGE_SIZE = 1000;

/** Maximum pages to fetch per query to prevent runaway pagination. */
const PAGE_LIMIT = 50;

// =============================================================================
// SECTION 2: FACTORY
// =============================================================================

/**
 * Factory function that creates a Google Gemini (AI Studio) provider usage
 * client.
 *
 * Uses explicit GCP Service Account credentials — no Application Default
 * Credentials (ADC). The service account must have the Monitoring Viewer role
 * on the project and the Cloud Monitoring API must be enabled.
 *
 * @param serviceAccount - Parsed GCP Service Account JSON
 * @returns ProviderUsageClient implementation for Google Gemini (AI Studio).
 */
export const makeGeminiUsageClient = (serviceAccount: ServiceAccountJson): ProviderUsageClient => ({
  providerSlug: 'google_gemini',

  // Google Cloud Monitoring retains most metrics for 6 weeks (42 days).
  // Querying beyond this returns no data but does not error.
  firstSyncLookbackMs: 42 * 24 * 60 * 60 * 1_000,

  /**
   * Fetch Gemini API request counts from Cloud Monitoring for the given window.
   * Groups by credential_id to attribute usage to specific API keys.
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

    logger.info('provider.fetch.start', {
      provider: 'google_gemini',
      projectId,
      clientEmail,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });

    const rows: RawProviderUsageData[] = [];

    const interval = {
      startTime: { seconds: Math.floor(startTime.getTime() / 1_000) },
      endTime: { seconds: Math.floor(endTime.getTime() / 1_000) },
    };

    try {
      // Fetch all pages of the request_count time series using manual pagination.
      // autoPaginate: false avoids the SDK auto-pagination hang observed on large
      // projects. We iterate up to PAGE_LIMIT pages as a safety net.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestSeries: any[] = [];
      let pageToken: string | undefined = undefined;
      let pagesFetched = 0;

      const baseRequest = {
        name: projectName,
        filter:
          `metric.type = "${REQUEST_COUNT_METRIC}" AND ` +
          `resource.type = "consumed_api" AND ` +
          `metric.labels.service = "generativelanguage.googleapis.com"`,
        interval,
        aggregation: {
          alignmentPeriod: { seconds: ALIGNMENT_PERIOD_SECONDS },
          perSeriesAligner: 'ALIGN_SUM',
          crossSeriesReducer: 'REDUCE_SUM',
          groupByFields: ['metric.labels.credential_id'],
        },
        view: 'FULL',
      };

      do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageReq: any = pageToken ? { ...baseRequest, pageToken } : baseRequest;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [page, , pageResp] = await (client.listTimeSeries(pageReq, { autoPaginate: false, pageSize: PAGE_SIZE } as any));
        for (const s of page ?? []) requestSeries.push(s);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pageToken = (pageResp as any)?.nextPageToken ?? undefined;
        pagesFetched++;
      } while (pageToken && pagesFetched < PAGE_LIMIT);

      logger.info('provider.fetch.timeseries', {
        provider: 'google_gemini',
        metric: 'request_count',
        seriesCount: requestSeries.length,
      });

      for (const series of requestSeries) {
        const credentialId =
          (series.metric?.labels as Record<string, string> | null | undefined)?.['credential_id'] ??
          projectId;

        for (const point of series.points ?? []) {
          const startSeconds = point.interval?.startTime?.seconds;
          if (startSeconds === undefined || startSeconds === null) continue;

          const bucketStart = new Date(Number(startSeconds) * 1_000);
          const requestCount = Number(point.value?.int64Value ?? point.value?.doubleValue ?? 0);
          if (requestCount === 0) continue;

          rows.push({
            modelSlug: 'gemini',
            serviceCategory: 'text_generation',
            credentialExternalId: credentialId,
            bucketStart,
            bucketEnd: new Date(bucketStart.getTime() + ONE_HOUR_MS),
            bucketWidth: '1h',
            requestCount,
          });
        }
      }
    } catch (error) {
      logger.error('provider.fetch.api_error', {
        provider: 'google_gemini',
        metric: 'request_count',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - fetchStart,
      });
    } finally {
      try { await client.close(); } catch { /* ignore close errors */ }
    }

    logger.info('provider.fetch.complete', {
      provider: 'google_gemini',
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
   * Gemini traffic yet). Returns a structured result — never throws.
   */
  async testConnection(): Promise<{ success: true; detail?: string } | { success: false; error: string }> {
    const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = serviceAccount;

    logger.info('provider.test_connection.start', { provider: 'google_gemini', projectId, clientEmail });

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

      logger.info('provider.test_connection.success', { provider: 'google_gemini', projectId, clientEmail });
      try { await client.close(); } catch { /* ignore close errors */ }
      return { success: true, detail: `Connected as ${clientEmail} (project: ${projectId})` };
    } catch (error) {
      const err = error as { code?: number; message?: string; details?: string };
      const code = err.code;
      const rawMessage = err.message ?? String(error);
      const details = err.details;

      logger.warn('provider.test_connection.failed', {
        provider: 'google_gemini',
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
