# PRD: GCP Billing Export Provider — Authoritative Cost + Per-Key Attribution for Gemini & Vertex AI

- **Feature ID:** 5
- **Module:** cost-tracking
- **Status:** Draft
- **Created:** 2026-04-29
- **Updated:** 2026-04-29

---

## Problem Statement

Aimdall already supports Google as a provider through the Cloud Monitoring metrics API. That path has hard, structural limitations that make accurate cost reporting for Google AI usage impossible:

- **AI Studio (Gemini API) gives almost nothing useful in dollar terms.** Cloud Monitoring exposes request counts per API key for the Generative Language API, but no token counts and no model-level breakdown. There is no path from Cloud Monitoring metrics to a defensible dollar figure.
- **Vertex AI dollar estimates are brittle.** Some token metrics exist, but model-to-cost mapping depends on Aimdall maintaining its own pricing catalog. SKUs change. Discounts (committed use, sustained use, promotional credits) are invisible to us. Our number is always an estimate, never the truth.
- **Customers do not trust estimates for finance reporting.** A user looking to reconcile their Aimdall dashboard with Google's invoice currently cannot.

Google's own Cloud Billing Export to BigQuery is the authoritative source: it is the same data Google bills the customer from. Bringing it in solves the dollar-accuracy problem at the root.

**But Billing Export alone is not enough for our target users.** Many Aimdall users run **multiple Gemini API keys inside the same GCP project** — one per team, product, or environment — and need to attribute spend to a specific key. Cloud Billing Export does not carry API-key identity; it aggregates at project + SKU level. The only signal that ties activity to a specific API key is Cloud Monitoring's `credential_id` label.

This means the right architecture is **dual-source**, not a replacement:

- **Cloud Billing Export → BigQuery** = authoritative dollars. Project + service + SKU + day granularity. Daily refresh, 24–48h lag.
- **Cloud Monitoring** (existing Vertex + Gemini providers) = request volume per API key. Hourly, near real-time. The only source of per-key identity for AI Studio.

Each source answers a question the other cannot. The product must keep both, present them coherently, and never pretend one substitutes for the other.

This is **not** a general GCP billing feature. The user wants accurate AI spend with key-level attribution. Compute, Storage, Networking, BigQuery, and the rest of GCP are explicitly out of scope, even though Billing Export contains all of it.

## Business Goals

1. **Authoritative AI cost for Google.** Replace estimated, metric-derived dollar amounts for Vertex AI and Gemini API with the exact dollar amounts Google bills the customer. Project + SKU totals must reconcile with Google's invoice.
2. **Answer the per-API-key cost question for Gemini users.** Users with multiple Gemini API keys in one project must be able to see, with appropriate caveats, which key is driving spend. This is a first-class goal, not a side benefit. It requires both sources working together.
3. **Make Gemini API (AI Studio) usage trackable in cost terms at all.** Today it is effectively unmeasured. The combination of Billing Export (real dollars per SKU) and Cloud Monitoring (per-key request share) gives the first usable Gemini API cost picture in the product.
4. **Stay inside the AI lane.** Both sources scope strictly to AI services. Non-AI GCP spend is never ingested, summed, or surfaced.

## User Personas

**The Cost Administrator (primary).** Operates a Google Cloud account running Vertex AI workloads, Gemini API calls, or both, often with several API keys in one project for different teams or products. Has, or can request, the privilege to enable Cloud Billing Export and grant a service account read access to the resulting BigQuery dataset. Goal: see real, invoice-grade dollars for AI spend in Aimdall, with enough breakdown — including per-key — to act on.

**The Finance/Ops Reviewer (secondary).** Reads Aimdall dashboards to validate AI spend before allocating it, charging it back, or signing off on it. Cares specifically that the headline number matches Google's invoice line items, and that any per-key breakdown is honest about its derivation.

## Use Cases

The questions this provider must let users answer:

