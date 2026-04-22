# Changelog

Reverse-chronological. Each entry: what shipped, what you can do now, what it requires.

---

## 2026-04-22 — Intelligence Layer

> Data becomes advice. Dollar-denominated recommendations. Attribution setup in 2 minutes.

**Roadmap:** Tier 1 (P0) complete. [Smart Recommendations](docs/features/03-smart-recommendations.md) + [Attribution Reimagined](docs/features/04-attribution-reimagined.md).

### Smart Recommendations `/cost-tracking/recommendations`

6 analyzers scan usage data after each sync and surface ranked actions:

| Analyzer | Trigger | Output |
|---|---|---|
| Model Tier | >30% low-output requests on expensive models | "Switch to mini — save $X/mo" |
| Cache Utilization | Cache active but <30% hit rate | "Improve to 40% — save $X/mo" |
| Batch API | >1K daily requests, batch tier available | "Convert 50% to batch — save $X/mo" |
| Dormant Credentials | No usage in 30+ days | Security cleanup |
| Context Tier | Extended context on small requests | "Use standard tier — save $X/mo" |
| Provider Concentration | >85% spend on one provider | Concentration risk warning |

Dismiss recommendations you've reviewed. Regenerate on demand.

### Attribution Reimagined `/cost-tracking/attributions`

| Capability | Before | After |
|---|---|---|
| Setup | Manual rules, must understand dimensions | 4 templates (team, project, env, individual) |
| Visibility | No idea what's covered | Coverage dashboard: X% attributed + gap breakdown |
| Discovery | Stare at credential list | Auto-detected naming clusters + usage patterns |
| Scenarios | Figure it out | Gallery: chargebacks, R&D vs prod, cost per feature |

Existing rule engine unchanged. Templates are shortcuts — edit anything after setup.

### New routes

- `/cost-tracking/recommendations` — sidebar: Recommendations (lightbulb icon)
- `/cost-tracking/attributions` — updated with coverage, templates, discovery, gallery

### Schema

2 new tables. Requires migration before use:

```
drizzle-kit generate && drizzle-kit push
```

| Table | Purpose |
|---|---|
| `cost_tracking_recommendations` | Persisted recommendation lifecycle (active/dismissed/expired) |
| `cost_tracking_suggestion_dismissals` | Tracks which auto-discovery suggestions were dismissed |

### Technical surface

| Layer | Smart Recommendations | Attribution Reimagined |
|---|---|---|
| Domain | `recommendation.ts` — 6 pure analyzers | `attributionTemplate.ts` — templates, discovery, coverage |
| Use Cases | generate, list, dismiss | applyTemplate, getCoverage, getAutoDiscovery, previewRule, dismiss/undismissSuggestion |
| Infrastructure | `DrizzleRecommendationRepository` | `DrizzleSuggestionDismissalRepository` |
| Server | `recommendations/page.tsx` + `actions.ts` | Updated `attributions/page.tsx` + `actions.ts` |
| UI | `RecommendationsView` (cards, savings, dismiss) | `AttributionsView` (832 lines, 8 sections) |

### What's next

Tier 2 is unblocked: [Circuit Breakers](docs/features/01-circuit-breakers.md) and [Model Cost Simulator](docs/features/02-model-cost-simulator.md). The simulator shares cost-comparison logic with recommendations.
