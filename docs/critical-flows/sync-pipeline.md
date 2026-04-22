# Sync Pipeline — Critical Flow Reference

## Section 1: Overview

The sync pipeline fetches usage and cost data from AI provider APIs (OpenAI, Anthropic, Google Vertex, Google Gemini), normalizes it into a common schema, and persists it via idempotent upserts keyed on a SHA-256 dedup hash.

**This is the most critical flow in the application.** Every downstream feature — dashboards, cost explorer, attributions, budget tracking, anomaly detection, recommendations — reads exclusively from the data this pipeline writes. If sync fails silently, produces incorrect token counts, or mishandles concurrency, every number in the UI is wrong. There is no secondary data source.

The pipeline is invoked via HTTP POST to `/api/cost-tracking/sync`. It is synchronous within the request boundary — the API route waits for all providers to complete before responding.

---

## Section 2: Architecture — Data Flow

```
HTTP POST /api/cost-tracking/sync
  → API Route (app/api/cost-tracking/sync/route.ts)
      checks COST_TRACKING_SYNC_SECRET (Bearer auth)
      calls syncProviderUsageFromEnv()
        → buildProviderClients(config) from env vars
        → makeSyncProviderUsageUseCase(syncDeps, clients)
          checks module-level syncInProgress flag (CONFLICT guard)
          syncInProgress = true
          │
          FOR EACH client:
          │
          ─── SETUP ───
          │ providerRepo.findBySlug()           → Provider lookup (skip if not found)
          │ syncCursorRepo.findCursor()         → Resume point (null = first sync)
          │ syncLogRepo.create()                → Audit entry (status: 'running')
          │
          ─── PHASE 1: Usage (critical path) ───
          │ client.fetchUsage()                 → Provider API call (paginated)
          │   for each raw record:
          │     lookupOrRegisterCredential()    → Auto-register unknown API keys
          │     lookupOrRegisterModel()         → Auto-register unknown models (strips date suffix)
          │     modelRepo.findPricingForModel() → Pricing lookup
          │     findApplicablePricing()         → Domain: match pricing by tier/region/date
          │     calculateCostFromRates()        → Domain: compute dollar cost from tokens
          │     generateDedupKey()              → SHA-256 of 9-dimension input
          │ usageRecordRepo.upsertBatch()       → Idempotent persist (BATCH_SIZE=250)
          │ syncCursorRepo.upsert()             → Advance cursor to latestBucket
          │   on Phase 1 error:
          │     syncLogRepo.updateStatus('failed')
          │     push to failed[], continue to next client
          │
          ─── PHASE 2: Costs (non-critical) ───
          │ client.fetchCosts()                 → Provider billing API (optional)
          │ providerCostRepo.upsertBatch()      → Idempotent persist (BATCH_SIZE=500)
          │   on Phase 2 error:
          │     costError captured, NOT pushed to failed[]
          │
          ─── PHASE 3: Finalize ───
          │ finalStatus = costError ? 'partial' : 'completed'
          │ syncLogRepo.updateStatus(finalStatus)
          │ push to synced[]
          │
        FINALLY: syncInProgress = false
      →  return { synced[], failed[] }
  ← HTTP 200 JSON { synced[], failed[] }
```

---

## Section 3: Component Inventory

