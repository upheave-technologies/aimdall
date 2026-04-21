**FUNCTIONAL SPECIFICATION**

**The Explore Surface**

*A dimension-driven data exploration experience for LLM spend intelligence.*

**Upheave Technologies d.o.o.** | **Confidential** | March 2026

**1\. The Core Idea**

The /explore page is not a dashboard. It is not a report. It is not a query builder. It is a single fluid surface that restructures itself around whatever the user is looking at.

The principle is this: all of the customer's LLM spend data exists as a cube. The dimensions of that cube are time, provider, model, API key, team, project, environment, and any custom tags the customer has defined. At any moment, the user is looking at a specific slice of that cube. The explore surface shows them that slice---completely, immediately, and with no configuration.

The user does not build a chart. They do not write a query. They do not configure a widget. They select dimensions, and the surface responds. Every selection narrows the slice. Every slice renders the same coherent set of visualizations, automatically adapted to the shape of the data in that slice. The visualizations are not chosen by the user. They are chosen by the data.

The mental model is a camera, not a control panel. The user points the camera at a region of their data. The surface shows them everything there is to see in that region. They move the camera---zoom in, pivot, focus---and the view updates. The camera is the set of active dimension selections. The view is the computed response.

**2\. The Dimension Bar**

At the top of the explore surface sits a horizontal bar. This is the only control. Everything below it is output.

The dimension bar contains one interactive element per available dimension. In the default configuration, these are:

**Time** - Provider - Model - Team - Project - Environment - API Key

Each dimension has three possible states:

**Ungrouped (default).** The dimension is collapsed. Data across all values of this dimension is aggregated. If Provider is ungrouped, the surface shows total spend across all providers. This is the starting state for every dimension.

**Grouped.** The dimension is expanded. Data is broken out by each value of this dimension. If Provider is grouped, the surface shows spend per provider, side by side. Grouping a dimension does not filter anything. It facets the view. The total remains the same. The composition becomes visible.

**Filtered.** The dimension is locked to one or more specific values. If Provider is filtered to "Anthropic," all data on the surface reflects Anthropic only. The total changes. Everything downstream recalculates.

The interaction to move between states is direct manipulation:

Click a dimension pill to toggle it between ungrouped and grouped. *One click. The view restructures. No menu. No dropdown. Just the immediate visual response of the data splitting open along that axis.*

Click a specific value within a grouped dimension to filter to it. *The user sees "OpenAI - Anthropic - Google - Others" as grouped segments. They click "Anthropic." The surface filters to Anthropic only. The pill changes state to show the active filter. Everything recalculates.*

Click the filtered pill again to clear and return to grouped. *Click again to return to ungrouped. The cycle is: ungrouped → grouped → (click value) filtered → (click pill) grouped → (click pill) ungrouped. Three states, two interactions, zero configuration screens.*

**2.1 Compound selections**

The power emerges from combining dimensions. Each combination produces a unique and meaningful view:

**Provider (grouped) + Model (grouped):** Shows spend per model, nested within each provider. The user sees exactly how much each model costs, organized by who they're paying.

**Team (grouped) + Provider (grouped):** Shows each team's provider distribution. Instantly reveals which teams are single-provider dependent and which are diversified.

**Team (filtered: Engineering) + Model (grouped) + Time (grouped: weekly):** Shows Engineering's model usage trends over time. Reveals model migration patterns, new model adoption, and cost trajectory per model for one specific team.

**Environment (filtered: staging) + Model (grouped):** Shows which models are being called in staging. Instantly reveals expensive models (GPT-4 Turbo, Claude Opus) running in non-production environments---the kind of waste that is invisible in provider dashboards.

There is no limit to the number of simultaneously active dimensions. But the surface is designed to be most useful with one to three active groupings. Beyond three, the data becomes sparse and the visualizations degrade gracefully into tables. This is by design. If the user needs a four-dimensional pivot, we show them a table. If they need a one-dimensional comparison, we show them a rich visual. The surface adapts to the data density.

**2.2 The time dimension is special**

Time behaves differently from other dimensions because it is the only dimension with an inherent order and a natural aggregation hierarchy.

