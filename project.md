Advanced Telemetry and Financial Operations for Multi-LLM Ecosystems
Introduction to Large Language Model Telemetry
The rapid integration of generative artificial intelligence into enterprise architectures has necessitated a paradigm shift in financial operations and system observability. Organizations leveraging multiple Large Language Models (LLMs) across different providers—specifically OpenAI, Anthropic, and Google—face complex challenges in monitoring consumption, allocating costs, and maintaining security postures. As usage scales across various departments and applications, relying on disparate, provider-specific graphical dashboards becomes untenable. An enterprise-grade telemetry system must programmatically ingest usage data across all providers, normalizing the metrics into a unified dimensional model. This requires extracting data at the highest possible granularity: per API key, per user, per project, and per model.
Furthermore, this extraction must be achieved using the strict principle of least privilege. The administrative credentials utilized to poll billing and usage data must be severely restricted, ensuring they cannot be leveraged by malicious actors or misconfigured scripts to execute cost-incurring inferences, modify infrastructure, or access sensitive prompt data. Security and observability must operate in tandem to provide a comprehensive financial operations (FinOps) platform.
This comprehensive analysis systematically deconstructs the programmatic telemetry capabilities of OpenAI, Anthropic, and Google Cloud (Gemini). It evaluates the specific application programming interface (API) endpoints available, the data schemas returned, the temporal and dimensional granularity of the data, and the strict security configurations required to provision read-only access for financial reporting. Because asynchronous billing APIs often suffer from latency, this report also details a unified architectural approach for reconciling delayed provider-side reporting with real-time, application-level telemetry interception. The objective is to provide a single, exhaustive architectural blueprint containing all requisite schemas, endpoint definitions, and security configurations necessary to implement a multi-LLM tracking engine internally.
The Dimensional Taxonomy of LLM Consumption
To accurately ingest and report token spend, the underlying data warehouse must reflect the fundamental metrics and dimensions common across all LLM providers. While each provider utilizes distinct terminology, the core operational concepts remain consistent across the industry. Establishing a unified taxonomy is the first step in building a multi-provider ingestion pipeline.
The primary metric of consumption is the token, which typically represents a fraction of a word (approximately four characters in English).1 However, tokens are no longer a monolithic metric. A robust ingestion pipeline must account for various token classifications, as providers bill these operations at significantly different rates. The foundational metrics include standard input tokens, which represent the baseline prompt provided by the user.2 Modern architectures also utilize cached input tokens, representing data read from a context cache, which are typically billed at a massive discount compared to standard input tokens.2 Conversely, cache creation tokens represent the ephemeral tokens generated to initially populate a context cache, which may carry a premium or specific temporal billing structures depending on the provider.3
Output tokens represent the generated response from the model and have historically been the most computationally expensive metric, often costing several times more than input tokens.2 Finally, advanced reasoning models introduce reasoning tokens (sometimes referred to as thinking tokens), which are specialized tokens utilized by the model to process complex logic before returning a final output.1 These tokens are typically billed at the standard output token rate but are distinct from the text presented to the end user.
Beyond the raw token metrics, the telemetry must be sliced by several organizational dimensions to enable precise cost attribution. The highest level is the organization or billing account, representing the overarching financial entity.5 Below this sits the logical grouping, referred to as a "Project" within the OpenAI and Google Cloud ecosystems, and a "Workspace" within Anthropic.5 The most granular dimensions include the actor (the specific user or service account initiating the request), the credential (the unique API key identifier used for the transaction), and the resource (the specific model version invoked, such as gpt-5.4, claude-3-7-sonnet-20250219, or gemini-2.5-flash).3
Table 1 illustrates the unified dimensional mapping required to normalize data across the three major providers.
Unified Dimension
OpenAI Nomenclature
Anthropic Nomenclature
Google Cloud Nomenclature
Logical Environment
project_id
workspace_id
project_id
Authentication Entity
api_key_id
api_key_id
service_account / IAM Principal
Actor Identity
user_id
actor (user_actor / api_actor)
Custom Label / Application Log
Model Identifier
model
model
model_id / Metric Dimension
Prompt Consumption
prompt_tokens
uncached_input_tokens
prompt_token_count
Generation Consumption
completion_tokens
output_tokens
candidates_token_count
Cached Consumption
Included in prompt metrics
cache_read_input_tokens
cached_content_token_count

