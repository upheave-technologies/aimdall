// =============================================================================
// Domain — KeyAssignment Entity
// =============================================================================
// A KeyAssignment maps a Principal (user) to a ProviderCredential (API key).
// This is the domain record that says "this person uses this API key" —
// enabling per-user cost attribution for shared provider accounts.
//
// Design decisions:
//   - principalId is a soft link to the Identity module — no FK constraint
//     across module boundaries per the Axiom of Data Sovereignty.
//   - Both principalId and credentialId must be non-empty strings. The use
//     case layer is responsible for verifying both entities actually exist
//     before creating an assignment.
//   - deletedAt uses null (not undefined) to match the database convention
//     for this entity (the table stores NULL for active records).
//   - All validation functions return Result<T, Error> — never throw.
// =============================================================================

import { Result } from '@/packages/shared/lib/result';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type KeyAssignment = {
  id: string;
  principalId: string;
  credentialId: string;
  assignedAt: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// =============================================================================
// SECTION 2: VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates a KeyAssignment's principalId and credentialId fields.
 * Business rules:
 *   - principalId must be a non-empty string
 *   - credentialId must be a non-empty string
 *
 * Note: This does NOT verify that the Principal or ProviderCredential actually
 * exist — that is the responsibility of the application layer use case.
 */
export const validateKeyAssignment = (input: {
  principalId: string;
  credentialId: string;
}): Result<{ principalId: string; credentialId: string }, Error> => {
  if (!input.principalId || input.principalId.trim().length === 0) {
    return {
      success: false,
      error: new Error('KeyAssignment.principalId cannot be empty'),
    };
  }

  if (!input.credentialId || input.credentialId.trim().length === 0) {
    return {
      success: false,
      error: new Error('KeyAssignment.credentialId cannot be empty'),
    };
  }

  return {
    success: true,
    value: {
      principalId: input.principalId.trim(),
      credentialId: input.credentialId.trim(),
    },
  };
};

// =============================================================================
// SECTION 3: FACTORY FUNCTION
// =============================================================================

/**
 * Validates and returns the core fields needed to create a new KeyAssignment.
 * The calling use case is responsible for appending id and timestamps.
 *
 * Business rules applied:
 *   1. principalId must be a non-empty string
 *   2. credentialId must be a non-empty string
 */
export const createKeyAssignment = (input: {
  principalId: string;
  credentialId: string;
}): Result<{ principalId: string; credentialId: string }, Error> => {
  return validateKeyAssignment(input);
};
