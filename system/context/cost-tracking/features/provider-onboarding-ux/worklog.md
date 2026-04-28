# Provider Onboarding UX — Worklog

**Date:** 2026-04-28
**Status:** Done / Implemented

## Problem

User reported the provider connection flow was "horrible UX":

1. Connecting OpenAI succeeded but the dashboard kept showing the same "Connect a provider" CTA — no toast, no acknowledgement, no signal anything had happened.
2. Returning to the providers list offered the same provider again, with no clear "already connected" indication on the cards.
3. No state distinction between "no provider connected" vs "provider connected, sync hasn't completed yet."
4. First sync only pulled 30 days of history — too thin to demonstrate the product's value on day one.

Goal: make the onboarding flow feel like a polished SaaS product. The user lands, connects a key, lands on a dashboard that's clearly working on their data, and watches their full historical usage flow in.

## Root cause (audit findings)

`DashboardView.tsx:299` was checking `!hasData` (presence of usage records with spend) to render the empty state. After a successful connection, the credential was saved and revalidation fired, but the background sync hadn't completed yet — so `hasData` was still false and the empty CTA persisted. The dashboard was asking the wrong question. It should have separated three states: no providers, providers but syncing, providers with data.

Additionally:
- `ToastProvider` was mounted only under `/cost-tracking/attributions/` — no toast surface in the providers / dashboard flow.
- The wizard's `step: 3` "success modal" + manual "Go to Dashboard" link was extra friction with no upside given the user wanted automatic redirect.
- Background sync was fire-and-forget on the client side, with no DB-persisted "currently syncing" state — a refresh during sync would not show any in-progress UI.
- `DEFAULT_LOOKBACK_MS` in `syncProviderUsageUseCase.ts` was 30 days — fine for incremental, too thin for a first-impression dataset.

## Implementation

### 1. Schema — persist sync state on the provider row

Migration `0005_awesome_praxagora.sql` adds:

- `cost_tracking_provider_sync_state` enum: `idle | in_progress | success | error`
- `cost_tracking_providers.sync_state` (NOT NULL DEFAULT `'idle'`)
- `cost_tracking_providers.sync_started_at` (timestamptz, nullable)
- `cost_tracking_providers.sync_error` (text, nullable)
- Backfill: rows with non-null `last_sync_at` set to `'success'`

A new enum was introduced (rather than reusing `cost_tracking_sync_status` which is per-run history on `sync_logs`) because provider-current-state and per-run-lifecycle are different concepts with different vocabularies.

### 2. Domain + repository

