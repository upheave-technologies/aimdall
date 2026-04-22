# Circuit Breakers / Smart Budget Enforcement

> Priority: P1
> Impact: Critical
> Status: Scoped

## Intent

Every cost tracking tool tells you when you've overspent -- after the damage is done. Circuit breakers make Aimdall the only tool that can actually *prevent* overspend by disabling API keys when budgets are exceeded. This transforms budgets from passive monitoring into active financial controls.

## Value

A finance lead sets a $5,000/month hard limit on the marketing team's API spend. When spend hits $5,000, the system automatically disables the relevant API keys. No human intervention, no lag, no "we'll catch it next week." The team's keys stop working within minutes of the threshold being crossed.

This is the difference between "we knew we overspent" and "we stopped the overspend." No other tool in this space can do this because nobody else has built the provider API integrations to toggle credentials on and off.

For the current single-tenant user, this means: set a budget, trust that it works, stop worrying about runaway costs from a misconfigured batch job or an employee experimenting with expensive models.

## Goal

- A hard_limit budget, when breached, automatically disables the API keys in its scope within 5 minutes of the threshold being detected.
- A disabled key can be re-enabled through the UI without recreating it (for supported providers).
- The user knows exactly which providers support full disable/re-enable, which support disable-only, and which have no enforcement capability.
- Zero false activations: a circuit breaker must never trigger on stale data or calculation errors.

## Functionality

### Budget Enforcement Configuration

The existing budget system has three types: hard_limit, soft_alert, and tracking_only. Currently none of them do anything when exceeded. Circuit breakers add enforcement behavior to hard_limit budgets.

When creating or editing a hard_limit budget, the user sees an enforcement section that shows which credentials are in scope and what will happen to each if the budget is breached. The system clearly communicates per-credential enforcement capability:

- **Full enforcement** (Anthropic, Google/Vertex): Key can be disabled and re-enabled. The system will toggle the key off when the budget is exceeded and the user can toggle it back on from the UI.
- **Destructive enforcement** (OpenAI): Key can only be deleted, not disabled. The user must explicitly opt in to destructive enforcement and acknowledge that a new key must be created manually to restore access. This is off by default.
- **No enforcement** (providers without key management APIs): The budget will alert but cannot enforce. The UI shows this clearly so the user knows which keys are protected and which are not.

### Breach Detection and Response

The system evaluates budgets on a regular cycle (after each sync, and/or on a configurable polling interval). When a hard_limit budget's spend crosses 100% of its amount:

1. The system identifies all credentials in the budget's scope.
2. For each credential with enforcement capability, it calls the provider API to disable the key.
3. The credential's status in Aimdall is updated to reflect the externally-disabled state.
4. A breach event is recorded with: timestamp, budget name, spend at time of breach, credentials affected, actions taken, and any failures.
5. The budget status changes to "exceeded" and the UI shows a prominent breach indicator.

If a provider API call fails (network error, permission denied, API changed), the system records the failure, marks the credential as "enforcement failed," and continues with remaining credentials. Partial enforcement is better than no enforcement.

### Manual Override and Recovery

After a circuit breaker activates:

- The user sees a clear summary: which keys were disabled, which failed, current spend vs. limit.
- For fully-enforceable providers: a "Re-enable" action in the UI that calls the provider API to restore the key. This should require explicit confirmation ("This will allow API usage to resume and spend to continue").
- For destructive-enforcement providers (OpenAI): the UI explains that the key was deleted and provides instructions for creating a new one in the provider's dashboard.
- The user can increase the budget limit to prevent immediate re-triggering after re-enabling keys.
- The user can pause the budget to temporarily disable enforcement without changing the limit.

### Enforcement Status Dashboard

The budget detail view shows enforcement status for every credential in scope:

- Credential label and provider
- Enforcement capability (full / destructive / none)
- Current enforcement state (active / disabled / enforcement-failed / not-enforceable)
- Last enforcement action timestamp
- For failed enforcement: the error reason

### Provider Capability Per Research

| Provider | Disable | Re-enable | Enforcement Type |
|----------|---------|-----------|------------------|
| Anthropic | Yes (status: inactive) | Yes (status: active) | Full |
| Google/Vertex | Yes (IAM disable) | Yes (IAM enable) | Full |
| AWS Bedrock | Yes (IAM deny policy) | Yes (remove policy) | Full |
| Azure OpenAI | Yes (disableLocalAuth) | Yes (re-enable) | Full |
| OpenAI | Delete only | No (must create new key) | Destructive |

### Safeguards

- **Sync credential protection**: Credentials flagged as sync credentials (isSyncCredential = true) must never be disabled by circuit breakers. Disabling a sync credential would break the data pipeline. The system must exclude these automatically and warn the user if a budget's scope includes only sync credentials.
- **Cool-down period**: After a circuit breaker activates, it should not re-trigger for the same budget within a configurable window (e.g., 1 hour) to prevent rapid disable/re-enable cycles if the user adjusts the budget near the limit.
- **Dry-run mode**: Before enabling enforcement on a hard_limit budget, the user can see "what would have happened" -- a simulation that shows which credentials would have been disabled in the past month based on current budget settings.

## Constraints

- We can only enforce on providers whose APIs support credential management. OpenAI's API does not support disabling keys -- only deleting them. This is a permanent limitation of OpenAI's platform.
- Enforcement is reactive, not real-time. There is inherent delay between when spend occurs and when the billing API reports it. For most providers this is minutes to hours. The system cannot guarantee sub-minute enforcement.
- We do not have the provider API secrets needed to manage credentials. The user must grant additional permissions (admin API keys for Anthropic, IAM permissions for Google) beyond what's needed for usage data sync. The onboarding for this must be clear about what permissions are needed and why.
- Multi-tenancy is out of scope. There is no RBAC controlling who can set or override circuit breakers.

## Dependencies

- **Existing budget system**: The budget entity, evaluation logic, and scope mechanism already exist. Circuit breakers extend the hard_limit budget type with enforcement behavior.
- **Provider credential management APIs**: New infrastructure-layer clients that can disable/enable credentials through provider APIs. These are separate from the existing usage sync clients.
- **Credential status tracking**: The ProviderCredential entity already has a status field (active/revoked/expired/suspended). This needs to track externally-disabled state and enforcement history.
- **Alert delivery (future)**: Circuit breaker activation events should be deliverable via Slack/email once the notification system exists. Until then, the breach is visible in the UI only.
