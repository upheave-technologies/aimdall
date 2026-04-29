---
task_id: COST_4_5
type: frontend-smart
agent: nexus
status: done
dependencies: [COST_4_3, COST_4_2]
---

# Migrate dashboard page to consume resolver and fix unfilled use case call sites

## Description

Migrate `app/cost-tracking/page.tsx` to consume `resolveSelectedPeriod` and pass the resolved range to every use case that should be period-scoped. This task fixes the existing bug where four of the five use cases on the dashboard are called with `{}` even though the user has selected a date range — the user's selection currently only reaches `getUsageSummary`.

The dashboard also has documented editorial opt-outs that must NOT consume the resolver. Per RFC Section 3.8, these are call-site decisions visible at the line where each use case is called — there is no flag, no metadata, and no marker.

## RFC Reference

- Section 1 — Problem (current dashboard bug: `getSpendForecast({})`, `getUnassignedSpend({})`, `detectSpendAnomalies({})`, `getBudgetStatus({})` at lines 40-43; only `getUsageSummary` receives the user's range)
- Section 3.7 — Page-by-Page Migration table, Dashboard row:
  - Period-scoped: `getUsageSummary`, `getUnassignedSpend`, `detectSpendAnomalies` (display filter), `getBudgetStatus`
  - Editorial opt-outs: `getSpendForecast` (always current month), the MTD hero card (fixed calendar month, already correct at line 34), the all-time unattributed >5% banner (full history)
- Section 3.8 — Opt-Out Mechanism (no flag; opt-out is a call-site decision)
- Section 5, Step 4 — Migration order: dashboard first; the layout selector already exists from COST_4_3

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/page.tsx` — the dashboard page to migrate (currently uses `DateRangeFilterContainer` locally; selector is now in the layout)
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/selectedPeriod.ts` — resolver from COST_4_1
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getUsageSummaryUseCase.ts` — already accepts dates; call site adjusts only
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getUnassignedSpendUseCase.ts` — already accepts dates; call site begins passing them
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/detectSpendAnomaliesUseCase.ts` — gains new optional dates from COST_4_2
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getBudgetStatusUseCase.ts` — input shape extended in COST_4_2
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getSpendForecastUseCase.ts` — opt-out; continues to be called as it is
- `/Users/mario/code/Labs/aimdall/.claude/rules/page-architecture.md` — page contract (auth, fetch, delegate)

## Files Touched

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/page.tsx`

## Acceptance Criteria

- [ ] `app/cost-tracking/page.tsx` resolves the period via `resolveSelectedPeriod` exactly once at the top of the page
- [ ] `getUsageSummary` receives the resolved range (no behavioural regression vs. today)
- [ ] `getUnassignedSpend` receives the resolved range (this fixes the current `{}` bug)
- [ ] `detectSpendAnomalies` receives the resolved range as `startDate`/`endDate` for displayed-list filtering; `windowDays` continues to be supplied (or defaulted) for detection math, per RFC Section 3.6
- [ ] `getBudgetStatus` receives the resolved range (this fixes the current `{}` bug; signature was extended in COST_4_2)
- [ ] `getSpendForecast` is NOT migrated — it remains called with `{}` per the editorial opt-out in RFC Section 3.7 and 3.8
- [ ] The MTD hero card (currently at line 34) continues to use its hard-coded current-calendar-month start — editorial opt-out per RFC Section 3.7
- [ ] The all-time unattributed >5% warning banner continues to use full-history attribution coverage — editorial opt-out per RFC Section 3.7
- [ ] The local `DateRangeFilterContainer` reference is removed from this page (the selector is now in the layout) — but the file itself is NOT deleted in this task; deletion happens in COST_4_8 after every consumer is migrated
- [ ] Page remains a Server Component (no `'use client'`, no hooks, no raw HTML JSX per `.claude/rules/page-architecture.md`)
- [ ] No use case is renamed and no return type changes (RFC Section 3.5)

## Business Rules (from RFC)

- Opt-outs are editorial: they are visible at the call site as a one-line decision in code review (RFC Section 3.8)
- The forecast is always current month and does not honour the global selection (RFC Section 3.7)
- Anomalies on the dashboard are filtered by displayed range, not by detection-baseline range — see COST_4_2 dual-mode contract (RFC Section 3.6)