The following sections dissect how to extract these metrics and dimensions from each specific provider using automated, secure methodologies.
OpenAI Telemetry Ingestion Architecture
OpenAI provides highly robust administrative APIs designed explicitly for programmatic usage and cost tracking, making it highly amenable to enterprise FinOps integrations. The platform operates on a hierarchical organizational structure containing multiple projects, with API keys scoped either to individual human users or specifically restricted as service accounts operating autonomously within a project.5
Security Configuration: Least Privilege API Keys
A strict requirement for an enterprise telemetry pipeline is absolute security isolation. The credentials used to poll usage statistics must not possess the capability to generate text, alter infrastructure, or access previous prompt data. OpenAI's Role-Based Access Control (RBAC) and restricted API key architecture elegantly fulfill this requirement.5
To configure an ingestion credential with minimal access, the organization administrator must bypass standard user keys and deploy a restricted service account. The process begins within the OpenAI dashboard by selecting the target project (or creating a dedicated administrative project for telemetry). A Service Account is generated, ensuring the credential's lifecycle is detached from any human employee.5
Upon generating a new Secret Key for this Service Account, the permissions must be actively modified from the default "All" setting to the "Restricted" setting.5 It is critical that the "Model Capabilities" permission (which governs endpoints like /v1/chat/completions and /v1/responses) is explicitly set to "None".5 To permit the extraction of usage data, the key must be granted the api.usage.read scope. This is typically achieved by setting the "Organization Administration" or specific usage reporting permissions to "Read".11
If the RBAC roles are improperly configured, any attempt to poll the usage endpoints will yield an HTTP 403 Forbidden error accompanied by the message Missing scopes: api.usage.read or organization.read.12 By strictly utilizing a Restricted key limited exclusively to organizational read access, the telemetry engine can safely ingest exhaustive token data without introducing a vector for model abuse or data exfiltration.
The Completions Usage API
OpenAI separates its telemetry into two primary endpoint categories: the Usage API and the Costs API. This bifurcation is critical for system design, as the endpoints offer different levels of granularity and temporal resolution. The Completions Usage endpoint (GET /v1/organization/usage/completions) provides the highly granular token consumption data required for detailed chargebacks.14 It allows programmatic queries of usage by the minute, hour, or day, and supports deep filtering and grouping by project, user, API key, and model.15
To ingest telemetry completely, the system must periodically issue HTTP GET requests to this endpoint. The API accepts several critical query parameters to shape the response. The start_time parameter defines the Unix timestamp (in seconds) marking the beginning of the query range, while the optional end_time defines the boundary.16 The bucket_width parameter controls the temporal downsampling, accepting values of 1m (minute), 1h (hour), or 1d (day).17
Crucially, to achieve the requested granularity per API key, per user, and per project, the request must utilize the group_by parameter. This accepts an array of strings defining the dimensions. An exhaustive query would append multiple group parameters to the URI.
The following demonstrates the exact HTTP request required to fetch hourly token usage, grouped by every available dimension, utilizing the restricted API key:

Bash


curl -G https://api.openai.com/v1/organization/usage/completions \
  -H "Authorization: Bearer $OPENAI_RESTRICTED_USAGE_KEY" \
  -H "Content-Type: application/json" \
  -d "start_time=1730419200" \
  -d "end_time=1730505600" \
  -d "bucket_width=1h" \
  -d "group_by=project_id" \
  -d "group_by=user_id" \
  -d "group_by=api_key_id" \
  -d "group_by=model"


The API responds with a paginated JSON object containing a list of temporal buckets. Each bucket contains a start_time, end_time, and a results array.18 Each object within the results array represents a unique combination of the requested group_by dimensions and contains the aggregated metrics for that specific cohort.

JSON


{
  "object": "page",
  "data": [
    {
      "object": "bucket",
      "start_time": 1730419200,
      "end_time": 1730422800,
      "result": [
        {
          "object": "organization.usage.completions.result",
          "project_id": "proj_abc123",
          "user_id": "user_def456",
          "api_key_id": "key_ghi789",
          "model": "gpt-5.4",
          "input_tokens": 45000,
          "output_tokens": 12000,
          "num_model_requests": 34
        },
        {
          "object": "organization.usage.completions.result",
          "project_id": "proj_abc123",
          "user_id": "user_jkl012",
          "api_key_id": "key_mno345",
          "model": "gpt-5-mini",
          "input_tokens": 150000,
          "output_tokens": 85000,
          "num_model_requests": 210
        }
      ]
    }
  ],
  "has_more": false,
  "next_page": null
}


