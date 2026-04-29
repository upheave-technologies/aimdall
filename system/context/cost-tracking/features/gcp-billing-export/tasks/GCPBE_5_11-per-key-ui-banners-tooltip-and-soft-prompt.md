---
task_id: GCPBE_5_11
type: frontend-ui
agent: frankie
status: pending
dependencies: [GCPBE_5_10]
phase: 2
---

# Phase 2 — Per-key UI: estimated tooltip, Unattributed row, transition banners, Cloud Monitoring soft-prompt

## Description

Replace the `null`-returning shells from GCPBE_5_10 with the styled presentational layer for all Phase 2 UI surfaces:

1. **"Estimated" indicator + methodology tooltip** on every per-key dollar figure — visually and structurally distinguishable from authoritative figures.
2. **Unattributed row** rendered as a first-class row in per-key views, with a hover explanation so the user understands why the residual exists.
3. **Billing-after-Monitoring delta banner** — one-time, shows the delta between the prior estimate and the new authoritative number, dismissible (acknowledgement wired through the server action created in GCPBE_5_10).
4. **Monitoring-after-Billing celebratory highlight** — one-time, when per-key views first light up.
5. **Empty-state UI** for per-key views when Monitoring data is missing — plain-language explanation per Journey 2, with a direct link to the Cloud Monitoring connection wizard.
6. **Soft prompt on the Cloud Monitoring connection wizard** advertising Billing Export for accurate dollars (informational, not blocking).
7. **Per-key tier freshness indicator** — bounded by the slower of the two sources (RFC §8 / R12).

## PRD Reference

- R9: dual-tier presentation — every per-key dollar figure must be visually marked as "estimated" with an accessible explanation of the allocation method; authoritative figures must NEVER carry the indicator
- R12: Freshness — per-key estimates bounded by the slower source (Billing Export's daily lag)
- R13: Per-key estimates surfaced on per-key views and anywhere else key-level breakdowns are exposed, always with the "estimated" marker
- Journey 2: Empty state, plain-language, direct link to Cloud Monitoring wizard
- Journey 3: Soft prompt on Cloud Monitoring connection screens for Billing Export

## RFC Reference

- §2 decision 2 — One-time delta banner; silent thereafter; "silent number shifts not allowed"
- §2 decision 3 — Celebratory highlight + estimated-derived-from-request-share tooltip
- §2 decision 4 — Unattributed bucket
- §8 — UI surfaces enumerated (per-key estimated indicator, Unattributed bucket, transition banner, Cloud Monitoring soft-prompt, per-source freshness indicator extension to the per-key tier)

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/attributions/_components/` and `_containers/` — existing per-key view chrome
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_components/` — chrome (reuse the freshness indicator scaffold added in GCPBE_5_7)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/providers/_components/` — Cloud Monitoring wizard component, where the Billing Export soft-prompt mounts
- `/Users/mario/code/Labs/aimdall/components/ui/` — Badge, Tooltip, Banner / Alert primitives
- The acknowledgement server action created in GCPBE_5_10 — called via `<form action={}>`; never re-implemented

## Acceptance Criteria

- [ ] Every rendered per-key dollar figure carries a visible "estimated" indicator (badge or equivalent) and a tooltip explaining "derived from request share" — methodology label sourced from the use case output, not invented in the UI
- [ ] Authoritative dollar figures NEVER carry the "estimated" indicator (R9 hard rule)
- [ ] An `Unattributed` row renders in per-key tables when the use case emits one, with an accessible explanation
- [ ] Billing-after-Monitoring delta banner appears once when the data layer signals it; on dismiss, the acknowledgement server action is called via `<form action={}>` and the banner does not return
- [ ] Monitoring-after-Billing celebratory highlight appears once when the data layer signals it; acknowledgement same as above
- [ ] When the use case returns the empty-state signal (Monitoring missing for the window), the per-key view shows the empty state described in Journey 2, with a direct link/button to the Cloud Monitoring connection wizard — never a partial number
- [ ] The Cloud Monitoring connection wizard gains a soft prompt advertising Billing Export — informational only, never blocking, never gating connect
- [ ] Per-key views show a freshness indicator bounded by the slower source (Billing Export's daily lag), distinct from the per-source indicator added in GCPBE_5_7
- [ ] No new server actions, no `useEffect` data fetching, no client-side use case calls
- [ ] No invented business logic or methodology copy — methodology label is sourced from the data layer output

## Out of Scope

- Other Vertex / Other AI Studio buckets and the report-SKU affordance (Phase 3 — GCPBE_5_13)
- Adding new server actions (GCPBE_5_10 already defined them)
