// =============================================================================
// Application — Sync Provider Usage Use Case
// =============================================================================
// Orchestrates fetching raw usage data from all configured provider clients
// and persisting the results as UsageRecords and ProviderCosts.
//
// Flow:
//   1. Create a sync log entry (status: 'running')
//   2. For each provider client, independently try/catch:
//      a. Look up the provider record in DB by slug; skip if not found
//      b. Fetch usage data via client.fetchUsage()
//      c. Fetch cost data via client.fetchCosts() (if available)
//      d. For each raw usage record:
//         - Look up or register credential by externalId
//         - Look up or register model by slug
//         - Look up pricing for the model; calculate cost if available
//         - Generate dedup key; map to UsageRecord domain entity
//      e. Upsert batch of usage records
//      f. For each raw cost record: generate dedup key, map to ProviderCost
//      g. Upsert batch of provider costs (if any)
//      h. Advance sync cursor to the latest bucket seen
//      i. Track success metrics
//   3. On per-provider error, track failure without propagating
//   4. Update sync log to 'completed' or 'partial'
//   5. Return SyncResult
//
// Dependency injection pattern:
//   All repositories and the dedup hasher are passed in via a SyncDeps bag.
//   Provider clients are passed as a separate array.
// =============================================================================

import { createId } from '@paralleldrive/cuid2';
import { Result } from '@/packages/shared/lib/result';
import {
  UsageRecord,
  DedupDimensions,
} from '../domain/usageRecord';
import { ProviderCost } from '../domain/providerCost';
import { ProviderCredential } from '../domain/providerCredential';
import { Model } from '../domain/model';
import { findApplicablePricing, calculateCostFromRates } from '../domain/modelPricing';
import {
  IUsageRecordRepository,
  IProviderCostRepository,
  ISyncLogRepository,
  ISyncCursorRepository,
  IProviderRepository,
  IProviderCredentialRepository,
  IModelRepository,
} from '../domain/repositories';
import { ProviderUsageClient, RawProviderUsageData, RawProviderCostData } from '../infrastructure/providers/types';
import { CostTrackingError } from './costTrackingError';
import { logger } from '../infrastructure/logger';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { makeProviderCostRepository } from '../infrastructure/repositories/DrizzleProviderCostRepository';
import { makeSyncLogRepository, makeSyncCursorRepository } from '../infrastructure/repositories/DrizzleSyncRepository';
import { makeProviderRepository, makeProviderCredentialRepository, makeModelRepository } from '../infrastructure/repositories/DrizzleProviderRepository';
import { generateDedupKey } from '../infrastructure/dedupKeyHasher';
import { buildProviderClients, ProviderClientConfig } from '../infrastructure/providers/buildProviderClients';
import { buildProviderClientsFromDb } from '../infrastructure/providers/buildProviderClientsFromDb';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type SyncInput = {
  startTime?: Date;
  endTime?: Date;
  /** Force a full sync even if a cursor exists. */
  forceFullSync?: boolean;
};

export type SyncResult = {
  synced: {
    providerSlug: string;
    syncLogId: string;
    usageRecordsCreated: number;
    usageRecordsUpdated: number;
    costRecordsCreated: number;
    costRecordsUpdated: number;
  }[];
  failed: { providerSlug: string; error: string }[];
};

/**
 * Dependencies required by the sync use case.
 * Each repository handles exactly one entity type.
 */
export type SyncDeps = {
  usageRecordRepo: IUsageRecordRepository;
  providerCostRepo: IProviderCostRepository;
  syncLogRepo: ISyncLogRepository;
  syncCursorRepo: ISyncCursorRepository;
  providerRepo: IProviderRepository;
  credentialRepo: IProviderCredentialRepository;
  modelRepo: IModelRepository;
  /** Infrastructure hasher — wraps buildDedupInput + SHA-256 */
  hashDedupKey: (dimensions: DedupDimensions) => string;
};

// =============================================================================
// SECTION 2: CONSTANTS
// =============================================================================

