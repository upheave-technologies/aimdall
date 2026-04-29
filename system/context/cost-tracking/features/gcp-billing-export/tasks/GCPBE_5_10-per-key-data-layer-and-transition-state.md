---
task_id: GCPBE_5_10
type: frontend-smart
agent: nexus
status: pending
dependencies: [GCPBE_5_9]
phase: 2
---

# Phase 2 — Per-key dashboard data layer (Server Components + actions) and transition banner state

## Description

Wire the Phase 2 read paths into existing per-key surfaces and add the data layer that drives the two transition banners:

- **Billing-after-Monitoring banner**: one-time, shows the delta between the prior Monitoring-estimated total and the new authoritative Billing Export total for the affected GCP account, then is silent thereafter (RFC §2 decision 2; explicit "no silent number shifts").
- **Monitoring-after-Billing celebratory highlight**: one-time, fires when per-key views first light up because Monitoring was added to an existing Billing Export connection (RFC §2 decision 3).

This task delivers the data layer only. Frankie replaces the `null` returns with the actual styled banners, tooltips, and Unattributed row in GCPBE_5_11.

## PRD Reference

- Journey 2: Billing without Monitoring — empty state explaining what's missing; direct link to the Cloud Monitoring wizard
- Journey 3: Monitoring without Billing — soft prompt for Billing Export
- Open Question 3 — Billing-after-Monitoring transition needs a migration banner
- Open Question 4 — Monitoring-after-Billing transition is "silent with subtle highlight"

## RFC Reference

- §2 decision 2 — Billing-after-Monitoring: one-time banner with delta, silent thereafter
- §2 decision 3 — Monitoring-after-Billing: celebratory highlight; every per-key cost column carries an "estimated, derived from request share" tooltip
- §7.2 — Empty-state signal when Monitoring is missing for the window
- §8 — UI surfaces this task feeds: per-key estimated indicator, Unattributed bucket, transition banner, Cloud Monitoring soft-prompt

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/attributions/page.tsx` — Server Component already wired to read attribution / per-key data; the new use case becomes an additional input here
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/attributions/_components/` — existing per-key view components (Frankie territory; Nexus only touches Server Components and actions)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/computePerKeyCostAllocationUseCase.ts` (from GCPBE_5_9)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/listProviderStatusUseCase.ts` — used to determine which transition banner (if any) is currently applicable
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/providers/page.tsx` — for the Cloud Monitoring soft-prompt placement
- `/Users/mario/code/Labs/aimdall/.claude/rules/page-architecture.md`
- `/Users/mario/code/Labs/aimdall/.claude/rules/server-actions.md`

## Files Touched

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/attributions/page.tsx` (modified — call new use case; pass allocation result + transition state to view)
- Possibly `/Users/mario/code/Labs/aimdall/app/cost-tracking/page.tsx` if dashboard surfaces a per-key strip
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/actions.ts` or `/Users/mario/code/Labs/aimdall/app/cost-tracking/providers/actions.ts` (modified — add server action that records "transition banner acknowledged" so the one-time banner stays one-time)
- New Server Component shells (returning `null`) for the banner mounts, to be styled by Frankie in GCPBE_5_11

## Acceptance Criteria

- [ ] The attributions Server Component invokes `computePerKeyCostAllocationUseCase` for the relevant `(project, day window)` and forwards the result (including any `Unattributed` bucket and the empty-state signal) to the view layer as a typed prop
- [ ] When Monitoring is missing for the window, the view receives the empty-state signal — never a partial estimate (RFC §7.2)
- [ ] Transition state is computed in the data layer:
  - Billing-after-Monitoring: provider history shows Monitoring connected before Billing Export, and the user has not yet acknowledged the banner — passes a `showBillingAfterMonitoringBanner` flag plus the computed delta
  - Monitoring-after-Billing: provider history shows Billing Export connected before Monitoring for the same GCP account, and acknowledgement state is unset — passes a `showMonitoringAfterBillingHighlight` flag
- [ ] A server action exists to record the user's acknowledgement of either transition banner; once recorded, the data layer stops setting the corresponding flag (one-time)
- [ ] All new Server Components return `null` or minimal markup per Nexus → Frankie handoff (CLAUDE.md)
- [ ] No business logic in Server Components or actions — all decisions live in use cases
- [ ] Imports respect the public-API boundary

## Out of Scope

- The styled banners themselves (GCPBE_5_11)
- The estimated-tooltip rendering on per-key columns (GCPBE_5_11)
- The Unattributed row's styling (GCPBE_5_11)
- SKU mapping integration (Phase 3 — GCPBE_5_12)
