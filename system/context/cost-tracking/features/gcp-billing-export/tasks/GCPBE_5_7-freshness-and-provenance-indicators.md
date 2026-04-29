---
task_id: GCPBE_5_7
type: frontend-ui
agent: frankie
status: pending
dependencies: [GCPBE_5_5]
phase: 1
---

# Per-source freshness indicator and provenance badge on cost-tracking dashboards (Phase 1 surfaces)

## Description

Add the per-source "as of" freshness indicator and a provenance badge to the existing cost-tracking dashboards (dashboard, explore, attributions, budget, alerts, report). The data inputs — last sync timestamp per provider, lifecycle state, expected lag — are already surfaced by the data layer in GCPBE_5_5 and the existing `getLastSyncedAtUseCase` / `listProviderStatusUseCase`. This task is presentational only.

In Phase 1 the badge differentiates two tiers:

- **Authoritative** (Billing Export rows): "as of [date]" with the 24–48h lag explanation.
- **Estimated** (Cloud Monitoring rows): "as of [time]" with the near-real-time explanation.

The "Derived per-key" tier with its bounded-by-slower-source rule is rendered in Phase 2 (GCPBE_5_11), once per-key views exist.

## PRD Reference

- R10: Source provenance is recoverable
- R12: Freshness indicators per source — Billing Export "as of [date]"; Monitoring near-real-time; user must never read "today's date with no Vertex spend" as "we did not use Vertex today"
- R13: Integration with existing dashboards — same dashboards/explorer/reports

## RFC Reference

- §8 — UI surfaces: per-source freshness indicator on every dashboard, distinguishing Billing Export's daily lag from Monitoring's near-real-time lag

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_components/` and `_containers/` — existing dashboard chrome
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_containers/SyncButtonContainer.tsx` — existing "last synced" affordance reference
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/page.tsx`, `alerts/page.tsx`, `attributions/page.tsx`, `budget/page.tsx`, `explore/page.tsx`, `report/page.tsx` — Server Components that already pass last-sync data into their views
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getLastSyncedAtUseCase.ts` — existing data source
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/listProviderStatusUseCase.ts` — existing data source
- `/Users/mario/code/Labs/aimdall/components/ui/` — design-system primitives (Badge, Tooltip, Card)

## Acceptance Criteria

- [ ] Every cost-tracking dashboard surface (dashboard, alerts, attributions, budget, explore, report) renders a per-source freshness indicator showing the most recent successful sync timestamp per data source tier (Authoritative / Estimated)
- [ ] When Billing Export is connected, the Authoritative tier indicator reads "as of [date]" and exposes a tooltip explaining the 24–48h lag (per R12)
- [ ] When Cloud Monitoring is connected, the Estimated tier indicator reads with minutes-level precision and a tooltip explaining near-real-time refresh (per R12)
- [ ] Each cost figure on these dashboards is associated (visually or via tooltip/badge) with its provenance tier — Authoritative or Estimated — per R10
- [ ] When the suppression predicate from GCPBE_5_4 has filtered Monitoring estimates out of a `(project, day)` window, the displayed total is labelled Authoritative; when Billing Export is absent, the total is labelled Estimated
- [ ] No styling decisions leak into the data layer (Server Components are unchanged in shape; this task only touches `_components/` and possibly `_containers/`)
- [ ] No new server actions, no new data fetching, no `useEffect` for data
- [ ] Imports respect the module public API

## Out of Scope

- Per-key freshness rendering (Phase 2 — GCPBE_5_11)
- Transition banners (Phase 2)
- Other Vertex / Other AI Studio buckets and report-SKU affordance (Phase 3)
