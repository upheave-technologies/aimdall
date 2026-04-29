---
task_id: GCPBE_5_5
type: frontend-smart
agent: nexus
status: pending
dependencies: [GCPBE_5_4]
phase: 1
---

# Server actions: connect, test, sync now, and pending_first_data lifecycle for google_billing_export

## Description

Add the Next.js server actions that the Phase 1 wizard and providers screen will call for the new `google_billing_export` provider type. These are thin adapters that translate FormData / typed inputs into use-case calls and translate use-case errors into plain-language `ActionResult` payloads. Per project conventions (`server-actions` rule and `application-layer` rule), no business logic lives here.

Four actions / data-layer pieces are needed:

1. **`testGcpBillingExportConnection`** — runs the connection probe via the existing `testProviderConnectionUseCase` (or a Billing-Export-specific equivalent if the existing one cannot accept the new configuration shape). Returns plain-language pass/fail with the failure mapping defined in GCPBE_5_3.
2. **`connectGcpBillingExport`** — accepts BigQuery project ID, dataset name, billing account ID, and SA JSON (or a reference to an existing Google SA credential to clone per RFC §5.1). On success: persists the provider row with `state = 'pending_first_data'` if `INFORMATION_SCHEMA.PARTITIONS` returned empty, otherwise persists `exportStartDate` and `state = 'active'`, then triggers the first sync.
3. **`syncGcpBillingExportNow`** — manual sync trigger. Re-runs the partition discovery if `state = 'pending_first_data'` to lift the provider out of that state when partitions appear.
4. **Page-level data layer** for the providers screen: when listing connected providers, the data layer must surface the lifecycle `state` (`pending_first_data` vs `active`) and the latest `bytesProcessed` / dry-run estimate from sync logs so the UI can render the correct empty / progress state. Server Component shells return `null` per the Nexus → Frankie gate.

## PRD Reference

- R2: Connection wizard
- R3: Connection validation (no raw error codes)
- Journey 1: First-time connection
- Journey 4: Validation fails — graceful recovery
- Journey 5: Historical-data limitation acknowledged before save
- Journey 6: Daily refresh + manual sync available

## RFC Reference

- §5.1 — Per-provider credential rows; wizard MAY offer to copy from an existing Google credential at submission time but stored row is independent
- §5.2 — `cost_tracking_providers.configuration` JSONB stores `bigQueryProjectId`, `bigQueryDatasetName`, `billingAccountId`, `exportStartDate`, `state`
- §5.3 — Connection probe maps failures to plain-language messages
- §5.4 — Auto-discover `exportStartDate`; `pending_first_data` lifecycle when no partitions yet; subsequent retry re-runs the metadata query and transitions to `active` once partitions exist
- §6 — Manual "sync now" available with note that fresher than yesterday is structurally unavailable

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/providers/actions.ts` — existing provider actions; new actions live alongside
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/providers/page.tsx` — providers list page (Server Component)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/connectProviderUseCase.ts`
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/testProviderConnectionUseCase.ts`
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/syncProviderUsageUseCase.ts`
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/listProviderStatusUseCase.ts`
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/disconnectProviderUseCase.ts`
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/listCredentialsUseCase.ts` — for surfacing existing Google SA credentials the user might reuse
- `/Users/mario/code/Labs/aimdall/.claude/rules/server-actions.md`
- `/Users/mario/code/Labs/aimdall/.claude/rules/page-architecture.md`
- `/Users/mario/code/Labs/aimdall/.claude/rules/server-first-react.md`

## Files Touched

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/providers/actions.ts` (modified — add the new actions)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/providers/page.tsx` (modified — surface lifecycle state on the providers list)
- Possibly a new wizard route shell under `/Users/mario/code/Labs/aimdall/app/cost-tracking/providers/` if existing wizard mounts cannot host the new step (Nexus decides based on existing onboarding wizard structure; Server Component returns `null` per Nexus → Frankie handoff)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/connectProviderUseCase.ts` (modified if needed to admit new configuration shape; otherwise a wrapping use case)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/testProviderConnectionUseCase.ts` (modified if needed)

## Acceptance Criteria

- [ ] `testGcpBillingExportConnection` server action exists, accepts the wizard's input shape, calls the application layer, and returns a plain-language `ActionResult` — no raw GCP error codes leak through
- [ ] `connectGcpBillingExport` server action persists a `cost_tracking_providers` row with slug `google_billing_export` and the configuration JSONB shape from RFC §5.2, plus a fresh `cost_tracking_provider_credentials` row even when the SA JSON matches an existing Google credential (RFC §5.1)
- [ ] When `INFORMATION_SCHEMA.PARTITIONS` returned empty during connect, the provider row is persisted with `state = 'pending_first_data'` and no first sync is triggered
- [ ] When partitions exist, `exportStartDate` is captured on `configuration`, `state = 'active'`, and the first sync runs with window `[exportStartDate, today)`
- [ ] `syncGcpBillingExportNow` re-runs partition discovery for `pending_first_data` providers and transitions them to `active` when partitions appear; for `active` providers it runs a manual sync over `[lastSyncCovered − 3 days, today)`
- [ ] The providers list page (Server Component) surfaces lifecycle `state`, last sync timestamp, and last-sync `bytesProcessed`/`dryRunEstimate` so the UI tier (Frankie) can render the correct chrome
- [ ] Server Components in this task render no styled JSX — return `null` or minimal markup per the Nexus → Frankie handoff (CLAUDE.md)
- [ ] All actions delegate to use cases; no business logic in `actions.ts` (server-actions rule)
- [ ] Imports respect the module-public-API boundary (project-structure rule): only `application/{useCase}`, `domain/types`, `infrastructure/session` from cost-tracking

## Out of Scope

- Wizard styled JSX, copy, layout (GCPBE_5_6 / Frankie)
- Freshness/provenance indicators on dashboards (GCPBE_5_7)
- Phase 2 transition banner state (GCPBE_5_10)
