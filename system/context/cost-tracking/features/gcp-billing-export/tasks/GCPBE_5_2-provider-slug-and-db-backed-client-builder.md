---
task_id: GCPBE_5_2
type: backend
agent: donnie
status: pending
dependencies: [GCPBE_5_1]
phase: 1
---

# Add @google-cloud/bigquery dependency, register google_billing_export provider slug, and extend DB-backed client builder

## Description

Introduce the new provider slug `google_billing_export` as a peer to `google_vertex` and `google_gemini` (RFC §3.1) and add the BigQuery SDK dependency. Extend the DB-backed provider-client builder so that when it encounters a `google_billing_export` row, it constructs a Billing Export client from the configuration JSONB (BigQuery dataset path, billing account ID, `exportStartDate`, lifecycle `state`) and the credential row (Service Account JSON). The env-var-based builder remains unchanged — Billing Export is intentionally DB-driven only because dataset path and billing account ID are per-tenant facts, not deployment secrets (RFC §3.2).

This task wires up the slug, the dependency, the configuration shape on the provider row, and the construction branch. It does NOT yet implement the BigQuery client itself (that's GCPBE_5_3) — a placeholder/stub that throws "not implemented" is acceptable to keep this task focused.

## PRD Reference

- R1: New provider type, distinct from Cloud Monitoring
- R2: Connection wizard collects BigQuery dataset path (project + dataset), billing account ID, and SA credential

## RFC Reference

- §3.1 — New provider slug `google_billing_export`; peer to existing Google providers; slots into existing `costTrackingProviders` / `costTrackingProviderCredentials` machinery without new tables
- §3.2 — Composition root changes; DB-backed builder owns Billing Export client construction; env-var builder unchanged
- §5.1 — Each connected provider gets its own `cost_tracking_provider_credentials` row; identical SA material is allowed but stored per-provider (no auto-share)
- §5.2 — `cost_tracking_providers.configuration` JSONB stores: BigQuery project ID, BigQuery dataset name, billing account ID, `exportStartDate` (auto-discovered, never user-typed), and `state` (e.g., `pending_first_data` | `active`)
- §10 — New npm package: `@google-cloud/bigquery`

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/buildProviderClientsFromDb.ts` — DB-backed builder; the branch for the new slug lands here
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/buildProviderClients.ts` — env-var builder; **must remain unchanged for Billing Export** per RFC §3.2
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/types.ts` — existing `ProviderUsageClient` contract; new client must conform to the existing shape (RFC §3.1 — no new methods)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/vertexUsageClient.ts` and `geminiUsageClient.ts` — existing Google provider clients; reference for SA credential plumbing
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/providers.ts` — provider row schema (slug enum, `configuration` JSONB column)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/provider.ts` — provider domain types; new slug must be admitted here
- `/Users/mario/code/Labs/aimdall/package.json` — for the new dependency
- `/Users/mario/code/Labs/aimdall/.claude/rules/infrastructure-layer.md`

## Files Touched

- `/Users/mario/code/Labs/aimdall/package.json` (modified — add `@google-cloud/bigquery`)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/provider.ts` (modified — admit `google_billing_export` slug; add configuration type)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/providers.ts` (modified if slug is enum-bound at the schema layer)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/schema/enums.ts` (modified if the provider-slug enum lives here)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/gcpBillingExportClient.ts` (new — stub conforming to `ProviderUsageClient`; full implementation in GCPBE_5_3)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/infrastructure/providers/buildProviderClientsFromDb.ts` (modified — new branch)
- Generated Drizzle migration if any enum value was added

## Acceptance Criteria

- [ ] `@google-cloud/bigquery` is added to `dependencies` in package.json with a pinned version
- [ ] `google_billing_export` is admitted as a valid provider slug everywhere a slug is enumerated (domain types, schema enums, builders) without breaking existing slugs
- [ ] The configuration shape stored on `cost_tracking_providers.configuration` for this slug is typed and documented in the domain layer; required keys: `bigQueryProjectId`, `bigQueryDatasetName`, `billingAccountId`, `exportStartDate` (nullable until discovered), `state` (`pending_first_data` | `active`)
- [ ] `buildProviderClientsFromDb` constructs a `gcpBillingExportClient` for every active `google_billing_export` provider row, supplying the dataset path, billing account ID, and SA credential
- [ ] `buildProviderClients` (env-var path) is **not** modified — Billing Export is DB-driven only
- [ ] `gcpBillingExportClient.ts` exists and conforms to the existing `ProviderUsageClient` contract; method bodies may throw `not implemented` placeholders that GCPBE_5_3 will fill
- [ ] Existing `google_vertex` and `google_gemini` provider construction is unaffected (no behaviour change)
- [ ] `pnpm install` / `pnpm typecheck` / `pnpm build` all succeed

## Out of Scope (do NOT do in this task)

- Actual BigQuery query construction, dry-run gating, sync window logic (GCPBE_5_3)
- Credential row plumbing for the wizard (GCPBE_5_5)
- Read-time Monitoring-estimate suppression (GCPBE_5_4)
- Any UI / app/ work
