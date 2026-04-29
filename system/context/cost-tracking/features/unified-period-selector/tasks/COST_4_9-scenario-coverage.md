---
task_id: COST_4_9
type: other
agent: tesseract
status: done
dependencies: [COST_4_8]
---

# Scenario coverage for resolver, anomalies dual-mode, and page-to-page URL propagation

## Description

Cover the behaviours enumerated in RFC Section 9. Three behavioural surfaces matter most because they are where the architecture is non-obvious and where regressions would be invisible:

1. **Resolver behaviour with bad inputs** — every preset returns the expected UTC range; default is `30d`; invalid `period` falls back to default; `period=custom` with missing/invalid dates falls back to default; `to > today` is clamped; `from > to` is silently swapped; stale `window=`/`time=` params are ignored.
2. **Anomalies dual-mode** — detection math is unaffected by `startDate`/`endDate`; display filtering trims the returned list to the range; calling without a date range yields the same behaviour as before COST_4_2.
3. **Selector navigation and stickiness** — changing the selector updates `period`/`from`/`to` correctly; navigating between cost-tracking pages (dashboard, alerts, explore, attributions, budget, recommendations, report) preserves the user's selection via the extended `NavigationContainer`.

Editorial opt-outs are also worth covering at the smoke-test level: the MTD card, forecast widget, and all-time unattributed >5% banner do NOT change when the global period changes.

## RFC Reference

- Section 9 — Testing (full enumeration of behaviours that need scenario coverage):
  - Resolver: each preset returns the expected UTC range; default is `30d`; invalid `period` falls back to default; `period=custom` with missing dates falls back to default; `to > today` is clamped
  - Selector navigation: changing the selector updates the URL contract correctly; navigating between cost-tracking pages preserves the selection
  - Anomalies dual-mode: detection math is unaffected by `startDate`/`endDate`; display filtering trims the returned list to the range; calling without a date range yields today's behaviour
  - Use case signature changes: `getBudgetStatus` accepts the new input; old call sites without dates still work
  - Page migration smoke tests: every cost-tracking page renders under the default period, a preset period, and a custom period
  - Opt-out widgets: MTD card, forecast, and all-time unattributed banner do not change when the global period changes
- Section 7, Risks — "Dual-mode anomaly use case becomes harder to reason about" — tesseract should cover both modes

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/selectedPeriod.ts` — resolver from COST_4_1
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/detectSpendAnomaliesUseCase.ts` — dual-mode contract from COST_4_2
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/application/getBudgetStatusUseCase.ts` — extended signature from COST_4_2
- `/Users/mario/code/Labs/aimdall/.claude/skills/prover/` — the project's scenario prover skill (per CLAUDE.md "Available Skills")
- All cost-tracking pages migrated in COST_4_5 through COST_4_8

## Files Touched

- New scenarios under the project's scenario directory (location chosen by tesseract per the prover skill conventions)

## Acceptance Criteria

- [ ] Scenarios cover every preset enumerated in RFC Section 3.1 (`today`, `7d`, `30d`, `90d`, `mtd`, `qtd`, `ytd`, `custom`) returning the expected UTC start and end-of-day-inclusive end
- [ ] Scenarios cover invalid `period` values falling back to `30d`
- [ ] Scenarios cover `period=custom` with missing or invalid `from`/`to` falling back to `30d`
- [ ] Scenarios cover `from > to` being silently swapped
- [ ] Scenarios cover `to > today` being clamped to end-of-day today (UTC)
- [ ] Scenarios cover stale `window=` and `time=` URL params being ignored (no silent translation)
- [ ] Scenarios cover anomalies detection math being unaffected when `startDate`/`endDate` are supplied (the statistical baseline window is independent)
- [ ] Scenarios cover anomalies displayed-list filtering excluding anomalies whose `date` falls outside the supplied range
- [ ] Scenarios cover anomalies use case behaving exactly as before COST_4_2 when called without `startDate`/`endDate`
- [ ] Scenarios cover `getBudgetStatus` accepting the new optional input AND old call sites without dates still working
- [ ] Smoke-level scenarios cover every cost-tracking page (dashboard, alerts, explore, attributions, budget, recommendations, report) rendering under the default period, a preset period, and a custom period
- [ ] Smoke-level scenarios confirm the editorial opt-outs do not change with the global period: MTD hero card, forecast widget, all-time unattributed >5% banner, report page
- [ ] Smoke-level scenarios confirm `period`/`from`/`to` are preserved when navigating between cost-tracking pages via the layout's `NavigationContainer`

## Business Rules (from RFC)

- The dual-mode contract is the highest-risk part of this feature (RFC Section 7); coverage of both modes is non-negotiable
- The resolver's edge-case behaviour is documented as silent fallbacks (RFC Section 3.9), not as errors — scenarios assert the silent-fallback semantics, not error throws