| Layer | File | Role |
|-------|------|------|
| Entry point | `app/api/cost-tracking/sync/route.ts` | HTTP POST handler; auth check; delegates to `syncProviderUsageFromEnv`; `maxDuration = 120` |
| Application | `modules/cost-tracking/application/syncProviderUsageUseCase.ts` | Orchestrator — phases, error handling, concurrency guard, pre-wired instance via `syncProviderUsageFromEnv` |
| Application | `modules/cost-tracking/application/costTrackingError.ts` | Typed error class with `code` string (e.g. `CONFLICT`, `SERVICE_ERROR`) |
| Infra: Clients | `modules/cost-tracking/infrastructure/providers/buildProviderClients.ts` | Factory — constructs active clients from `ProviderClientConfig`; absent keys skip that provider |
| Infra: Clients | `modules/cost-tracking/infrastructure/providers/openaiUsageClient.ts` | OpenAI — 8 endpoints, paginated, `FETCH_BUDGET_MS = 90_000` aggregate deadline, per-request `AbortSignal.timeout(30_000)` |
| Infra: Clients | `modules/cost-tracking/infrastructure/providers/anthropicUsageClient.ts` | Anthropic — usage report + cost report APIs; 30s per-request timeout; returns `[]` on error |
| Infra: Clients | `modules/cost-tracking/infrastructure/providers/vertexUsageClient.ts` | Vertex AI — Cloud Monitoring metrics; Google SDK with implicit timeout |
| Infra: Clients | `modules/cost-tracking/infrastructure/providers/geminiUsageClient.ts` | Gemini — Cloud Monitoring + serviceruntime; ADC authentication |
| Infra: Clients | `modules/cost-tracking/infrastructure/providers/types.ts` | Shared contract: `ProviderUsageClient`, `RawProviderUsageData`, `RawProviderCostData` |
| Infra: Repos | `modules/cost-tracking/infrastructure/repositories/DrizzleUsageRecordRepository.ts` | `upsertBatch` with `xmax = 0` insert/update counting; `BATCH_SIZE = 250` |
| Infra: Repos | `modules/cost-tracking/infrastructure/repositories/DrizzleProviderCostRepository.ts` | Cost `upsertBatch` with `xmax = 0` counting; `BATCH_SIZE = 500` |
| Infra: Repos | `modules/cost-tracking/infrastructure/repositories/DrizzleSyncRepository.ts` | Sync log CRUD (`makeSyncLogRepository`) + cursor upsert with retry loop (`makeSyncCursorRepository`) |
| Infra: Repos | `modules/cost-tracking/infrastructure/repositories/DrizzleProviderRepository.ts` | Provider, credential, model lookups + auto-registration factories |
| Infra | `modules/cost-tracking/infrastructure/dedupKeyHasher.ts` | `generateDedupKey` — calls domain `buildDedupInput` then SHA-256 via `node:crypto` |
| Infra | `modules/cost-tracking/infrastructure/logger.ts` | Structured JSON logging |
| Infra | `modules/cost-tracking/infrastructure/database.ts` | `CostTrackingDatabase` type (Drizzle instance shape, no connection creation) |
| Database | `lib/db.ts` | Pool singleton: `max: 20`, `connectionTimeoutMillis: 10_000`, `idleTimeoutMillis: 30_000`, `statement_timeout: 60_000`, `query_timeout: 60_000`; `pool.on('error')` handler |
| Domain | `modules/cost-tracking/domain/usageRecord.ts` | `UsageRecord` entity; `DedupDimensions` type; `buildDedupInput` — stable pipe-delimited string over 9 dimensions |
| Domain | `modules/cost-tracking/domain/providerCost.ts` | `ProviderCost` entity |
| Domain | `modules/cost-tracking/domain/model.ts` | `Model` entity; `ServiceCategory` type |
| Domain | `modules/cost-tracking/domain/modelPricing.ts` | `findApplicablePricing` — matches pricing by effective date, tier, region; `calculateCostFromRates` — multiplies token counts by per-unit rates |
| Domain | `modules/cost-tracking/domain/syncLog.ts` | `SyncLog` entity; `SyncStatus` type (`running`, `completed`, `partial`, `failed`) |
| Domain | `modules/cost-tracking/domain/syncCursor.ts` | `SyncCursor` entity — tracks last synced bucket per (providerId, credentialId, serviceCategory) |
| Domain | `modules/cost-tracking/domain/repositories.ts` | All repository interfaces (`IUsageRecordRepository`, `IProviderCostRepository`, `ISyncLogRepository`, `ISyncCursorRepository`, `IProviderRepository`, `IProviderCredentialRepository`, `IModelRepository`) |
| Schema | `modules/cost-tracking/schema/usageRecords.ts` | Fact table — wide column set, all metric columns nullable |
| Schema | `modules/cost-tracking/schema/enums.ts` | All PostgreSQL enums (service category, sync status, cost source, etc.) |