1. **"How much did we spend on Vertex AI vs. Gemini API last month?"** Service-level split, in real dollars, that ties out to Google's bill. (Billing Export.)
2. **"Which Gemini / Vertex SKU is driving our cost?"** SKU-level breakdown — e.g., Gemini 2.5 Pro input tokens vs. output tokens vs. context caching, Vertex AI online prediction vs. batch. (Billing Export.)
3. **"Which of our Gemini API keys is driving cost?"** Per-key attribution within a project for Gemini API spend — even if approximate. (Billing Export × Cloud Monitoring.)
4. **"How is AI cost trending?"** Daily spend trend over the user-selected period.
5. **"Which GCP project is incurring AI cost?"** Per-project breakdown for users with dev/staging/prod or per-team projects.
6. **"Do credits or discounts change the picture?"** The dashboard cost must reflect net cost (after credits and discounts), because that is what the user actually pays.

## Cost Attribution Model — Design Decision for the PRD

The two sources answer different questions and do not naturally compose:

- Billing says: *"Project upheave-main spent $400 on Gemini 1.5 Pro yesterday."*
- Monitoring says: *"API key A made 60% of Gemini requests, key B made 30%, key C made 10%."*

Three options were considered:

**(a) Proportional allocation as the only number.** Multiply Billing $ by Monitoring's per-key request share to produce per-key dollar estimates. Simple, but inaccurate when keys use different models or token volumes (a key making few but very long requests gets undercounted). And it presents a derived number with no caveat — the user will treat it as truth.

**(b) Two coexisting views, never combined.** A "Cost" view sourced purely from Billing (project/service/SKU/day), and a separate "Key activity" view sourced purely from Monitoring (per-key request counts, no dollars). The user mentally bridges them. No fake precision, but the per-key cost question is only answered by inference.

**(c) Hybrid: per-key estimate with explicit caveat.** Proportional allocation as the headline per-key number, but every per-key dollar figure is labelled "estimated" with a tooltip explaining the allocation method. Authoritative project + service + SKU totals always reconcile with the invoice; per-key breakdowns are flagged as derived.

**Recommended option: (c) Hybrid with explicit caveat.**

Reasoning:
- The user explicitly came to us to answer "which key is costing me money." Refusing to provide that answer (option b) fails the primary use case for multi-key users, even if it is the most technically pure stance.
- Option (a) gives the answer but lies about its certainty. That is worse than refusing — it erodes trust the moment a user tries to reconcile a per-key number with anything else.
- Option (c) gives the answer where it can be derived, is explicit that it is derived, and never lets a derived per-key number pollute the totals that must reconcile with Google's invoice. The "estimated" label is not a UI nicety — it is a hard requirement: any per-key dollar figure must be visually and structurally distinguishable from billing-grade dollars.

Two structural rules that fall out of this:

- **Authoritative totals never include per-key estimates.** Project totals, service totals, SKU totals, and time-series totals are sourced from Billing Export only. Adding them up never relies on the allocation.
- **Per-key dollar estimates are only shown when both signals exist for the same project + service + day window.** If Billing data exists but Monitoring data does not (or vice versa), the per-key dollar view shows a clear empty state explaining what is missing — never a partial estimate.

This recommendation is the PRD's stated direction. The RFC may revise it with new evidence, but the bar to deviate is high.

## User Journeys

### Journey 1: First-time connection (happy path)

1. User goes to the providers screen and sees the GCP Billing Export option, distinct from the existing Google Cloud Monitoring option.
2. The wizard opens with a clear explainer: what Cloud Billing Export is, what it gives (authoritative dollars), what it does not give (per-API-key attribution), and why Cloud Monitoring stays useful alongside it. The historical-data warning (Journey 5) is surfaced up front.
3. User provides: BigQuery dataset path (project, dataset name), billing account ID, and a service account credential. If a Google service account is already on file from a Cloud Monitoring connection, the wizard offers to reuse it and explains the additional roles needed.
4. The wizard validates the connection: the dataset is reachable, the expected Detailed Export table exists, and the service account can read it.
5. If validation passes, the connection saves and the first sync begins. The dashboard shows a clear "syncing" state for the new provider.
6. As sync completes, AI cost from Billing Export appears on the dashboard. If a Cloud Monitoring connection for Google also exists, per-key views are populated. If not, the wizard prompts the user to consider adding Cloud Monitoring (Journey 2).

### Journey 2: User has Billing Export but not Cloud Monitoring (multi-key context)

