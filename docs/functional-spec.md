**FUNCTIONAL SPECIFICATION**

**The AI Cost Intelligence Layer**

*A unified financial operating system for LLM spend across providers.*

**Upheave Technologies d.o.o.** | **Confidential** | March 2026

**1\. The Problem Nobody Is Solving**

Every LLM provider gives you a usage dashboard. OpenAI shows you a cost chart. Anthropic shows you token counts. Google shows you a billing summary. None of them solve the actual problem.

The actual problem is this: companies using multiple LLM providers have no unified view of what they are spending, where that money is going, or whether the way they are spending it makes any financial sense. The individual dashboards are fine for a single engineer checking their API bill. They are useless for any organization that needs to answer real questions.

These are the questions that have no home today:

How much are we spending on AI across all providers, this month, compared to last month? *Nobody can answer this without opening four tabs and adding numbers in a spreadsheet.*

Which team is responsible for the $2,300 spike we saw on Thursday? *Provider dashboards don't know your org chart. They show API keys, not people.*

Are we going to exceed our quarterly AI budget? *No provider offers budget forecasting. They show what you spent. Not where you're heading.*

If Anthropic raises prices 20%, what happens to our margin? *This question requires knowing your full provider distribution. No single provider can answer it.*

These are not hypothetical. These are the questions that engineering leaders, finance teams, and CTOs ask weekly in every AI-native company. Today, the answer is always the same: someone opens a spreadsheet and spends two hours manually pulling data from provider dashboards.

That spreadsheet is the product we are replacing.

**2\. What the Data Actually Contains**

Before describing the product, it is important to be precise about the data foundation. Everything described in this document is derived from data that LLM provider APIs actually expose. No hallucinated capabilities. No assumed access to per-request logs or prompt content.

**2.1 Raw provider data (what the APIs give us)**

Every major LLM provider (OpenAI, Anthropic, Google, Mistral, Cohere, and others) exposes usage data through billing or admin APIs. The specifics vary, but the common shape is:

**Daily aggregated cost and token usage, broken down by model.** For each day, for each model, we get: total cost in USD, total input tokens consumed, total output tokens consumed. Some providers additionally report cached tokens, image tokens, audio tokens, or other modality-specific counts.

**API key or project level attribution.** Most providers allow spend to be segmented by API key. Some (OpenAI, Google) additionally support project or workspace grouping. This gives us the lowest-level unit of attribution that provider APIs expose.

**Model-level pricing.** Current and historical per-token pricing for each model variant. This allows us to decompose a dollar cost into its token components and vice versa.

**Roughly 24-48 hour lag.** This is not real-time data. Provider APIs typically settle usage data with a one-day delay. The product is designed around this constraint.

**2.2 The custom dimension layer (what we add)**

The raw provider data is granular but unattributed. An API key is a string. A project ID is a hash. They mean nothing to a finance team or an engineering manager.

The critical value layer is the mapping of provider-native identifiers to business-meaningful dimensions:

**API Key → Team → Cost Center.** The customer maps their API keys to teams, departments, or cost centers. This is the single most important enrichment. It transforms raw provider data into organizational intelligence.

**API Key → Project / Product.** Keys can be tagged with the project, product, or feature they serve. This enables per-product AI cost tracking.

**API Key → Environment.** Production, staging, development. A trivial tag that exposes a non-trivial problem: teams running expensive models in staging environments.

This mapping layer is maintained by the customer. We provide the interface, the import tools, and over time, heuristic suggestions. But the human decision of "this key belongs to the content team" is theirs. This is a feature, not a limitation. It means the data is always organizationally accurate.

**3\. The Product**

What follows is a description of every functional capability in the product, organized by the problem it solves. Each feature is annotated with the data it requires, to make the grounding explicit.

**3.1 Unified Spend View**

**Problem:** Multi-provider spend requires manual aggregation.

A single view showing total LLM spend across all connected providers. Monthly, weekly, and daily granularity. Filterable by provider, model, team, project, environment, and any custom dimension. Month-over-month and week-over-week trend comparisons.

This is table stakes. Every competitor will build this. It is necessary but not sufficient. We include it because it is the entry point. The features that follow are where the product differentiates.

*Data required: Daily cost per model per API key, from all connected providers. Custom dimension mappings.*

**3.2 The Allocation Engine**

