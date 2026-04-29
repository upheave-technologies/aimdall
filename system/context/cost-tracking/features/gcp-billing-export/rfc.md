# RFC: GCP Billing Export Provider — Authoritative AI Cost + Per-Key Allocation

- **Module:** cost-tracking
- **Feature:** gcp-billing-export
- **Status:** Draft
- **Created:** 2026-04-29
- **PRD:** `system/context/cost-tracking/features/gcp-billing-export/prd.md`

---

## 1. Problem

The PRD establishes that Cloud Monitoring metrics cannot deliver invoice-grade dollars for Vertex AI or AI Studio, and cannot deliver any meaningful Gemini cost picture at all. Cloud Billing Export to BigQuery is the only authoritative source. Cloud Monitoring is the only signal that ties activity to a specific Gemini API key. Neither source replaces the other; they must coexist as peers, contribute to two distinct presentation tiers (authoritative vs derived), and never double-count.

This RFC specifies the architectural decisions required to introduce Billing Export as a first-class provider, store its rows, suppress Cloud Monitoring's estimated dollars when both are connected, and compute per-key allocation as a derived read-time view. Implementation details (SQL bodies, function signatures, exact column types beyond what's load-bearing for storage shape, UI props) are deferred to specification and Plancton task breakdown.

## 2. Decisions Already Resolved by the User

These are committed inputs; the RFC does not relitigate them.

1. **Allocation granularity is daily only.** Sub-day per-key dollar values are forbidden. Sub-day Monitoring data renders as a request-count signal but never as dollars.
2. **Billing-after-Monitoring transition** shows a one-time banner with the delta between the prior estimate and the new authoritative number, then is silent thereafter. Silent number shifts are not allowed.
3. **Monitoring-after-Billing transition** is a celebratory highlight when per-key views light up. Every per-key cost column carries an "estimated, derived from request share" tooltip.
4. **Partial Monitoring coverage** surfaces an explicit `Unattributed` bucket in per-key views so the bucket totals always sum to project totals.
5. **SKU → canonical model** is resolved through a maintained mapping table shipped with Aimdall. Unmapped SKUs land in `Other Vertex` / `Other AI Studio` buckets with a "report SKU" affordance. Allocation always runs at canonical-model level.

## 3. Architecture

### 3.1 New provider type: `google_billing_export`

A new provider slug, `google_billing_export`, is added alongside the existing `google_vertex` and `google_gemini` providers. All three remain peer providers. Neither Monitoring provider is deprecated, repurposed, or made dependent on the Billing Export provider — the relationship is established at read time, not at the provider-record level.

The new provider plugs into the existing abstraction unchanged: the same `costTrackingProviders` row, the same `costTrackingProviderCredentials` row, the same sync-cursor and sync-log machinery. The only thing new is the client implementation behind the existing `ProviderUsageClient` contract. The contract gains no new methods; raw billing rows map onto the existing `RawProviderUsageData` shape with cost columns populated and token/request columns null. This preserves the single ingestion code path and reuses the existing dedup/upsert pipeline in `DrizzleUsageRecordRepository`.

### 3.2 Composition root changes

The composition root currently builds Monitoring clients from a single `gcpServiceAccountJson` env-shaped config. Billing Export adds two new pieces of per-connection configuration that env-vars cannot carry: a BigQuery dataset path and a billing account ID. Therefore Billing Export client construction is driven by the database-backed builder (`buildProviderClientsFromDb`), not by the env-var builder. The env-var path stays as-is for Monitoring providers; the DB-backed path gains a branch that, for `google_billing_export` provider rows, reads dataset path and billing account ID from the provider's `configuration` JSONB column and the SA from the credential row, then constructs a Billing Export client.

**Rationale:** dataset path and billing account ID are per-tenant connection facts, not deployment secrets. Putting them on the provider row is the existing project pattern for per-connection configuration.

### 3.3 Coexistence and de-duplication of Google AI cost (R11)

Cloud Monitoring's Vertex and Gemini providers continue to ingest both request volume and their own estimated dollar amounts. Suppression of those estimates happens at the **read layer**, not at the storage layer:

- Storage continues to record the Monitoring-derived dollar estimates with `cost_source = 'estimated'` (existing behavior).
- A new domain predicate determines whether Billing Export is "active and trusted" for a given GCP project on a given day (provider connected, sync state success, watermark covers the day).
- Read-side use cases that aggregate dollars filter out `cost_source = 'estimated'` rows from `google_vertex` and `google_gemini` for `(project, day)` windows where Billing Export is trusted. Monitoring's request-count signal is unaffected by this filter.

This keeps both providers writing to the same fact table without coordination, makes the suppression reversible (disconnecting Billing Export immediately falls back to Monitoring estimates), and confines the policy to a single read-side function.

## 4. Schema

### 4.1 Position: extend `cost_tracking_usage_records` rather than introduce a new table

The PRD's stated inclination is reuse with `cost_source` as the discriminator. **This RFC commits to that path.** Reasoning:

- The dominant downstream operation is "sum cost over dimensions and time," which works identically on billed and computed rows.
- The explorer already treats token/request metrics as context-adaptive; null columns on billed rows are not novel.
- A separate table forces every cost aggregation, every dashboard, the explorer, the attribution pipeline, and the recommendations engine to UNION across two tables forever. The cost of that architectural debt outweighs the cost of a few semantically inapplicable columns on billed rows.
- The dedup pipeline, soft-delete model, sync-log linkage, and upsert idempotency machinery are reused without modification.

Billed rows use `cost_source = 'provider_reported'` (the existing enum value semantically matching "Google reported this exact dollar amount"). Token and request metric columns are null. `bucket_width` is `1d`. `bucket_start` is the day in UTC derived from `usage_start_time`.

### 4.2 New columns on `cost_tracking_usage_records`

Billing Export carries facts that have no existing column home. These are added as nullable columns so that no migration of existing data is required and Monitoring rows simply leave them null:

- `sku_id` — Google's SKU identifier (stable across name changes).
- `sku_description` — human-readable SKU label captured at ingest time.
- `billing_account_id` — the GCP billing account this row belongs to.
- `gcp_project_id` — the GCP project this row belongs to (Monitoring providers also populate this for Google rows; existing rows can be backfilled lazily).
- `usage_amount` and `usage_unit` — the SKU's native usage quantity (tokens, characters, seconds), used for diagnostics and future per-token allocation work.
- `gross_cost_amount` — pre-credit cost retained for diagnostics.
- `credits_amount` — total credits applied to this row, sign as Google reports it.

`calculated_cost_amount` continues to hold the **net** cost (after credits) for billed rows so that existing aggregations naturally produce invoice-grade totals. `calculated_cost_currency` continues to hold the source currency.

The Billing Export `labels` column is intentionally **not** in the Phase 1 column list; see §11 for the rationale and the Phase 2 home for it.

### 4.3 New table: `cost_tracking_gcp_sku_mappings`

A maintained mapping from Google SKU identity to a canonical model identifier (the same canonical identity used by `cost_tracking_models`) plus a service-bucket label (`vertex_ai` or `generative_language_api`). This table is read-only from the application's perspective in MVP; it is shipped as seed data and updated by Aimdall releases. A flag indicates "officially mapped" vs "fallback" so the read layer can produce `Other Vertex` / `Other AI Studio` buckets for unmapped SKUs and surface the "report SKU" affordance.

**Rationale:** the mapping is a vendor-of-truth concern that changes on Aimdall's release cadence, not the user's. Storing it as a database table (rather than a code constant) lets the SKU-mapping coverage be queried, reported on, and joined into read-side queries directly. Promoting it later to a user-editable override table is a small additive change.

### 4.4 Dedup key for billed rows

A billed row is uniquely identified by `(billing_account_id, gcp_project_id, sku_id, usage_start_time, usage_end_time)`. This becomes the input to the existing `dedupKeyHasher`. Late-arriving rows from Google for the same window naturally upsert against the same key. The PRD's mandated overlap window (re-querying the trailing days on every sync) is therefore safe and idempotent by construction.