The user finishes Billing Export onboarding. The dashboard renders authoritative cost. But when they navigate to a per-key view, they see an explicit empty state, not a misleading number.

1. The empty state says, in plain language: *"Per-API-key attribution requires Cloud Monitoring. Billing Export gives us the dollars; Cloud Monitoring tells us which of your API keys is doing the work. Connect Cloud Monitoring to see this breakdown."*
2. A direct link to the Cloud Monitoring connection wizard is provided.
3. Authoritative views (project, service, SKU, time-series) are unaffected — they render fully from Billing Export alone.

The user is never silently denied per-key data; they are told what to do to get it.

### Journey 3: User has Cloud Monitoring but not Billing Export

This is the existing world before this feature. Onboarding for Cloud Monitoring (Vertex / Gemini) is unchanged. The Cloud Monitoring connection screens should, as part of this feature, gain a soft prompt: *"For accurate dollar amounts (not estimates), connect Cloud Billing Export."* This is informational, not blocking.

### Journey 4: Validation fails — graceful recovery

The user provides a dataset path that points to a Standard Export (not Detailed), or to a dataset where the SA has no access, or where Export was never enabled.

1. The wizard reports the specific failure in plain language ("This looks like a Standard Export — Aimdall needs Detailed Export to break down AI spend by SKU"; "The service account cannot read this dataset — please grant BigQuery Data Viewer"; "We could not find a billing export table — has Cloud Billing Export been enabled on this billing account?").
2. The wizard does not save a broken connection. The user fixes the underlying GCP setup and retries.
3. No exposure of raw error messages, error codes, or HTTP statuses to the user.

### Journey 5: Understanding the historical-data limitation up front

This must happen before the user finishes onboarding, not after.

1. The wizard prominently explains: Cloud Billing Export only contains data from the day it was enabled forward. There is no way to backfill. If Export was enabled today, today is day zero of the dataset.
2. The wizard surfaces — if technically discoverable — the export start date so the user knows what range of historical data they will and will not see.
3. The user acknowledges this before the connection is saved.

### Journey 6: Daily refresh

Once connected, Billing Export data refreshes automatically on a daily cadence. Yesterday's spend appears in Aimdall by the next day, with a 24–48h lag inherited from Google's own export. Per-key views update on the Cloud Monitoring cadence (near real-time for activity counts) but the dollar component of any per-key estimate only updates when Billing data lands.

### Journey 7: Reading the data on the dashboard

The user opens cost-tracking dashboards and the explorer. Two clearly distinguished tiers of information are presented:

**Authoritative (Billing Export):**
- GCP service — Vertex AI, Generative Language API
- SKU (model / operation level) — e.g., "Gemini 2.5 Pro Input Tokens"
- GCP project
- Day-level time-series
- Net cost in source currency (after credits and discounts)

**Derived (Billing Export × Cloud Monitoring), labelled "estimated":**
- Per-API-key cost share within a project + service + day window
- Per-API-key dollar estimate, with allowance method explained on hover

Every per-key dollar figure must carry an "estimated" indicator and a tooltip explaining how it was computed. Authoritative figures must never carry this indicator.

Both data tiers are honest about freshness — see R12.

## Functional Requirements

### R1: New provider type, distinct from Cloud Monitoring

Aimdall must support GCP Cloud Billing Export → BigQuery as a first-class provider type, separate from the existing Google Cloud Monitoring provider. A user can have either, both, or neither. The UI must clearly communicate what each one delivers and that they are complementary, not alternatives.

### R2: Connection wizard

The wizard is allowed to be longer and more thorough than other providers — friction is acceptable in exchange for getting GCP setup right. It must collect:

- BigQuery dataset path (GCP project ID and dataset name)
- Billing account ID
- A Google service account credential — either a new upload or reuse of an already-connected Google SA

It must explain, before the user finishes:
- The role of Billing Export (authoritative dollars) vs. Cloud Monitoring (per-key activity), and that connecting both is recommended for users with multiple API keys
- That Detailed Export (not Standard) is required, and how to verify
- The IAM roles the SA needs
- The historical-data limitation (no backfill)
- The 24–48h refresh lag
- That non-AI GCP spend will not be ingested or displayed

