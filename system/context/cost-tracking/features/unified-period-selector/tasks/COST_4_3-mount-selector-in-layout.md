---
task_id: COST_4_3
type: frontend-smart
agent: nexus
status: done
dependencies: [COST_4_1]
---

# Mount PeriodSelector in cost-tracking layout and preserve searchParams across navigation

## Description

Add the unified period selector as application chrome in the cost-tracking layout so it is visible on every cost-tracking page, then make the existing intra-cost-tracking navigation preserve the `period`/`from`/`to` searchParams when the user moves between pages.

This task delivers the data layer only, per the Nexus → Frankie gate:

1. Create `PeriodSelector` as a server component skeleton (calls the resolver, embeds the client island, but renders no styled JSX — returns minimal/null markup that frankie will replace in COST_4_4).
2. Create `PeriodSelectorMenu` as a client component skeleton (`'use client'`, owns `useRouter`/`useSearchParams`, exposes the navigation handler that mutates the URL — but renders no styled chrome yet).
3. Mount `PeriodSelector` inside `app/cost-tracking/layout.tsx`.
4. Extend `NavigationContainer` so internal cost-tracking nav links forward the current `period`/`from`/`to` searchParams. This is the stickiness mechanism described in RFC Section 3.4.

After this task, the URL contract is writable from the layout and is preserved across cost-tracking nav, but no page consumes it yet — behaviour is unchanged for end users until COST_4_5 onward migrate the pages.

## RFC Reference

- Section 2, Decision 2 — Selector lives in application chrome, not on a page; goes in `app/cost-tracking/layout.tsx`
- Section 3.3 — Component Architecture (`PeriodSelector` server component in `_components/`; `PeriodSelectorMenu` client island in `_containers/`; minimum-surface client principle)
- Section 3.4 — Layout Integration and Navigation Stickiness (label rendered by client island via `useSearchParams`; `NavigationContainer` extended to forward selection)
- Section 5, Step 3 — Migration order: add selector to layout next; no page consumes the searchParams yet, so behaviour is unchanged

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/layout.tsx` — the layout where the selector mounts (currently only renders `NavigationContainer` and `ToastProvider`)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_containers/NavigationContainer.tsx` — the client nav container that needs extending to preserve searchParams
- `/Users/mario/code/Labs/aimdall/modules/cost-tracking/domain/selectedPeriod.ts` — the resolver added in COST_4_1
- `/Users/mario/code/Labs/aimdall/.claude/rules/server-first-react.md` — minimum client surface principle (only the dropdown island is `'use client'`; chrome stays server)
- `/Users/mario/code/Labs/aimdall/.claude/rules/page-architecture.md` — server-component contract

## Files Touched

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_components/PeriodSelector.tsx` (new)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_containers/PeriodSelectorMenu.tsx` (new, `'use client'`)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/layout.tsx` (modified)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_containers/NavigationContainer.tsx` (modified)

## Acceptance Criteria

- [ ] `PeriodSelector` exists as a server component (no `'use client'`)
- [ ] `PeriodSelectorMenu` exists as a client component in `_containers/` with `'use client'` (the only `'use client'` introduced by this task)
- [ ] The selector is mounted inside `app/cost-tracking/layout.tsx` and renders on every cost-tracking page
- [ ] Selecting a preset or submitting custom dates updates the URL with the unified contract: `period` plus optional `from`/`to`; no other URL keys are written
- [ ] Stale `window=` and `time=` query params are NOT translated — they are ignored, per RFC Section 3.9
- [ ] `NavigationContainer` preserves `period`/`from`/`to` on every internal cost-tracking nav link so navigation between dashboard, alerts, explore, attributions, budget, recommendations, report keeps the user's selection
- [ ] Per-dimension explore filter params (`provider`, `model`, etc.) are not affected by the nav extension (per RFC Section 5, Step 6)
- [ ] No styling decisions made in this task — `PeriodSelector` returns minimal/null markup ready for frankie to replace in COST_4_4 (the Nexus → Frankie handoff per CLAUDE.md)
- [ ] The Next.js layout does not attempt to read `searchParams` directly — the visible label is rendered inside the client island via `useSearchParams`, per RFC Section 3.4

## Business Rules (from RFC)

- The selector is application chrome, not a per-page widget — placement in the layout is the architectural decision (RFC Section 2, Decision 2)
- The minimum-surface client principle: only the dropdown island is client; the chrome stays server (RFC Section 3.3, alternative 6.4)
- Stickiness across navigation requires both layout placement AND a single URL contract — together they produce the desired behaviour (RFC Section 3.4)
