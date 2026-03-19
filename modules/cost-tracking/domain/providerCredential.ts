// =============================================================================
// Domain — ProviderCredential Entity
// =============================================================================
// A ProviderCredential represents an API key, service account, or IAM role
// used to access a provider. Credentials serve two purposes:
//
// 1. Tracking credentials — API keys whose usage we want to monitor and
//    attribute costs to.
// 2. Sync credentials — Admin / elevated keys used to fetch usage data from
//    provider APIs (flagged via isSyncCredential).
//
// Design decisions:
//   - externalId is the provider's own public reference for this credential.
//     The actual secret is never stored.
//   - keyHint stores the last 4 characters for display purposes only.
//   - deletedAt uses undefined (not null) at the domain level.
// =============================================================================

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/** How the credential authenticates with the provider. */
export type CredentialType =
  | 'admin_api_key'
  | 'api_key'
  | 'service_account'
  | 'iam_role'
  | 'oauth_token'
  | 'other';

/** Lifecycle state of a credential. */
export type CredentialStatus = 'active' | 'revoked' | 'expired' | 'suspended';

export type ProviderCredential = {
  id: string;
  providerId: string;
  segmentId?: string;
  externalId: string;
  label: string;
  keyHint?: string;
  credentialType: CredentialType;
  status: CredentialStatus;
  isSyncCredential: boolean;
  scopes?: Record<string, unknown>;
  lastUsedAt?: Date;
  lastSyncAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};