### R3: Connection validation

Before a connection is saved, the system must verify that:
- The dataset is reachable with the supplied credential
- The expected Detailed Billing Export table exists in that dataset for the supplied billing account
- The service account has sufficient permissions to read the table and run queries
- The export contains AI service rows (Vertex AI or Generative Language API). If neither is present after a reasonable lookback, the wizard warns the user that no AI cost will appear and confirms they want to continue.

Validation failures must produce specific, actionable, plain-language messages. No raw error codes or stack traces ever surface to the user.

### R4: AI-only ingestion (both sources)

Both data sources scope strictly to AI services. For Billing Export, queries must filter to:
- `service.description = "Vertex AI"`
- `service.description = "Generative Language API"`

The Cloud Monitoring providers (already filtered to Vertex / Gemini) remain similarly scoped. Non-AI services must never be ingested, never aggregated, never displayed, and never exposed via any UI surface.

### R5: Daily sync cadence (Billing Export)

The Billing Export provider syncs once per day on a schedule. Each sync pulls the latest available billing rows since the last successful sync watermark, plus a small overlap to handle Google's late-arriving data. A manual "sync now" remains available, with a note that fresher data than yesterday is structurally unavailable. Cloud Monitoring sync cadence is unchanged by this feature.

### R6: Backfill behavior on first connect

On first connect, the Billing Export provider pulls all AI-service rows from the start of the export up to the most recent available day. If the export is brand-new (started today), the dashboard will be empty for this provider until tomorrow's data lands. The wizard's day-zero warning makes this acceptable.

### R7: Cost dimensions captured (Billing Export)

Per row, the provider must capture at minimum:
- Date (day-level, derived from `usage_start_time`)
- GCP service (Vertex AI or Generative Language API)
- SKU description (carries model / operation identity)
- GCP project ID
- Net cost in the row's currency, after credits applied
- Source currency

### R8: Net cost reporting

The headline dashboard number must reflect cost **after** Google's credits and discounts. This is what makes the figure tie out to the invoice. Gross cost may be retained behind the scenes for diagnostics but is not the headline.

### R9: Cost attribution model — dual-tier presentation

The product must present cost data in two clearly distinguished tiers, per the design decision above:

- **Authoritative tier** (project / service / SKU / time): sourced from Billing Export only. Reconciles with Google's invoice. Never includes derived per-key allocations.
- **Derived tier** (per-API-key cost): produced by allocating Billing Export dollars across keys using Cloud Monitoring's per-key request share, scoped to the same project + service + day window. Every dollar figure in this tier must be visually marked as "estimated" with an accessible explanation of the allocation method.

Per-key dollar figures are only computed and displayed when both Billing Export and Cloud Monitoring data exist for the relevant project + service + day window. When Monitoring data is missing for that window, the per-key view shows an empty state explaining what is needed — never a partial or guessed number.

### R10: Source provenance is recoverable

For each cost figure shown, the user must be able to determine:
- Which source(s) it came from (Billing Export, Cloud Monitoring, or a derived combination)
- Whether it is authoritative or estimated
- When it was last refreshed

The exact UI mechanism (badge, tooltip, side panel) is a design call, but the information must be recoverable on every cost surface.

### R11: De-duplication of Google cost across sources

A user with both Cloud Monitoring (Google) and Billing Export connected for the same GCP account must never see double-counted Google AI cost in any total. Authoritative cost totals come from Billing Export; Cloud Monitoring's estimated dollar amounts (the existing Vertex / Gemini cost rows) must be suppressed from cost aggregations once Billing Export is validated for the same account, while Cloud Monitoring's request-volume signal continues to drive per-key attribution.

### R12: Freshness indicators per source

Every dashboard surface must communicate, per data source, when it was last updated and what its expected lag is:
- Billing Export: 24–48h lag, daily refresh — "as of [date]" indicator.
- Cloud Monitoring: near real-time activity, lag in minutes — separate indicator.
- Derived per-key estimates: bounded by the slower of the two — must be honest about the Billing Export lag.

The user should never be misled into reading "today's date with no Vertex spend" as "we did not use Vertex today."

### R13: Integration with existing dashboards