- `Provider` type extended with `syncState`, `syncStartedAt`, `syncError`. `ProviderSyncState` exported from `domain/types.ts`.
- `IProviderRepository` gains three methods: `markSyncStarted`, `markSyncSucceeded(lastSyncAt)`, `markSyncFailed(errorMessage)`. Plain `Promise<void>` — matches existing repo method shape; thrown exceptions propagate.
- `DrizzleProviderRepository` implements them with narrow targeted updates (don't touch unrelated columns) and truncates the error message to ~500 chars before storing.
- New `IProviderSyncStatusRepository` + `findSyncStatus()` — narrow 5-column SELECT used by the polling endpoint. Kept separate from `IProviderRepository` to avoid widening that contract for a single read path.

### 3. Application layer

- `connectProviderUseCase` calls `markSyncStarted(provider.id)` after the credential save succeeds. Best-effort — failure logs a warning but does not fail the connect flow.
- `syncProviderUsageUseCase` wraps each per-provider iteration in markSyncStarted at entry, markSyncSucceeded at success, markSyncFailed in catch blocks (both per-provider and catastrophic outer catch).
- `listProviderStatusUseCase` surfaces the three new fields on `ProviderStatusItem`. Not-connected entries default to `idle / null / null`.
- New `getSyncStatusUseCase.ts` — lightweight polling endpoint. Does a single SELECT of just the 5 status columns. No usage records, no aggregations.

### 4. Server actions (`app/cost-tracking/providers/actions.ts`)

`connectProviderAction` now:
1. Validates FormData
2. Calls `connect` use case (saves credential + marks sync_state='in_progress')
3. Spawns `syncProviderUsageFromDb()` filtered to the just-connected provider as fire-and-forget (caught with `.catch` to prevent unhandled rejections)
4. Calls `revalidatePath('/cost-tracking/providers')` and `revalidatePath('/cost-tracking')`
5. Calls `redirect('/cost-tracking?connected=<slug>')`

On error: returns `{ success: false, error }` with the error translated to plain user-facing language (no status codes, no internal field names, no jargon).

`getSyncStatusAction` — wraps the new use case, serializes Date → ISO string for client transport. No auth check (matches the rest of this internal-tool action surface).

### 5. UI

**Layout:**
- `ToastProvider` lifted from `app/cost-tracking/attributions/_containers/` → `app/cost-tracking/_containers/`. Mounted in `app/cost-tracking/layout.tsx` (which stays a Server Component; only the provider container is `'use client'`). All four attribution containers updated to import from the new path; the inner mount in the attributions layout was removed.

**Dashboard (`page.tsx` + `DashboardView.tsx`):**
- Replaced the `if (!hasData) renderEmptyState()` logic with four-state branching:
  - `!hasProviders` → existing connect CTA (unchanged)
  - `hasProviders && anySyncing` → new `DashboardSkeleton` (full-page shimmer mirroring the real layout: KPI tiles, provider breakdown, top cost drivers — all with CSS keyframe shimmer + animated dot trio + an `aria-live="polite"` heading naming the syncing providers)
  - `hasProviders && !hasData && !anySyncing` → `NoDataPanel` (edge case: sync completed but nothing to show)
  - `hasData` → real dashboard

**New components/containers:**
- `_components/DashboardSkeleton.tsx` — Server Component, pure presentational
- `_components/NoDataPanel.tsx` — Server Component, edge state
- `_containers/SyncStatusPoller.tsx` — `'use client'` polling island; polls `getSyncStatusAction` every 5s while any provider is `in_progress`; on `in_progress → success` transition fires success toast and calls `router.refresh()`; on `in_progress → error` fires error toast; self-stops the interval when nothing's syncing
- `_containers/ConnectedToast.tsx` — `'use client'` arrival-toast island; reads `?connected=<slug>` from `useSearchParams`, fires welcome toast, then `router.replace()` to strip the query param so refresh doesn't re-toast

**Provider card (`providers/_components/ProviderCard.tsx`):**
- Status badge maps from `status` (Active/Paused/Error) with a `syncState='in_progress'` override showing "Syncing…" with an animated ping dot
- "Synced X ago" relative time (inline helper, no date lib dependency)
- Masked credential hint in mono font
- Sync now / Disconnect actions via `<form action={serverAction}>`
- Red error banner (replaces the "last synced" line when `syncState='error'`) with the stored error message + Retry sync button

**Wizard cleanup (`providers/_containers/ProviderWizard.tsx`, `_components/ProviderWizardView.tsx`):**
- `step: 3` success modal removed (unreachable now that `connectProviderAction` redirects)
- Progress bar collapsed from 3 segments to 2
- The wizard's `triggerSyncAction` call after `connectProviderAction` removed (server action spawns its own sync)

### 6. First-sync window — pull full history per provider

Each provider has a different historical retention window. Rather than a single global default, `ProviderUsageClient` got an optional `firstSyncLookbackMs` field, declared per concrete client:

| Provider | First-sync lookback | Basis |
|---|---|---|
| OpenAI | 365 days | Organization Usage API retains ~1 year |
| Anthropic | 90 days | Admin API usage_report/cost_report retention |
| Vertex AI | 42 days | Cloud Monitoring 6-week metric retention |
| Gemini | 42 days | Same Cloud Monitoring backend |

In `syncProviderUsageUseCase.ts`, the no-cursor branch (first sync, or `forceFullSync`) now uses `client.firstSyncLookbackMs ?? FALLBACK_FIRST_SYNC_LOOKBACK_MS` (fallback: 30 days). The cursor-based incremental sync logic is unchanged. `forceFullSync` semantics are unchanged.

Skeleton message updated accordingly: "We're loading everything available from {provider} so your dashboard shows patterns, trends, and anomalies from day one. This usually takes 1–3 minutes — feel free to refresh, leave the page, or come back later. Your data will be waiting."

## Files touched

**Schema (3 files + 1 migration):**
- `modules/cost-tracking/schema/enums.ts`
- `modules/cost-tracking/schema/providers.ts`
- `modules/cost-tracking/schema/index.ts`
- `drizzle/migrations/0005_awesome_praxagora.sql` + `meta/0005_snapshot.json` + `_journal.json`

**Domain (3 files):**
- `modules/cost-tracking/domain/provider.ts`
- `modules/cost-tracking/domain/repositories.ts`
- `modules/cost-tracking/domain/types.ts`

**Application (4 files; one new):**
- `modules/cost-tracking/application/connectProviderUseCase.ts`
- `modules/cost-tracking/application/listProviderStatusUseCase.ts`
- `modules/cost-tracking/application/syncProviderUsageUseCase.ts`
- `modules/cost-tracking/application/getSyncStatusUseCase.ts` (new)

**Infrastructure (5 files):**
- `modules/cost-tracking/infrastructure/repositories/DrizzleProviderRepository.ts`
- `modules/cost-tracking/infrastructure/providers/types.ts`
- `modules/cost-tracking/infrastructure/providers/openaiUsageClient.ts`
- `modules/cost-tracking/infrastructure/providers/anthropicUsageClient.ts`
- `modules/cost-tracking/infrastructure/providers/vertexUsageClient.ts`
- `modules/cost-tracking/infrastructure/providers/geminiUsageClient.ts`

**Server actions (1 file):**
- `app/cost-tracking/providers/actions.ts`

**UI (10 files; 4 new + 6 modified):**
- `app/cost-tracking/layout.tsx`
- `app/cost-tracking/page.tsx`
- `app/cost-tracking/_components/DashboardView.tsx`
- `app/cost-tracking/_components/DashboardSkeleton.tsx` (new)
- `app/cost-tracking/_components/NoDataPanel.tsx` (new)
- `app/cost-tracking/_containers/ToastProvider.tsx` (relocated from attributions)
- `app/cost-tracking/_containers/ConnectedToast.tsx` (new)
- `app/cost-tracking/_containers/SyncStatusPoller.tsx` (new)
- `app/cost-tracking/providers/page.tsx`
- `app/cost-tracking/providers/_components/ProvidersPageView.tsx`
- `app/cost-tracking/providers/_components/ProviderCard.tsx`
- `app/cost-tracking/providers/_components/ProviderWizardView.tsx`
- `app/cost-tracking/providers/_containers/ProviderWizard.tsx`
- `app/cost-tracking/providers/_containers/ProviderActions.tsx`
- `app/cost-tracking/attributions/_containers/DashboardShell.tsx` (toast provider unmounted; inherits from parent)
- `app/cost-tracking/attributions/_containers/GroupDetailPanel.tsx` (import path)
- `app/cost-tracking/attributions/_containers/RuleBuilder.tsx` (import path)
- `app/cost-tracking/attributions/_containers/TemplateWizard.tsx` (import path)
- `app/cost-tracking/attributions/_containers/ToastProvider.tsx` (deleted)

## Verification

- `pnpm tsc --noEmit` — clean
- `pnpm build` — clean, all routes compile

End-to-end flow tested locally:
1. Land on `/cost-tracking` with zero providers → connect CTA shows
2. Click Connect, enter API key → wizard validates, saves, redirects
3. Dashboard at `/cost-tracking?connected=openai` → toast fires, query param strips, skeleton renders
4. Skeleton shows provider name + "loading everything available… 1–3 minutes" message + animated shimmer
5. Background sync runs; poller detects flip; `router.refresh()` swaps skeleton for real data; success toast fires
6. Refresh during sync → skeleton persists (state in DB)
7. Visit `/cost-tracking/providers` → connected provider card shows status badge, last-sync time, key hint, Sync now / Disconnect

## Known follow-ups

- **Stale-sync recovery.** If the Node process dies mid-sync, a provider could be stuck in `in_progress` indefinitely. Future work: background job that resets `sync_state` to `'error'` if `sync_started_at` is older than ~10 minutes.
- **`ActionResult<any>` widening in `ProviderWizard`.** Type was widened from `ActionResult<never>` during parallel agent work. Functional but should be tightened back to `ActionResult<never>` in a cleanup pass.
- **Anthropic 90-day window.** Their API has no documented hard cap. If they silently return data beyond 90d the existing pagination handles it; if shorter, no breakage. Worth verifying in production once we have real data.
- **Sync progress.** Currently we have binary `in_progress` vs done. A "X% pulled" indicator would be valuable but requires per-provider progress reporting in the clients.
- **Disconnect-then-reconnect.** Cursors persist on the `sync_cursors` table; reconnecting an already-disconnected-and-rerun provider may not trigger the full-history pull because the cursor exists. Confirm and handle if needed.
