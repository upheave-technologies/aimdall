# Aimdall — Product Assessment & Market Analysis

> Date: 2026-04-21
> Status: Initial assessment

---

## What We've Built

A multi-provider LLM cost warehouse that pulls from OpenAI, Anthropic, and Vertex AI billing APIs, normalizes the data into a unified schema, and presents it through 6 dashboard pages (home, explore, budget, report, attributions, alerts). No proxy, no SDK wrapper, no latency impact. Pure billing API ingestion.

---

## Would Someone Pay For This?

**Today? No.** Here's why:

1. **No auth.** Anyone with the URL sees everything. You can't sell a tool that has zero access control, zero multi-tenancy, zero org isolation. This is table-stakes, not a feature.

2. **No notifications.** Budgets have alert thresholds in the schema but no delivery mechanism. A budget tool that can't email/Slack you when you're at 90% is a dashboard, not a tool. Dashboards don't change behavior.

3. **No enforcement.** Budgets are "tracking only" — there are no circuit breakers. The #1 user pain point is bill shock ($2,000 surprise bills). Your tool would let someone *watch* themselves get bill-shocked in real-time, which is worse than not knowing.

4. **Single tenant only.** Can't onboard multiple companies. Can't even onboard multiple teams within one company with different access levels.

5. **No onboarding.** Adding providers requires env vars and manual config. No OAuth flow, no guided setup, no "connect your OpenAI org in 2 clicks."

---

## What's Actually Interesting (Secret Sauce)

### 1. No-proxy architecture

This is genuinely differentiated. Every competitor (Helicone, Portkey, LiteLLM) requires routing API traffic through their proxy — adding 50-200ms latency and becoming a single point of failure. Users on HN and Reddit *hate* this. We pull directly from billing APIs. Zero latency impact. Zero SPOF. This is a real, defensible advantage.

### 2. The attribution rule engine

The `cost_tracking_attribution_rules` table with regex/prefix/exact/in_list matching across arbitrary dimensions (credential, model, segment, service tier, region) with priority-based conflict resolution — this is sophisticated. Most competitors give you "cost by API key" and call it attribution. We can map "all Claude models used by credential X in region us-east-1 → Marketing team" with a single rule. The market research shows cost-per-team/feature/customer attribution is the **#1 most requested feature** that nobody does well.

### 3. The data model is enterprise-grade

SHA-256 dedup keys, soft deletes, time-boxed pricing with region/tier variants, incremental sync cursors, audit logs. This isn't a weekend project schema — it's built for reconciliation at scale. Most competitors don't even attempt pricing versioning.

### 4. Historical backfill without instrumentation

Because we pull from billing APIs (not a proxy), we can analyze *past* spend that happened before the tool was installed. "I didn't have a tracking tool last month but I need to understand my costs" — nobody else does this. It's a killer onboarding story.

---

## Competitive Landscape

### Dedicated LLM Observability / Cost Tracking

| Tool | Focus | Pricing Model |
|------|-------|---------------|
| **Helicone** | Open-source LLM proxy; logging, cost tracking, caching | Free tier + usage-based (~$20-120/mo for teams) |
| **LangSmith** (LangChain) | Tracing, evaluation, prompt management | Free tier, Plus ~$39/seat/mo, Enterprise custom |
| **Portkey** | AI gateway; routing, cost tracking, fallbacks | Free tier, Growth ~$49/mo, Enterprise custom |
| **Keywords AI** | LLM monitoring dashboard; cost per user/feature | Free tier, paid ~$40-100/mo |
| **OpenPipe** | Fine-tuning + cost reduction | Pay per fine-tuned model inference |
| **Lunary** | Open-source LLM observability; traces, cost, eval | Free self-hosted, cloud ~$30/mo+ |
| **LiteLLM** | Open-source proxy; unified API across 100+ providers | Free (OSS), Enterprise hosted version |
| **Langfuse** | Open-source tracing and analytics for LLM apps | Free self-hosted, cloud free tier + paid |
| **Braintrust** | Eval + logging platform | Free tier, paid for teams |

