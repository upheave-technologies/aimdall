# Alert Delivery / Notification System

> Priority: P2
> Impact: High
> Status: Scoped

## Intent

Budgets, anomalies, and circuit breakers all generate events that need to reach humans immediately -- but today, nothing leaves the application. A budget breach at 2 AM sits silently in the UI until someone logs in the next morning. Alert delivery closes this gap by pushing notifications to Slack and email where people actually see them.

## Value

A finance lead configures a $5,000/month budget for the marketing team with a 75% alert threshold. When spend hits $3,750, a Slack message arrives in the #finance-alerts channel: "Marketing team API budget: 75% consumed ($3,750 of $5,000) with 12 days remaining in the period." The team has time to react before the budget is exhausted.

Without delivery, every alert and threshold in the system is retroactive -- the user discovers the problem only when they think to check. With delivery, the problem finds the user.

## Goal

- Budget threshold breaches are delivered within 5 minutes of detection.
- Circuit breaker activations are delivered immediately after execution.
- Anomaly alerts are delivered as part of a daily or post-sync digest (not individually -- anomaly spam is worse than no anomalies).
- A non-technical user can configure "send to this Slack channel when this budget hits 75%" in under 1 minute.
- Alert fatigue is actively managed: no duplicate notifications for the same event, configurable frequency caps, digest mode for high-volume alerts.

## Functionality

### Notification Channels

**Slack Webhook**
The user provides a Slack webhook URL (with clear instructions on how to create one in their Slack workspace settings). All notifications to this channel are formatted as Slack Block Kit messages with structured data, not raw text.

A single webhook can be used for all alerts, or the user can configure different webhooks for different alert types (budget alerts to #finance-alerts, anomalies to #engineering-alerts).

**Email**
The user provides one or more email addresses. Notifications are sent as formatted HTML emails with the same content as Slack messages.

Email delivery requires an outbound email service to be configured. If no email service is available, the email channel is shown as "not configured" with setup instructions.

### Alert Types and Their Delivery Behavior

**Budget threshold alerts**
Triggered when a budget's spend crosses any configured threshold percentage (e.g., 50%, 75%, 90%, 100%). Each threshold triggers exactly once per budget period. Re-notification only happens if the budget period resets or the threshold is reconfigured.

Content: Budget name, current spend, limit, percentage consumed, time remaining in period, scope description (which credentials/groups are covered).

**Circuit breaker activation alerts**
Triggered immediately when a circuit breaker disables credentials. This is the highest-priority notification -- it means API access has been cut.

Content: Budget name, credentials disabled (with provider and label), current spend at time of breach, which enforcement actions succeeded and which failed.

**Circuit breaker recovery alerts**
Triggered when a user re-enables credentials after a circuit breaker activation. Confirms that access has been restored.

Content: Budget name, credentials re-enabled, current spend, new limit (if changed).

**Anomaly digest**
Rather than alerting on every individual anomaly (which would be noisy), anomalies are batched into a digest. The digest is generated after each sync cycle or on a daily schedule.

Content: Number of anomalies detected, top 3 by severity with provider, date, actual vs. baseline spend, and severity rating. Link back to the anomaly detail view.

**Weekly spend summary (optional)**
An opt-in weekly email/Slack message summarizing: total spend this week, comparison to last week, top 3 models by spend, any active budget warnings. This is a low-frequency "state of the world" notification for users who want passive visibility.

### Notification Preferences

A settings view where the user configures:

- Available channels (add/remove Slack webhooks and email addresses)
- Per-alert-type routing: which channels receive which alert types
- Quiet hours (optional): suppress non-critical notifications during specified time windows. Circuit breaker activations are never suppressed.
- Digest frequency for anomalies: after every sync, daily, or weekly

### Delivery Reliability

- Failed deliveries (Slack webhook returns error, email bounces) are retried once after a short delay.
- Persistent failures are logged and surfaced in the UI: "Slack delivery has failed 3 times in the last 24 hours. Check your webhook URL."
- A delivery history log shows recent notifications with status (delivered, failed, retried).

## Constraints

- **No mobile push notifications.** Slack and email only for the initial implementation.
- **No bidirectional interaction.** Notifications are informational. The user cannot take action from within the notification (e.g., no "click to re-enable key" button in Slack). They must go to the Aimdall UI to take action.
- **No PagerDuty/OpsGenie/webhook-generic integration.** Slack webhook is the sole real-time channel. Generic webhook support (send JSON to any URL) could be a future extension but is out of scope.
- **Email requires external service configuration.** Email delivery is only available if an outbound email service is set up. The feature degrades gracefully to Slack-only if email is not configured.
- **Single-tenant only.** No per-user notification preferences, no team-level routing. One set of notification preferences for the entire installation.

## Dependencies

- **Budget system (existing)**: Threshold breach events are the primary trigger for budget alerts.
- **Circuit breakers (Feature 1)**: Activation and recovery events are the trigger for circuit breaker notifications.
- **Anomaly detection (existing)**: The anomaly detection use case already produces anomaly data. The digest wraps these results for delivery.
- **Outbound Slack/email infrastructure (new)**: The actual delivery mechanism -- making HTTP calls to Slack webhooks and sending emails -- must be built.