---

## Section 4: Robustness Guarantees

### 1. Concurrency guard

`syncProviderUsageUseCase.ts` declares `let syncInProgress = false` at module level. The returned use case function checks `if (syncInProgress)` at the very start and returns `{ success: false, error: new CostTrackingError('Sync already in progress', 'CONFLICT') }` immediately. The flag is set to `true` before any work begins and reset to `false` inside the outer `finally` block, meaning it always clears even when an unhandled exception escapes all inner catches.

### 2. Phased execution

Usage (Phase 1) and costs (Phase 2) execute inside separate, independent `try/catch` blocks inside the per-provider loop. Phase 1 is critical: its catch sets `syncLog.status = 'failed'`, pushes to `failed[]`, and calls `continue` — no Phase 2 attempt is made. Phase 2 failure is non-critical: the error is captured in `costError` but is never pushed to `failed[]`. The final status is `'partial'` when `costError` is set, `'completed'` otherwise. This means a billing API outage never causes loss of usage data.

### 3. Sync log always reaches a terminal state

Every code path transitions the sync log away from `'running'`:
- Phase 1 catch: `syncLogRepo.updateStatus(syncLogId, 'failed', ...)`
- Phase 3 (success path): `syncLogRepo.updateStatus(syncLogId, finalStatus, ...)` where `finalStatus` is `'partial'` or `'completed'`
- Outer per-provider catch (catastrophic setup failure): best-effort `syncLogRepo.updateStatus(syncLogId, 'failed', ...)` when `syncLogId` is defined
- All `updateStatus` calls inside catch blocks are themselves wrapped in inner `try/catch {}` to prevent a sync log failure from masking the original error

There is no code path that leaves a sync log permanently in `'running'`.

### 4. Per-record resilience in all mappers

Every mapper that iterates API response results wraps its inner loop body in `try/catch`. A single malformed record is logged via `logger.warn('provider.fetch.usage.record.skip', ...)` and skipped — it does not terminate the loop or abort the batch. This applies to all 8 OpenAI mappers (`mapCompletionsBuckets`, `mapEmbeddingsBuckets`, `mapImagesBuckets`, `mapAudioSpeechesBuckets`, `mapAudioTranscriptionsBuckets`, `mapModerationsBuckets`, `mapCodeInterpreterBuckets`, `mapVectorStoresBuckets`), the Anthropic usage inner loop, the Anthropic cost inner loop, and the OpenAI cost inner loop.

### 5. Defensive numeric coercion

All API response numeric fields are null-guarded before arithmetic:
- OpenAI usage mappers: every field uses `?? 0` (e.g. `result.input_tokens ?? 0`, `result.reasoning_tokens ?? 0`)
- Anthropic usage mapper: every field uses `?? 0` (e.g. `result.uncached_input_tokens ?? 0`, `result.output_tokens ?? 0`)
- Anthropic cost mapper: `const rawAmount = Number(result.amount ?? 0)` followed by `Number.isFinite(rawAmount) ? rawAmount / 100 : 0` before the `.toFixed(8)` call
- OpenAI cost mapper: `Number(result.amount.value ?? 0).toFixed(8)` — `Number()` coerces null/undefined to 0

### 6. Aggregate timeout budget (OpenAI)

`openaiUsageClient.ts` declares `const FETCH_BUDGET_MS = 90_000`. At the start of `fetchUsage`, a `deadline = fetchStart + FETCH_BUDGET_MS` is computed. Before each of the 8 endpoint category blocks, the client checks `if (Date.now() >= deadline)`. When the deadline is exceeded, it logs `logger.warn('provider.fetch.deadline_exceeded', { completedCategories, totalRecords, elapsedMs })` and returns `allRows` immediately — partial results from completed categories are preserved. This prevents the 8-endpoint sequential fetch from running past the 120s `maxDuration` of the API route.