This JSON payload provides the exact blueprint for the data warehouse ingestion. The pipeline iterates through the result arrays, extracting the api_key_id, project_id, and mapping the input_tokens and output_tokens directly to internal cost allocation tables.16
The Costs API and Financial Reconciliation
While the Usage API provides the volume of tokens, the Costs endpoint (GET /v1/organization/costs) provides the actual financial expenditure in fiat currency.16 However, the Costs API is structurally limited: it currently only supports a daily temporal resolution (bucket_width=1d).16
Because the objective is highly granular tracking, relying solely on the Costs API is insufficient. Therefore, an enterprise telemetry pipeline must utilize a hybrid computational approach. The system must ingest the high-resolution, minute-by-minute token counts from the Usage API and programmatically multiply those volumes by the known, static pricing schema for the respective models (e.g., $2.00 per 1M output tokens for gpt-5.4).2 The Costs API should then be queried once every 24 hours. The resulting financial totals from the Costs API serve as an asynchronous reconciliation mechanism, verifying that the internally calculated costs derived from the Usage API perfectly match OpenAI's final billing ledger.
Anthropic Telemetry Ingestion Architecture
Anthropic organizes its administrative hierarchies into Organizations and Workspaces. Workspaces act as the foundational boundaries for isolating API keys, rate limits, and resources among different teams or deployment environments.7 Similar to OpenAI, Anthropic offers a dedicated Admin API for programmatic usage and cost reporting.19
Security Limitations: The Admin Key Constraint
While the Anthropic API provides excellent dimensional granularity for reporting, its security model currently presents a severe structural limitation regarding the principle of least privilege.
Access to the Anthropic Usage and Cost APIs is restricted exclusively to Admin API keys. These keys are immediately identifiable by the prefix sk-ant-admin... and differ fundamentally from standard, workspace-scoped inference API keys.6 Admin keys grant overarching, organization-wide management access. They allow the bearer to list all users, manage all workspaces, disable API keys, and view all usage data.20
Crucially, as of current platform capabilities, all Anthropic Admin API Keys possess revocable read-write access, with absolutely no option for finer permission scoping or read-only restrictions.6 The Anthropic platform does not currently support generating an sk-ant-admin key that can only read usage statistics.6 Therefore, utilizing this API inherently requires accepting a higher degree of credential privilege than requested by ideal security architectures.
To mitigate the risk of utilizing a fully privileged Admin key purely for telemetry reporting, the ingestion engine architecture must implement strict external security compensating controls. The sk-ant-admin key must never be hardcoded or stored in standard configuration files. It must be stored in a centralized enterprise secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault) and injected into the telemetry pipeline's memory exclusively at runtime.21 Furthermore, the network egress of the microservice executing the telemetry polling should be strictly constrained via firewall rules to only permit connections to api.anthropic.com. Finally, a strict programmatic rotation policy must be enforced, periodically automating the replacement of the Admin key within the Anthropic Console to minimize the window of vulnerability in the event of a credential leak.22
The Messages Usage Report API
Anthropic provides the GET /v1/organizations/usage_report/messages endpoint to return detailed token consumption metrics.19 This endpoint is highly flexible and aligns perfectly with the requirement for maximum data granularity.
It supports bucket_width configurations of 1m (high-resolution, allowing a maximum of 1440 buckets per request), 1h (medium-resolution, maximum 168 buckets), and 1d (daily analysis, maximum 31 buckets).21 To extract comprehensive telemetry across all dimensions, the pipeline must query the endpoint with specific group_by arrays. Anthropic permits grouping by api_key_id, workspace_id, model, service_tier, context_window, inference_geo, and speed.19
A request to ingest all granular token data, utilizing the securely vaulted Admin key, would be structured as follows:

Bash