### Adjacent / Broader Platforms

| Tool | Focus |
|------|-------|
| **Datadog LLM Observability** | Extension of their APM; traces LLM calls |
| **Weights & Biases (Prompts)** | ML experiment tracking extended to LLM prompts |
| **Arize / Phoenix** | ML observability extended to LLM evaluation |

### Pricing complaints (from real users)

- "Per-seat pricing doesn't make sense for observability. I want the whole team to see dashboards without paying $39/seat x 20 people." (LangSmith)
- "Usage-based pricing for an observability tool means the tool gets more expensive exactly when my AI costs are already spiking. Double penalty." (Helicone, Portkey at scale)
- "Datadog's LLM observability is just another line item on our already-insane Datadog bill."

---

## Real User Pain Points (Reddit, HN, Twitter)

### About existing tools

- **"Yet another SDK wrapper."** Many users express fatigue at tools that are thin wrappers around OpenAI's API.
- **"Helicone/Portkey add latency."** Proxy-based tools add 50-200ms per request. Unacceptable for latency-sensitive applications.
- **"LangSmith is tightly coupled to LangChain."** Users who don't use LangChain feel locked out.
- **"Vendor lock-in anxiety."** Routing all API traffic through a third-party proxy means the proxy becomes a SPOF.
- **"Pricing is opaque for observability tools."** At production scale (millions of requests), these tools become surprisingly expensive.
- **"Self-hosted options are half-baked."** Langfuse and Lunary self-hosted are difficult to set up, lack features, have poor docs.

### About provider billing itself

- **"OpenAI billing is a black box."** Usage dashboard updates with hours of delay, doesn't break down by API key granularly enough.
- **"Anthropic has no usage API."** (as of early 2025) Minimal tracking — monthly invoice but no real-time breakdown.
- **"I got a $2,000 bill I wasn't expecting."** Bill shock stories are extremely common. Misconfigured loops, prompt injection causing recursive calls.
- **"Google Vertex AI billing is incomprehensible."** Costs buried in GCP billing console, mixed with compute costs.
- **"Azure OpenAI billing is completely separate from OpenAI direct."** No unified view.

### Top pain points managing multi-provider costs

1. **No unified dashboard across providers.** #1 complaint. Each provider has its own billing console with different update frequencies, granularity, and data models.
2. **Token counting is inconsistent.** Different providers count differently (especially images, tool calls, system prompts).
3. **Attribution is nearly impossible.** "I spent $5,000 on Claude last month, but which feature? Which team? Which customer?"
4. **No proactive alerts that actually work.** OpenAI limits are soft caps. Anthropic had no programmatic spending controls.
5. **Caching savings are invisible.** Can't measure how much prompt caching actually saves.
6. **Cost of switching providers is unknown.** "If I move this workload from GPT-4o to Claude, what would it cost?"
7. **Batch vs. real-time cost differences are confusing.**

---

## Features People Wish Existed But Don't

1. **Cost-per-feature / cost-per-customer attribution.** No tool does this well out of the box.
2. **Automated model downgrade suggestions.** "This prompt gets the same quality from Haiku as it does from Opus — switch and save 90%."
3. **Budget enforcement (hard limits) per team/project/feature.** Not just alerts — actual circuit breakers.
4. **Cost forecasting / projection.** "Based on our growth rate, what will AI spend be in 3 months?"
5. **Waste detection.** "You're sending 4,000 tokens of system prompt on every request but only using 20% of the instructions."
6. **Provider-agnostic cost normalization.** Normalize to "cost per equivalent output quality."
7. **Integration with financial systems.** Export to CloudHealth, Kubecost, QuickBooks, NetSuite.
8. **Replay and what-if analysis.** "Replay last month's traffic against Claude 3.5 Sonnet pricing."

---

