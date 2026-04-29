---
task_id: GCPBE_5_4
type: backend
agent: donnie
status: pending
dependencies: [GCPBE_5_3]
phase: 1
---

# Wire billed-row dedup, ingestion mapping, and read-time Monitoring-estimate suppression predicate

## Description

Three small but load-bearing wiring steps that complete the Phase 1 backend:

1. **Dedup-key wiring**: extend `dedupKeyHasher` (and the `DrizzleUsageRecordRepository` upsert path that uses it) so billed rows key off `(billing_account_id, gcp_project_id, sku_id, usage_start_time, usage_end_time)` — the dedup key declared in RFC §4.4. Existing Monitoring rows continue to use their existing dedup key. The 3-day sync overlap depends on this being correct and idempotent.
2. **Ingestion mapping**: ensure the existing ingestion pipeline (the use case driven by `syncProviderUsageUseCase`) projects the new fields emitted by `gcpBillingExportClient` onto `cost_tracking_usage_records` rows, including `cost_source = 'provider_reported'`, the new dimensional columns, and net cost in `calculated_cost_amount`.
3. **Read-time suppression predicate**: add the new domain predicate / read-side filter that, for any `(gcp_project_id, day)` window where Billing Export is "active and trusted" (provider connected, sync state success, watermark covers the day), excludes `cost_source = 'estimated'` rows from `google_vertex` and `google_gemini` providers from dollar aggregations. Monitoring's request-count signal must remain unaffected. This is the de-duplication mechanism per R11 / RFC §3.3.

The suppression must be reversible by construction — disconnecting Billing Export immediately falls back to Monitoring estimates. No data migration, no flag flips on storage rows.

## PRD Reference

- R11: De-duplication of Google cost across sources
- R10: Source provenance is recoverable
- R12: Freshness indicators per source

## RFC Reference

- §3.3 — Coexistence and de-duplication: suppression at the **read layer**, not storage; Monitoring continues to write `cost_source = 'estimated'` rows; new domain predicate decides whether Billing Export is "active and trusted" for a `(project, day)`; reversible if Billing Export disconnects
- §4.4 — Dedup key for billed rows
- §6 — Sync window with 3-day overlap; idempotent against dedup key (this task makes that idempotency real)

## Critical Specifics

- **"Active and trusted"** definition (bake in): provider row exists with slug `google_billing_export`, status reflects a successful most recent sync, and the sync watermark covers the `(project, day)` being aggregated
- **Suppression target**: rows with `cost_source = 'estimated'` AND provider slug in `{google_vertex, google_gemini}` AND matching `(gcp_project_id, day)` to a covered Billing Export window
- **Untouched**: Monitoring rows that carry request-count / token signals (these drive the per-key allocation in Phase 2 and must remain visible to read paths that ask for activity, not dollars)

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/repositories/DrizzleUsageRecordRepository.ts` — upsert path; `dedupKeyHasher` plugs in here
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/usageRecord.ts` and `domain/usageRecordRepository.ts` — existing repository interface
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/syncProviderUsageUseCase.ts` — ingestion entry point
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getUsageSummaryUseCase.ts`, `exploreCostDataUseCase.ts`, `getBudgetStatusUseCase.ts`, `detectSpendAnomaliesUseCase.ts`, `getUnassignedSpendUseCase.ts` — read-side use cases that aggregate dollars and therefore need to consult the suppression predicate
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/provider.ts` — for the "active and trusted" definition
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/syncCursors.ts` — for watermark coverage check

## Files Touched

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/repositories/DrizzleUsageRecordRepository.ts` (modified — dedup key branch for billed rows)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/usageRecord.ts` (modified if dedup key shape lives in domain)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/syncProviderUsageUseCase.ts` (modified — projection mapping for billed rows)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/billingExportTrust.ts` (new — pure predicate determining "active and trusted" for a `(project, day)` window) — final filename and shape at the agent's discretion within domain layer rules
- Read-side use cases listed above (modified — apply suppression predicate when aggregating dollars)

## Acceptance Criteria

- [ ] Billed rows upsert idempotently against `(billing_account_id, gcp_project_id, sku_id, usage_start_time, usage_end_time)`; running the same sync window twice produces no duplicate rows and no row churn
- [ ] Existing Monitoring upsert behaviour is unchanged — Monitoring rows still dedup against their existing key
- [ ] Ingestion projection writes the Phase 1 columns (per GCPBE_5_3 ACs) into `cost_tracking_usage_records` with `cost_source = 'provider_reported'`
- [ ] A pure domain predicate exists that, given `(gcp_project_id, day)`, returns whether Billing Export is "active and trusted" for that pair (provider connected, last sync success, watermark covers the day)
- [ ] Every read-side use case that aggregates dollars (the list above) consults this predicate and excludes `cost_source = 'estimated'` rows from `google_vertex` / `google_gemini` for `(project, day)` windows where the predicate is true
- [ ] Read-side use cases that aggregate request counts / tokens are NOT affected by the suppression — Monitoring's activity signal continues to flow unchanged
- [ ] Disconnecting the Billing Export provider (or its sync watermark not covering a window) immediately re-exposes Monitoring estimates for that window — no data migration, no storage flag flips
- [ ] The predicate lives in the domain layer (no I/O); it consumes inputs lifted by the use case from repositories
- [ ] No app/ or UI changes in this task

## Out of Scope

- Server actions / wizard / app/ work (GCPBE_5_5 onward)
- Per-key allocation (Phase 2)
- Transition banners (Phase 2)
- SKU mapping (Phase 3)