The time dimension in the bar presents as a set of quick-select options: Today, 7D, 30D, 90D, MTD, QTD, YTD, Custom. Selecting a time range does not group or filter in the same way as other dimensions. It sets the window. All data on the surface reflects the selected time window.

Within that window, the user can additionally group by time granularity: daily, weekly, or monthly. This determines how the time axis renders in charts. A 90-day window grouped by week shows 13 data points. A 30-day window grouped by day shows 30. The surface selects a sensible default: 7D defaults to daily, 30D defaults to daily, 90D defaults to weekly, YTD defaults to monthly. The user can override.

Regardless of the selected window, the surface always shows a comparison to the equivalent prior period. If the user selects 30D, they see the current 30 days compared to the previous 30 days. If they select MTD, they see this month compared to last month (pro-rated to the same number of elapsed days). The comparison is automatic and always visible. It is not a toggle. Context is not optional.

**3\. The Surface**

Everything below the dimension bar is the surface. The surface is a single vertical scroll of computed visualizations that respond to the current dimension state. The user does not arrange, configure, or select these visualizations. They appear because the data warrants them.

The surface is composed of four zones, always in this order:

**3.1 Zone 1: The Summary Strip**

A horizontal row of four to six key metrics, computed from the current slice. These are not configurable. They are deterministic outputs of the selected dimensions and time window.

The metrics always present are:

**Total spend** in the current slice and time window. If Provider is filtered to Anthropic and time is set to 30D, this shows the 30-day Anthropic spend. With the prior-period comparison inline.

**Daily run rate** calculated from the current slice. This is the average daily spend over the time window. It is the number that answers: "how fast is this slice burning?"

**Dominant segment** of the primary grouped dimension. If Provider is grouped, this shows the highest-spending provider and its share. If Team is grouped, the highest-spending team. If nothing is grouped, this metric is hidden. It appears only when a grouping creates segments.

**Anomaly count** within the slice. The number of days in the time window that exceeded 2 standard deviations from the trailing baseline, within this specific slice. If the user is looking at Engineering + Anthropic, this counts anomalies in that intersection only.

The summary strip is the answer to the first question anyone asks when looking at data: "what am I looking at, and is it normal?" Four numbers. Always visible. Always computed from the exact slice being viewed.

**3.2 Zone 2: The Time Series**

A single chart showing spend over time for the current slice and grouping. This is the primary visualization and it occupies the most screen space.

The chart adapts its rendering to the active dimensions:

**No grouping active:** A single line (or area) chart showing total spend over time. The prior period is shown as a faded overlay. Anomaly days are marked with a dot. This is the simplest view: one trend line, one comparison.

**One grouping active (e.g., Provider):** A stacked area chart. Each segment of the grouped dimension gets its own layer. The user sees both the total trend and the composition simultaneously. Hovering any layer shows that segment's value and percentage of total for that day.

**Two groupings active (e.g., Provider + Team):** The chart uses the first grouped dimension as its stacking axis and the second as a facet. This means: if Provider and Team are both grouped, the chart shows a small-multiples layout---one stacked area chart per team, each showing provider composition. Alternatively, if the second dimension has few values, a single chart with grouped bars is used. The surface selects the representation that best fits the cardinality.

**High cardinality:** If the grouped dimension has more than 6 values (common for Model or API Key), the chart shows the top 5 by spend and aggregates the rest into "Other." The threshold is visible: "Showing top 5 of 14 models." Clicking "Other" drills into the long tail.

The time series is not optional. It is always present. It is always the first thing below the summary strip. Time is the universal context for financial data. You cannot understand spend without seeing it move.

**3.3 Zone 3: The Composition Table**

Below the time series sits a table. This is the detailed breakdown of the current slice along the primary grouped dimension.

If Provider is grouped, the table has one row per provider. If Model is grouped, one row per model. If nothing is grouped, the table shows a single row for the total slice.

Every row contains the same columns:

Segment name - Total spend - % of slice - Daily average - Prior period total - Change % - Input tokens - Output tokens - Inline sparkline (trailing 14 days)

The table is sortable by any column. Default sort is by total spend, descending. The sparkline in the last column shows the 14-day trend for each row, giving the user an instant visual signal: is this segment growing, stable, or declining? No click required. The trend is visible at a glance.