### 4.5 New repository

`DrizzleGcpSkuMappingRepository` lives at `modules/cost-tracking/infrastructure/repositories/`, exposing a read-only domain interface defined in `modules/cost-tracking/domain/gcpSkuMapping.ts`. The mapping is consulted at read time by the per-key allocation use case and at sync time for early validation that incoming SKUs are recognized (with unrecognized ones still ingested but flagged as fallback-bucket).

## 5. Credentials & Connection

### 5.1 Credential model: separate row per provider, identical material allowed

Each connected provider gets its own `cost_tracking_provider_credentials` row, even when the user pastes the same Service Account JSON across multiple Google providers. Auto-sharing across providers is rejected: it couples lifecycles (revoking one Google connection should not silently break another), it complicates audit, and it leaks SA scope across feature surfaces with different IAM expectations (Cloud Monitoring requires Monitoring Viewer; Billing Export requires BigQuery Data Viewer + Job User).

The wizard may *offer* to copy the JSON from an existing Google credential into the new credential row at submission time. The stored row is independent.

**Trade-off:** the user's actual key material is duplicated at rest in the encrypted-secret column. Acceptable: that column is encrypted, lifecycle-coupled to the provider, and the duplication is honest about the operational reality (the user, not Aimdall, decides whether the same SA actually has both role sets).

### 5.2 New configuration captured by the wizard

Stored on the `cost_tracking_providers.configuration` JSONB for the new provider row: BigQuery project ID, BigQuery dataset name, billing account ID, and `exportStartDate` (auto-discovered, see §5.4 — never user-typed). Validation rules: project ID and dataset name match Google's published syntax; billing account ID matches the `XXXXXX-XXXXXX-XXXXXX` shape.

### 5.3 Connection probe

`testConnection` for the Billing Export client runs a single bounded query against the configured dataset that simultaneously verifies dataset reachability, table existence, SA read access, partition filter acceptance, and Detailed Export schema. The probe restricts itself to the most recent partition only (a single day) and selects the Detailed-Export-only columns required by the sync. If those columns are missing, the user is told they have a Standard Export. If the partition filter is rejected, the user is told the export is not partitioned. If the table is absent, the user is told Billing Export does not appear to be enabled. No raw error codes ever surface — only the mapped plain-language failure.

### 5.4 Export start-date discovery (committed: automatic via metadata)

Once the connection probe succeeds, the wizard automatically discovers the export's earliest available data by querying `INFORMATION_SCHEMA.PARTITIONS` for the configured billing table and taking the minimum partition identifier as a date. This is a metadata query: it reads zero bytes of table data and is therefore free of both bytes-scanned cost and the bytes-scanned ceiling defined in §6. The discovered value is persisted on `cost_tracking_providers.configuration` as `exportStartDate`, and the first sync uses `[exportStartDate, today)` as its initial window. The user is never asked to type a date.

If the metadata query returns no partitions, the export was just enabled and has not yet received any rows. The wizard surfaces a friendly "Billing data will start appearing in 24–48 hours; come back then" state, and the provider is persisted in a `pending_first_data` status. A subsequent retry — manual or scheduled — re-runs the same metadata query; once partitions exist, `exportStartDate` is captured and the provider transitions to its normal sync lifecycle. This removes the wizard's only piece of user-typed historical configuration and eliminates an entire class of "I picked the wrong date" support cases.

## 6. Sync Algorithm

