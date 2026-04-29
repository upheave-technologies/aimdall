---
task_id: GCPBE_5_3
type: backend
agent: donnie
status: pending
dependencies: [GCPBE_5_2]
phase: 1
---

# Implement gcpBillingExportClient — auto export-start-date discovery, mandatory filters, dry-run gate, sync window with overlap

## Description

Fill in the Billing Export client stubbed in GCPBE_5_2 with a full BigQuery-backed implementation of the `ProviderUsageClient` contract. All BigQuery access is confined to this single file (RFC §9). The application and domain layers must never import `@google-cloud/bigquery`.

The client is responsible for four things:

1. **Connection probe (`testConnection`)** — single bounded query that simultaneously verifies dataset reachability, table existence, SA read access, partition filter acceptance, and Detailed Export schema. Errors map to plain-language failures.
2. **Export start-date auto-discovery** — query `INFORMATION_SCHEMA.PARTITIONS` for the configured billing table, take the minimum partition identifier as a date. Metadata-only — bypasses the bytes-scanned ceiling.
3. **Sync (`fetchUsage` or equivalent)** — pull AI-services billing rows for the sync window, with mandatory client-side enforcement of partition filter + service filter, gated by a dry-run that aborts if estimated bytes exceed `MAX_BYTES_PER_QUERY`.
4. **Error mapping** — distinct domain errors for: BigQuery API not enabled, dataset/table not found, partition filter rejected, SA permission denied, quota errors, dry-run ceiling abort, no AI rows in lookback window.

## PRD Reference

- R3: Connection validation (specific, plain-language failures; no raw error codes)
- R4: AI-only ingestion — `service.description IN ('Vertex AI', 'Generative Language API')`
- R5: Daily sync cadence
- R6: Backfill behavior on first connect
- R7: Cost dimensions captured per row
- R8: Net cost reporting (after credits)
- "Non-Functional Requirements / Query cost containment" — partition filter mandatory, AI-service filter at query level, ceiling on bytes scanned

## RFC Reference