Each row in the table is clickable. Clicking a row filters the surface to that segment. This is the drill-down interaction. The user sees Provider grouped, clicks "Anthropic," and the entire surface recalculates for Anthropic only. The dimension bar updates to show the active filter. The time series shows only Anthropic data. The summary strip reflects Anthropic totals. The composition table now shows the next logical grouping: models within Anthropic, or teams using Anthropic, depending on which other dimensions are grouped.

This click-to-filter pattern is the primary navigation mechanism. The user does not think about queries. They see a row that interests them. They click it. The surface zooms in. They see another row. They click again. Each click is a step deeper into the data. The dimension bar at the top always shows where they are. They can release any filter at any time to zoom back out.

**3.4 Zone 4: The Context Panel**

The bottom zone of the surface shows contextual information that is specific to the current slice but does not belong in the time series or table. This zone is dynamic---its contents change based on what dimensions are active and what the data contains.

The context panel shows whichever of the following are relevant to the current slice:

**Budget status.** If the current slice maps to a dimension that has a budget (team or project), the panel shows the budget gauge: current spend, budget limit, projected close, and whether the forecast band crosses the budget threshold. This appears automatically when the user filters to a team or project that has a budget configured. It does not appear for slices without budgets.

**Anomaly details.** If the current slice contains days that were flagged as anomalous, the panel lists them: date, actual spend, expected spend, deviation magnitude, and the dimension-attributed cause (which model, which API key contributed most to the spike). The user does not have to search for anomalies. They appear when the slice contains them.

**Price events.** If a pricing change occurred during the selected time window that affects models in the current slice, the panel shows it: which model, which provider, what the price change was, and the calculated dollar impact on this specific slice. If the user is looking at Team: Engineering, 90D, and Anthropic dropped Sonnet pricing during that window, the panel shows exactly how much that saved the Engineering team.

**Model migration signals.** If the time series data reveals a model substitution pattern within the slice (one model's spend declining while another's increases at a comparable rate), the panel notes it. "In this slice, gpt-4-turbo spend decreased by $1,800 while gpt-4o spend increased by $2,100 over the selected period." No recommendation. Just the observation, derived from the data.

**Concentration indicator.** If the current slice is a team or project, the panel shows that entity's provider concentration. "The Content team sources 94% of spend from OpenAI." This appears only when the slice is narrow enough for concentration to be meaningful.

**Ghost keys.** If the slice contains API keys that are unassigned, or keys tagged as staging/development that are calling production-tier models, the panel surfaces them. This is passive detection that only becomes visible when the user navigates into a slice where it exists.

The context panel is the layer that separates this product from a BI tool. A BI tool shows the user what they asked for. The context panel shows them what they did not know to ask for. It is computed from the same data, but it surfaces the derivative insights---the anomalies, the risks, the events---that are latent in the slice the user is already examining. The user does not configure these. They appear when they are true.

**4\. Interaction Patterns**

The explore surface supports a small set of interaction patterns. Each is designed to feel like a single physical gesture, not a multi-step configuration.

**4.1 Drill down**

Click any segment in any visualization (a bar in a chart, a row in a table, a slice in a composition breakdown) to filter the surface to that segment. The dimension bar updates. All four zones recalculate. The user has zoomed in.

The drill-down is the most common interaction. It requires zero knowledge of the data model. The user sees something interesting. They click it. They see more detail. This is how humans naturally explore information. We preserve it exactly.

**4.2 Pivot**

While filtered to a specific value (say, Team: Engineering), the user clicks a different dimension pill in the bar (say, Model). The surface now shows Engineering's spend broken down by model. This is a pivot---the filter stays, but the grouping axis changes.

The pivot answers the question: "I'm looking at this team---now show me what they're spending on." Or: "I'm looking at this model---now show me who's using it." The filter is the subject. The grouping is the lens.

**4.3 Compare**

The user can select multiple values within a grouped dimension for comparison. Shift-click or multi-select on two or three segments (e.g., Team: Engineering and Team: Content). The surface shows both side by side. The time series renders both as separate lines. The table shows both. The summary strip shows both totals.

Comparison is the interaction that answers: "are these two things behaving the same way?" It requires no special mode. It is a natural extension of the multi-select within a grouped dimension.

