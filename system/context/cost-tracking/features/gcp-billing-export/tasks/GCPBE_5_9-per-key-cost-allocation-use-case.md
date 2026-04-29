---
task_id: GCPBE_5_9
type: backend
agent: donnie
status: pending
dependencies: [GCPBE_5_4, GCPBE_5_8]
phase: 2
---

# Phase 2 — Implement computePerKeyCostAllocationUseCase with Unattributed bucket and empty-state signal

## Description

Add the read-time use case that allocates Billing Export dollars across API keys using Cloud Monitoring's per-key request share, scoped to a project + canonical-model + day window. This is a **derived view** computed on every read — no storage, no materialization, no backfill.

The use case must:

1. Read authoritative billed rows for the requested `(project, day)` window from `cost_tracking_usage_records` (filtered by `cost_source = 'provider_reported'` and provider slug `google_billing_export`).
2. Read Cloud Monitoring request-count signal for the same `(project, day)` window from `google_vertex` and `google_gemini` providers.
3. Compute each key's share of total project requests for that window.
4. Multiply each day's authoritative dollar total by the key's share. Mark every produced figure with `estimated: true` and a methodology label.
5. If shares sum to less than 100% (Monitoring covers only some of the project's keys), emit an explicit `Unattributed` bucket holding the residual dollars so totals reconcile to the project total.
6. If Monitoring data is missing for the window entirely, emit no per-key dollars; return the empty-state signal the UI tier renders per Journey 2.

In Phase 2, allocation is computed at the SKU level (raw SKU strings). The Phase 3 task GCPBE_5_12 will rebase allocation onto canonical-model identity once the SKU mapping table is populated. This task should structure inputs so that the Phase 3 swap is a small, localised change (e.g., the grouping function is a single parameter).

The use case file lives at `modules/cost-tracking/application/computePerKeyCostAllocationUseCase.ts` (RFC §7.2 — naming confirmed against the existing application directory listing).

## PRD Reference

- "Cost Attribution Model — Design Decision for the PRD" — Option (c) Hybrid with explicit caveat
- R9: dual-tier presentation; per-key dollar figures only when both signals exist; per-key dollars never pollute authoritative totals
- Use case 3: "Which of our Gemini API keys is driving cost?"

## RFC Reference

- §2, decision 1 — Allocation granularity is daily only; sub-day per-key dollars are forbidden
- §2, decision 4 — Partial Monitoring coverage surfaces an explicit `Unattributed` bucket so bucket totals always sum to project totals
- §7.1 — Allocation runs at read time, not sync time; trade-off and rationale
- §7.2 — Composition shape (the five steps above), file location, naming convention

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getUsageSummaryUseCase.ts` — reference pattern for read-side use case shape and dependency injection style
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/usageRecord.ts`
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/usageRecordRepository.ts`
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/repositories/DrizzleUsageRecordRepository.ts` — existing query primitives to reuse for both billed-row reads and Monitoring request-count reads
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/billingExportTrust.ts` (created in GCPBE_5_4) — reuse the "active and trusted" predicate
- `/Users/mario/code/Labs/aimdall/.claude/rules/application-layer.md`
- `/Users/mario/code/Labs/aimdall/.claude/rules/domain-layer.md`

## Files Touched

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/computePerKeyCostAllocationUseCase.ts` (new)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/perKeyCostAllocation.ts` (new — domain types: allocation result, Unattributed bucket, empty-state signal, methodology label) — exact shape at agent's discretion within domain layer rules
- Possibly extensions to `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/usageRecordRepository.ts` if new query primitives are required (per-`(project, day)` request-count rollups)
- Repository implementation extensions in `DrizzleUsageRecordRepository.ts` to back the new primitives

## Acceptance Criteria

- [ ] `computePerKeyCostAllocationUseCase.ts` exports a pre-wired use case instance per project conventions (no `index.ts`, no `use-cases.ts` barrel)
- [ ] Inputs: project ID(s), day window, optional service / canonical-model filters
- [ ] Output: per-`(key, day)` dollar amount with `estimated: true`, methodology label, plus an `Unattributed` bucket where Monitoring share < 100%
- [ ] The use case never returns a per-key dollar figure without `estimated: true` set
- [ ] When Monitoring data is missing for the requested window, the use case returns an empty-state signal (no partial estimates), distinguishable in shape from a "zero per-key spend" result
- [ ] Authoritative project / service / SKU totals are NOT recomputed by this use case — it is a derived view layered on top, never a source of total dollars
- [ ] The grouping dimension (raw SKU in Phase 2; canonical model in Phase 3) is parameterised so GCPBE_5_12 can swap it without re-architecting
- [ ] Domain types live in `domain/`; the use case in `application/` orchestrates without business decisions of its own (per project DDD rules)
- [ ] No new app/ or UI work
- [ ] No reads of `infrastructure/` from app/ — the use case is the public-API entry point

## Out of Scope

- SKU-mapping integration (Phase 3 — GCPBE_5_12)
- Per-key UI rendering / tooltip / Unattributed row styling (GCPBE_5_11)
- Transition banner state (GCPBE_5_10)
