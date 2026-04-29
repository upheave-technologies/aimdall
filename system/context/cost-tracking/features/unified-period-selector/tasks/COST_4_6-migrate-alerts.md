---
task_id: COST_4_6
type: frontend-smart
agent: nexus
status: done
dependencies: [COST_4_3, COST_4_2]
---

# Migrate alerts page from window to resolved period (anomalies dual-mode)

## Description

Migrate `app/cost-tracking/alerts/page.tsx` from the legacy `window` URL param to the unified contract. The alerts page is the primary consumer of the anomalies dual-mode contract: the user-selected period filters the *displayed list* of anomalies, while `windowDays` continues to govern the detection statistical baseline. Per RFC Section 3.6, when `windowDays` is not supplied, the use case keeps its existing default behaviour.

## RFC Reference

- Section 1 — Problem (alerts page currently reads `window` and forwards as `windowDays`; does not read `from`/`to` at all; line 27)
- Section 3.1 — Legacy `window` param is retired with no shim
- Section 3.6 — Anomalies Dual-Mode Semantics (windowDays drives detection math; startDate/endDate drives displayed list)
- Section 3.7 — Alerts row: `detectSpendAnomalies` (display filter), `getUsageSummary`; no opt-outs on this page
- Section 3.9 — Stale `window=` URLs are ignored; first navigation lands on the default (30d)
- Section 5, Step 5 — Migration order

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/alerts/page.tsx` — the page to migrate
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/selectedPeriod.ts` — resolver from COST_4_1
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/detectSpendAnomaliesUseCase.ts` — extended in COST_4_2 to accept the dual-mode contract
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getUsageSummaryUseCase.ts` — already accepts dates

## Files Touched

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/alerts/page.tsx`

## Acceptance Criteria

- [ ] The page no longer reads the `window` URL param
- [ ] The page resolves the period via `resolveSelectedPeriod` and passes the resolved range to `detectSpendAnomalies` as `startDate`/`endDate` for displayed-list filtering
- [ ] `windowDays` is no longer derived from the URL; per RFC Section 3.6 it remains an internal default for detection math when not supplied (or is supplied as a fixed default at the call site, per Section 5, Step 5)
- [ ] `getUsageSummary` receives the resolved range
- [ ] Stale `window=` URLs do not cause errors and do not silently translate — the first navigation lands on the default (30d), per RFC Section 3.9
- [ ] Page remains a Server Component (no `'use client'`, no hooks, no raw HTML JSX per `.claude/rules/page-architecture.md`)
- [ ] No `windowDays` UI control persists in the page — period selection happens via the layout-mounted selector

## Business Rules (from RFC)

- Detection math is decoupled from the displayed-list filter (RFC Section 3.6); a "last 7 days" period must NOT cause anomaly detection to fail for lack of baseline
- The legacy `window` param is retired with no shim (RFC Section 3.1, Section 3.9)
