# Cost Tracking Module — Implementation Report (v2 Schema Rewrite)

## What Was Implemented

### Domain Layer (`domain/`)

| File | Status | Description |
|------|--------|-------------|
| `domain/provider.ts` | **NEW** | Provider entity type + `validateProviderSlug`, `createProvider` pure functions |
| `domain/providerSegment.ts` | **NEW** | ProviderSegment entity type + `SegmentType` union |
| `domain/providerCredential.ts` | **NEW** | ProviderCredential entity type + `CredentialType`, `CredentialStatus` unions |
| `domain/model.ts` | **NEW** | Model entity type + `ServiceCategory` (shared across many entities), `ModelStatus` |
| `domain/modelPricing.ts` | **NEW** | ModelPricing entity type + `PricingRates`, `UsageMetrics` + two pure functions: `findApplicablePricing`, `calculateCostFromRates` |
| `domain/usageRecord.ts` | **REWRITTEN** | Removed old PRICING_MAP, Provider enum, and old types. New wide-column `UsageRecord` type + `DedupDimensions`, `BucketWidth`, `CostSource` + three pure functions: `buildDedupInput`, `validateUsageRecord`, `extractMetrics` |
| `domain/providerCost.ts` | **NEW** | ProviderCost entity type (write-once billing records) |
| `domain/syncLog.ts` | **NEW** | SyncLog entity type + `SyncType`, `SyncStatus` unions |
| `domain/syncCursor.ts` | **NEW** | SyncCursor entity type |
| `domain/attributionGroup.ts` | **NEW** | AttributionGroup entity type + `GroupType` union |
| `domain/attributionRule.ts` | **NEW** | AttributionRule entity type + `AttributionDimension`, `MatchType` + two pure functions: `matchesRule`, `resolveAttribution` |
| `domain/budget.ts` | **NEW** | Budget entity type + `BudgetType`, `BudgetPeriodType`, `BudgetStatus` + `evaluateBudgetStatus` pure function |
| `domain/repositories.ts` | **NEW** | All 9 repository interfaces in one file: `IUsageRecordRepository`, `IProviderCostRepository`, `ISyncLogRepository`, `ISyncCursorRepository`, `IProviderRepository`, `IProviderCredentialRepository`, `IModelRepository`, `IAttributionRepository`, `IBudgetRepository` + `UsageSummaryRow`, `DailySpendRow` aggregation types |
| `domain/usageRecordRepository.ts` | **REPLACED** | Now a thin re-export shim pointing to `repositories.ts` for backward compatibility |

### Infrastructure Layer (`infrastructure/`)

| File | Status | Description |
|------|--------|-------------|
| `infrastructure/dedupKeyHasher.ts` | **NEW** | Wraps `buildDedupInput` (domain) + SHA-256 (node:crypto) → 64-char hex dedup key |
| `infrastructure/database.ts` | **UNCHANGED** | CostTrackingDatabase type re-export |
| `infrastructure/logger.ts` | **UNCHANGED** | Structured JSON logger |
| `infrastructure/providers/types.ts` | **REWRITTEN** | New `ProviderUsageClient` contract with `providerSlug: string`, `fetchUsage` → `RawProviderUsageData[]`, optional `fetchCosts` → `RawProviderCostData[]` |
| `infrastructure/providers/openaiUsageClient.ts` | **REWRITTEN** | `provider` → `providerSlug`; maps to `RawProviderUsageData` (adds `serviceCategory`, `bucketEnd`, `bucketWidth`) |
| `infrastructure/providers/anthropicUsageClient.ts` | **REWRITTEN** | Same updates; `cacheCreationTokens` → `cacheWriteTokens`; derives `bucketEnd` by adding 1 hour |
| `infrastructure/providers/vertexUsageClient.ts` | **REWRITTEN** | Same updates; adds `serviceCategory`, `bucketEnd`, `bucketWidth` |
| `infrastructure/repositories/DrizzleUsageRecordRepository.ts` | **REWRITTEN** | Upsert now targets `dedupKey` column. Five aggregation queries (by provider, model, credential, segment, daily spend). Returns `{ created, updated }`. |
| `infrastructure/repositories/DrizzleProviderCostRepository.ts` | **NEW** | Implements `IProviderCostRepository`: `upsertBatch` + `findByProvider` |
| `infrastructure/repositories/DrizzleSyncRepository.ts` | **NEW** | Implements `ISyncLogRepository` + `ISyncCursorRepository` |
| `infrastructure/repositories/DrizzleProviderRepository.ts` | **NEW** | Implements `IProviderRepository` + `IProviderCredentialRepository` + `IModelRepository` |
| `infrastructure/repositories/DrizzleAttributionRepository.ts` | **NEW** | Implements `IAttributionRepository` |
| `infrastructure/repositories/DrizzleBudgetRepository.ts` | **NEW** | Implements `IBudgetRepository` with `softDelete` and `updateSpend` |

### Application Layer (`application/`)

