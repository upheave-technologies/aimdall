---
task_id: GCPBE_5_12
type: backend
agent: donnie
status: pending
dependencies: [GCPBE_5_9]
phase: 3
---

# Phase 3 — Seed cost_tracking_gcp_sku_mappings and wire DrizzleGcpSkuMappingRepository into allocation use case

## Description

The mapping table created in GCPBE_5_1 is read-only from the application's perspective and is shipped as seed data updated on Aimdall's release cadence (RFC §4.3). Phase 3 populates that seed with full canonical-model mappings for the AI SKUs Aimdall ships support for, adds the read-only repository, and rebases the per-key allocation use case from raw SKU grouping (Phase 2) onto canonical-model identity.

Unmapped SKUs still flow through ingestion (they are written to `cost_tracking_usage_records` exactly as in Phase 1 / 2) but at read time they are bucketed into `Other Vertex` or `Other AI Studio` based on the `service.description` they were ingested with. The mapping table's "officially mapped" vs "fallback" flag governs this routing.

## PRD Reference

- Open Question 8 — SKU → model mapping; Phase 3 acts on the inclination to normalize once it surfaces as friction
- Use case 2: "Which Gemini / Vertex SKU is driving our cost?"
- Success metric 2: Coverage of Gemini API cost — actionable SKU-level Gemini API spend

## RFC Reference

- §2 decision 5 — SKU → canonical model resolved through a maintained mapping table shipped with Aimdall; unmapped SKUs land in `Other Vertex` / `Other AI Studio`; allocation runs at canonical-model level
- §4.3 — Mapping table shape; "officially mapped" vs "fallback" flag; read-only from the application
- §11 — Phase 3 commits the mapping live and rebases allocation onto canonical-model identity

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/gcpSkuMappings.ts` (from GCPBE_5_1) — table being seeded
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/models.ts` — the canonical model identity to which mappings point (must align with `cost_tracking_models`)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/computePerKeyCostAllocationUseCase.ts` (from GCPBE_5_9) — its grouping dimension parameter is swapped from raw SKU to canonical model
- Existing `Drizzle{Entity}Repository.ts` files in `infrastructure/repositories/` — naming + style reference

## Files Touched

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/gcpSkuMapping.ts` (new — domain types + read-only repository interface)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/repositories/DrizzleGcpSkuMappingRepository.ts` (new)
- Seed data file under the project's standard seed/migrations location for reference data — exact path follows existing project conventions for shipped reference data
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/computePerKeyCostAllocationUseCase.ts` (modified — accept canonical-model grouping; surface `Other Vertex` / `Other AI Studio` buckets for unmapped SKUs)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/gcpBillingExportClient.ts` (optionally modified — early validation log when ingesting unrecognized SKUs, per RFC §4.5; non-blocking)

## Acceptance Criteria

- [ ] `DrizzleGcpSkuMappingRepository` exists and exposes a read-only domain interface; no write paths are added
- [ ] The mapping table is populated with the full set of AI SKUs Aimdall ships support for, each mapped to a canonical model identifier consistent with `cost_tracking_models`, plus a `vertex_ai` / `generative_language_api` service-bucket label, plus the "officially mapped" / "fallback" flag
- [ ] `computePerKeyCostAllocationUseCase` now groups by canonical model (joining via the mapping table) instead of raw SKU
- [ ] Unmapped SKUs surface as `Other Vertex` or `Other AI Studio` buckets in the use case output, distinguishable in shape from canonical-model buckets so the UI can render the report-SKU affordance
- [ ] Adding new mappings is a code/seed change only — no migration, no read-side rewrite
- [ ] Read-time joins do not blow past existing query latency budgets for the per-key surface; if they would, a small in-memory cache of the mapping table is acceptable (the table is small and read-mostly)
- [ ] No app/ or UI changes in this task

## Out of Scope

- The "report unrecognized SKU" UI affordance (GCPBE_5_13)
- User-editable mapping overrides (explicitly out of scope per RFC §12)