curl -G https://api.anthropic.com/v1/organizations/usage_report/messages \
  -H "anthropic-version: 2023-06-01" \
  -H "X-Api-Key: $ANTHROPIC_ADMIN_API_KEY" \
  -d "starting_at=2026-03-10T00:00:00Z" \
  -d "ending_at=2026-03-11T00:00:00Z" \
  -d "bucket_width=1h" \
  -d "group_by=workspace_id" \
  -d "group_by=api_key_id" \
  -d "group_by=model"


The resulting MessagesUsageReport JSON schema provides deep insights into the exact nature of the tokens consumed, particularly regarding Anthropic's prompt caching mechanics.

JSON


{
  "has_more": false,
  "next_page": null,
  "data":
    }
  ]
}


This schema requires careful parsing by the ingestion engine. The output_tokens represent the generated text. The uncached_input_tokens represent standard processed inputs. The cache_read_input_tokens represent inputs successfully retrieved from the prompt cache, which must be billed internally at the discounted cache rate.3 The nested cache_creation object details tokens processed specifically to build the cache state. This granular breakdown allows an enterprise to precisely track how efficiently different software development teams (identified via their workspace_id) are utilizing prompt caching algorithms to reduce operational costs.
Claude Code Analytics
For organizations utilizing Anthropic's agentic coding tools, an additional specialized endpoint exists: GET /v1/organizations/usage_report/claude_code. This endpoint retrieves daily aggregated usage metrics specifically for developers interacting with Claude Code in their local environments. It returns a ClaudeCodeUsageReport object that tracks productivity metrics (such as commits and pull requests generated) alongside a model_breakdown array detailing token consumption and estimated costs. While this data operates on a daily aggregation rather than minute-level granularity, it is vital to poll this endpoint to capture the totality of Anthropic consumption outside of standard API inference requests.
Google Cloud (Gemini) Telemetry Ingestion Architecture
Tracking token spend for Google's Gemini models requires navigating a fundamentally bifurcated ecosystem. Google offers programmatic access to Gemini through two distinct primary avenues: Google AI Studio (utilizing the Generative Language API) and Google Cloud Vertex AI (utilizing the AI Platform API).23 The approach to telemetry differs radically between the two, dictating the necessary enterprise architecture.
The Limitations of Google AI Studio
Google AI Studio (which routes requests to generativelanguage.googleapis.com) is designed for rapid prototyping, individual developer access, and lightweight applications.23 Users authenticate via simple API keys generated directly within the AI Studio web interface.24
However, for enterprise FinOps, Google AI Studio presents a critical deficiency: it does not provide a dedicated programmatic API endpoint for extracting granular usage statistics or token consumption logs.25 While high-level usage can be viewed visually within the AI Studio web dashboard, there is no programmatic equivalent to OpenAI's /v1/organization/usage endpoint for the generativelanguage API.25 While costs incurred by Paid Tier API keys are eventually aggregated into the linked Google Cloud Billing account, extracting minute-by-minute, per-key token metrics programmatically from the standard billing export is inherently delayed, cumbersome, and lacks the requisite real-time multidimensional granularity.25
Therefore, to achieve the requirement of ingesting comprehensive, granular, API-key level token telemetry, organizations must migrate their production workloads away from Google AI Studio and exclusively utilize Google Cloud Vertex AI.
The Enterprise Solution: Vertex AI and Cloud Monitoring
Vertex AI (routing requests to aiplatform.googleapis.com) is Google's enterprise machine learning platform.23 It integrates natively with Google Cloud Monitoring and Cloud Logging, providing a highly robust, queryable metrics framework.26
Vertex AI automatically exports extensive token usage metrics directly to Cloud Monitoring. The primary monitored resource type for these metrics is aiplatform.googleapis.com/PublisherModel or aiplatform.googleapis.com/Endpoint.26 The specific metric descriptor required for tracking token volume is aiplatform.googleapis.com/publisher/online_serving/token_count.27 This metric records the accumulated input and output token counts and includes critical labels for dimensionality, including the max_token_size (the bucketized size of the tokens in the request/response) and the type (distinguishing between input and output tokens).27
To extract this data programmatically, the telemetry ingestion pipeline must interact with the Google Cloud Monitoring API (monitoring_v3). This involves utilizing the Google Cloud client libraries to execute a Monitoring Query Language (MQL) request or a time-series filter.28
An MQL query designed to extract the token consumption mapped to specific Gemini models over a specified interval would be structured as follows:

SQL


fetch aiplatform.googleapis.com/PublisherModel

