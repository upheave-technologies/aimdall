---
task_id: COST_4_8
type: frontend-smart
agent: nexus
status: done
dependencies: [COST_4_5, COST_4_6, COST_4_7]
---

# Migrate attributions and budget pages and delete DateRangeFilter / DateRangeFilterContainer

## Description

Two final migrations and one cleanup, performed together because the cleanup depends on every previous consumer being migrated:

1. **Attributions** — replace both `new Date(0)` call sites in `app/cost-tracking/attributions/page.tsx` (currently at lines 106 and 110) with the resolved range. Per RFC Section 1, this hard-coded all-time window is the bug; the page must honour the global selection.
2. **Budget** — pass the resolved range to `getBudgetStatus`. The signature was extended in COST_4_2; this task wires the call site. Per RFC Section 3.7, the global period scopes which budgets are listed, but each budget's internal `periodType` (monthly/quarterly/annual) continues to govern its own computation.
3. **Cleanup** — after this task, no consumer of `DateRangeFilter`/`DateRangeFilterContainer` remains. Delete both files. Per RFC Section 4, their behaviour is fully absorbed by the new selector.

Editorial documentation (no code changes) for the deliberate opt-outs:
- **Recommendations page** — RFC Section 3.7 says revisit only if recommendations carry a time dimension. Today they do not. No code change in this task; a comment at the page top noting the editorial opt-out is sufficient if helpful, but not required.
- **Report page** — RFC Section 3.7: entire page opts out by convention (monthly snapshot). No code change.

## RFC Reference

- Section 1 — Problem (attributions passes `startDate: new Date(0)` at lines 106 and 110)
- Section 3.5 — Use case signature changes (no rename, no return type change)
- Section 3.7 — Page-by-Page Migration table:
  - Attributions: `getAttributionSummary`, `getAttributionCoverage` get the resolved range; replace `new Date(0)`
  - Budget: `getBudgetStatus` scopes which budgets are listed; per-budget internal periods are unchanged
  - Recommendations: revisit only if time-dimensional (currently not)
  - Report: opts out by convention (monthly snapshot)
- Section 3.8 — Editorial opt-outs (no flag, no marker)
- Section 4 — `DateRangeFilter` and `DateRangeFilterContainer` are deleted; selector subsumes them
- Section 5, Steps 7-9 — Migration order: attributions, budget, then delete the legacy filter

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/attributions/page.tsx` — RFC cites lines 106 and 110 (hard-coded `new Date(0)`)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/budget/page.tsx` — call site for `getBudgetStatus`
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/selectedPeriod.ts` — resolver from COST_4_1
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getAttributionSummaryUseCase.ts` — already accepts dates; call site adjusts
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getAttributionCoverageUseCase.ts` — already accepts dates; call site adjusts
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getBudgetStatusUseCase.ts` — extended in COST_4_2
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_components/DateRangeFilter.tsx` — to be deleted
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_containers/DateRangeFilterContainer.tsx` — to be deleted

## Files Touched

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/attributions/page.tsx`
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/budget/page.tsx`
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_components/DateRangeFilter.tsx` (delete)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_containers/DateRangeFilterContainer.tsx` (delete)

## Acceptance Criteria

- [ ] `app/cost-tracking/attributions/page.tsx` no longer contains `new Date(0)` at any call site; `getAttributionSummary` and `getAttributionCoverage` receive the resolved range
- [ ] `app/cost-tracking/budget/page.tsx` calls `getBudgetStatus` with the resolved range; the global period now scopes which budgets are listed
- [ ] Each budget's internal `periodType` (monthly/quarterly/annual) continues to govern its own period computation, per RFC Section 3.7
- [ ] Both `DateRangeFilter.tsx` and `DateRangeFilterContainer.tsx` are deleted; no remaining import of either exists in the codebase
- [ ] Attributions, budget, recommendations, and report pages all render under the layout-mounted selector — recommendations and report continue NOT to consume the resolver per editorial opt-out
- [ ] All modified pages remain Server Components (no `'use client'`, no hooks, no raw HTML JSX per `.claude/rules/page-architecture.md`)
- [ ] No use case is renamed and no return type changes (RFC Section 3.5)

## Business Rules (from RFC)

- Hard-coded all-time windows are the bug (RFC Section 1); the all-time view must come from explicit user choice (`period=ytd` or a wide custom range), not from a `new Date(0)` literal
- Budget scoping is "which budgets are listed", not "how each budget computes its own period" (RFC Section 3.7)
- Recommendations and report are deliberate editorial opt-outs (RFC Section 3.7, 3.8) — they continue not to consult the resolver
- The deletion of `DateRangeFilter`/`DateRangeFilterContainer` is the final cleanup step in the migration order (RFC Section 5, Step 9)
