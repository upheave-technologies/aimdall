# Model Cost Simulator / What-If Engine

> Priority: P1
> Impact: Very High
> Status: Scoped

## Intent

Teams constantly ask "would it be cheaper to use a different model?" but have no way to answer without running a costly experiment. The simulator uses existing usage data and pricing tables to show exactly what historical usage would have cost under different model, tier, or provider configurations -- turning a guessing game into a data-driven decision.

## Value

An engineering manager sees $12,000/month in Claude Sonnet spend. They wonder if GPT-4o-mini would be cheaper for their high-volume, low-complexity workloads. Today, answering this requires: manually looking up pricing for both models, estimating token ratios, accounting for cached vs. uncached input, batch vs. on-demand tiers, and doing the math across thousands of usage records. Nobody does this.

With the simulator, they select their actual usage data, pick an alternative model, and see: "Your 850,000 requests to Claude Sonnet cost $12,340 last month. The same token volume on GPT-4o-mini would cost $1,890 (84.7% savings)." Done in 10 seconds.

This also enables provider migration analysis: "What would all our Anthropic usage cost on OpenAI, model by model?" -- an answer that currently requires a spreadsheet and hours of manual work.

## Goal

- A user can compare the cost of any historical usage period against one or more alternative models in under 30 seconds.
- The simulator produces accurate cost calculations using the same pricing engine that powers regular cost tracking.
- Users understand that this is a cost comparison only -- we explicitly do not predict quality, latency, or capability differences.
- Provider migration scenarios (all usage from provider A re-priced under provider B's models) are supported.

## Functionality

### Single Model Comparison

The primary interaction: "What would this usage have cost on a different model?"

1. The user selects a source: a specific model, a credential, an attribution group, or any filter combination from the explorer. This defines the usage dataset.
2. The user selects one or more target models to compare against.
3. The system takes the source usage records, preserves the token/metric volumes, and re-prices them using each target model's rate card.
4. Results show side-by-side: source model cost, each target model's hypothetical cost, absolute savings/increase, and percentage difference.

The comparison uses the pricing rates effective during the actual usage period (not today's rates), so the comparison reflects what the user *would have paid* -- not what they *would pay today*. An option to use current rates for forward-looking estimates should also be available.

### Tier Comparison

Same usage, different service tier. "What if we moved 100% of our on-demand usage to batch?"

1. The user selects usage data (same filter mechanism as above).
2. Instead of changing the model, they change the service tier (e.g., on_demand to batch).
3. The system re-prices using the same model but the target tier's rate card.
4. Results show the cost difference and the percentage of usage eligible for the tier change.

Not all usage is eligible for all tiers. If a model doesn't have a batch tier pricing entry, the simulator shows "no pricing available for this tier" for those records rather than silently dropping them.

### Provider Migration Preview

"What would all our Anthropic usage cost if we switched to OpenAI?"

1. The user selects a source provider.
2. The user maps source models to target provider models (e.g., Claude Sonnet -> GPT-4o, Claude Haiku -> GPT-4o-mini). The system suggests mappings based on service category and model tier similarity, but the user controls the final mapping.
3. The system re-prices all usage records using the mapped target models.
4. Results show: total source cost, total target cost, per-model breakdown of savings/increases, and any unmapped usage (models with no suggested target).

### Results Display

Every simulation result includes:

- **Headline**: Total source cost vs. total simulated cost, absolute difference, percentage change.
- **Breakdown table**: Per-model or per-day granularity showing where savings come from and where costs increase.
- **Coverage indicator**: What percentage of the source usage was successfully re-priced. If some records couldn't be re-priced (missing pricing data for the target model/tier), this is shown clearly.
- **Methodology disclosure**: A persistent note stating: "This comparison shows cost differences only. It does not predict changes in response quality, latency, rate limits, or feature compatibility. Actual results after switching may differ due to differences in tokenization, context window handling, and model capabilities."

### Saved Scenarios

Users can save simulation configurations (source filters + target model mappings) to re-run them as pricing changes or usage patterns evolve. "Re-run last month's GPT-4o vs Claude Sonnet comparison with this month's data."

## Constraints

- **No quality or capability prediction.** We have zero traffic data -- no prompts, no responses, no latency measurements. We cannot and must not suggest whether a cheaper model will produce acceptable results. The UI must make this limitation explicit and unavoidable.
- **Token volume is preserved, not recalculated.** When comparing Model A to Model B, we use Model A's actual token counts. In reality, different models tokenize differently (the same text may be 1,000 tokens on one model and 1,200 on another). This is an inherent limitation that should be disclosed. The comparison answers "what would this token volume cost?" not "what would this exact text cost?"
- **Pricing data must exist for the target model.** If the pricing table doesn't have rates for a model/tier/context combination, the simulation cannot produce a result for those records. Missing pricing should be reported, not silently ignored.
- **Historical pricing only.** The system uses the pricing rates that were in effect during the usage period. Forward estimates using current rates are an option but clearly labeled as projections.

## Dependencies

- **Pricing tables (existing)**: The ModelPricing entity with time-versioned rate cards already exists and supports multi-tier, multi-context pricing. The simulator uses the same `calculateCostFromRates` logic.
- **Usage data (existing)**: UsageRecord entities with token/metric volumes are the source data. The explorer's existing filter/aggregation infrastructure can supply the dataset.
- **Model registry (existing)**: The Model entity with service categories enables intelligent model-to-model mapping suggestions (only suggest text_generation models as alternatives to text_generation models).