/**
 * Fallback lookback window when no sync cursor exists AND the provider client
 * does not declare a firstSyncLookbackMs. 30 days is a safe, conservative
 * baseline. All upserts are idempotent via the dedup key — duplicate records
 * are never created regardless of how far back we pull.
 *
 * Provider clients should declare their own firstSyncLookbackMs based on the
 * historical retention their API actually supports. The use case picks that
 * value on first sync so users get the richest possible historical view from
 * minute one.
 */
const FALLBACK_FIRST_SYNC_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/** Module-level sync lock to prevent concurrent syncs within the same process. */
let syncInProgress = false;

/**
 * Higher-order function that creates the syncProviderUsage use case.
 *
 * @param deps    - Repository and hasher dependencies
 * @param clients - Array of provider usage clients to sync
 * @returns Async use case function
 */
export const makeSyncProviderUsageUseCase = (
  deps: SyncDeps,
  clients: ProviderUsageClient[],
) => {
  return async (data: SyncInput): Promise<Result<SyncResult, CostTrackingError>> => {
    if (syncInProgress) {
      return {
        success: false,
        error: new CostTrackingError('Sync already in progress', 'CONFLICT'),
      };
    }
    syncInProgress = true;

    try {
      const syncStart = Date.now();

      try {
        // Step 1: Resolve time window defaults (last 2 hours for overlap / catch-up)
        const endTime = data.endTime ?? new Date();
        const startTime = data.startTime ?? new Date(endTime.getTime() - 2 * 60 * 60 * 1_000);

        logger.info('sync.start', {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          providers: clients.map((c) => c.providerSlug),
        });

        const synced: SyncResult['synced'] = [];
        const failed: SyncResult['failed'] = [];

        // Step 2: Process each provider client independently
        for (const client of clients) {
          let syncLogId: string | undefined;
          let currentProviderId: string | undefined;

          try {
            // ── SETUP: Provider lookup + cursor + sync log ──────────────────────
            const provider = await deps.providerRepo.findBySlug(client.providerSlug);
            if (!provider) {
              logger.warn('sync.provider.not_found', { providerSlug: client.providerSlug });
              failed.push({
                providerSlug: client.providerSlug,
                error: `Provider "${client.providerSlug}" not found in the database. Register it first.`,
              });
              continue;
            }

            // Track provider id for the catastrophic catch block
            currentProviderId = provider.id;

            const providerCursor = await deps.syncCursorRepo.findCursor(
              provider.id,
              undefined,
              'text_generation',
            );

            const providerStartTime =
              !data.forceFullSync && providerCursor
                ? providerCursor.lastSyncedBucket
                : new Date(
                    endTime.getTime() -
                      (client.firstSyncLookbackMs ?? FALLBACK_FIRST_SYNC_LOOKBACK_MS),
                  );

            logger.info('sync.provider.cursor', {
              provider: client.providerSlug,
              cursorFound: providerCursor !== null,
              lastSyncedBucket: providerCursor?.lastSyncedBucket.toISOString() ?? null,
              resolvedStartTime: providerStartTime.toISOString(),
              forceFullSync: data.forceFullSync ?? false,
            });

            // Mark sync as in_progress on the provider row (idempotent — safe if
            // already set by connectProvider). Best effort: don't abort if this fails.
            try {
              await deps.providerRepo.markSyncStarted(provider.id);
            } catch (markErr) {
              logger.warn('sync.provider.markSyncStarted_failed', {
                provider: client.providerSlug,
                error: markErr instanceof Error ? markErr.message : String(markErr),
              });
            }

            const syncLog = await deps.syncLogRepo.create({
              providerId: provider.id,
              syncType: 'incremental',
              status: 'running',
              periodStart: providerStartTime,
              periodEnd: endTime,
              recordsFetched: 0,
              recordsCreated: 0,
              recordsUpdated: 0,
              recordsSkipped: 0,
              startedAt: new Date(),
            });
            syncLogId = syncLog.id;

            // ── PHASE 1: Usage (critical path) ─────────────────────────────────
            let usageResult = { created: 0, updated: 0 };
            let rawUsageCount = 0;
            let latestBucket: Date | undefined;

            try {
              const rawUsage: RawProviderUsageData[] = await client.fetchUsage(providerStartTime, endTime);
              rawUsageCount = rawUsage.length;

              const now = new Date();
              const usageRecords: UsageRecord[] = [];

              for (const raw of rawUsage) {
                if (!latestBucket || raw.bucketStart > latestBucket) {
                  latestBucket = raw.bucketStart;
                }

                let credentialId: string | undefined;
                if (raw.credentialExternalId) {
                  const credential = await lookupOrRegisterCredential(
                    deps.credentialRepo,
                    provider.id,
                    raw.credentialExternalId,
                    now,
                  );
                  credentialId = credential?.id;
                }

                const model = await lookupOrRegisterModel(
                  deps.modelRepo,
                  provider.id,
                  raw.modelSlug,
                  raw.serviceCategory,
                  now,
                );

                let calculatedCostAmount: string | undefined;
                let costSource: UsageRecord['costSource'] = 'none';

                if (model) {
                  const pricings = await deps.modelRepo.findPricingForModel(model.id);
                  const pricing = findApplicablePricing(
                    pricings,
                    raw.bucketStart,
                    raw.serviceTier,
                    raw.contextTier,
                    raw.region,
                  );

                  if (pricing) {
                    const metrics = {
                      inputTokens: raw.inputTokens,
                      outputTokens: raw.outputTokens,
                      cachedInputTokens: raw.cachedInputTokens,
                      cacheWriteTokens: raw.cacheWriteTokens,
                      thinkingTokens: raw.thinkingTokens,
                      audioInputTokens: raw.audioInputTokens,
                      audioOutputTokens: raw.audioOutputTokens,
                      imageCount: raw.imageCount,
                      characterCount: raw.characterCount,
                      durationSeconds: raw.durationSeconds,
                      storageBytes: raw.storageBytes,
                      sessionCount: raw.sessionCount,
                      searchCount: raw.searchCount,
                      requestCount: raw.requestCount,
                    };
                    calculatedCostAmount = calculateCostFromRates(pricing.rates, metrics);
                    costSource = 'calculated';
                  } else {
                    costSource = 'estimated';
                  }
                } else {
                  costSource = 'estimated';
                }

                const dedupDims: DedupDimensions = {
                  providerId: provider.id,
                  credentialId,
                  modelSlug: raw.modelSlug,
                  serviceCategory: raw.serviceCategory,
                  serviceTier: raw.serviceTier,
                  contextTier: raw.contextTier,
                  region: raw.region,
                  bucketStart: raw.bucketStart,
                  bucketWidth: raw.bucketWidth,
                };
                const dedupKey = deps.hashDedupKey(dedupDims);

                usageRecords.push({
                  id: createId(),
                  providerId: provider.id,
                  credentialId,
                  segmentId: undefined,
                  modelId: model?.id,
                  modelSlug: raw.modelSlug,
                  serviceCategory: raw.serviceCategory,
                  serviceTier: raw.serviceTier,
                  contextTier: raw.contextTier,
                  region: raw.region,
                  bucketStart: raw.bucketStart,
                  bucketEnd: raw.bucketEnd,
                  bucketWidth: raw.bucketWidth,
                  inputTokens: raw.inputTokens,
                  outputTokens: raw.outputTokens,
                  cachedInputTokens: raw.cachedInputTokens,
                  cacheWriteTokens: raw.cacheWriteTokens,
                  thinkingTokens: raw.thinkingTokens,
                  audioInputTokens: raw.audioInputTokens,
                  audioOutputTokens: raw.audioOutputTokens,
                  imageCount: raw.imageCount,
                  characterCount: raw.characterCount,
                  durationSeconds: raw.durationSeconds !== undefined
                    ? raw.durationSeconds.toFixed(3)
                    : undefined,
                  storageBytes: raw.storageBytes,
                  sessionCount: raw.sessionCount,
                  searchCount: raw.searchCount,
                  requestCount: raw.requestCount,
                  calculatedCostAmount,
                  calculatedCostCurrency: 'USD',
                  costSource,
                  providerMetadata: raw.providerMetadata,
                  syncId: syncLog.id,
                  dedupKey,
                  syncedAt: now,
                  createdAt: now,
                  updatedAt: now,
                });
              }

              const upsertStart = Date.now();
              usageResult = await deps.usageRecordRepo.upsertBatch(usageRecords);

              logger.info('sync.provider.usage_upsert', {
                provider: client.providerSlug,
                syncLogId,
                recordCount: usageRecords.length,
                created: usageResult.created,
                updated: usageResult.updated,
                durationMs: Date.now() - upsertStart,
              });

              // Advance cursor immediately after successful usage upsert
              if (latestBucket) {
                await deps.syncCursorRepo.upsert({
                  providerId: provider.id,
                  credentialId: undefined,
                  serviceCategory: 'text_generation',
                  lastSyncedBucket: latestBucket,
                });
              }
            } catch (usageErr) {
              // Phase 1 failed — this is a real failure for this provider
              const errorMsg = usageErr instanceof Error ? usageErr.message : String(usageErr);
              logger.error('sync.provider.usage_failed', {
                provider: client.providerSlug,
                syncLogId,
                error: errorMsg,
              });

              try {
                await deps.syncLogRepo.updateStatus(syncLogId, 'failed', {
                  errorMessage: errorMsg,
                  completedAt: new Date(),
                  durationMs: Date.now() - syncStart,
                });
              } catch { /* best effort — sync log update failure shouldn't mask the original error */ }

              // Mark provider sync state as error. Best effort.
              try {
                await deps.providerRepo.markSyncFailed(provider.id, errorMsg);
              } catch { /* best effort */ }

              failed.push({ providerSlug: client.providerSlug, error: errorMsg });
              continue;
            }

            // ── PHASE 2: Costs (non-critical — degrades gracefully) ─────────────
            let costResult = { created: 0, updated: 0 };
            let costError: string | undefined;

            try {
              const rawCosts: RawProviderCostData[] = client.fetchCosts
                ? await client.fetchCosts(providerStartTime, endTime)
                : [];

              if (rawCosts.length > 0) {
                const now = new Date();
                const costRecords: ProviderCost[] = rawCosts.map((raw) => {
                  const costDedupInput = [
                    provider.id,
                    raw.segmentExternalId ?? '__',
                    raw.modelSlug ?? '__',
                    raw.costType,
                    raw.tokenType ?? '__',
                    raw.serviceTier ?? '__',
                    raw.contextTier ?? '__',
                    raw.region ?? '__',
                    raw.bucketStart.toISOString(),
                  ].join('|');

                  const dedupKey = deps.hashDedupKey({
                    providerId: provider.id,
                    modelSlug: raw.modelSlug ?? costDedupInput,
                    serviceCategory: 'other',
                    serviceTier: raw.serviceTier,
                    contextTier: raw.contextTier,
                    region: raw.region,
                    bucketStart: raw.bucketStart,
                    bucketWidth: '1d',
                  });

                  return {
                    id: createId(),
                    providerId: provider.id,
                    segmentId: undefined,
                    modelSlug: raw.modelSlug,
                    costType: raw.costType,
                    tokenType: raw.tokenType,
                    serviceTier: raw.serviceTier,
                    contextTier: raw.contextTier,
                    region: raw.region,
                    bucketStart: raw.bucketStart,
                    bucketEnd: raw.bucketEnd,
                    amount: raw.amount,
                    currency: raw.currency,
                    description: raw.description,
                    dedupKey,
                    syncId: syncLog.id,
                    providerMetadata: raw.providerMetadata,
                    syncedAt: now,
                    createdAt: now,
                  } satisfies ProviderCost;
                });

                costResult = await deps.providerCostRepo.upsertBatch(costRecords);
                logger.info('sync.provider.cost_upsert', {
                  provider: client.providerSlug,
                  syncLogId,
                  recordCount: costRecords.length,
                  created: costResult.created,
                  updated: costResult.updated,
                });
              }
            } catch (costErr) {
              costError = costErr instanceof Error ? costErr.message : String(costErr);
              logger.warn('sync.provider.costs_failed', {
                provider: client.providerSlug,
                syncLogId,
                error: costError,
              });
            }

            // ── PHASE 3: Finalize sync log ──────────────────────────────────────
            const finalStatus = costError ? 'partial' : 'completed';

            try {
              await deps.syncLogRepo.updateStatus(syncLogId, finalStatus, {
                recordsFetched: rawUsageCount,
                recordsCreated: usageResult.created,
                recordsUpdated: usageResult.updated,
                completedAt: new Date(),
                durationMs: Date.now() - syncStart,
                ...(costError && { errorMessage: `Costs failed: ${costError}` }),
              });
            } catch { /* best effort */ }

            synced.push({
              providerSlug: client.providerSlug,
              syncLogId: syncLog.id,
              usageRecordsCreated: usageResult.created,
              usageRecordsUpdated: usageResult.updated,
              costRecordsCreated: costResult.created,
              costRecordsUpdated: costResult.updated,
            });

            // Mark provider sync as succeeded. Best effort — don't fail the sync result.
            try {
              await deps.providerRepo.markSyncSucceeded(provider.id, new Date());
            } catch (markErr) {
              logger.warn('sync.provider.markSyncSucceeded_failed', {
                provider: client.providerSlug,
                error: markErr instanceof Error ? markErr.message : String(markErr),
              });
            }
          } catch (err) {
            // Catastrophic failure for this provider (setup failed, e.g. provider not found in DB)
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error('sync.provider.failed', {
              provider: client.providerSlug,
              syncLogId,
              error: errorMsg,
            });

            // Best-effort: update sync log if we have one
            if (syncLogId) {
              try {
                await deps.syncLogRepo.updateStatus(syncLogId, 'failed', {
                  errorMessage: errorMsg,
                  completedAt: new Date(),
                  durationMs: Date.now() - syncStart,
                });
              } catch { /* last resort */ }
            }

            // Best-effort: mark provider sync state as error if we got a provider id
            if (currentProviderId) {
              try {
                await deps.providerRepo.markSyncFailed(currentProviderId, errorMsg);
              } catch { /* last resort */ }
            }

            failed.push({ providerSlug: client.providerSlug, error: errorMsg });
          }
        }

        // Step 4: Log completion summary
        logger.info('sync.complete', {
          synced: synced.map((s) => `${s.providerSlug}:${s.usageRecordsCreated}+${s.usageRecordsUpdated}`),
          failed: failed.map((f) => f.providerSlug),
          syncLogIds: synced.map((s) => s.syncLogId),
          durationMs: Date.now() - syncStart,
        });

        // Step 5: Return result
        return { success: true, value: { synced, failed } };
      } catch {
        return {
          success: false,
          error: new CostTrackingError('Failed to sync provider usage', 'SERVICE_ERROR'),
        };
      }
    } finally {
      syncInProgress = false;
    }
  };
};

