---
task_id: COST_4_4
type: frontend-ui
agent: frankie
status: done
dependencies: [COST_4_3]
---

# Replace PeriodSelector skeleton with styled JSX (dropdown + custom date inputs)

## Description

After nexus has mounted the selector skeleton in the layout in COST_4_3 and established the navigation contract, replace the minimal/null markup with styled, presentational JSX. This is the Frankie side of the Nexus → Frankie handoff.

The styled selector renders the current period label and a dropdown menu that lists every preset enumerated in the RFC. When the user picks `custom`, the menu reveals two date inputs (`from`/`to`) that submit together as a single navigation.

This task does not introduce any new server actions, data fetching, or auth concerns — those were established in COST_4_3. Frankie touches only the visual layer.

## RFC Reference

- Section 3.1 — Single URL Contract (the preset values that must appear in the dropdown: `today`, `7d`, `30d`, `90d`, `mtd`, `qtd`, `ytd`, `custom`)
- Section 3.3 — Component Architecture (the visible structure of the selector and its menu; custom date inputs live inside `PeriodSelectorMenu` and submit together)
- Section 4 — `DateRangeFilter` and `DateRangeFilterContainer` are deleted; the new selector subsumes their behaviour (deletion happens in COST_4_8)

## Existing Code to Leverage

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_components/PeriodSelector.tsx` — skeleton created by nexus in COST_4_3
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_containers/PeriodSelectorMenu.tsx` — client island created by nexus in COST_4_3 (already owns `useRouter`, `useSearchParams`, and the URL-mutation handler)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_components/DateRangeFilter.tsx` — existing pattern reference for date-input layout (this file will be deleted in COST_4_8)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_containers/DateRangeFilterContainer.tsx` — existing pattern reference (also deleted in COST_4_8)
- The project's existing design system primitives in `app/cost-tracking/_components/` (e.g. styling conventions used in `NavigationView.tsx`, `DashboardView.tsx`)

## Files Touched

- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_components/PeriodSelector.tsx` (replace null skeleton with styled JSX)
- `/Users/mario/code/Labs/aimdall/app/cost-tracking/_containers/PeriodSelectorMenu.tsx` (replace minimal markup with styled dropdown + custom date inputs; do NOT alter the navigation handler logic established in COST_4_3)

## Acceptance Criteria

- [ ] The selector visibly displays the current period label on every cost-tracking page (sourced from the client island's `useSearchParams` per RFC Section 3.4)
- [ ] The dropdown menu lists exactly the preset values from RFC Section 3.1: `today`, `7d`, `30d`, `90d`, `mtd`, `qtd`, `ytd`, `custom`
- [ ] Selecting `custom` reveals two date inputs (`from`/`to`) that submit together as a single navigation (per RFC Section 3.3)
- [ ] Server-rendered chrome remains server (the file stays a server component); only the existing client island in `_containers/PeriodSelectorMenu.tsx` is `'use client'`
- [ ] No new `'use client'` files are introduced by this task
- [ ] No data fetching, no server actions, no auth checks added by this task — those concerns belong to COST_4_3
- [ ] Frankie does not modify `app/cost-tracking/layout.tsx`, the resolver, the navigation container, or any use case (those are nexus/donnie surfaces)
- [ ] Visual treatment is consistent with the existing cost-tracking chrome (reference `NavigationView.tsx` and existing `_components/` styling)

## Business Rules (from RFC)

- The dropdown menu is the only piece that genuinely needs client state (open/closed, custom date input coordination); per RFC Section 3.3 and the minimum-surface principle, the rest stays server-rendered
- Custom date inputs must submit together as one navigation, not as two separate URL updates (RFC Section 3.3)