| metric 'aiplatform.googleapis.com/publisher/online_serving/token_count'
| group_by [resource.model_id, metric.type], sum(val())
| within 1h


By submitting this query to the Cloud Monitoring API, the ingestion engine retrieves precise token counts, cleanly separated by input and output, across all deployed generative models within the Google Cloud Project.
Adapting "Per API Key" Tracking to Vertex AI
A crucial requirement is the ability to track usage "per API key" and "per user." Vertex AI, designed for enterprise security, relies heavily on Google Cloud Identity and Access Management (IAM) and Service Accounts rather than simple, static API keys.23
To fulfill the granular tracking requirement within the Vertex AI ecosystem, architectural adjustments are necessary. Instead of generating arbitrary API keys, each distinct application, team, or user group should be provisioned with its own dedicated Google Cloud Service Account. When the application authenticates to Vertex AI using Application Default Credentials (ADC) tied to that specific Service Account, the generated metrics and audit logs are intrinsically bound to that identity. The telemetry pipeline then queries Cloud Monitoring and groups the metrics by the principal identity, effectively replicating the "per API key" tracking paradigm within a far more secure IAM framework.23
Security Configuration: Custom IAM Roles
Google Cloud's IAM framework excels at enforcing the principle of least privilege, making it highly suitable for the stated security requirements. To allow the telemetry ingestion engine to query Vertex AI metrics without granting it dangerous access to modify models, view sensitive prompts, or incur costly inference charges, a restrictive predefined role must be utilized.30
The telemetry service account executing the script requires only the ability to query the Cloud Monitoring API. This is achieved by assigning the predefined roles/monitoring.viewer role to the service account.31 This role provides read-only access to all monitoring data and metrics across the project, including the vital aiplatform.googleapis.com token counts.31
By assigning exclusively the monitoring.viewer role, the credential is completely restricted from calling the aiplatform.googleapis.com/v1/projects/...:generateContent endpoints.32 It cannot execute generative models, read training data, or modify system quotas. This flawlessly satisfies the requirement for a highly secure, minimally scoped credential solely dedicated to financial reporting.31
Achieving Real-Time Telemetry via Synchronous Interception
While the administrative and monitoring APIs detailed for OpenAI, Anthropic, and Vertex AI are exhaustive, they are fundamentally asynchronous. They rely on backend batch processing and data aggregation pipelines. Consequently, they exhibit varying degrees of latency. Anthropic's Usage API can aggregate data into one-minute buckets, but processing delays dictate that the data is not instantly available the exact millisecond an inference concludes. OpenAI's usage endpoints similarly rely on asynchronous log processing. Furthermore, querying these administrative endpoints continuously at high frequencies across multiple providers can easily trigger rate limits (e.g., HTTP 429 Resource Exhausted) on the management interfaces themselves.33
To fulfill the ambitious requirement for tracking token spend "in real time if possible," the architecture must be split into two synergistic operational streams: Synchronous Interception at the application layer, and Asynchronous Reconciliation via the control plane APIs.
The Application Layer Proxy
Every major LLM provider returns highly accurate token consumption statistics directly within the JSON payload of the completion response itself. Capturing this metadata at the exact moment the API call resolves is the only architectural mechanism to achieve zero-latency, true real-time tracking.
The schemas for these embedded usage statistics are standard across providers:
OpenAI: The JSON response from /v1/chat/completions contains a root-level usage object detailing prompt_tokens, completion_tokens, and total_tokens.35
Anthropic: The response from the Messages API contains a root-level usage object detailing input_tokens and output_tokens.
Gemini (Vertex AI): The response object from generateContent features a usage_metadata attribute detailing prompt_token_count, candidates_token_count (output), and total_token_count.1
To track this natively without polling external APIs, the application layer executing the LLM calls must be wrapped in a telemetry interceptor, or traffic must be routed through an internal API gateway proxy.
When an inference request is dispatched and the response is received, the interceptor parses the JSON body, extracts the usage object, and binds it to the current user's internal session ID, the target project context, and the active credential identifier. The interceptor then immediately pushes this structured event to a high-throughput real-time data stream, such as Apache Kafka, Redis Streams, or directly into a time-series database. This synchronous stream feeds the live organizational dashboards, allowing the business to observe token expenditure instantaneously as users interact with the systems.
Asynchronous Reconciliation
While the real-time interception stream provides instantaneous visibility, it is inherently fragile. It is susceptible to network timeouts, dropped packets, or unhandled exception crashes where the LLM response is successfully generated and billed by the provider, but the local telemetry event fails to publish to the internal database. Therefore, the real-time application stream cannot serve as the sole, auditable source of truth for financial accounting.
The ingestion engine must utilize the provider-level administrative APIs (OpenAI Usage API, Anthropic Usage Report, Vertex AI Cloud Monitoring) as the authoritative control plane. On an hourly or daily scheduled cron job, the pipeline executes the secure API requests detailed in the previous sections. The newly ingested, authoritative data is then used to reconcile and overwrite the estimated real-time data, ensuring that the internal tracking perfectly matches the provider's immutable billing infrastructure.19
Data Modeling and Pipeline Implementation
To ingest the telemetry "completely, all of it and as granular as allowed" across OpenAI, Anthropic, and Gemini, the central data warehouse must employ a normalized schema. This schema maps the disparate taxonomies and JSON structures of the three providers into a unified relational structure.
Table 2 outlines the normalized database schema required to harmonize the telemetry across all three vendors, mapping their specific parameter outputs to a standardized internal format.
Database Column
Data Type
OpenAI Source Field
Anthropic Source Field
Gemini (Vertex) Source Field
timestamp_start
DATETIME
start_time
starting_at
Interval Start Time
provider
VARCHAR
Static: "openai"
Static: "anthropic"
Static: "google_vertex"
account_segment
VARCHAR
project_id
workspace_id
GCP Project ID
credential_id
VARCHAR
api_key_id
api_key_id
IAM Principal ID
model_identifier
VARCHAR
model
model
resource.model_id
tokens_input_std
INTEGER
prompt_tokens
uncached_input_tokens
prompt_token_count
tokens_output
INTEGER
completion_tokens
output_tokens
candidates_token_count
tokens_cached
INTEGER
Parsed from details
cache_read_input_tokens
cached_content_token_count
tokens_cache_gen
INTEGER
Parsed from details
ephemeral_1h_input_tokens
N/A
estimated_cost
DECIMAL
Calculated via Pricing
Calculated via Pricing
Calculated via Pricing