**Problem:** Most organizations do not know who owns their AI spend.

This is the hard, unsexy, and extremely valuable core of the product. It solves the attribution problem: which team, which project, which cost center is responsible for which portion of the bill.

The allocation engine works in three tiers:

**Tier 1 --- Direct mapping.** The customer assigns API keys to teams and projects through the UI, CSV import, or API. This covers the simple case where key ownership is known.

**Tier 2 --- Inherited mapping.** When a provider supports native project or workspace grouping (OpenAI's Projects, Google's billing accounts), we inherit that hierarchy and allow the customer to map at the group level rather than per-key.

**Tier 3 --- Unassigned surfacing.** API keys that carry spend but have no team assignment are surfaced as "unassigned spend." This is not a passive list. It is an active alert. Unassigned spend is the operational blind spot that every organization has and nobody tracks. Showing a CTO that $3,400/month is being spent by keys that nobody owns is the moment the product sells itself.

The allocation engine is the moat. It requires customer investment (they must map their keys), which creates switching cost. And it produces organizational knowledge that no provider dashboard can replicate.

*Data required: API key identifiers from each provider. Customer-provided team/project/environment mappings.*

**3.3 Budget Forecasting with Confidence Bands**

**Problem:** Provider dashboards show what you spent. Nobody shows where you're heading.

We forecast end-of-period spend at the organization, team, and project level using the historical daily spend data we have accumulated. This is not a linear extrapolation. It accounts for observable patterns:

**Weekday/weekend cyclicality.** Most organizations spend 40-60% less on weekends. A naive daily-average projection systematically overestimates or underestimates depending on where in the week you are. We decompose the forecast into weekday and weekend run rates.

**Intra-month growth curves.** Many organizations see spend increase through the month as feature rollouts, batch jobs, and accumulated usage compound. We fit a trend to the daily data rather than assuming a flat rate.

**Confidence intervals.** Rather than a single projected number, we show a range. "You will close between $34,200 and $38,800 (80% CI)." This is computed from the variance in daily spend. High-variance teams get wide bands. Stable teams get narrow bands. The width of the band itself is a signal: if your forecast range is $15K wide, your spend is unpredictable, and that is a problem worth knowing about.

The budget view includes a threshold alert system. Customers set a monthly budget per team or project. When the forecast band crosses the budget threshold, we alert. Not when they have already overspent. When we project they will. The difference between a retrospective report and a forward-looking warning is the difference between accounting software and a financial tool.

*Data required: 30+ days of historical daily spend per dimension. Customer-defined budget thresholds.*

**3.4 Anomaly Detection on Daily Aggregates**

**Problem:** Spend spikes go unnoticed until the monthly bill arrives.

With daily aggregated data and a one-day lag, we cannot catch a runaway process in real time. We are explicit about this constraint. What we can do is detect anomalies within 24 hours, which is 29 days faster than most organizations currently notice.

The anomaly detection operates on multiple signals:

**Statistical outliers.** A day's spend that exceeds 2 standard deviations from its trailing 14-day average (weekday-adjusted) is flagged. Simple, but effective. The March 26th spike that's 112% above average is exactly the kind of event that goes unnoticed in a provider dashboard but is immediately visible in an anomaly alert.

**New model appearances.** When an API key starts incurring cost on a model it has never used before, we flag it. This is a deployment signal. Someone changed what model an API key is calling. This is frequently unintentional, and always worth knowing about.

**Trend breaks.** A team whose spend has been declining suddenly reverses course. A model that was being phased out suddenly shows increased usage. These are not single-day spikes; they are trajectory changes. We detect them by comparing 7-day trailing averages to 28-day baselines.

**Ghost key detection.** API keys that have been inactive for 30+ days and suddenly show spend. Keys that are incurring cost but have no team assignment. Keys that are tagged as "development" or "staging" but are calling production-tier models (gpt-4-turbo, claude-opus). These are the silent budget leaks that compound month over month.

Each anomaly is attributed to a specific dimension: which provider, which model, which API key, and (if mapped) which team and project. The alert does not say "your spend spiked." It says "the content-pipeline project on OpenAI's gpt-4-turbo model spent $2,340 yesterday, which is 2.1× the trailing weekday average for that key." Specific. Attributable. Actionable.

