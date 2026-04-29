---
task_id: GCPBE_5_1
type: database
agent: archie
status: pending
dependencies: []
phase: 1
---

# Add Phase 1 columns to cost_tracking_usage_records and create cost_tracking_gcp_sku_mappings table

## Description

Two schema changes are needed to admit Cloud Billing Export rows into the existing fact table and to host the maintained SKU → canonical-model mapping that Phase 3 will populate. Both changes ship in Phase 1 because:

- Phase 1 must already write billed rows with the new dimensional columns populated.
- The mapping table is declared in Phase 1 (empty / minimal seed) so the read layer in later phases can join to it without a follow-up migration. The `labels` column is **explicitly excluded** from this task — it is added in Phase 2 (GCPBE_5_8) per RFC §11.

This task is schema-only. No business logic, no queries, no use cases.

## PRD Reference

- "Schema Fit — Design Question for the RFC" — PRD inclines toward (a) reuse with `cost_source` discriminator
- R7: Cost dimensions captured (Billing Export) — date, GCP service, SKU description, GCP project ID, net cost, source currency
- R8: Net cost reporting — `calculated_cost_amount` continues to hold net cost
- R10: Source provenance is recoverable

## RFC Reference

- §3.1 — `google_billing_export` is added alongside `google_vertex` and `google_gemini`
- §4.1 — Commits to extending `cost_tracking_usage_records` with `cost_source` discriminator (existing `provider_reported` enum value semantically matches)
- §4.2 — Enumerates the new columns (Phase 1 set, excluding `labels`)
- §4.3 — New table `cost_tracking_gcp_sku_mappings`: SKU identity → canonical model id + service bucket (`vertex_ai` or `generative_language_api`), with an "officially mapped" vs "fallback" flag
- §4.4 — Dedup key for billed rows is `(billing_account_id, gcp_project_id, sku_id, usage_start_time, usage_end_time)` — supporting indexes follow from this
- §11 — `labels` column is intentionally **not** in Phase 1; do not add it here

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/usageRecords.ts` — table being extended; reuse existing patterns (column conventions, soft-delete, sync-log linkage)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/enums.ts` — `cost_source` enum already includes `provider_reported`; verify and reuse
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/index.ts` — barrel for schema; the new table must be exported here
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/relations.ts` — register relations for the new mapping table if/where the existing pattern requires it

## Files Touched

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/usageRecords.ts` (modified — add new nullable columns)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/gcpSkuMappings.ts` (new)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/index.ts` (modified — export new table)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/relations.ts` (modified if existing pattern requires)
- Generated Drizzle migration file under the project's standard migrations folder (run `pnpm db:generate` or the project's equivalent — do NOT hand-edit)

## Acceptance Criteria

- [ ] `cost_tracking_usage_records` gains the following nullable columns per RFC §4.2: `sku_id`, `sku_description`, `billing_account_id`, `gcp_project_id`, `usage_amount`, `usage_unit`, `gross_cost_amount`, `credits_amount`. The `labels` column is **NOT** added in this task.
- [ ] All new columns are nullable so existing rows (Cloud Monitoring `google_vertex` / `google_gemini` and all non-Google providers) remain valid without backfill
- [ ] Existing `cost_source` enum already supports `provider_reported`; if not, it is extended; either way, no rename of existing values
- [ ] A unique index supporting the billed-row dedup key `(billing_account_id, gcp_project_id, sku_id, usage_start_time, usage_end_time)` exists on `cost_tracking_usage_records` — partial / filtered to billed rows is acceptable if the existing `dedupKeyHasher` strategy is preserved (consult RFC §4.4 and existing dedup conventions before choosing)
- [ ] New table `cost_tracking_gcp_sku_mappings` exists with columns sufficient to express: SKU identifier, SKU description (captured at mapping-author time), canonical model identifier, service bucket (one of `vertex_ai` / `generative_language_api`), mapping-quality flag (officially mapped vs fallback), and standard audit columns matching the project's conventions for read-mostly reference tables
- [ ] The new table is exported from `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/index.ts`
- [ ] The Drizzle-generated migration file is committed alongside the schema changes
- [ ] Migration applies cleanly on a database that already contains existing cost_tracking data (no data loss, no downtime requirement beyond a column add)

## Out of Scope (do NOT do in this task)

- The `labels` JSONB column (deferred to GCPBE_5_8 / Phase 2)
- Seeding rows into `cost_tracking_gcp_sku_mappings` (deferred to GCPBE_5_12 / Phase 3 — Phase 1 ships the table empty or with the minimal seed the RFC permits)
- Any use case, repository, or query touching the new columns or table (separate backend tasks own this)
- Any application-layer or app/ changes
