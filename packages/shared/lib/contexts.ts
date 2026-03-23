// =============================================================================
// Shared — Context Constants
// =============================================================================
// Typed constants for context key-value pairs used in defineCapability
// annotations. Use these instead of raw object literals to ensure context
// values remain consistent across all use cases.
// =============================================================================

export const CONTEXTS = {
  credentialType: {
    key: 'credential_type',
    password: { credential_type: 'password' } as const,
    apiKey: { credential_type: 'api_key' } as const,
    oauth: { credential_type: 'oauth' } as const,
  },
} as const;
