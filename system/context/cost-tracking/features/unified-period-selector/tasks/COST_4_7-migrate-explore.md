---
task_id: COST_4_7
type: frontend-smart
agent: nexus
status: done
dependencies: [COST_4_3, COST_4_1]
---

# Migrate explore page from time to period and delete local resolveTimePreset

## Description

Migrate `app/cost-tracking/explore/page.tsx` from its local `time` preset contract to the unified `period` contract, and delete the page-local `resolveTimePreset` function — its behaviour is fully absorbed by `resolveSelectedPeriod` in the domain layer.

The explore page is the most behaviourally complete consumer of period selection today (it handles `today`, `7d`, `30d`, `90d`, `mtd`, `qtd`, `ytd`, `custom`). The migration replaces the local resolver but does NOT change explore's bucket-granularity logic — granularity remains an explore-local concern derived from the resolved range length, per RFC Section 8 Open Question 4.

Per-dimension explore filter params (`provider`, `model`, etc.) are untouched.

## RFC Reference

- Section 1 — Problem (explore reads `time` preset plus optional `from`/`to`, with its own `resolveTimePreset` at lines 96-184)
- Section 3.1 — Single URL Contract; `time` is retired
- Section 3.2 — Single Server-Side Resolver: `resolveSelectedPeriod` replaces both `resolveTimePreset` (explore-local) and the duplicated default behaviour in `resolveDateRange`
- Section 3.7 — Explore row: `exploreCostData` (main and prior-period queries derive from the resolved range), `getUnassignedSpend`; no opt-outs
- Section 4 — `resolveTimePreset` inside `app/cost-tracking/explore/page.tsx:96-184` is deleted
- Section 5, Step 6 — Delete `resolveTimePreset`; rename `time` → `period` in the URL contract; preserve per-dimension filter params (`provider`, `model`, etc.)
- Section 8, Open Question 4 — Granularity stays explore-local: explore continues to derive default granularity from the resolved range length; the resolver does NOT return granularity
- Section 3.9 — Stale `time=` URLs are ignored

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/explore/page.tsx` — the page to migrate; RFC cites lines 96-184 (local `resolveTimePreset` to delete) and 113-183 / 185 (granularity logic to preserve)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/selectedPeriod.ts` — resolver from COST_4_1
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/exploreCostDataUseCase.ts` — already accepts dates; call site changes only
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getUnassignedSpendUseCase.ts` — already accepts dates

## Files Touched

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/explore/page.tsx`

## Acceptance Criteria

- [ ] The local `resolveTimePreset` function (currently at lines 96-184) is deleted from `explore/page.tsx`
- [ ] The page calls `resolveSelectedPeriod` to obtain the dates
- [ ] `exploreCostData` receives the resolved range for both the main query and the prior-period query
- [ ] `getUnassignedSpend` receives the resolved range
- [ ] The legacy `time` URL param is no longer read; the page now reads `period` (and `from`/`to` for `period=custom`)
- [ ] Stale `time=` URLs do not cause errors and do not silently translate — the first navigation lands on the default (30d), per RFC Section 3.9
- [ ] Per-dimension explore filter params (`provider`, `model`, etc.) are unchanged in their contract and behaviour, per RFC Section 5, Step 6
- [ ] Bucket granularity continues to be derived locally on the explore page from the resolved range length — granularity is NOT moved into the domain resolver, per RFC Section 8 Open Question 4
- [ ] Page remains a Server Component (no `'use client'`, no hooks, no raw HTML JSX per `.claude/rules/page-architecture.md`)

## Business Rules (from RFC)

- One resolver is the architectural goal (RFC Section 3.2); duplicated/divergent date math across pages is the bug being fixed
- Granularity is an explore-specific concern, not a global one (RFC Section 8 Open Question 4)
- The legacy `time` param is retired with no shim (RFC Section 3.1, Section 3.9)