## The Gaps That Matter (Ranked by Impact)

| # | Gap | Why It Matters | Difficulty |
|---|-----|---------------|------------|
| 1 | **No auth / multi-tenancy** | Can't sell, can't demo, can't share | High but we have IAM/identity packages already |
| 2 | **No alert delivery** | Budgets without notifications are useless | Medium — Slack webhook + email is a weekend |
| 3 | **No provider onboarding UI** | First-run experience is "edit .env" | Medium |
| 4 | **No cost optimization recommendations** | Show costs but not how to reduce them | High — this is the golden feature nobody has |
| 5 | **No model comparison / what-if** | "What would this cost on Claude vs GPT?" | Medium — we have the pricing data already |
| 6 | **No Azure OpenAI** | Enterprises use Azure, not OpenAI direct | Medium — similar API patterns |
| 7 | **No AWS Bedrock** | Same — enterprise provider | Medium |
| 8 | **Forecasting is linear extrapolation** | Not useful beyond "multiply by days left" | Medium-High for real ML |
| 9 | **No financial system export** | CFOs need this in their existing FinOps tools | Low — CSV/API export |
| 10 | **No cache savings visibility** | Teams can't measure ROI of prompt caching | Medium — we track cached tokens already |

---

## The Opportunity

The market research reveals a clear gap: **there is no "CloudHealth/Kubecost for AI."** Every existing tool is built for developers. Nobody builds for the FinOps team, the engineering manager, or the CFO.

Our building blocks are well-positioned for this:

- **No-proxy = sell to security-conscious enterprises** (regulated industries won't route traffic through third parties)
- **Attribution engine = sell to multi-team orgs** ("which team is burning $50K/month?")
- **Historical backfill = instant time-to-value** ("see your last 90 days of spend in 5 minutes, no code changes")
- **Pricing versioning = accurate cost calculation** when providers change rates (which they do constantly)

The SMB segment ($5K-50K/month AI spend, 10-50 person teams) is completely underserved. Too big for free tiers, too small for enterprise sales. Flat-rate pricing with whole-team access would be a market-positioning win — every competitor charges per-seat or per-request, which users vocally hate.

---

## What To Build Next (Strategic Phasing)

### Phase 1 — Make it sellable

- Auth + multi-org (we have IAM/identity packages sitting unused)
- Slack/email alert delivery
- Provider OAuth onboarding flow ("Connect OpenAI" button)
- CSV/PDF export for finance teams

### Phase 2 — Make it unique

- **Cache savings calculator**: "Your prompt caching saved $X this month" (we already track cached tokens — just surface the delta)
- **Model migration simulator**: "Replay last month on Claude 3.5 Haiku → would cost $Y instead of $Z" (we have the pricing tables and usage data)
- **Waste detection**: Flag credentials/keys with zero usage, models being used at premium tier when standard tier produces equivalent results
- **Hard budget enforcement**: Webhook that hits a customer's API gateway to revoke/throttle keys when budget exceeded

### Phase 3 — Make it a platform

- Financial system integrations (QuickBooks, NetSuite, existing FinOps tools)
- Custom dashboards / embeddable widgets
- API access for programmatic cost queries
- AWS Bedrock + Azure OpenAI providers

---

## Bottom Line

We have strong infrastructure and a genuinely differentiated architecture (no-proxy, attribution engine, historical backfill). But we've built the warehouse without the storefront. The data model is enterprise-grade; the user experience is prototype-grade.

The secret sauce isn't any single feature — it's the combination of **no-proxy + attribution + historical backfill**. That trio doesn't exist anywhere in the market today. But none of it matters without auth, notifications, and a 5-minute onboarding flow.

The biggest risk isn't a competitor building this — it's that OpenAI/Anthropic/Google eventually build decent native dashboards and the bottom falls out of basic cost visibility. Our moat needs to be in **attribution, optimization, and financial integration** — things the providers will never build because it spans their competitors.