- **Cadence:** daily, on the existing scheduler. A manual "sync now" remains available with a note that data fresher than yesterday is structurally unavailable.
- **Window:** `[lastSyncCovered − 3 days, today)`. The 3-day overlap absorbs Google's late-arriving rows. Idempotent against the dedup key.
- **Mandatory query shape:** every query enforces (a) a partition filter on `_PARTITIONDATE` (or the table's native partition column) bounding the lookback and (b) a service filter restricting to `service.description IN ('Vertex AI', 'Generative Language API')`. Both filters are applied **at query construction time inside the client**, not in caller code, so no upstream caller can issue an unfiltered query by accident.
- **Mandatory dry-run gate (1 GiB ceiling, committed):** every BigQuery query the client issues is first executed as a dry-run, which is free and returns the byte estimate without running. If the estimate exceeds `MAX_BYTES_PER_QUERY` (set to 1 GiB, i.e. 1,073,741,824 bytes), the client aborts before submitting the real query, emits a `provider.sync.bytes_ceiling_exceeded` warning carrying the estimated byte count, and surfaces a sync error with the user-facing message: "This sync would scan more than 1 GB of BigQuery data, which suggests a partition filter regression. Aborting to protect your BigQuery costs." The threshold lives as a single named constant (`MAX_BYTES_PER_QUERY`) inside the client module so it can be revisited without code-wide changes. The metadata-only `INFORMATION_SCHEMA.PARTITIONS` query used for export-start-date discovery (§5.4) does not pass through this gate because it scans zero bytes by definition.
- **Bytes-scanned telemetry:** every query that does run emits `bytesProcessed` (the actual post-execution figure Google returns) on its sync log line, alongside the dry-run estimate. Together they give us the runaway-cost trip-wire and a continuous comparison between predicted and actual scan size.
- **Error mapping:** BigQuery API not enabled, dataset/table not found, partition filter rejected, SA permission denied, quota errors, and the dry-run ceiling abort each map to a distinct domain error with a plain-language message. Sync failure on this provider does not block other providers' syncs (existing isolation guarantee).

### 6.1 Anti-runaway

The combination of (a) client-enforced partition + service filters at query-construction time, (b) the mandatory dry-run gate aborting any query whose estimate exceeds `MAX_BYTES_PER_QUERY = 1 GiB`, and (c) per-query `bytesProcessed` logging gives us defense in depth against accidental BigQuery cost runaways. A regression that drops the partition filter, a corrupted lookback window, or any other path to "scan the whole table" is caught by the dry-run before a single billable byte is read. The constant lives in one place; raising or lowering it is a single-line change once Phase 1 telemetry tells us the right number.

## 7. Per-Key Allocation Read Model

### 7.1 Position: allocation is computed at read time

Allocation runs in the use case that powers the per-key dashboard query, not at sync time. Reasoning:

- Allocation is a derivative view, not a fact. Storing it would require backfill any time the allocation method evolved (and it will evolve — request-share today, possibly token-share later, possibly model-weighted later).
- Authoritative storage stays the source of truth. The read layer can change allocation policy without rewriting historical rows.
- Read-time computation is the only honest option: it can decide on the spot whether both signals are present for the window and whether to render an `Unattributed` bucket. A pre-materialized table cannot adapt to the user's chosen filter.

**Trade-off:** more compute per dashboard load. Acceptable: the inputs are already daily-aggregated by SKU and project, so the dataset is small. If query latency becomes a problem, the layer can be cached by `(project, canonical_model, day)` cheaply — caching a derived view is far easier than backfilling a stored one.

### 7.2 Composition shape (conceptual, not implementation)

For a per-key dashboard request scoped to a project, canonical model, and day window:

1. Read authoritative billed rows for `(project, canonical_model, day)`. The SKU mapping table joins SKUs to canonical model. Unmapped SKUs collect into `Other Vertex` / `Other AI Studio`.
2. Read Monitoring request-count rows for the same `(project, canonical_model, day)` from Vertex and Gemini providers. Compute per-key share of total project requests for that window.
3. For each `(key, day)`, multiply the day's authoritative dollar total by the key's request share. Attach an `estimated: true` flag to every produced figure. Carry the methodology label.
4. If shares sum to less than 100% (Monitoring covers only some of the project's keys), produce an explicit `Unattributed` bucket holding the residual dollars so totals reconcile to the project total.
5. If Monitoring data is missing for the window, emit no per-key dollars at all and return the empty-state signal the UI tier renders (per Journey 2). Authoritative project/service/SKU views are unaffected.

This use case lives at `modules/cost-tracking/application/computePerKeyCostAllocationUseCase.ts` (matches the project's existing `verbEntityUseCase` naming convention as confirmed against the application directory listing). Each call exports its pre-wired instance.

## 8. UI Surfaces (Frankie scope, named here)

- **Wizard step** for the `google_billing_export` provider type (longer than other providers per R2; carries the historical-data acknowledgement).
- **Transition banner** shown once when authoritative dollars first replace Monitoring estimates for a given account, displaying the delta and dismissing on acknowledgement.
- **Per-key column "estimated" indicator** with methodology tooltip, present on every per-key dollar surface.
- **Per-source freshness indicator** ("as of …") on every dashboard, distinguishing Billing Export's daily lag from Monitoring's near-real-time lag.
- **`Unattributed` bucket** rendered as a first-class row in per-key views, with hover explanation.
- **`Other Vertex` and `Other AI Studio` buckets** with a "report unrecognized SKU" affordance feeding back into the SKU-mapping maintenance loop.
- **Soft prompt on the Cloud Monitoring connection wizard** advertising Billing Export for accurate dollars (informational, not blocking).

## 9. Module Placement (verified against existing conventions)

- `modules/cost-tracking/infrastructure/providers/gcpBillingExportClient.ts` — the BigQuery-backed implementation of `ProviderUsageClient`. Naming matches the existing `vertexUsageClient.ts`, `geminiUsageClient.ts` pattern.
- `modules/cost-tracking/infrastructure/repositories/DrizzleGcpSkuMappingRepository.ts` — read-only repository for the mapping table; naming matches the existing `Drizzle{Entity}Repository.ts` pattern.
- `modules/cost-tracking/domain/gcpSkuMapping.ts` — domain types and repository interface for the SKU mapping.
- `modules/cost-tracking/application/computePerKeyCostAllocationUseCase.ts` — the read-time allocation use case.
- `modules/cost-tracking/schema/gcpSkuMappings.ts` — Drizzle schema for the new table.

All BigQuery access is confined to `gcpBillingExportClient.ts`. The application and domain layers never import `@google-cloud/bigquery`.

## 10. Dependencies

- New npm package: `@google-cloud/bigquery`. The project already uses Google APIs through the Cloud Monitoring clients; the BigQuery library is from the same maintainer and shares its auth abstractions. Version pinning and peer-dep verification are an Archie/Donnie task at install time.

## 11. Phasing

- **Phase 1.** New provider type, connection wizard with automatic export start-date discovery, daily sync into `cost_tracking_usage_records` with new columns, AI-services filter enforced inside the client, mandatory dry-run + 1 GiB bytes-scanned ceiling, dollar totals visible on existing project/service/SKU dashboards. No per-key allocation, no transition UX, no SKU mapping (unmapped SKUs render with raw description in MVP buckets). The Billing Export `labels` column is **not** projected, stored, or reasoned about in Phase 1.
- **Phase 2.** Per-key allocation read model, `Unattributed` bucket, both transition flows (one-time delta banner; Monitoring-after-Billing celebratory highlight), per-key "estimated" tooltip. **Phase 2 is also where `labels` ingestion lands**: the team/environment attribution that `labels` carries is the natural complement to API-key request-share attribution, and per-key allocation is the only consumer that can use it meaningfully. Adding `labels` earlier would store data with no read-side home.
- **Phase 3.** SKU mapping table goes live, `Other Vertex` / `Other AI Studio` buckets, "report unrecognized SKU" affordance, allocation rebased onto canonical model identity.

## 12. Out of Scope

- Non-AI GCP cost (Compute, Storage, Networking, BigQuery itself, etc.).
- Real-time per-key dollar attribution (structurally impossible).
- Historical backfill before the user enabled Billing Export.
- AWS, Azure, or any other cloud's billing export.
- Auto-enabling Cloud Billing Export on the user's behalf.
- Removing or deprecating the Cloud Monitoring providers.
- Multi-currency normalization (display in source currency for MVP).
- User-editable SKU mapping overrides.

## 13. Open Questions

All open questions resolved as of 2026-04-29.
