# GCP Billing Export Integration

> Priority: P2
> Impact: Medium-High (for Google-heavy users)
> Status: Scoped

## Intent

For users with significant Google Vertex AI or Gemini spend, the current Cloud Monitoring integration is capped at **42 days** of historical data — Cloud Monitoring's metric retention window. OpenAI users get 365 days, Anthropic users get 365 days (speculative). Google users get six weeks. This integration closes that gap by reading from **GCP Billing Export to BigQuery**, which retains **13 months** of detailed billing data, including LLM API line items.

## Value

A new user with 18 months of Vertex AI history connects Aimdall today and sees only the last six weeks. They can't answer "how did our spend trend through the last fiscal year?" — a basic question that's table stakes for a cost tool.

After this integration: the user enables Billing Export → BigQuery in their GCP project (a one-click flow on Google's side), grants Aimdall a service account with `bigquery.dataViewer` on the export dataset, and Aimdall pulls the full 13-month history. Cloud Monitoring continues to handle near-real-time updates (the last few hours of usage that BigQuery hasn't ingested yet); Billing Export handles everything beyond.

The two data sources reconcile via the existing dedup key — the same usage record will not be inserted twice.

## Goal

- A Google user with Billing Export enabled sees up to 13 months of historical Vertex / Gemini spend on first sync.
- The user enables Billing Export through a guided flow within Aimdall — they should not need to leave the app to read GCP docs.
- Cloud Monitoring remains the source of truth for the most recent ~3 hours (BigQuery export has up to a 24-hour lag); Billing Export covers everything older.
- Users without Billing Export configured fall back to the current Cloud Monitoring 42-day window — no degradation, no error.
- A user can disable the Billing Export integration without losing previously imported records.

## Functionality

### Setup Flow

The provider onboarding wizard's Google step gains an optional second screen after credentials are accepted:

1. **"Want full 13-month history?"** — explains the benefit (e.g., *"Cloud Monitoring only retains 6 weeks. To see your full annual trend, enable Billing Export to BigQuery."*) with a "Yes, set this up" / "Skip for now" choice.
2. **Step-by-step guide** if the user opts in:
   - Open the GCP Console → Billing → Billing Export
   - Enable BigQuery export with the "Detailed usage cost data" option (annotated screenshot)
   - Create a BigQuery dataset (or select existing)
   - Wait ~24 hours for the first export to populate (a banner in Aimdall reminds the user; sync triggers automatically once data is detected)
3. **Service account permissions:**
   - Aimdall provides the email of the service account it uses for Vertex/Gemini sync
   - User grants `roles/bigquery.dataViewer` on the export dataset
   - Aimdall verifies the connection and confirms

### Data Pulling Strategy

A new infrastructure client `gcpBillingExportClient.ts` queries BigQuery directly:

- Filters `service.description` to `Vertex AI` and `Generative Language API` (Gemini's billing label)
- Maps SKU descriptions to Aimdall's internal model identifiers (a maintained mapping table — Google's SKUs are stable but verbose)
- Aggregates line items into `UsageRecord` shape using the same dimensions as the Cloud Monitoring client
- Returns records with `firstSyncLookbackMs` of **395 days** (13 months + safety margin)

The sync use case treats this as a separate client per provider when configured — the existing per-client first-sync-lookback mechanism handles the rest.

### Reconciliation with Cloud Monitoring

Two sources, one dedup key. The dedup key already includes `(providerId, credentialId, modelId, dimension hash, time bucket)`. Records from Cloud Monitoring and Billing Export for the same hour collapse into one row via the existing upsert. Cloud Monitoring wins on conflict (newer data, finer granularity); Billing Export fills gaps.

A small operational nuance: Billing Export's "exact dollar cost" can differ from Cloud Monitoring's "list price × usage" by a few percent due to negotiated discounts, sustained-use credits, and rounding. Document this in the user-facing tooltip ("Costs from BigQuery reflect your actual billed amount; older data may show small differences from real-time estimates").

### Disable / Disconnect

A user can revoke the BigQuery service account permission externally — Aimdall detects 403 responses, marks the integration as `error`, surfaces a banner suggesting reconnection, but **keeps all previously imported historical records**. The Cloud Monitoring path continues working independently.

## Constraints

- **Requires the user to enable Billing Export themselves.** This is not something Aimdall can do on the user's behalf without privileged GCP roles we explicitly do not request.
- **24-hour lag.** BigQuery export populates daily, not in real time. The 13-month historical pull is one-shot at setup; subsequent days arrive on a daily cadence. Cloud Monitoring continues to fill the real-time gap.
- **BigQuery cost.** Querying the export dataset costs money — small at this scale (a single full pull is on the order of cents), but documented for transparency. Subsequent incremental queries are tiny.
- **SKU mapping drift.** Google occasionally renames or splits SKUs. The mapping table needs maintenance. Build it with a fallback "unknown SKU" bucket so unknown line items don't silently disappear.
- **Single-region BigQuery datasets only (initially).** Multi-region datasets and cross-project queries are out of scope for v1.

## Dependencies

- **Provider onboarding wizard (existing, shipped 2026-04-28):** the credential setup screen needs a "Continue to Billing Export" branch; trivial extension.
- **Sync use case + per-client lookback (existing, shipped 2026-04-28):** the new client plugs in as a sibling to `vertexUsageClient` and `geminiUsageClient` with its own `firstSyncLookbackMs`.
- **Dedup key (existing):** unchanged — the mechanism already handles cross-source reconciliation.
- **Service account from existing Vertex/Gemini integration:** reuse it. Add the `bigquery.dataViewer` role to the same SA the user already configured.

## Why Now / Why Later

This is a Tier 3 feature — operational foundation, not differentiating intelligence. Google-heavy users feel the 42-day cap acutely; non-Google users don't. Build it after circuit breakers and the cost simulator (Tier 2) unless adoption signals show that the 42-day cap is actively blocking deals.