### 7. Per-request HTTP timeout

All `fetch()` calls in `openaiUsageClient.ts` and `anthropicUsageClient.ts` use `signal: AbortSignal.timeout(30_000)`. This aborts any individual HTTP request that does not respond within 30 seconds. The network error is caught inside `fetchOpenAIPaginatedUsage` and `anthropicUsageClient.fetchUsage`, which return partial results and log the error — they do not throw. Google clients (`vertexUsageClient.ts`, `geminiUsageClient.ts`) use the GCP SDK which manages its own timeout.

### 8. Idempotent upserts

Both `DrizzleUsageRecordRepository.upsertBatch` and `DrizzleProviderCostRepository.upsertBatch` use `.onConflictDoUpdate` keyed on `dedupKey` with `targetWhere: isNull(deletedAt)`. The dedup key is a SHA-256 hash of 9 dimensions: `providerId | credentialId | modelSlug | serviceCategory | serviceTier | contextTier | region | bucketStart.toISOString() | bucketWidth`. Re-ingesting the same time window produces updates (not duplicates), and revised metric values from the provider overwrite the stored values. This makes the pipeline safe to re-run or to overlap time windows without creating ghost records.

### 9. Accurate insert/update counting

Both upsert repositories use `.returning({ id, wasInserted: sql<boolean>\`(xmax = 0)\` })`. PostgreSQL's `xmax` system column is `0` for freshly inserted rows and non-zero for rows updated in place. The returned boolean distinguishes new records from revisions without relying on timestamps, row counts, or other heuristics that can miscount on conflict.

### 10. Cursor race protection

`DrizzleSyncRepository.makeSyncCursorRepository` implements a manual find-then-update-or-insert with a retry loop (`MAX_RETRIES = 3`) rather than `onConflictDoUpdate`. This is necessary because PostgreSQL's `ON CONFLICT` clause does not fire when the conflict key contains `NULL` values (NULL != NULL in constraint evaluation), and `credentialId` is nullable. The retry loop catches constraint violations identified by error code `23505`, message substring `'unique constraint'`, or message substring `'duplicate key'`. On constraint violation it retries; the next iteration finds the existing row and takes the update branch. After 3 failed attempts it re-throws.

### 11. Database pool hardening

`lib/db.ts` configures `pg.Pool` with: `max: 20`, `connectionTimeoutMillis: 10_000`, `idleTimeoutMillis: 30_000`, `statement_timeout: 60_000`, `query_timeout: 60_000`. The `pool.on('error')` handler logs to structured JSON and prevents the uncaught error from crashing the process.

### 12. Auto-registration with race safety

`lookupOrRegisterCredential` and `lookupOrRegisterModel` in `syncProviderUsageUseCase.ts` both follow the same pattern: attempt `findByExternalId` / `findBySlug`; if not found, insert a placeholder; catch any error (concurrent insert) and re-fetch. This catch-and-refetch pattern means two concurrent syncs can race to insert the same credential or model without one of them crashing — the loser of the race fetches the winner's row.

For models, `lookupOrRegisterModel` applies a two-step slug resolution: (1) exact match on the full slug (e.g. `gpt-4.1-mini-2025-04-14`), (2) base slug with date suffix stripped via `stripDateSuffix` (e.g. `gpt-4.1-mini`), (3) register new model with the base slug if neither matches. This ensures date-versioned model slugs from provider APIs resolve to canonical model entries that have pricing attached.

### 13. Incremental sync

`syncCursorRepo.findCursor(provider.id, undefined, 'text_generation')` retrieves the last synced bucket for each provider. If a cursor exists and `forceFullSync` is false, `providerStartTime` is set to `cursor.lastSyncedBucket`. On first sync (no cursor), the start time falls back to `endTime - DEFAULT_LOOKBACK_MS` (30 days). After a successful Phase 1 upsert, the cursor is advanced to `latestBucket` (the maximum `bucketStart` seen in the current batch). Because upserts are idempotent, cursor overlap between runs is harmless.