Authoritative Billing Export AI cost flows into the same dashboards, explorer, and reports as other providers' cost. Per-key estimates are surfaced on the per-key views and anywhere else key-level breakdowns are exposed, always with the "estimated" marker. The user gets one cost view, with the source/derivation tier always discoverable.

## Non-Functional Requirements

### Query cost containment

BigQuery charges roughly $5 per TB scanned. Every query Aimdall issues against the export table must:
- Apply a partition filter on the export table's partition column so only the requested days are scanned. Unbounded queries are forbidden by construction.
- Apply the AI-service filter (R4) at the query level, not in post-processing.
- Be bounded by sync watermark + overlap window on incremental syncs.

The system should track an estimate of bytes scanned per sync so runaway query cost can be detected. A practical ceiling is desirable; the exact number is for the RFC.

### Security

The Google service account credential is a long-lived secret with read access to the customer's billing data. Storage, access controls, and log redaction must match the existing Cloud Monitoring service account credential. Reusing the existing Google SA storage path is preferred over inventing a new one.

### Failure handling

Sync failures (auth, quota, transient BigQuery errors) must:
- Not corrupt the existing dataset
- Not block other providers' syncs (Cloud Monitoring continues independently)
- Surface a plain-language status on the provider screen
- Be retried on the next scheduled sync window without manual intervention

### Retention

