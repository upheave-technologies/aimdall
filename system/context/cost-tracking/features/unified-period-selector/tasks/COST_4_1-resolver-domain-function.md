---
task_id: COST_4_1
type: backend
agent: donnie
status: done
dependencies: []
---

# Add resolveSelectedPeriod domain function

## Description

Add a single, pure server-side resolver that maps the unified URL contract (`period`/`from`/`to`) to a concrete UTC date range, preset token, and human-readable label. This is the only place in the codebase that knows how to interpret the period URL contract. It is a pure addition — no call sites yet.

This function lives next to the existing `resolveDateRange` utility in the domain layer.

## RFC Reference

- Section 3.1 — Single URL Contract (accepted `period` values, defaults, custom-range rules)
- Section 3.2 — Single Server-Side Resolver (rationale for domain-layer placement, output shape)
- Section 3.9 — Edge Cases (invalid `period`, missing custom dates, `from > to`, future `to`, UTC/DST handling)
- Section 5, Step 1 — Migration order: pure addition, no call sites yet
- Section 9 — Behaviours that need scenario coverage (each preset returns expected UTC range; default `30d`; invalid → default; `period=custom` with missing dates → default; `to > today` is clamped)

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/dateRange.ts` — existing `resolveDateRange` utility; the new resolver is layered on top, not a replacement (per RFC Section 4)
- `/Users/mario/code/Labs/aimdall/.claude/rules/domain-layer.md` — domain layer constraints (pure functions, no I/O, no framework deps)

## Files Touched

- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/selectedPeriod.ts` (new file)

## Acceptance Criteria

- [ ] New file `modules/cost-tracking/domain/selectedPeriod.ts` exists and is framework-agnostic (no Next.js, no React, no I/O)
- [ ] Accepts the searchParams shape produced by Next.js (string-or-undefined for each of `period`, `from`, `to`)
- [ ] Recognises every preset token enumerated in RFC Section 3.1: `today`, `7d`, `30d`, `90d`, `mtd`, `qtd`, `ytd`, `custom`
- [ ] Default behaviour when `period` is absent matches the current `resolveDateRange()` default (last 30 calendar days)
- [ ] All returned dates are UTC; `endDate` is end-of-day-inclusive (`23:59:59.999Z`), matching `dateRange.ts:25`
- [ ] Edge cases handled per RFC Section 3.9 — invalid `period` falls back to default; `period=custom` with missing/invalid `from`/`to` falls back to default; `from > to` is silently swapped; `to` in the future is clamped to end-of-day today (UTC); stale `window`/`time` params are ignored with no silent translation
- [ ] Output exposes the resolved start date, end date, the preset token, and a human-readable label (per RFC Section 3.2)
- [ ] Function is exported as a named export
- [ ] No imports from `application/`, `infrastructure/`, `app/`, or any external framework

## Business Rules (from RFC)

- The resolver is the sole authority on URL → dates mapping for the cost-tracking module
- Detection math elsewhere in the system (anomalies baseline) is independent of this resolver — it is a separate concern (RFC Section 3.6)
- Granularity is NOT returned by this resolver — that remains an explore-page-local concern (RFC Section 8, Open Question 4)
