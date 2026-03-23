// =============================================================================
// Shared — Capability Name Constants
// =============================================================================
// Typed constants for all capability names used in defineCapability annotations
// and the scenario runner registry. Use these instead of raw strings to make
// the connection between use case annotations and registry keys explicit and
// compiler-verified.
// =============================================================================

export const CAPABILITIES = {
  identity: {
    createPrincipal: 'create-principal',
    getPrincipal: 'get-principal',
    getPrincipalByEmail: 'get-principal-by-email',
    updatePrincipal: 'update-principal',
    suspendPrincipal: 'suspend-principal',
    reactivatePrincipal: 'reactivate-principal',
    deactivatePrincipal: 'deactivate-principal',
  },
  auth: {
    createPasswordCredential: 'create-password-credential',
    verifyPassword: 'verify-password',
    changePassword: 'change-password',
    createApiKey: 'create-api-key',
    verifyApiKey: 'verify-api-key',
    linkOAuthProvider: 'link-oauth-provider',
    verifyOAuthProvider: 'verify-oauth-provider',
    hasActiveCredential: 'has-active-credential',
    revokeCredential: 'revoke-credential',
    revokeAllCredentials: 'revoke-all-credentials',
  },
  iam: {
    createPolicy: 'create-policy',
    updatePolicyActions: 'update-policy-actions',
    grantEntitlement: 'grant-entitlement',
    revokeEntitlement: 'revoke-entitlement',
    resolvePrincipalPermissions: 'resolve-principal-permissions',
    buildPrincipalAbility: 'build-principal-ability',
    evaluateAccess: 'evaluate-access',
  },
} as const;
