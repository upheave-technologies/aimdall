# Feature Roadmap

## Sequencing Rationale

Features are ordered by a combination of three factors:

1. **Immediate user impact** -- How much pain does this eliminate right now? Can the current user act on this today?
2. **Value amplification** -- Does this feature make existing data dramatically more useful?
3. **Dependency chain** -- Does this feature unlock or enhance other features?

The ordering reflects a deliberate strategy: lead with intelligence that transforms existing data into actionable insight (recommendations, attribution UX), then layer in enforcement and simulation capabilities that are genuinely novel (circuit breakers, cost simulation), and finally add operational infrastructure (notifications, onboarding, open-source estimation).

Smart Recommendations and Attribution Reimagined come first because the data warehouse is already full of usage data sitting idle. These features extract maximum value from what already exists — no new infrastructure required, no external API integrations, no new permissions. The user gets immediate, tangible returns from their existing setup.

Circuit Breakers and the Model Cost Simulator are powerful differentiators, but they require new provider API integrations (admin key management, additional permissions) and introduce operational complexity (enforcement failures, key recovery). Build the intelligence layer first so users understand their spend deeply, then give them the tools to control and optimize it.

---

## Tier 1: Intelligence Layer (P0)

These features transform raw data into actionable insight. They make the existing data dramatically more valuable with zero additional setup.

| # | Feature | Why First |
|---|---------|-----------|
| 3 | [Smart Recommendations](03-smart-recommendations.md) | The data warehouse is full of patterns nobody is seeing. Recommendations surface specific, dollar-denominated actions: "save $2,800/month by moving 40% of GPT-4o requests to GPT-4o-mini." Passive data becomes proactive advice. No new infrastructure needed — just analysis of what's already being tracked. |
| 4 | [Attribution Engine Reimagined](04-attribution-reimagined.md) | The attribution engine is the most powerful feature we have, but nobody uses it because setup is too hard. Templates, auto-discovery, and coverage visibility make it accessible in under 2 minutes. Once attribution works, every other feature (budgets, recommendations, reports) becomes 10x more useful because you can answer "which team?" not just "how much?" |

## Tier 2: Competitive Moat (P1)

These features create capabilities that no competitor offers in this form. They justify the product's existence to the broader market.

| # | Feature | Why Here |
|---|---------|----------|
| 1 | [Circuit Breakers](01-circuit-breakers.md) | Only cost tool that can actually *stop* overspend, not just report it. Transforms budgets from passive tracking into active enforcement. No competitor does this. Requires new provider API integrations (admin keys, IAM permissions) — builds on the understanding users develop in Tier 1. |
| 2 | [Model Cost Simulator](02-model-cost-simulator.md) | Turns historical data into forward-looking decisions. Every team wonders "what if we switched models?" — this answers it with real numbers. Pairs naturally with Smart Recommendations (which identify *what* to optimize; the simulator shows *exactly how much* each alternative costs). |

## Tier 3: Operational Foundation (P2)

These features fill infrastructure gaps. They're necessary but not differentiating on their own.

| # | Feature | Why Last |
|---|---------|----------|
| 5 | [Alert Delivery](05-alert-delivery.md) | Budgets and anomalies are useless if nobody sees them in time. Slack + email delivery makes everything in Tier 1-2 actionable. Deferred because the features it notifies about should exist first. |
| 6 | [Provider Onboarding](06-provider-onboarding.md) | Critical for adoption beyond the current user, but the current user already has providers configured via env vars. The "5 minutes to value" onboarding story is killer — but only after there's enough value to justify the first 5 minutes. |
| 7 | [Open Source Cost Estimation](07-open-source-estimation.md) | Useful reference data but inherently approximate. Lower priority because it's comparative information, not operational capability. No dependency on other features. |

---

## Dependency Graph

```
Smart Recommendations -------> Model Cost Simulator (shares cost comparison logic)
                        \
Attribution Engine ----------> Alert Delivery (per-group alerts)
                        \
Circuit Breakers ------------> Alert Delivery (breach notifications)
                        \
Provider Onboarding (standalone, but benefits from everything above)
Open Source Estimation (standalone)
```

Smart Recommendations and Attribution Reimagined are independent of each other and can be built in parallel. Circuit Breakers depend on the existing budget system. The Model Cost Simulator shares calculation logic with recommendations. Alert Delivery depends on circuit breakers and budgets producing events worth notifying about. Everything else is independent.
