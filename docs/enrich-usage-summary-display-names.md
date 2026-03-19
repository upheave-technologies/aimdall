# Implementation Report — Enrich UsageSummaryRow and DailySpendRow with Display Names

## What was implemented

### Files modified

| File | Change |
|------|--------|
| `modules/cost-tracking/domain/repositories.ts` | Added `providerSlug`, `providerDisplayName` to both `UsageSummaryRow` and `DailySpendRow`; added `credentialLabel`, `credentialKeyHint` to `UsageSummaryRow`; added `segmentDisplayName` to `UsageSummaryRow`. All new fields carry JSDoc comments. |
| `modules/cost-tracking/infrastructure/repositories/DrizzleUsageRecordRepository.ts` | Added `eq` to drizzle-orm imports; imported `costTrackingProviders`, `costTrackingProviderCredentials`, `costTrackingProviderSegments` from schema; updated all five aggregation methods with JOINs, additional SELECT columns, and extended GROUP BY clauses. |

## Existing code analysis — files reviewed and left unchanged

- `modules/cost-tracking/schema/usageRecords.ts` — confirmed `providerId` is a UUID FK to `costTrackingProviders.id`, not a slug
- `modules/cost-tracking/schema/providers.ts` — confirmed columns `slug` (text, not null) and `display_name` (text, not null)
- `modules/cost-tracking/schema/providerCredentials.ts` — confirmed columns `label` (text, not null) and `key_hint` (text, nullable)
- `modules/cost-tracking/schema/providerSegments.ts` — confirmed column `display_name` (text, not null)

## Query design decisions

**`providerId` is a UUID, not a slug.** The `cost_tracking_usage_records.provider_id` column is a FK UUID referencing `cost_tracking_providers.id`. Any consumer code that was matching `row.providerId` against slug-based label maps (e.g., `PROVIDER_LABELS`) would silently produce no match. With `providerSlug` and `providerDisplayName` now available directly from the JOIN, the UI layer can render the correct label without any secondary lookup.

**JOIN strategy:**

| Method | Provider JOIN | Credential JOIN | Segment JOIN |
|--------|--------------|-----------------|--------------|
| `findSummaryByProvider` | INNER | — | — |
| `findSummaryByModel` | INNER | — | — |
| `findSummaryByCredential` | INNER | LEFT (credentialId is nullable) | — |
| `findSummaryBySegment` | INNER | — | LEFT (segmentId is nullable) |
| `findDailySpend` | INNER | — | — |

Provider JOIN is INNER because every usage record must have a provider (FK NOT NULL, referential integrity enforced by the constraint). Credential and segment JOINs are LEFT because both FKs are nullable on usage records.

**GROUP BY correctness.** All non-aggregated columns from joined tables (`slug`, `displayName`, `label`, `keyHint`) are present in the GROUP BY clause. Postgres requires this — selecting a non-aggregated column without grouping by it is a query error.

**Zombie Shield note.** The existing `isNull(costTrackingUsageRecords.deletedAt)` filter on every WHERE clause remains unchanged. No additional soft-delete filters are applied to the joined tables — a usage record referencing a now-soft-deleted provider or credential is still a valid historical cost record that should appear in aggregation queries.

## Architectural compliance

- Domain layer changes are pure type additions — zero external imports, zero side effects. The domain layer rule (no imports from external libraries) is satisfied.
- Infrastructure layer is the only layer touching the database. JOINs use Drizzle ORM column references matching the project's established pattern.
- The `IUsageRecordRepository` interface contract and use case factories are unchanged.
- Factory function pattern (`makeUsageRecordRepository`) is preserved.
- Zombie Shield active on all five aggregation methods.

## Code changes for tesseract

### New fields on `UsageSummaryRow`
- `providerSlug: string` — always present (INNER JOIN guarantees it)
- `providerDisplayName: string` — always present
- `credentialLabel?: string` — present when `credentialId` is set and the credential row exists
- `credentialKeyHint?: string` — present when `credentialId` is set and the credential has a non-null `key_hint`
- `segmentDisplayName?: string` — present when `segmentId` is set and the segment row exists

### New fields on `DailySpendRow`
- `providerSlug: string` — always present
- `providerDisplayName: string` — always present

### Test scenarios to cover

1. `findSummaryByProvider` — result rows carry `providerSlug` and `providerDisplayName` matching the provider fixture.
2. `findSummaryByModel` — same provider enrichment; `modelSlug` grouping unchanged.
3. `findSummaryByCredential` with credential — row has `credentialLabel` and optionally `credentialKeyHint`.
4. `findSummaryByCredential` without credential (NULL credentialId) — `credentialLabel` and `credentialKeyHint` are `undefined`.
5. `findSummaryBySegment` with segment — row has `segmentDisplayName`.
6. `findSummaryBySegment` without segment (NULL segmentId) — `segmentDisplayName` is `undefined`.
7. `findDailySpend` — result rows carry `providerSlug` and `providerDisplayName`.
8. Soft-deleted usage records remain excluded from all five queries.

## Verification results

```
pnpm build
  ✓ Compiled successfully in 2.9s
  TypeScript: 0 errors

pnpm lint
  0 errors, 3 warnings (all pre-existing in unrelated files — test file, budgets schema, db-seed script)
```

## Deferred scope

- No changes to `app/` files. The page adapter that maps these rows to UI-facing types is owned by nexus. That adapter can now use `row.providerSlug` and `row.providerDisplayName` directly instead of a PROVIDER_LABELS lookup that was receiving a UUID.
- No tests created — tesseract owns test authorship.
- No use case changes — the use case is a pass-through and the `IUsageRecordRepository` interface signature is unchanged.