- §5.3 — Connection probe shape and the four failure surfaces
- §5.4 — Export start-date auto-discovery via `INFORMATION_SCHEMA.PARTITIONS`; metadata-only (zero bytes); `pending_first_data` state when no partitions yet
- §6 — Sync algorithm:
  - Cadence: daily, plus manual
  - Window: `[lastSyncCovered − 3 days, today)` — 3-day overlap absorbs late-arriving rows; idempotent against dedup key
  - Mandatory query shape: partition filter on `_PARTITIONDATE` (or table's native partition column) AND service filter on `service.description IN ('Vertex AI', 'Generative Language API')` — both applied **inside the client at query construction time**, never relying on the caller
  - Mandatory dry-run gate: `MAX_BYTES_PER_QUERY = 1_073_741_824` (1 GiB); abort if exceeded with the user-facing message specified in RFC §6
  - Bytes-scanned telemetry: emit dry-run estimate AND post-execution `bytesProcessed` on the sync log
  - Error mapping: distinct domain errors per failure mode
- §6.1 — Anti-runaway defense in depth (filters + dry-run + telemetry)
- §9 — All BigQuery access confined to `gcpBillingExportClient.ts`
- §11 — `labels` column intentionally NOT projected in Phase 1; this client must not select or store labels

## Critical Specifics (baked in so the agent does not re-derive)

- **Dedup key for billed rows**: `(billing_account_id, gcp_project_id, sku_id, usage_start_time, usage_end_time)` — the client must populate every component on every emitted row so the existing dedup pipeline keys correctly (RFC §4.4)
- **Mandatory query filters**: `WHERE service.description IN ('Vertex AI', 'Generative Language API') AND _PARTITIONDATE BETWEEN @start AND @end` — both required, both enforced inside the client
- **Sync window**: `[lastSyncCovered − 3 days, today)` (UTC). On first sync, `lastSyncCovered` defaults to `exportStartDate` (auto-discovered)
- **Bytes ceiling constant**: `MAX_BYTES_PER_QUERY = 1_073_741_824` (1 GiB), defined as a single named constant inside this client module so it can be revisited centrally
- **Abort message** (user-facing, plain language): "This sync would scan more than 1 GB of BigQuery data, which suggests a partition filter regression. Aborting to protect your BigQuery costs."
- **Metadata-only `INFORMATION_SCHEMA.PARTITIONS` query bypasses the gate** — it scans zero bytes by definition
- **Net cost** maps to `calculated_cost_amount`; `gross_cost_amount` and `credits_amount` are diagnostic columns (RFC §4.2, §8)
- **Phase 1 columns**: `sku_id`, `sku_description`, `billing_account_id`, `gcp_project_id`, `usage_amount`, `usage_unit`, `gross_cost_amount`, `credits_amount`, `calculated_cost_amount`, `calculated_cost_currency`, `bucket_width = 1d`, `bucket_start = day(usage_start_time)` (UTC), `cost_source = 'provider_reported'`. Token / request columns left null. **No `labels` column in Phase 1.**

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/gcpBillingExportClient.ts` — stub from GCPBE_5_2; this task fills it
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/types.ts` — `ProviderUsageClient` and `RawProviderUsageData` contracts
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/vertexUsageClient.ts` and `geminiUsageClient.ts` — Google SA auth plumbing reference
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/syncLog.ts` and `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/syncLogs.ts` — for emitting `bytesProcessed` and dry-run estimate telemetry on sync log lines
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/costTrackingError.ts` — existing error patterns for the new domain errors

## Files Touched

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/gcpBillingExportClient.ts` (full implementation)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/costTrackingError.ts` (modified — add new error variants for Billing Export failure modes)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/syncLog.ts` (modified if telemetry shape needs the dry-run estimate field)

## Acceptance Criteria

- [ ] `gcpBillingExportClient` conforms to `ProviderUsageClient` and surfaces no BigQuery types across the module boundary
- [ ] `testConnection` issues a single bounded query restricted to the most recent partition only, selecting Detailed-Export-only columns; failure modes (Standard Export, missing partition column, dataset not reachable, table absent, SA permission denied) each map to distinct, plain-language domain errors with no raw GCP error codes
- [ ] On `testConnection` success, the client auto-discovers `exportStartDate` via `INFORMATION_SCHEMA.PARTITIONS` (metadata-only, no bytes scanned, bypasses the dry-run gate)
- [ ] When `INFORMATION_SCHEMA.PARTITIONS` returns no rows, the client returns a `pending_first_data` signal (does not throw) so the caller can persist that state
- [ ] Every sync query is constructed inside the client with BOTH the partition filter on the table's partition column AND `service.description IN ('Vertex AI', 'Generative Language API')` — caller-provided filters cannot remove either
- [ ] Sync window is `[lastSyncCovered − 3 days, today)` (UTC); first sync uses `[exportStartDate, today)`
- [ ] Every sync query is preceded by a BigQuery dry-run; if the estimate exceeds `MAX_BYTES_PER_QUERY = 1_073_741_824`, the real query is NOT submitted and a `BytesCeilingExceededError` (or equivalent named domain error) is raised with the exact user-facing message specified in RFC §6
- [ ] Both the dry-run byte estimate and the post-execution `bytesProcessed` are recorded on the sync log line for every executed query
- [ ] Emitted rows populate every dedup-key component: `billing_account_id`, `gcp_project_id`, `sku_id`, `usage_start_time`, `usage_end_time`
- [ ] Emitted rows populate the Phase 1 columns enumerated above; `cost_source = 'provider_reported'`; token and request columns left null; `bucket_width = 1d`; `calculated_cost_amount` holds NET cost (after credits)
- [ ] No `labels` selection in any query and no `labels` column written
- [ ] Error mapping covers: API not enabled, dataset/table not found, partition filter rejected, SA permission denied, quota errors, dry-run ceiling abort, no AI rows in lookback window — each as a distinct domain error
- [ ] Sync failures on this provider do not throw out of the existing per-provider isolation envelope (Cloud Monitoring syncs continue independently)
- [ ] `MAX_BYTES_PER_QUERY` is a single named constant in this module, easy to grep and revisit

## Out of Scope (do NOT do in this task)

- Read-time suppression of Monitoring estimates (GCPBE_5_4)
- Per-key allocation (Phase 2)
- Labels ingestion (Phase 2 — GCPBE_5_8)
- SKU-mapping lookups during sync (Phase 3)
- Any wizard, server action, or app/ work
