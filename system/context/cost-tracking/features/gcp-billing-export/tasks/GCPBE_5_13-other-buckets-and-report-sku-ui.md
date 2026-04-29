---
task_id: GCPBE_5_13
type: frontend-ui
agent: frankie
status: pending
dependencies: [GCPBE_5_12, GCPBE_5_11]
phase: 3
---

# Phase 3 — UI: Other Vertex / Other AI Studio buckets with "report unrecognized SKU" affordance

## Description

Render the `Other Vertex` and `Other AI Studio` buckets that GCPBE_5_12's allocation output produces for SKUs that have no canonical-model mapping yet, and add the "report unrecognized SKU" affordance that lets users feed back into Aimdall's SKU-mapping maintenance loop.

This task is presentational only. The data — including which SKU strings are unmapped and which buckets they fall into — already comes from the allocation use case.

## PRD Reference

- Use case 2 — SKU-level breakdown of Gemini / Vertex spend remains usable even when canonical mapping is incomplete
- Success metric 4 — Honesty signal: users are not surprised by figures; the "Other" buckets make the gap explicit

## RFC Reference

- §2 decision 5 — Unmapped SKUs land in `Other Vertex` / `Other AI Studio` with a "report SKU" affordance
- §8 — UI surfaces: `Other Vertex` and `Other AI Studio` buckets with a "report unrecognized SKU" affordance feeding back into the SKU-mapping maintenance loop

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/attributions/_components/` — per-key / breakdown views where the buckets render
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/explore/_components/` — explore surface for SKU-level breakdowns
- `/Users/mario/code/Labs/aimdall/components/ui/` — design-system primitives (Card, Badge, Button)
- The allocation use case output from GCPBE_5_12 — passed through Server Components into the view tier

## Acceptance Criteria

- [ ] `Other Vertex` and `Other AI Studio` buckets render as first-class rows / segments in per-key views, the explorer's SKU dimension, and any other surface that breaks down by canonical model
- [ ] Each `Other` bucket exposes the underlying unmapped SKU strings (on hover or expand) so the user can see what the residual is composed of
- [ ] A "report unrecognized SKU" affordance is present on each `Other` bucket. The reporting mechanism (e.g., link to feedback / GitHub issue / contact form) follows whatever channel Aimdall already uses for product feedback — Frankie does not invent a new backend
- [ ] No invented styling for the canonical-model rows — they use the existing per-model row presentation from Phase 2
- [ ] No new server actions, no new use cases, no new data fetching
- [ ] Imports respect the module public API

## Out of Scope

- User-editable SKU mapping overrides (out of scope per RFC §12)
- Backend changes to ingestion or allocation (already complete in GCPBE_5_12)