// =============================================================================
// SECTION 3: PRIVATE HELPERS
// =============================================================================

/**
 * Looks up a credential by externalId. If not found, registers a minimal
 * placeholder credential so the usage record can be linked.
 *
 * Returns null if lookup and registration both fail.
 */
async function lookupOrRegisterCredential(
  credentialRepo: IProviderCredentialRepository,
  providerId: string,
  externalId: string,
  now: Date,
): Promise<ProviderCredential | null> {
  const existing = await credentialRepo.findByExternalId(providerId, externalId);
  if (existing) return existing;

  // Register a placeholder credential — it will be enriched by a dedicated
  // credential sync in the future.
  const placeholder: ProviderCredential = {
    id: createId(),
    providerId,
    externalId,
    label: externalId, // use externalId as label until enriched
    credentialType: 'api_key',
    status: 'active',
    isSyncCredential: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await credentialRepo.create(placeholder);
    return placeholder;
  } catch {
    // Concurrent insert — fetch the winner
    return await credentialRepo.findByExternalId(providerId, externalId);
  }
}

/**
 * Strips date suffix from model slugs: "gpt-4.1-mini-2025-04-14" → "gpt-4.1-mini"
 * Returns the original slug if no date suffix is found.
 */
function stripDateSuffix(slug: string): string {
  return slug.replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

/**
 * Looks up a model by slug. Resolution order:
 *   1. Exact match on the full slug (e.g. "gpt-5-mini-2025-08-07")
 *   2. Base slug with date suffix stripped (e.g. "gpt-5-mini")
 *   3. If neither found, register a new model with the base slug
 *
 * This ensures date-suffixed model versions from providers resolve to our
 * canonical model entries (which have pricing attached).
 *
 * Returns null if lookup and registration both fail.
 */
async function lookupOrRegisterModel(
  modelRepo: IModelRepository,
  providerId: string,
  slug: string,
  serviceCategory: Model['serviceCategory'],
  now: Date,
): Promise<Model | null> {
  // Step 1: Try exact match
  const exact = await modelRepo.findBySlug(providerId, slug);
  if (exact) return exact;

  // Step 2: Try base slug (strip date suffix)
  const baseSlug = stripDateSuffix(slug);
  if (baseSlug !== slug) {
    const base = await modelRepo.findBySlug(providerId, baseSlug);
    if (base) return base;
  }

  // Step 3: Register a new model with the base slug so pricing can be attached once
  const placeholder: Model = {
    id: createId(),
    providerId,
    slug: baseSlug,
    displayName: baseSlug,
    serviceCategory,
    status: 'available',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await modelRepo.create(placeholder);
    return placeholder;
  } catch {
    // Concurrent insert — fetch the winner
    return await modelRepo.findBySlug(providerId, baseSlug);
  }
}

// =============================================================================
// SECTION 4: PRE-WIRED INSTANCE
// =============================================================================

const syncDeps: SyncDeps = {
  usageRecordRepo: makeUsageRecordRepository(db),
  providerCostRepo: makeProviderCostRepository(db),
  syncLogRepo: makeSyncLogRepository(db),
  syncCursorRepo: makeSyncCursorRepository(db),
  providerRepo: makeProviderRepository(db),
  credentialRepo: makeProviderCredentialRepository(db),
  modelRepo: makeModelRepository(db),
  hashDedupKey: generateDedupKey,
};

/**
 * Pre-wired sync use case — repository deps are resolved, only provider
 * clients need to be supplied at call time.
 *
 * Usage:
 *   import { syncProviderUsage } from '.../syncProviderUsageUseCase';
 *   const sync = syncProviderUsage(clients);
 *   const result = await sync({ startTime, endTime });
 */
export const syncProviderUsage = (clients: ProviderUsageClient[]) =>
  makeSyncProviderUsageUseCase(syncDeps, clients);

/**
 * Pre-wired sync use case that reads provider credentials from environment
 * variables. Used by the sync API route so it doesn't need to import
 * infrastructure-layer provider factories directly.
 *
 * Usage:
 *   import { syncProviderUsageFromEnv } from '.../syncProviderUsageUseCase';
 *   const { clients, sync } = syncProviderUsageFromEnv();
 *   if (clients.length === 0) { ... }
 *   const result = await sync({ startTime, endTime });
 */
export const syncProviderUsageFromEnv = () => {
  const config: ProviderClientConfig = {
    openaiApiKey: process.env.OPENAI_USAGE_API_KEY,
    anthropicAdminApiKey: process.env.ANTHROPIC_ADMIN_API_KEY,
    // Both Vertex AI and Gemini use the same GCP Service Account JSON.
    gcpServiceAccountJson: process.env.GCP_SERVICE_ACCOUNT_JSON,
  };
  const clients = buildProviderClients(config);
  return { clients, sync: makeSyncProviderUsageUseCase(syncDeps, clients) };
};

/**
 * Pre-wired sync use case that reads provider credentials from the database.
 * Decrypts each stored credential using ENCRYPTION_KEY and constructs clients.
 *
 * Throws if ENCRYPTION_KEY is not set — callers should wrap in try/catch and
 * fall back to env-var-only behaviour.
 *
 * Usage:
 *   import { syncProviderUsageFromDb } from '.../syncProviderUsageUseCase';
 *   const { clients, sync } = await syncProviderUsageFromDb();
 *   const result = await sync({ startTime, endTime });
 */
export const syncProviderUsageFromDb = async () => {
  const clients = await buildProviderClientsFromDb(
    makeProviderRepository(db),
    makeProviderCredentialRepository(db),
  );
  return { clients, sync: makeSyncProviderUsageUseCase(syncDeps, clients) };
};
