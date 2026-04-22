# Open Source Model Cost Estimation

> Priority: P2
> Impact: Medium
> Status: Scoped

## Intent

Teams evaluating whether to self-host open-source models have no way to compare costs against their current commercial API spend. This feature provides reference estimates for what running equivalent open-source models on their own infrastructure would cost, using their actual usage volumes as the input.

## Value

A CTO sees $20,000/month in commercial API spend and wonders: "Would it be cheaper to run Llama 3.1 70B ourselves?" Today, answering this requires researching GPU instance pricing, estimating throughput per GPU, calculating how many instances they'd need for their usage volume, and factoring in operational overhead. Nobody does this math rigorously.

With this feature: "Your 2.8M output tokens/month on GPT-4o would require approximately 2 A100 GPU instances running Llama 3.1 70B, costing an estimated $5,800-$8,200/month in compute alone (excluding engineering, ops, and infrastructure overhead)." The user gets a ballpark to decide whether self-hosting is even worth investigating further -- not a deployment plan.

## Goal

- Users see a clear, honest cost comparison between their current commercial API spend and estimated self-hosting costs for comparable open-source models.
- Estimates are clearly labeled as approximate, with explicit caveats about what's included and what's not.
- The feature helps users decide "is self-hosting worth investigating?" -- not "how do I deploy this model."
- Reference data is updatable as GPU pricing and open-source model benchmarks change.

## Functionality

### Cost Comparison View

Accessible from the model cost simulator or as a standalone view. The user selects a time period and sees their commercial API usage alongside estimated self-hosting costs.

For each commercial model in use, the system shows:

- **Current cost**: Actual spend on this model for the selected period (from existing usage data).
- **Open-source equivalent**: The most comparable open-source model (e.g., GPT-4o -> Llama 3.1 70B, Claude Haiku -> Mistral 7B).
- **Estimated self-hosting cost**: A range (not a single number) based on the user's token volume and published inference benchmarks.
- **Break-even indicator**: Whether the user's usage volume is high enough to make self-hosting economically viable at all. Low-volume users should see "Your volume is too low for self-hosting to be cost-effective" rather than a misleading comparison.

### Estimation Methodology

The estimation uses three inputs:

1. **User's actual token volume** (from usage records): total input tokens, output tokens, and request count for the selected period.
2. **Published inference throughput benchmarks**: tokens/second per GPU for each open-source model, sourced from published benchmarks (vLLM, TGI, etc.). These are reference numbers, not guarantees.
3. **Cloud GPU pricing**: Published on-demand and reserved pricing for common GPU instances (A100, H100, L40S) across major cloud providers (AWS, GCP, Azure).

The calculation: (user's token volume / throughput per GPU) * hours in period * GPU hourly cost = estimated compute cost.

The result is presented as a range (low estimate: reserved pricing with optimal throughput; high estimate: on-demand pricing with conservative throughput) to reflect the inherent uncertainty.

### What's Included and What's Not

The estimate explicitly covers:
- GPU compute costs for inference only

The estimate explicitly excludes (and says so in the UI):
- Engineering time to set up and maintain the deployment
- Model fine-tuning costs
- Networking, storage, and data transfer costs
- Monitoring, logging, and observability infrastructure
- Load balancing and scaling infrastructure
- Redundancy and high-availability setup
- Model quality differences (we cannot compare output quality)

A persistent disclosure states: "These estimates cover GPU compute costs only. Total cost of ownership for self-hosted models typically includes significant engineering, operations, and infrastructure overhead not reflected here."

### Reference Data Management

Open-source model benchmarks and GPU pricing are stored as reference data that can be updated without code changes. This data includes:

- Model name, parameter count, and recommended GPU type
- Throughput benchmarks (tokens/second) with source attribution
- GPU pricing by cloud provider and instance type
- Last-updated date for each data point

This reference data should be straightforward for the administrator to update as new benchmarks or pricing become available.

## Constraints

- **All estimates are approximate.** Inference throughput varies dramatically based on batch size, quantization, prompt length, hardware configuration, and serving framework. Published benchmarks represent optimal conditions. Real-world throughput is typically 30-60% of benchmarks.
- **No quality comparison.** We cannot assess whether an open-source model produces output quality comparable to the commercial model it replaces. The feature explicitly does not make quality claims.
- **No deployment guidance.** This feature answers "roughly how much would it cost?" -- not "how do I do it." Deployment architecture, model selection, and infrastructure decisions are out of scope.
- **Static reference data.** GPU pricing and throughput benchmarks are point-in-time reference values that require manual updates. They are not dynamically fetched from cloud provider APIs.
- **Text generation only.** Self-hosting cost estimation is meaningful only for text generation models. Embedding, image generation, and other service categories have different cost structures that don't map cleanly to "GPU hours per token."

## Dependencies

- **Usage data (existing)**: Token volumes per model from existing usage records.
- **Model registry (existing)**: Model service categories to determine which models have self-hosting equivalents.
- **Reference data (new)**: A data source containing open-source model benchmarks and GPU pricing. This is new data that doesn't exist in the current system and needs to be seeded and maintained.