*Data required: 14+ days of daily spend history per API key per model. Custom dimension mappings for attribution.*

**3.5 The Price Event Engine**

**Problem:** LLM pricing changes constantly and nobody tracks the impact.

This is the feature that transforms a cost tracking tool into a financial intelligence system.

LLM providers change pricing frequently. New models are released. Existing models get price reductions. Models are deprecated. Pricing tiers change. Batch API discounts are introduced. Each of these events has a concrete dollar impact on every customer's bill, and nobody is calculating it.

The Price Event Engine works as follows:

**We maintain a pricing database.** Every model, every provider, every pricing change, timestamped. This is the canonical record of what each token has cost, historically and currently. We build and maintain this ourselves; it is not available from any single provider API.

**When a pricing event occurs, we calculate impact.** We take the customer's actual token volume distribution (by model, by input/output split) and apply the new pricing. The output is an exact dollar delta. "Anthropic reduced Claude Sonnet 4 pricing by 20%. Based on your trailing 30-day usage, this saves you $1,640/month with no action required."

**For model releases, we calculate migration potential.** When a new model is released, we identify which existing models the customer is using that could potentially be replaced based on the model's positioning (same provider, similar capability tier). We calculate the cost difference at the customer's actual token volume. We explicitly do not make quality claims. We say: "If you moved your gpt-4-turbo volume to gpt-4o, your cost would decrease by 38%. We cannot assess quality impact---you'll need to evaluate that. Here is the dollar figure."

**For deprecations, we calculate urgency.** When a model is scheduled for deprecation, we identify every API key still calling it, the daily spend on that model, and the team that owns it. This is the migration punch list. Not "you should probably migrate." But: "3 API keys owned by the Engineering team are calling text-davinci-003, spending $410/month. This model is deprecated effective April 15. Here are the keys."

The Price Event Engine converts industry noise into personalized financial impact. Every pricing blog post, every model announcement, every deprecation notice becomes a concrete number attached to a specific team and project in the customer's organization.

*Data required: Customer's trailing token volume per model (from daily aggregates). Our maintained pricing database across all providers.*

**3.6 Provider Concentration & Risk Scoring**

**Problem:** Organizations are building critical infrastructure on providers they could lose access to overnight.

This is the question that boards should be asking and nobody is surfacing: how dependent are we on any single LLM provider?

We calculate a provider concentration score using a Herfindahl-Hirschman Index (HHI) adapted for LLM spend. If 90% of your spend goes to OpenAI, your concentration is dangerously high. If you are evenly distributed across four providers, your risk is lower. The score is not an opinion. It is a mathematical fact about your spend distribution.

For each provider, we show the financial exposure: "If OpenAI raises prices 25%, your monthly bill increases by $3,200. If Anthropic becomes unavailable, 29% of your AI-powered features are affected." These are calculations, not predictions. They are derived directly from the spend distribution.

The risk view is designed for board decks and quarterly reviews. It answers the question that technical leadership gets asked and currently cannot answer without guesswork: what is our AI vendor risk?

*Data required: Spend distribution across providers. Provider-to-project mapping for feature dependency analysis.*

**3.7 The AI Unit Economics Calculator**

**Problem:** Companies building AI-native products do not know their true per-unit AI cost.

This is the feature that expands the product's audience from engineering leadership to CFOs.

Traditional SaaS has near-zero marginal cost per user. AI-native products have significant per-interaction cost. Every chatbot conversation, every document summary, every search result that passes through an LLM has a real cost. Most companies do not know what it is.

The unit economics calculator works by letting the customer define business units and map them to spend dimensions:

"The content-pipeline project produces blog posts. We published 2,400 this month. **AI cost per blog post: $2.23."**

"The chatbot-v2 project handles customer conversations. We had 18,000 conversations this month. **AI cost per conversation: $0.27."**

"The data-enrichment project processes lead records. We enriched 45,000 records. **AI cost per record: $0.07."**

We do not have the business unit data. The customer provides it---a number in a field, or an API integration with their product analytics. We do the division. But that division is the number that changes how an organization thinks about AI spend. It converts a line item on a bill into a unit of business economics.

Tracked over time, this becomes a margin trend. Is the AI cost per conversation going up or down? If you switched models last month, did it change the unit cost? If a team scaled up usage, did the per-unit cost stay stable or did it increase (suggesting inefficiency)?

