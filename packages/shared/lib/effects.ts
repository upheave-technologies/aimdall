// =============================================================================
// Shared — Effect Token Constants
// =============================================================================
// Typed constants for all effect tokens used in defineCapability annotations.
// Use these instead of raw strings to make cross-file connections traceable
// and prevent drift between use case annotations and scenario prover logic.
// =============================================================================

export const EFFECTS = {
  identity: {
    principal: {
      exists: 'identity:principal:exists',
      active: 'identity:principal:active',
      suspended: 'identity:principal:suspended',
      deactivated: 'identity:principal:deactivated',
      deleted: 'identity:principal:deleted',
      updated: 'identity:principal:updated',
    },
  },
  auth: {
    credential: {
      exists: 'auth:credential:exists',
      verified: 'auth:credential:verified',
      revoked: 'auth:credential:revoked',
      allRevoked: 'auth:credential:all-revoked',
    },
    oauth: {
      linked: 'auth:oauth:linked',
    },
    password: {
      changed: 'auth:password:changed',
    },
  },
  iam: {
    policy: {
      exists: 'iam:policy:exists',
      updated: 'iam:policy:updated',
    },
    entitlement: {
      granted: 'iam:entitlement:granted',
      revoked: 'iam:entitlement:revoked',
    },
    access: {
      evaluated: 'iam:access:evaluated',
    },
    permissions: {
      resolved: 'iam:permissions:resolved',
    },
  },
} as const;