Ingested billing rows persist with the same retention as other cost-tracking data. The data is commercially sensitive (customer's actual spend) and is treated as such.

## Schema Fit — Design Question for the RFC

The existing `cost_tracking_usage_records` table is shaped around request-level usage: request_count, input/output tokens, model slug, calculated_cost. Billing Export rows are fundamentally different shape:

- They carry **dollars directly**, computed by Google.
- They carry **no token counts** and **no request counts**. The SKU description encodes a model and an operation; usage amount is in tokens or characters or seconds depending on SKU.
- Granularity is daily aggregate per SKU per project, not per-request.

Two reasonable paths for the RFC to pick between:

**(a) Reuse `cost_tracking_usage_records` with a `cost_source` discriminator.** Billing rows go in with cost populated, request_count and token columns null, and a tag (`cost_source = 'billed'` vs `'computed'`). Pro: one table, one query path, instant integration with the explorer. Con: half the columns are semantically inapplicable to billed rows; aggregations must avoid mixing incompatible metrics.

**(b) Introduce a separate `cost_tracking_billed_records` table for $-only data.** Pro: each table internally consistent. Con: every "total AI cost" query must UNION across tables; the explorer's metric-adaptive logic gets more complicated.

**Inclination (not a decision):** Option (a) — reuse with `cost_source` — is likely the right answer. The dominant downstream operation is "sum cost over dimensions and time," which works identically on both row types. Token / request_count metrics are already context-adaptive in the explorer, so null columns on billed rows fit naturally. This recommendation is for the RFC's consideration, not a directive.

Note: the per-key allocation in R9 is a **derived view**, not a stored row type. It is computed at read time from authoritative billing rows joined against Cloud Monitoring activity counts. The schema decision above is about how to store ingested rows, not about materializing allocations.

## Out of Scope

**Explicitly NOT in this feature, by design:**

- **Real-time per-key dollar attribution.** Structurally impossible — Billing Export has a 24–48h lag and Cloud Monitoring carries no dollars. Per-key dollars are always at least a day delayed and always estimated. We will not pretend otherwise.
- **Exact per-key dollar attribution.** Even with both sources, the allocation is proportional to request share, not token share or actual model-specific cost. It is an estimate by construction. Anyone who needs invoice-grade per-key numbers must use a different mechanism (e.g., separate GCP projects per key) — that is a customer-side architectural choice, not a product gap we can close.
- **Non-AI GCP spend** of any kind. Compute Engine, Cloud Storage, Cloud SQL, BigQuery itself, networking, Kubernetes, etc., are never ingested, never displayed, never queryable.
- **Historical backfill before export was enabled.** Google does not provide it; Aimdall cannot invent it.
- **Per-request detail.** Billing rows are aggregates. If a user wants per-request data, they need the Cloud Monitoring path with its accuracy trade-offs.
- **AWS, Azure, or any other cloud's billing export.**
- **Budgets or alerts specific to Billing Export.** Existing budget/alert mechanisms apply because Billing Export rows show up as cost in the same dashboards.
- **Auto-enabling Cloud Billing Export on the user's behalf.** The user enables it in their GCP console. We validate and read.
- **Removing or deprecating the Cloud Monitoring providers.** They remain a first-class part of the system because they carry information Billing Export does not.

## Success Metrics

1. **Reconciliation:** A user who connects Billing Export and reads their Aimdall AI cost for any closed month sees a number matching Google's invoice for Vertex AI + Generative Language API for that month, within rounding.
2. **Coverage of Gemini API cost:** Users with AI Studio usage who today see effectively zero useful cost data should, after connecting Billing Export, see SKU-level Gemini API spend they can act on.
3. **Per-key answerability:** Multi-key Gemini users with both Billing Export and Cloud Monitoring connected can identify, for any given day, which API keys account for the largest share of project Gemini spend — even if the dollar number is labelled estimated.
4. **Honesty signal:** No user reports being surprised by a per-key dollar figure that "didn't add up" — because every per-key dollar figure carries the "estimated" label and the methodology tooltip up front.
5. **Query cost stays bounded:** Aimdall's BigQuery spend per connected customer per month stays well below the value the customer derives from accurate cost reporting. The RFC sets the target ceiling.

## Open Questions

1. **Schema strategy.** Reuse `cost_tracking_usage_records` with a discriminator (a) vs. dedicated `cost_tracking_billed_records` (b). Inclination: (a). Decision in RFC.

2. **Allocation window granularity.** Per-key allocation is computed over a project + service + day window. Should sub-day windows (hourly) be supported when both sources have data, to match Cloud Monitoring's natural granularity? Or is daily allocation always sufficient given Billing Export only refreshes daily? Inclination: daily-only in MVP — finer granularity adds complexity and the dollar source can't keep up anyway.

3. **Behavior when Cloud Monitoring connected first, then Billing Export added.** The existing Cloud Monitoring providers display their own (estimated) dollar amounts today. Once Billing Export is connected for the same account, R11 says those Cloud Monitoring dollars must be suppressed from totals. What is the user-facing transition? A silent swap? A migration banner explaining "we now have authoritative dollars, your cost numbers may shift slightly to match your invoice"? RFC + design call.

4. **Behavior when Billing Export connected first, then Cloud Monitoring added.** Per-key views go from empty-state to populated. Is there a notification ("per-key attribution is now available")? Or does it just light up silently? Probably silent with a subtle highlight, but worth confirming.

5. **What happens if Cloud Monitoring covers only some of the API keys active in a project?** E.g., user has Cloud Monitoring connected for one Gemini API key but other keys also exist in the same project. The Monitoring share will not sum to 100% of the project's actual usage. How is the residual surfaced — "unattributed" bucket? Hidden? RFC + design call. Inclination: explicit "unattributed" bucket so the user is not left wondering where the missing share went.

6. **Currency handling.** Cloud Billing Export rows carry their billing-account currency. For MVP it is acceptable to display in source currency with the currency code visible. A multi-currency normalization policy is deferred.

7. **Discoverability of export start date.** Whether we can programmatically detect the date on which a customer enabled Cloud Billing Export depends on what BigQuery exposes. If discoverable, surface it in the wizard. RFC to determine.

8. **SKU → model mapping.** Whether Aimdall maintains a normalization layer (mapping "Gemini 2.5 Pro Input Tokens" SKU → canonical model identifier shared with the Anthropic/OpenAI providers) or shows raw SKU strings in MVP. Inclination: raw SKU strings in MVP; normalize later only if it surfaces as real friction. This question also affects how cleanly per-key allocation can be done across SKU/model boundaries.

9. **Resource labels.** Billing Export's `labels` column sometimes carries useful context (model name, fine-tune ID) but is inconsistent across SKUs. Recommendation: ignore labels in MVP, revisit once we see real customer data.

10. **Reaction when Detailed Export is not enabled.** The wizard refuses the connection. Should the product also offer a guided GCP-console walkthrough? UX investment question, not a correctness question. Out of scope unless explicitly added.
