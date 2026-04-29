---
task_id: GCPBE_5_8
type: database
agent: archie
status: pending
dependencies: [GCPBE_5_1]
phase: 2
---

# Phase 2 — Add labels JSONB column to cost_tracking_usage_records and ingest labels in billing client

## Description

Phase 2 lights up per-key allocation. The Billing Export `labels` column carries team / environment / fine-tune-id context that becomes meaningful only once an attribution view exists to consume it. This task adds the storage column AND extends the BigQuery client to project labels into ingested rows.

This task is intentionally split out from Phase 1 because RFC §11 requires it: storing labels earlier would persist data with no read-side home.

## PRD Reference

- Open Question 9 — "Resource labels … inconsistent across SKUs. Recommendation: ignore labels in MVP, revisit once we see real customer data." Phase 2 acts on that revisit.

## RFC Reference

- §4.2 — `labels` column intentionally NOT in Phase 1 column list
- §11 — Phase 2 is where `labels` ingestion lands; team/environment attribution is the natural complement to per-key allocation, and per-key allocation is the only consumer that can use it meaningfully

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/usageRecords.ts` — table being extended (already has Phase 1 columns from GCPBE_5_1)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/gcpBillingExportClient.ts` — query construction; SELECT must now include the `labels` field

## Files Touched

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/usageRecords.ts` (modified — add nullable `labels` JSONB column)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/gcpBillingExportClient.ts` (modified — add labels to query projection and emitted row shape)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/syncProviderUsageUseCase.ts` (modified if ingestion projection needs an explicit field for labels)
- Generated Drizzle migration

## Acceptance Criteria

- [ ] `cost_tracking_usage_records` gains a nullable `labels` JSONB column
- [ ] Migration applies cleanly to a database already carrying Phase 1 schema and Phase 1 billed rows (existing rows leave `labels` null)
- [ ] `gcpBillingExportClient` projects labels in its sync query (still inside the mandatory partition + AI-service filter envelope) and writes them onto the emitted row shape
- [ ] Existing Phase 1 ingestion behaviour is otherwise unchanged
- [ ] Dedup key is unaffected — labels are not part of the dedup key (RFC §4.4)

## Out of Scope

- Reading labels in any use case or read path (consumer is the per-key allocation in GCPBE_5_9 if/when it chooses to use them)
- UI surfaces for labels
