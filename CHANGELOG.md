# Changelog

Reverse-chronological. Each entry: what shipped, what you can do now, what it requires.

---

## 2026-04-28 — Provider Onboarding UX

> Connect a provider, get redirected, watch your full history flow in. State persists across refreshes.

**Roadmap:** Tier 3 (P2) partial — [Provider Onboarding](docs/features/06-provider-onboarding.md) done. New: [GCP Billing Export](docs/features/08-gcp-billing-export.md) scoped (Tier 3, P2).

### What you can do now

Connect OpenAI / Anthropic / Vertex / Gemini through the wizard at `/cost-tracking/providers`. The flow:

1. Enter API key → click Connect.
2. Server validates, saves credential, marks `sync_state='in_progress'`, spawns background sync, redirects to `/cost-tracking?connected=<slug>`.
3. Dashboard fires welcome toast, strips the query param, renders a shimmer skeleton mirroring the real layout.
4. Background sync runs. Client polls every 5 seconds. On completion: `router.refresh()` swaps skeleton for real dashboard, success toast fires.
5. Refresh during sync — skeleton persists (state lives in DB).
6. On sync error — red banner on the provider card with the error message and a Retry button.

### Per-provider first-sync windows

| Provider | First-sync lookback | Source |
|---|---|---|
| OpenAI | 365 days | Organization Usage API |
| Anthropic | 365 days (speculative) | Admin API — no documented cap |
| Vertex AI | 42 days | Cloud Monitoring 6-week retention |
| Gemini | 42 days | Same Cloud Monitoring backend |

Subsequent syncs are incremental from the existing cursor — unchanged.

### Schema

Migration `0005_awesome_praxagora.sql` adds:

| Column | Type | Purpose |
|---|---|---|
| `cost_tracking_providers.sync_state` | enum (`idle`/`in_progress`/`success`/`error`) | Drives the dashboard skeleton vs real-data switch |
| `cost_tracking_providers.sync_started_at` | timestamptz | When the current/last sync began |
| `cost_tracking_providers.sync_error` | text | Last error message (truncated to 500 chars) |

Backfill: existing rows with non-null `last_sync_at` set to `'success'`.

### Provider cards

The providers list at `/cost-tracking/providers` now shows, per connected provider: status badge (with `Syncing…` override during in-progress runs), "Synced X ago" relative time, masked credential hint in mono font, and Sync now / Disconnect actions. Sync errors render an inline red banner with a Retry button.

### Technical surface

| Layer | Change |
|---|---|
| Schema | Migration `0005_awesome_praxagora.sql` + new `cost_tracking_provider_sync_state` enum |
| Domain | `Provider` extended with sync fields; `IProviderRepository.markSyncStarted/Succeeded/Failed`; new `IProviderSyncStatusRepository` |
| Application | `connectProviderUseCase` marks sync started; `syncProviderUsageUseCase` writes per-iteration state; new `getSyncStatusUseCase`; per-client `firstSyncLookbackMs` |
| Infrastructure | `DrizzleProviderRepository` + new sync-status factory; `firstSyncLookbackMs` on each provider client |
| Server | `connectProviderAction` redirects with `?connected=<slug>`; new `getSyncStatusAction` for polling |
| UI | New `DashboardSkeleton`, `NoDataPanel`, `SyncStatusPoller`, `ConnectedToast`. `ToastProvider` lifted to `/cost-tracking/layout.tsx`. Wizard collapsed from 3 steps to 2 (success modal removed). Provider card enriched. |

### What's next

[GCP Billing Export](docs/features/08-gcp-billing-export.md) is the natural follow-up for Google-heavy users — extends Vertex/Gemini history from 42 days to 13 months by reading from BigQuery alongside Cloud Monitoring. Reconciles with the existing dedup key.

### App naming

The CLI/window/tab is now branded **Aimdall** (was "Create Next App"). New `app/icon.svg` — amber crosshair / radar mark with a small ascending spark chart. Distinct enough at 16×16 to spot among other localhost tabs.

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
