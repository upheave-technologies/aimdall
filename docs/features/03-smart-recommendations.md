# Smart Recommendations / Cost Optimization Engine

> Priority: P0
> Impact: Very High
> Status: Scoped

## Intent

Users see their spend data but don't know what to *do* about it. The recommendations engine analyzes usage patterns and surfaces specific, actionable suggestions to reduce cost -- things the user could act on today but would never discover on their own by staring at dashboards.

## Value

Instead of "you spent $15,000 last month" (which every cost tool tells you), Aimdall says: "You could save $2,800/month by switching 40% of your GPT-4o requests to GPT-4o-mini -- these are requests with fewer than 500 output tokens where a smaller model is likely sufficient" and "$420/month by investigating your Anthropic cache hit rate, which is 12% vs. the 40%+ typical for repetitive workloads."

The user goes from "I know I'm spending a lot" to "here are 4 things I can do this week to spend less, ranked by savings potential." This is the difference between a dashboard and an advisor.

## Goal

- Every recommendation includes a specific dollar savings estimate based on the user's actual data.
- Recommendations are ranked by potential savings (highest first).
- Each recommendation is actionable: the user should know exactly what to investigate or change.
- Zero misleading recommendations: we never suggest quality tradeoffs we can't evaluate. Every recommendation is based on observable usage patterns, not assumptions about the user's workload.

## Functionality

### Recommendation Categories

The system generates recommendations from the following analysis patterns. Each runs against the user's actual usage data and produces recommendations only when the data supports them.

**1. Model Tier Optimization**

Analyze token volume distributions per model. When a significant percentage of requests to an expensive model have low output token counts (configurable threshold, e.g., under 500 output tokens), recommend evaluating whether a cheaper model in the same service category could handle those requests.

What the user sees: "42% of your GPT-4o requests produce fewer than 500 output tokens. These cost $4,200/month. If these workloads are suitable for GPT-4o-mini, the same volume would cost $420/month (90% savings). Review these workloads to assess if a smaller model is appropriate."

Note: We explicitly frame this as "evaluate" and "review" because we cannot know if the cheaper model will produce acceptable quality for those specific use cases.

**2. Cache Utilization**

Compare the ratio of cached input tokens to total input tokens. When cache hit rates are significantly below expected benchmarks for providers that support caching, flag the opportunity.

What the user sees: "Your Anthropic cache hit rate is 12%. For workloads with repetitive system prompts or context, cache hit rates of 40%+ are common. Improving prompt structure to maximize cache reuse could reduce input token costs by up to $X/month."

This recommendation only appears for providers/models that support prompt caching, and only when the data shows caching is being used but at low rates (not when caching isn't used at all -- that's a different signal).

**3. Batch API Opportunity**

Identify usage patterns that are candidates for batch processing: high-volume, consistent daily patterns, or usage that occurs during off-peak hours. Compare on-demand pricing with batch pricing for those models.

What the user sees: "You have 12,000 requests/day to Claude Sonnet on the on_demand tier. Batch tier pricing for this model is 50% cheaper. If even half of these requests can tolerate batch latency, you'd save approximately $X/month."

Only generated for models that have batch tier pricing in the rate card.

**4. Dormant Credentials**

Identify API keys that haven't generated any usage in a configurable period (e.g., 30+ days). Dormant keys are a security risk and a cleanup opportunity.

What the user sees: "API key sk-...abc7 (labeled 'Staging Deploy Key') hasn't been used in 47 days. Consider revoking it if it's no longer needed."

This isn't a cost savings recommendation directly, but it's a security/hygiene recommendation that users consistently value.

**5. Context Tier Analysis**

For providers that charge differently for extended context (e.g., Anthropic's extended thinking tier), analyze what percentage of usage is on the more expensive tier and whether the token volumes suggest the extended context is necessary.

What the user sees: "31% of your Claude Sonnet usage is on the extended context tier, which costs 25% more per token. X% of those requests used fewer than 50K input tokens, which fits within the standard context window. Reviewing whether these requests need extended context could save $X/month."

**6. Provider Concentration Risk**

When a high percentage of total spend (e.g., 85%+) goes to a single provider, flag the concentration. This isn't a direct cost saving but is operationally important.

What the user sees: "92% of your LLM spend ($13,800 of $15,000) goes to Anthropic. Consider whether distributing across providers would reduce risk from rate limits, outages, or pricing changes."

### Recommendations Dashboard

A dedicated view showing all active recommendations, sorted by estimated savings (highest first). Each recommendation card shows:

- Category icon and title
- One-paragraph explanation with specific numbers
- Estimated monthly savings (or "Security" / "Risk" label for non-cost recommendations)
- Confidence indicator: "Based on 30 days of data" / "Based on 90 days of data"
- Dismiss action (user can hide recommendations they've reviewed and decided not to act on)
- Link to the relevant explorer view pre-filtered to the data that generated the recommendation

### Recommendation Freshness

Recommendations are recalculated after each data sync (not on every page load). The dashboard shows when recommendations were last updated. Dismissed recommendations don't reappear unless the underlying data changes significantly (e.g., a dormant key becomes active again, or the cache hit rate changes by more than 10 percentage points).

## Constraints

- **No quality assessment.** We cannot tell users whether switching to a cheaper model will degrade their output quality. Every model-switching recommendation must include explicit language that quality evaluation is the user's responsibility.
- **No prompt analysis.** We have no access to actual prompts, system messages, or response content. Recommendations about caching and context window usage are based on token volume patterns, not prompt inspection.
- **No real-time data.** Recommendations are based on historical billing data with inherent delay (minutes to hours depending on provider). They reflect patterns, not live state.
- **Savings estimates are upper bounds.** "You could save up to $X" -- not "you will save $X." The actual savings depend on whether the user can act on the recommendation without quality or operational impact.
- **Benchmark data is approximate.** Figures like "40%+ cache hit rate is typical" are based on published benchmarks and industry knowledge, not measured from the user's specific workload type. These should be presented as reference points, not guarantees.

## Dependencies

- **Usage data and explorer infrastructure (existing)**: Token volume distributions, cache metrics, request patterns, and credential activity are all derivable from existing usage records.
- **Pricing tables (existing)**: Rate card comparisons for model tier and batch opportunity calculations.
- **Model Cost Simulator (Feature 2, partial)**: The model tier optimization recommendation shares calculation logic with the simulator. The recommendation engine can reference the simulator for detailed comparisons.
