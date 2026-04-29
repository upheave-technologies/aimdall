---
task_id: COST_4_2
type: backend
agent: donnie
status: done
dependencies: [COST_4_1]
---

# Extend use case input shapes for anomalies and budget

## Description

Two use cases currently cannot accept the unified period and must be extended additively so that all existing call sites continue to compile while new call sites can pass the resolved range:

1. **`detectSpendAnomaliesUseCase`** — current input is `{ windowDays?: 30 | 90 | 180 }` only. Add optional `startDate`/`endDate` for *displayed-list filtering* (NOT for detection math). Implement the displayed-list filter inside the use case after the existing sort step and before the return.
2. **`getBudgetStatusUseCase`** — current input is `Record<string, never>` (no params accepted). Replace with `{ startDate?: Date; endDate?: Date }`.

This is the dual-mode contract specified in RFC Section 3.6: detection math continues to use the rolling statistical baseline (`windowDays`), while the user-selected period filters which anomalies are *returned*.

## RFC Reference

- Section 1 — Problem (current incompatible signatures: `detectSpendAnomaliesUseCase.ts:30–32` and `getBudgetStatusUseCase.ts:28`)
- Section 2, Decision 1 — Anomaly detection math keeps its rolling window; displayed-list filtering is separate
- Section 3.5 — Use Case Signature Changes table; both changes are additive
- Section 3.6 — Anomalies Dual-Mode Semantics (windowDays drives detection math; startDate/endDate drives displayed list; filter happens after sort, before return)
- Section 5, Step 2 — Migration order: extend signatures next; existing call sites still compile because both new fields are optional
- Section 9 — Anomalies dual-mode scenario coverage (detection math is unaffected by date range; display filtering trims the returned list; calling without a date range yields today's behaviour)

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/detectSpendAnomaliesUseCase.ts` — RFC cites lines 30-32 (input shape), 89-138 (statistical baseline window math), and the sort step before line 200 (where the new filter belongs)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getBudgetStatusUseCase.ts` — RFC cites line 28 (current `Record<string, never>` input)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/dateRange.ts` — existing default-handling utility used inside use cases (per RFC Section 4: "use cases continue to use `resolveDateRange` for their internal defaults when no dates are supplied")
- `/Users/mario/code/Labs/aimdall/.claude/rules/application-layer.md` — application layer constraints

## Files Touched

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/detectSpendAnomaliesUseCase.ts`
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getBudgetStatusUseCase.ts`

## Acceptance Criteria

- [ ] `detectSpendAnomaliesUseCase` input accepts optional `startDate` and `endDate` IN ADDITION TO the existing `windowDays`
- [ ] When `startDate`/`endDate` are absent, `detectSpendAnomaliesUseCase` behaves exactly as today (no behavioural regression for callers that don't supply dates)
- [ ] The detection statistical window (the `windowDays * 2` history fetch and the trailing baseline computation referenced at lines 89-138) is NOT affected by `startDate`/`endDate`
- [ ] When `startDate`/`endDate` are supplied, anomalies whose `date` falls outside `[startDate, endDate]` are excluded from the returned list
- [ ] The displayed-list filter is applied inside the use case AFTER the sort step and BEFORE the existing return statement (per RFC Section 3.6)
- [ ] `getBudgetStatusUseCase` input shape becomes `{ startDate?: Date; endDate?: Date }` (no longer `Record<string, never>`)
- [ ] All existing call sites of both use cases still compile (no required new fields)
- [ ] Neither use case has its return type changed (RFC Section 3.5: "No use case is renamed or has its return type changed")
- [ ] No business logic leaks into the call site — date-range filter logic stays inside the anomalies use case

## Business Rules (from RFC)

- Detection math is statistically meaningful only with a fixed-length baseline; coupling the baseline to user-selected ranges (e.g. "last 7 days") would yield zero anomalies because no baseline could be computed (RFC Section 3.6 rationale)
- Display filtering is a presentation concern; keeping it inside the use case prevents leakage of date-range logic into the page layer (RFC Section 3.6)
- `getBudgetStatus` scoping semantics: the global period scopes which budgets are *listed*, not how each budget computes its own internal period (RFC Section 3.7)