---

## Section 5: Agentic Audit Checklist

Each item below describes a specific invariant, where to find it, and what constitutes a pass or fail. Run these checks after any modification to the sync pipeline files.

```
AUDIT-SYNC-01: Concurrency guard exists
  File: modules/cost-tracking/application/syncProviderUsageUseCase.ts
  Check: File contains `let syncInProgress = false` at module scope (outside the factory function)
  Check: The returned async function contains `if (syncInProgress)` before any repository call
  Check: `syncInProgress = false` appears inside a `finally` block that wraps the entire use case body
  Fail if: Any of these three patterns are absent

AUDIT-SYNC-02: Phase separation is intact
  File: modules/cost-tracking/application/syncProviderUsageUseCase.ts
  Check: Phase 1 (usage fetch + upsert + cursor advance) is inside its own `try` block
  Check: Phase 2 (cost fetch + upsert) is inside a SEPARATE subsequent `try` block
  Check: Phase 1 catch calls `deps.syncLogRepo.updateStatus(syncLogId, 'failed', ...)` and calls `continue`
  Check: Phase 2 catch sets a `costError` variable but does NOT call `failed.push(...)`
  Fail if: Usage processing and cost processing share a single try/catch block

AUDIT-SYNC-03: Sync log always reaches terminal state
  File: modules/cost-tracking/application/syncProviderUsageUseCase.ts
  Check: Phase 1 catch block calls syncLogRepo.updateStatus with status 'failed'
  Check: Phase 3 block calls syncLogRepo.updateStatus with `finalStatus` ('completed' or 'partial')
  Check: Outer per-provider catch calls syncLogRepo.updateStatus with 'failed' when syncLogId is defined
  Check: All syncLogRepo.updateStatus calls inside catch blocks are themselves wrapped in try/catch
  Fail if: Any execution path can leave a sync log record permanently in 'running' status

AUDIT-SYNC-04: Per-record try/catch in all mappers
  File: modules/cost-tracking/infrastructure/providers/openaiUsageClient.ts
  Check: mapCompletionsBuckets — inner `for (const result of bucket.results)` loop body has try/catch
  Check: mapEmbeddingsBuckets — inner loop has try/catch
  Check: mapImagesBuckets — inner loop has try/catch
  Check: mapAudioSpeechesBuckets — inner loop has try/catch
  Check: mapAudioTranscriptionsBuckets — inner loop has try/catch
  Check: mapModerationsBuckets — inner loop has try/catch
  Check: mapCodeInterpreterBuckets — inner loop has try/catch
  Check: mapVectorStoresBuckets — inner loop has try/catch
  Check: fetchCosts inner `for (const result of bucket.results)` loop has try/catch
  File: modules/cost-tracking/infrastructure/providers/anthropicUsageClient.ts
  Check: fetchUsage inner `for (const result of bucket.results)` loop has try/catch
  Check: fetchCosts inner `for (const result of bucket.results)` loop has try/catch
  Fail if: Any of the above loops lacks a try/catch wrapping the record mapping logic

AUDIT-SYNC-05: Defensive numeric coercion
  File: modules/cost-tracking/infrastructure/providers/openaiUsageClient.ts
  Check: All arithmetic on CompletionsResult fields uses `?? 0` (input_tokens, output_tokens, reasoning_tokens, input_cached_tokens, num_model_requests)
  Check: fetchCosts amount uses `Number(result.amount.value ?? 0).toFixed(8)`
  File: modules/cost-tracking/infrastructure/providers/anthropicUsageClient.ts
  Check: All usage numeric fields use `?? 0` (uncached_input_tokens, output_tokens, thinking_tokens, cache_read_input_tokens, web_search_requests)
  Check: Cost amount uses `const rawAmount = Number(result.amount ?? 0)` AND `Number.isFinite(rawAmount) ? rawAmount / 100 : 0`
  Fail if: Any raw API numeric field is used in arithmetic or stored without a null/undefined guard

AUDIT-SYNC-06: Aggregate timeout budget (OpenAI)
  File: modules/cost-tracking/infrastructure/providers/openaiUsageClient.ts
  Check: `const FETCH_BUDGET_MS = 90_000` (or lower — must not exceed 90000)
  Check: `fetchUsage` computes `const deadline = fetchStart + FETCH_BUDGET_MS`
  Check: `if (Date.now() >= deadline)` check appears before each of the 8 endpoint category blocks (completions, embeddings, images, audio_speeches, audio_transcriptions, moderations, code_interpreter_sessions, vector_stores)
  Check: Each exceeded-deadline branch calls `logger.warn` and returns `allRows`
  Fail if: Any category block is missing its deadline guard, or FETCH_BUDGET_MS > 90000

AUDIT-SYNC-07: Idempotent upserts with correct insert/update counting
  File: modules/cost-tracking/infrastructure/repositories/DrizzleUsageRecordRepository.ts
  Check: `upsertBatch` uses `.onConflictDoUpdate({ target: costTrackingUsageRecords.dedupKey, targetWhere: isNull(costTrackingUsageRecords.deletedAt), ... })`
  Check: `.returning()` includes `wasInserted: sql<boolean>\`(xmax = 0)\``
  File: modules/cost-tracking/infrastructure/repositories/DrizzleProviderCostRepository.ts
  Check: `upsertBatch` uses `.onConflictDoUpdate({ target: costTrackingProviderCosts.dedupKey, targetWhere: isNull(costTrackingProviderCosts.deletedAt), ... })`
  Check: `.returning()` includes `wasInserted: sql<boolean>\`(xmax = 0)\``
  Check: Neither repository uses Date.now() or timestamp comparison to determine created vs. updated
  Fail if: xmax check is absent, or time-based counting logic is introduced