**4.4 Zoom out**

Click an active filter pill in the dimension bar to release it. The surface returns to the grouped state for that dimension. Click again to return to ungrouped. Every zoom-in is reversible with one click on the same pill.

There is also a "Reset" action that clears all dimensions to their default state (ungrouped, 30D time window). This is the escape hatch. The user can always get back to the starting view in one action.

**4.5 Save as View**

Any combination of dimension states can be saved as a named view. "Engineering Weekly Review" might be: Team filtered to Engineering, Time set to 7D grouped by daily, Model grouped. The user creates this view once. They return to it with one click from a saved views menu.

Saved views are the bridge between exploration and reporting. Exploration is ad hoc. But once the user discovers a slice they need to revisit, they save it. The saved view captures the exact dimension state---no visual configuration, no widget layout, no chart selection. Just the dimension coordinates. The surface regenerates the same output every time because the visualization is deterministic given the dimensions.

**5\. URL as State Machine**

The entire explore surface state is encoded in the URL. Every dimension selection, every filter, every time window is represented as a query parameter. This is not an implementation detail. It is a product feature with three deliberate consequences.

**5.1 Shareability**

A user discovers that the Data Science team's Gemini spend spiked last week. They copy the URL and paste it into Slack. Their colleague opens it and sees the exact same view. No account required to see the shared view (if link sharing is enabled). The URL is the artifact. The surface is the renderer.

The URL format is human-readable:

**/explore?time=30d&group=provider,model&filter=team:engineering&compare=team:content**

This is not a serialized blob. It is a readable state description. An engineer can construct it by hand. A Slack message containing it is self-documenting.

**5.2 Bookmarkability**

Browser bookmarks, saved links, and documentation can point to specific data views. A runbook entry might say: "When investigating cost spikes, start here: [link to explore with anomaly-prone dimensions pre-selected]." The URL is stable. If the underlying data changes, the same URL shows the updated view of the same slice.

**5.3 Agent accessibility**

Because the URL encodes the complete state, any system that can construct a URL can "use" the explore surface. This is the foundation of the programmatic interface described in section 6.

**6\. The Programmatic Interface**

Every view that the explore surface can render for a human must be equally accessible to a machine. This is not an afterthought API bolted onto a UI. The explore surface and the API are the same system. The UI is a visual client. The API is a programmatic client. Both issue the same queries and receive the same data.

**6.1 The Explore API**

The API mirrors the dimension bar exactly. A request specifies:

**GET /api/explore**

** ?time=30d**

** &group=provider,model**

** &filter=team:engineering,env:production**

** &metrics=spend,tokens_in,tokens_out,daily_avg,anomaly_count**

The response returns the same data that populates all four zones of the surface:

**summary:** The summary strip metrics for the current slice.

**timeseries:** The time series data, bucketed by the appropriate granularity, grouped by the specified dimensions.

**breakdown:** The composition table data, sorted by spend descending.

**context:** The context panel data---anomalies, budget status, price events, ghost keys---applicable to the current slice.

The response is a single JSON document. One request, one response, complete view. The API does not require the caller to know what widgets to request. It returns everything the surface would show, in structured form.

**6.2 Why this matters for AI agents**

An AI agent tasked with "analyze our LLM spend and find problems" can operate the explore API using the exact same strategy a human would use:

**Step 1. Start broad.** Call /api/explore with no groupings and a 30-day window. Read the summary. Note the total, the daily run rate, the anomaly count.

**Step 2. Group by provider.** Call with group=provider. Read the breakdown. Identify the largest provider. Note any disproportionate growth rates.

**Step 3. Drill into the interesting provider.** Call with filter=provider:openai&group=model. See which models are driving cost. Identify any models with unusual growth.

**Step 4. Pivot to teams.** Call with filter=provider:openai,model:gpt-4-turbo&group=team. See which team is responsible for the GPT-4 Turbo spend.

**Step 5. Check the context.** Read the context object in the response. Were there anomalies in this slice? Price events? Ghost keys? The agent does not need to know to ask these questions. The API answers them automatically for every slice.