The ingestion engine itself should be structured as a resilient Extract, Transform, Load (ETL) microservice.
Extract: The service authenticates with the three providers using the strictly scoped credentials. For OpenAI, it utilizes the Restricted Service Account key with api.usage.read. For Vertex AI, it relies on Application Default Credentials bound to a Service Account restricted to the monitoring.viewer role. For Anthropic, it injects the highly sensitive sk-ant-admin key from a secure vault, executing the HTTP requests to retrieve the paginated usage arrays.
Transform: The service normalizes the disparate JSON arrays. It flattens nested structures, such as Anthropic's cache_creation objects, into standard columns. Crucially, it applies dynamic pricing multipliers based on the model_identifier string to calculate the estimated USD cost for that specific interval, distinguishing between the cost of standard inputs versus cached inputs.
Load: The normalized records are upserted into an analytical database. If the temporal boundaries and dimensional identifiers match an existing record generated by the real-time application interceptor, the authoritative API data overwrites the real-time estimation, finalizing the ledger.
Conclusion
Creating an invaluable, exhaustive token spend tracking system across the disparate ecosystems of OpenAI, Anthropic, and Gemini requires mastering the distinct administrative interfaces and security models of each provider. Relying on superficial web dashboards is insufficient for enterprise scale; true observability requires deep programmatic integration.
By leveraging OpenAI's restricted API keys scoped specifically to the api.usage.read permission 12, utilizing Anthropic's highly granular Messages Usage Report endpoint while strictly guarding the requisite but overly-privileged sk-ant-admin key within a secrets manager 6, and migrating Google workloads entirely to Vertex AI to harness the power of Cloud Monitoring with read-only IAM roles 27, an organization can programmatically extract every facet of its LLM consumption.
Combining these authoritative, asynchronous administrative polls with synchronous response payload interception at the application layer provides the ultimate financial operations solution. It yields real-time operational visibility that is perfectly reconciled against verifiable, highly granular, and securely extracted billing data, ensuring absolute control over enterprise artificial intelligence expenditure.