| File | Status | Description |
|------|--------|-------------|
| `application/costTrackingError.ts` | **UNCHANGED** | Error class with `code` field |
| `application/syncProviderUsageUseCase.ts` | **REWRITTEN** | Accepts `SyncDeps` bag (7 repos + hasher) + `clients[]`. Creates sync log, processes each provider: auto-registers credentials/models, calculates cost from DB pricing, upserts usage records and provider costs, advances sync cursor, updates sync log on completion. |
| `application/getUsageSummaryUseCase.ts` | **UPDATED** | Now calls 5 parallel queries (added `findSummaryBySegment`). Returns `UsageSummary` with `bySegment`. |

### Module Barrel

| File | Status | Description |
|------|--------|-------------|
| `index.ts` | **REWRITTEN** | Exports all 9 repository factories, all domain entity types, provider client factories, use case factories, `generateDedupKey`, and `CostTrackingError`. |

### Adjacent Files Updated for Compatibility

| File | Status | Description |
|------|--------|-------------|
| `app/api/cost-tracking/sync/route.ts` | **UPDATED** | Wires all new repositories into `SyncDeps` bag; uses `providerSlug` |
| `app/cost-tracking/page.tsx` | **UPDATED** | Adapts new `UsageSummaryRow`/`DailySpendRow` shapes to legacy component prop types via local adapter functions |

## Existing Code Reviewed (Left Unchanged)

- All 12 schema files (`schema/`) — read to understand column names, FK relationships, and index structure
- `infrastructure/database.ts`, `infrastructure/logger.ts` — no changes required
- `app/cost-tracking/_components/*.tsx` — read to understand legacy component prop shapes

## Architectural Compliance

- **Domain layer**: Zero external imports. All domain files import only from other domain files or `@/packages/shared/lib/result`. `node:crypto` is isolated to `infrastructure/dedupKeyHasher.ts`.
- **Factory pattern**: All repositories and use cases use `make*` factory functions.
- **Zombie Shield**: Every read query on soft-deletable entities includes `isNull(deletedAt)` — verified in all 6 infrastructure repository implementations.
- **Inward dependencies**: Infrastructure → domain; application → domain; domain → nothing external.
- **One responsibility per repository**: Each factory function in `DrizzleProviderRepository.ts` implements exactly one interface.
- **Result type**: All use cases return `Result<T, CostTrackingError>`.
- **Precision**: All cost amounts use string representation throughout domain and infrastructure.

## Code Changes for Tesseract

### New Domain Pure Functions (unit-testable, zero dependencies)

1. `validateProviderSlug(slug)` — rejects empty or non-`[a-z0-9_]+` slugs
2. `createProvider(slug, displayName, options?)` — validates slug + displayName
3. `buildDedupInput(dims)` — deterministic pipe-delimited string from 9 dimensions; field order is fixed
4. `validateUsageRecord(data)` — validates required fields; bucketEnd must be after bucketStart
5. `extractMetrics(record)` — maps UsageRecord fields to UsageMetrics shape; `durationSeconds` string → number via `parseFloat`
6. `findApplicablePricing(pricings, date, tier?, context?, region?)` — half-open interval [effectiveFrom, effectiveTo); returns most recent match or undefined
7. `calculateCostFromRates(rates, metrics)` — sums `(quantity / per) * rate` for each present key; returns 8 d.p. string; missing metrics contribute zero
8. `matchesRule(rule, dimensionValue)` — dispatches on `matchType`: exact (===), prefix (`startsWith`), regex (`new RegExp().test`), in_list (comma-split + `.includes`); returns false for invalid regex
9. `resolveAttribution(rules, dimensions)` — evaluates all rules; returns group IDs sorted by descending matched priority; each group included if ANY rule matches
10. `evaluateBudgetStatus(budget)` — paused/archived pass through unchanged; zero-dollar budget → 100% exceeded; percentUsed clamped to minimum 0

### New Use Case Factories

- `makeSyncProviderUsageUseCase(deps, clients)` — test opportunities: (a) mock all repos + known-output client; verify upsert called with correct `dedupKey`; (b) provider not in DB → failed result; (c) per-provider error doesn't abort other providers
- `makeGetUsageSummaryUseCase(repo)` — verify 5 queries run in parallel; verify 30-day default applied

### New Infrastructure Utilities

- `generateDedupKey(dimensions)` — deterministic: same dimensions → same SHA-256 hex output

### API Contracts

- `POST /api/cost-tracking/sync` — accepts optional `{ startTime?, endTime? }` body; returns `SyncResult` with `{ syncLogId, synced[], failed[] }`

## Verification Results

```
TypeScript: npx tsc --noEmit → BUILD OK (zero errors)

Lint: pnpm lint
  - 0 errors
  - 1 warning: schema/budgets.ts unused 'isNull' import (pre-existing schema file, not modified)
```

## Deferred Scope

- **Segment look-up in sync**: The sync use case sets `segmentId: undefined`. A future task should add segment resolution via a `IProviderSegmentRepository`.
- **Budget evaluation use case**: `evaluateBudgetStatus` exists in domain but no use case calls it yet. A `evaluateBudgetsUseCase` should be added.
- **Attribution resolution use case**: `resolveAttribution` exists in domain but no use case applies it to usage records.
- **Model pricing enrichment**: Auto-registered models have no pricing rows. A `syncModelPricingUseCase` should populate `model_pricing` from provider APIs or a static config.
- **Provider cost dedup key**: Uses a sentinel `serviceCategory: 'other'` in the hasher call — a dedicated cost-dimension dedup function would be cleaner.
