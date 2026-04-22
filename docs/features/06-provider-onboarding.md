# Provider Onboarding Flow

> Priority: P2
> Impact: High
> Status: Scoped

## Intent

Adding a new AI provider to Aimdall currently requires editing environment variables, understanding credential types, and knowing which API permissions to grant. This is a barrier that prevents the "see your last 90 days in 5 minutes" onboarding story from working. A guided setup wizard replaces manual configuration with a step-by-step flow that gets a provider connected and syncing in minutes.

## Value

A new user installs Aimdall and wants to see where their OpenAI spend is going. Today: they read docs, figure out which env vars to set, generate an admin API key in the OpenAI dashboard (hoping they pick the right permission level), restart the application, trigger a sync, and wait.

After: they click "Add Provider," select "OpenAI," see a visual guide showing exactly where to find their admin API key in the OpenAI dashboard (with screenshots), paste it in, click "Test Connection," see a green checkmark, click "Start Sync," and watch 90 days of historical usage data flow in. The entire experience takes under 5 minutes and requires zero documentation.

This is the single biggest improvement for first-time setup experience. Every feature in this product is worthless until the first provider is connected and data is flowing.

## Goal

- A user with no prior knowledge of Aimdall can connect their first provider and see historical data within 5 minutes.
- The onboarding flow handles the credential creation guidance, validation, connection testing, and initial sync trigger as one continuous experience.
- Failed connections produce clear, actionable error messages (not "403 Forbidden" but "Your API key doesn't have the 'usage' permission. Here's how to fix that in the OpenAI dashboard.").
- Credentials entered through the onboarding flow are stored securely and never displayed in full after initial entry.

## Functionality

### Provider Selection

The first step presents all supported providers with their logos, names, and a one-line description of what data Aimdall pulls from them:

- **OpenAI**: "Usage data, model consumption, and cost data across all API keys"
- **Anthropic**: "Token usage, caching metrics, and batch tier consumption"
- **Google Vertex AI**: "Service account usage, model metrics, and project-level data"
- **Google Gemini**: "API usage and model consumption via the Gemini API"

Each provider card shows whether it's already connected or not.

### Credential Setup Guide

After selecting a provider, a step-by-step guide walks the user through creating the required credentials in the provider's own dashboard. This is provider-specific:

**OpenAI:**
1. "Go to platform.openai.com/settings/organization/api-keys"
2. "Create a new API key with the 'Usage' permission" (with annotated screenshot showing the permission selector)
3. "Copy the key and paste it below"
4. Input field for the API key, with a "What permissions does this need?" expandable help section

**Anthropic:**
1. "Go to console.anthropic.com/settings/keys"
2. "Create a new Admin API key" (with screenshot)
3. "Copy the key and paste it below"
4. For circuit breaker support: "This key also needs the 'Manage Keys' permission to enable budget enforcement (optional)"

**Google Vertex AI:**
1. "Create a service account with the 'Monitoring Viewer' role in your Google Cloud project"
2. "Generate a JSON key file for this service account"
3. "Upload the key file or paste the JSON content below"
4. "Enter your Google Cloud project ID"

**Google Gemini:**
1. "Go to aistudio.google.com/apikey"
2. "Create or select an API key"
3. "Copy the key and paste it below"

Each guide adapts to the provider's specific authentication mechanism. The instructions should be detailed enough that a user who has never done this before can follow them without leaving the Aimdall application.

### Connection Test

After credential entry, a "Test Connection" step:

1. Makes a minimal API call to the provider to verify the credential works.
2. On success: green checkmark, provider display name confirmed, shows which data capabilities are available.
3. On failure: specific error message mapped to common causes:
   - Invalid key format: "This doesn't look like a valid API key for [Provider]. Keys usually start with [prefix]."
   - Authentication failure: "This key was rejected by [Provider]. It may be expired, revoked, or incorrectly copied."
   - Insufficient permissions: "Connection succeeded but this key doesn't have access to usage data. You need the [specific permission] -- here's how to add it."
   - Network error: "Couldn't reach [Provider]'s API. Check your network connection."

The user can retry with a different key without restarting the flow.

### Initial Sync

After a successful connection test:

1. The system asks how far back to sync: "How much historical data should we pull? (Recommended: 90 days)"
   - Options: 30 days, 60 days, 90 days, 180 days, All available
2. The sync starts and the user sees a progress indicator: "Syncing December 2025... January 2026... February 2026..."
3. As data arrives, the user sees real-time counters: "12,450 usage records imported, $8,340 total spend identified"
4. On completion: "Done! We imported 90 days of data from OpenAI. Here's your spend summary:" followed by a mini-dashboard showing total spend, top models, and a trend line.
5. A "Go to Dashboard" button takes them to the full cost tracking overview.

### Credential Management (Post-Onboarding)

After initial setup, a settings page shows all connected providers with:

- Connection status (connected / error / syncing)
- Last successful sync timestamp
- Credential hint (last 4 characters only, never full key)
- "Reconnect" action (replace credential without deleting data)
- "Disconnect" action (stop syncing, keep historical data, require confirmation)
- "Sync Now" action (trigger an immediate sync outside the regular schedule)

### Multiple Providers

After the first provider is connected, the user can add additional providers from the same settings page. Each follows the same wizard flow. The dashboard automatically aggregates data across all connected providers.

## Constraints

- **Credentials are stored, not proxied.** The credentials entered are admin/sync keys stored in the application's configuration. They are not used for API traffic proxying. The onboarding flow should make clear that Aimdall reads billing data -- it does not intercept or route API calls.
- **Provider API changes.** The step-by-step guides include screenshots and specific UI paths that may change when providers update their dashboards. Guides should be structured to be easy to update and should include "last verified" dates.
- **No OAuth flow.** All providers use API keys or service account credentials, not OAuth. If a provider adds OAuth support for billing API access in the future, the onboarding flow would need to be extended.
- **Single-tenant.** There is no per-user credential management or team-level provider access control. One set of credentials per provider per installation.

## Dependencies

- **Provider sync pipeline (existing)**: The sync infrastructure, credential storage, and usage data ingestion are already built. The onboarding flow wraps these capabilities in a user-friendly experience.
- **Provider usage clients (existing)**: Connection testing uses the existing provider clients' ability to make authenticated API calls.
- **Credential entity (existing)**: ProviderCredential with its type, status, and metadata fields stores the configured credentials.