This progressive drill-down is not a scripted workflow. It is the natural exploration pattern that emerges from the dimension model. The agent makes decisions at each step based on what it finds. If the anomaly count is zero, it pivots elsewhere. If one team dominates, it drills into that team. The API gives it the same information at each step that a human would see on screen.

The critical design decision is that the context panel data is included in every API response by default. A human might glance at the context panel and notice a ghost key. An agent receives it in structured JSON and can act on it. Neither the human nor the agent had to know to ask. The system surfaced it because the data warranted it.

**6.3 Webhooks for autonomous monitoring**

Beyond interactive exploration, the API supports registering saved views as monitored slices. The system evaluates each monitored slice daily (when new data arrives) and fires a webhook if:

An anomaly is detected in the slice. 

The forecast band for the slice crosses its budget threshold. 

A price event affects models used in the slice. 

A ghost key or unassigned spend appears in the slice. 

The webhook payload contains the same structured data as an API response for that slice, plus the specific event that triggered it. An agent receiving this webhook has full context to investigate further by calling the explore API to drill deeper into the affected dimension.

This is the cycle: the human sets up a monitored view ("watch the Engineering team's weekly spend"). The system detects an event. The webhook fires. An agent receives it. The agent uses the explore API to investigate. The agent produces a summary. The human reads the summary and, if needed, opens the explore surface at the exact URL the agent was investigating. The URL is in the webhook payload. The human and the agent share the same coordinate system.

**7\. Why Determinism Matters**

The explore surface is fully deterministic. Given the same dimension state, the same time window, and the same underlying data, the surface produces the exact same output. Always. There is no randomness, no AI-generated narrative that might vary between loads, no heuristic that might highlight a different insight.

This is a deliberate choice with three consequences:

**Trust.** When a user saves a view and shares it with their team, everyone sees the same thing. When they return to it tomorrow, it shows the same structure (with updated data). The surface is a reliable instrument. You do not question whether your thermometer is showing you the right number. You should not question whether your financial tool is showing you the right view.

**Debuggability.** When something looks wrong, the user can reason about why. The summary strip shows $12,400. The composition table breaks that into $5,200 + $3,800 + $2,100 + $1,300. The numbers add up. Every aggregation is a sum of its parts. The user can verify any number by drilling into its components. There is no black box.

**Agent reliability.** An AI agent that calls the API twice with the same parameters gets the same response. It can make decisions based on the data without worrying about non-deterministic presentation. It can compare responses over time and know that any differences are in the data, not the system.

The context panel might appear to violate determinism because different slices show different contextual information. But this is conditional rendering, not non-determinism. The rule is fixed: if the slice contains anomalies, show them. If it doesn't, don't. The same slice will always show or not show the same context. The rules do not change.

**8\. What This Is Not**

It is worth being explicit about what the explore surface does not do, because the temptation to add these things will be strong and must be resisted.

**It is not a natural language query interface.** The user does not type "show me Engineering's Anthropic spend." They click Team, click Engineering, click Provider, see Anthropic. The direct manipulation is faster, more precise, and does not require the user to know the vocabulary of the data model. Natural language interfaces introduce ambiguity into what should be an exact operation. We do not add ambiguity to financial data.

**It is not a drag-and-drop dashboard builder.** The user does not choose which charts to display, where to place them, or how to size them. The surface makes these decisions based on the data. This removes an entire category of cognitive load. The user's job is to decide what to look at. The surface's job is to decide how to show it.

**It is not a report generator for this page.** The monthly report (described in the parent product spec) is a separate feature. The explore surface is for interactive investigation. Reports are for periodic communication. They serve different cognitive modes and should not be conflated.

**It does not use AI to generate insights on this surface.** The context panel shows calculated facts: anomalies, budget status, price events. These are deterministic computations, not generated text. If the customer wants an AI-generated narrative summary of their explore session, that is a feature of the agent integration, not of the surface itself. The surface is the instrument. The agent is the analyst.

*The explore surface is a single page with a single control (the dimension bar) that produces a complete, deterministic, self-contextualizing view of any slice of the customer's LLM spend data. It serves human analysts and AI agents through the same data model and the same interaction patterns. It does not ask the user what they want to see. It shows them everything there is to see in the region they have pointed at. The only skill required is curiosity.*