AUDIT-SYNC-08: Cursor upsert is race-safe
  File: modules/cost-tracking/infrastructure/repositories/DrizzleSyncRepository.ts
  Check: `makeSyncCursorRepository` upsert method contains a `for` loop with `MAX_RETRIES = 3`
  Check: The catch inside the retry loop checks for constraint violation via error code `'23505'`, message `'unique constraint'`, or message `'duplicate key'`
  Check: On non-constraint errors or exhausted retries, the error is re-thrown
  Fail if: Cursor upsert uses `onConflictDoUpdate` without accounting for NULL key columns, or retry loop is absent

AUDIT-SYNC-09: Database pool is hardened
  File: lib/db.ts
  Check: `new Pool(...)` includes `max: 20`
  Check: `new Pool(...)` includes `connectionTimeoutMillis: 10_000`
  Check: `new Pool(...)` includes `idleTimeoutMillis: 30_000`
  Check: `new Pool(...)` includes `statement_timeout: 60_000`
  Check: `pool.on('error', ...)` handler exists and logs the error
  Fail if: Pool is constructed with only `connectionString` and no other options, or error handler is absent

AUDIT-SYNC-10: syncLogId appears in post-creation structured logs
  File: modules/cost-tracking/application/syncProviderUsageUseCase.ts
  Check: `logger.info('sync.provider.usage_upsert', ...)` includes `syncLogId`
  Check: `logger.info('sync.provider.cost_upsert', ...)` includes `syncLogId`
  Check: `logger.error('sync.provider.usage_failed', ...)` includes `syncLogId`
  Check: `logger.warn('sync.provider.costs_failed', ...)` includes `syncLogId`
  Check: `logger.info('sync.complete', ...)` includes `syncLogIds: synced.map((s) => s.syncLogId)`
  Fail if: Any logger call made after syncLog creation omits syncLogId