This is the metric that belongs in board decks. Not "we spent $30K on AI." But: "Our AI cost per customer interaction dropped from $0.34 to $0.21 this quarter while maintaining service quality." That is a sentence a CFO understands.

*Data required: Project-level LLM spend (from our allocation engine). Customer-provided business output metrics (number of conversations, documents produced, records processed, etc.).*

**3.8 The Monthly AI Financial Report**

**Problem:** There is no standard format for reporting AI spend to leadership.

At the end of each period, the product auto-generates a financial report that is designed to be forwarded to a CFO, shared in a board meeting, or attached to a quarterly review. It contains:

Total spend by provider and model, with month-over-month comparison. Budget variance by team and project. Anomalies detected and their attributed cause. Price events that occurred and their calculated impact. Provider concentration score. Unit economics trends (if configured). Forecast accuracy---how close our previous month's forecast was to actual.

This report is not a dashboard screenshot. It is a structured financial document with narrative context. The anomaly section does not say "spike detected." It says "On March 26, the content-pipeline project spent $2,340, which was 112% above its trailing average. This coincided with the deployment of a new summarization endpoint. Spend returned to baseline the following day."

The report writes itself from the data. The customer's finance team gets a document they can work with, in a format they already understand, without anyone in engineering spending two hours assembling it.

*Data required: All of the above. This is a synthesis layer, not a new data source.*

**4\. Why This Is Harder Than It Looks**

The common objection is: "I can build a dashboard that pulls from provider APIs in a weekend." This is true. And it is the wrong product.

The weekend dashboard shows you numbers. It does not solve the allocation problem (which requires a persistent mapping layer and organizational buy-in). It does not forecast with confidence bands (which requires accumulated historical data). It does not detect anomalies against weekday-adjusted baselines (which requires statistical modeling on rolling windows). It does not maintain a cross-provider pricing database. It does not generate financial reports.

The moat has five layers:

**Provider integration depth.** Each provider API has different authentication, rate limits, data formats, and reporting granularity. Maintaining reliable connectors across 6+ providers, handling API changes, and normalizing data into a common model is ongoing engineering work, not a one-time build.

**The pricing database.** No single source of truth exists for historical LLM pricing across all providers. We build and maintain this. It compounds in value over time as historical pricing data becomes available nowhere else.

**Accumulated customer data.** Forecast accuracy improves with history. Anomaly baselines need 14+ days of data to calibrate. Unit economics trends require months of data. The longer a customer uses the product, the more accurate and valuable it becomes. This is a natural retention mechanism.

**The allocation layer.** Once a customer has mapped 50 API keys to teams and projects, they are not switching to a competitor and re-doing that work. The mapping is the switching cost.

**Cross-provider insight.** No LLM provider will ever build this. OpenAI will never show you your Anthropic spend. Google will never calculate your concentration risk across competitors. The unified view is structurally impossible for any single provider to offer. This product exists in the gap between providers, and that gap is permanent.

**5\. Who Pays and Why**

The initial buyer is the engineering leader (VP Eng, CTO, Head of AI/ML) at a company spending $5,000+/month across at least two LLM providers. This person currently maintains a spreadsheet. They know it is inadequate. They do not have time to fix it.

The product expands into finance (CFO, FP&A) through the unit economics calculator and the monthly report. This is the path from "engineering tool" to "enterprise financial system." The engineering leader brings the product in. The finance team makes it permanent.

The pricing is a percentage of managed spend, with a minimum monthly fee. This aligns incentive: as the customer's AI spend grows (and it will), our revenue grows with it. The customer accepts this because the product pays for itself through the savings it identifies---budget overruns caught early, ghost keys discovered, migration opportunities surfaced.

The pitch to the buyer is not "save money on AI." It is: "Know where your AI money goes." Saving money is a consequence. Visibility is the product.

*This document describes a product that is grounded entirely in data that LLM provider APIs expose today, enriched with organizational mappings that customers maintain. No per-request logging. No prompt inspection. No quality scoring. No real-time monitoring. Every feature described above works within the constraint of daily aggregated spend data with a one-day lag.*

*That constraint is also a strength. We ask nothing of the customer's infrastructure. No SDK. No proxy. No code changes. They connect their provider billing APIs. They map their keys. The product does the rest.*