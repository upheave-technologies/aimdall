---
task_id: GCPBE_5_6
type: frontend-ui
agent: frankie
status: pending
dependencies: [GCPBE_5_5]
phase: 1
---

# GCP Billing Export connection wizard step UI

## Description

Implement the styled presentational layer of the new connection wizard step for the `google_billing_export` provider. The data layer (server actions, lifecycle state) is already in place from GCPBE_5_5; this task replaces the `null`-returning shells with a real, styled wizard step.

The wizard step is allowed to be longer and more thorough than other providers — the PRD explicitly states friction is acceptable in exchange for getting GCP setup right.

## PRD Reference

- R2: Connection wizard — must collect BigQuery dataset path (project + dataset), billing account ID, SA credential (new upload OR reuse of an existing Google SA), and must explain (before the user finishes):
  - The role of Billing Export (authoritative dollars) vs Cloud Monitoring (per-key activity), and that connecting both is recommended for multi-key users
  - That Detailed Export (not Standard) is required, and how to verify
  - The IAM roles the SA needs
  - The historical-data limitation (no backfill)
  - The 24–48h refresh lag
  - That non-AI GCP spend will not be ingested or displayed
- R3: Validation failures must produce specific, actionable, plain-language messages. **No raw error codes or stack traces ever surface.**
- Journey 1: Happy path
- Journey 4: Graceful recovery — Standard Export, missing access, export not enabled — each surfaces a specific message
- Journey 5: Historical-data limitation surfaced **before** the user finishes onboarding; user must acknowledge

## RFC Reference

- §5.1 — Wizard MAY offer to copy SA JSON from an existing Google credential; UI affordance lives in this task
- §5.2 — Inputs collected: BigQuery project ID, dataset name, billing account ID; `exportStartDate` is auto-discovered (NEVER user-typed)
- §5.3 — Plain-language probe failures (Standard Export, missing partition, dataset unreachable, table absent, SA permission denied)
- §5.4 — `pending_first_data` state: render the friendly "Billing data will start appearing in 24–48 hours; come back then" state; provide manual retry affordance that calls back into `syncGcpBillingExportNow`
- §8 — UI surfaces (this task implements the wizard step item)

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/providers/_components/` and `_containers/` — existing wizard styling and components (Frankie should grep for current onboarding wizard patterns and reuse the same shell, dialogs, form primitives)
- `/Users/mario/code/Labs/aimdall/components/ui/` — design-system primitives (buttons, inputs, alerts, cards)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/providers/actions.ts` — server actions from GCPBE_5_5 (called via `<form action={}>` — never re-implemented)
- `/Users/mario/code/Labs/aimdall/.claude/rules/react-components.md`
- `/Users/mario/code/Labs/aimdall/.claude/rules/server-first-react.md`

## Acceptance Criteria

- [ ] Wizard step exists for the `google_billing_export` provider type, mounted into the existing onboarding flow without disrupting the existing Cloud Monitoring wizards
- [ ] The step collects: BigQuery project ID, BigQuery dataset name, billing account ID, and a Service Account credential (either upload of new JSON OR a chooser populated from existing Google SA credentials per RFC §5.1)
- [ ] The step displays, before the final "connect" affordance is enabled:
  - The Billing Export vs Cloud Monitoring explainer (authoritative dollars vs per-key activity; both recommended for multi-key users)
  - The Detailed Export (not Standard) requirement and how to verify
  - The IAM roles the SA needs
  - The historical-data limitation (no backfill)
  - The 24–48h refresh lag
  - The non-AI GCP spend exclusion
- [ ] Historical-data acknowledgement is an explicit interaction (checkbox or equivalent) the user must complete before finishing onboarding (Journey 5)
- [ ] Validation calls `testGcpBillingExportConnection` and surfaces ONLY the plain-language messages defined in RFC §5.3 — no raw error codes, no stack traces, no HTTP statuses
- [ ] On `pending_first_data` outcome, the step renders the friendly "Billing data will start appearing in 24–48 hours" state and provides a manual retry affordance wired to `syncGcpBillingExportNow`
- [ ] The "Connect" affordance is wired via `<form action={connectGcpBillingExport}>` — Frankie does not invent server logic
- [ ] No business logic, no `useEffect` data fetching, no client-side calls to use cases
- [ ] Imports of cost-tracking module respect the public-API boundary (only `application/{useCase}` types via `domain/types`, never `infrastructure/repositories/*`)

## Out of Scope

- Server actions themselves (already exist from GCPBE_5_5)
- Soft prompt on Cloud Monitoring wizard advertising Billing Export (Phase 2 — GCPBE_5_11)
- Per-source freshness indicator on dashboards (GCPBE_5_7)
- Transition banners (Phase 2)