AUDIT-SYNC-11: API route guards
  File: app/api/cost-tracking/sync/route.ts
  Check: `export const maxDuration = 120` is set (must be ≤ 120)
  Check: When `clients.length === 0`, route returns `NextResponse.json({ error: ... }, { status: 400 })`
  Check: When `process.env.COST_TRACKING_SYNC_SECRET` is set, route checks `request.headers.get('authorization') !== \`Bearer \${secret}\`` and returns 401
  Fail if: maxDuration is absent or > 120, empty-clients check is missing, or auth guard is missing

AUDIT-SYNC-12: Provider client contract compliance
  Files: openaiUsageClient.ts, anthropicUsageClient.ts, vertexUsageClient.ts, geminiUsageClient.ts
  Check: Each factory returns an object matching the `ProviderUsageClient` type (providerSlug: string, fetchUsage: function)
  Check: `openaiUsageClient.fetchUsage` — top-level function has no unguarded throw; all pagination errors are caught inside `fetchOpenAIPaginatedUsage` which returns partial results
  Check: `anthropicUsageClient.fetchUsage` — network errors and API errors are caught and return `allRows` (partial results)
  Check: `anthropicUsageClient.fetchCosts` — network errors and API errors are caught and return `allRows`
  Check: Both Google clients log errors rather than propagating them unhandled
  Fail if: Any client's fetchUsage or fetchCosts can propagate an unhandled exception from the provider HTTP/gRPC call
```

---

## Section 6: Environment Variables

| Variable | Required | Used by |
|----------|----------|---------|
| `DATABASE_URL` | Yes | `lib/db.ts` — PostgreSQL connection string for `pg.Pool` |
| `OPENAI_USAGE_API_KEY` | No | `openaiUsageClient.ts` — org-level API key with usage read scope |
| `ANTHROPIC_ADMIN_API_KEY` | No | `anthropicUsageClient.ts` — Admin API key (`sk-ant-admin...`) |
| `GOOGLE_CLOUD_PROJECT_ID` | No | `vertexUsageClient.ts` — GCP project ID for Cloud Monitoring API |
| `GOOGLE_GEMINI_PROJECT_ID` | No | `geminiUsageClient.ts` — GCP project ID for Gemini Cloud Monitoring metrics |
| `GOOGLE_GEMINI_API_KEY` | No | `geminiUsageClient.ts` — informational only; ADC (Application Default Credentials) is used for auth |
| `COST_TRACKING_SYNC_SECRET` | No | `app/api/cost-tracking/sync/route.ts` — when set, requires `Authorization: Bearer <secret>` on every POST |

If none of `OPENAI_USAGE_API_KEY`, `ANTHROPIC_ADMIN_API_KEY`, `GOOGLE_CLOUD_PROJECT_ID`, or `GOOGLE_GEMINI_PROJECT_ID` are set, `buildProviderClients` returns an empty array and the route returns `400 No provider API keys configured`.

---

## Section 7: How to Run This Audit

To re-run this audit with Claude Code:

1. Open the project in Claude Code
2. Say: "Run the sync pipeline audit from docs/critical-flows/sync-pipeline.md"
3. The agent should:
   a. Read this document in full
   b. For each AUDIT-SYNC-XX item, grep or read the specified file(s)
   c. Verify each pass/fail criterion against the actual code
   d. Report results as a table: ID | Status (PASS/FAIL) | Notes
   e. Flag any FAIL result as a regression requiring immediate attention before the next deploy

```
To trigger a live sync for manual verification:

curl -s -X POST http://localhost:5050/api/cost-tracking/sync \
  -H 'Content-Type: application/json' \
  -d '{}'
```

A healthy response has `synced` entries with non-zero `usageRecordsCreated` or `usageRecordsUpdated` and an empty `failed` array:

```json
{
  "synced": [
    {
      "providerSlug": "openai",
      "syncLogId": "...",
      "usageRecordsCreated": 142,
      "usageRecordsUpdated": 0,
      "costRecordsCreated": 12,
      "costRecordsUpdated": 0
    }
  ],
  "failed": []
}
```

A `"partial"` sync log status (costs failed, usage succeeded) is a degraded but acceptable outcome. A `"failed"` status or a non-empty `failed` array requires investigation.
