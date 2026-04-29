// =============================================================================
// Domain — GCP Service Account Credential
// =============================================================================
// Pure types and validation for GCP Service Account JSON credentials used by
// the Gemini and Vertex AI providers. This file has zero external dependencies
// and no side effects.
//
// Security contract (enforced here, nowhere else):
//   - The JSON must be of type "service_account"
//   - Required fields: type, project_id, client_email, private_key, private_key_id
//   - private_key must contain PEM BEGIN/END PRIVATE KEY markers
//   - Surrounding whitespace is stripped from all string fields
//
// Safe metadata (may be logged or returned to clients):
//   - project_id
//   - client_email
//
// Never log or return:
//   - private_key
//   - private_key_id
//   - The raw JSON string
// =============================================================================

import { Result } from '@/packages/shared/lib/result';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/**
 * The subset of GCP Service Account JSON fields required by the Cloud
 * Monitoring client. Additional fields in the JSON file are accepted but
 * ignored.
 */
export type ServiceAccountJson = {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
};

// =============================================================================
// SECTION 2: VALIDATION
// =============================================================================

/**
 * Parses and validates a raw GCP Service Account JSON string.
 *
 * Validation rules (all non-negotiable):
 *   1. Must be valid JSON
 *   2. type field must equal "service_account"
 *   3. project_id, client_email, private_key, private_key_id must all be
 *      non-empty strings after trimming
 *   4. private_key must contain "BEGIN PRIVATE KEY" and "END PRIVATE KEY"
 *
 * Returns a Result with the parsed ServiceAccountJson on success, or an
 * Error with a plain-language user-facing message on failure.
 *
 * Never throws. Never logs.
 */
export const parseServiceAccountJson = (raw: string): Result<ServiceAccountJson, Error> => {
  const trimmed = raw.trim();

  // 1. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      success: false,
      error: new Error(
        'The file you uploaded is not valid JSON. Download the service account key file directly from the Google Cloud Console (IAM & Admin → Service Accounts → Keys → Add Key → JSON).',
      ),
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      success: false,
      error: new Error(
        'The uploaded file does not look like a service account key. It should be a JSON object downloaded from Google Cloud Console.',
      ),
    };
  }

  const obj = parsed as Record<string, unknown>;

  // 2. type must be "service_account"
  if (obj['type'] !== 'service_account') {
    return {
      success: false,
      error: new Error(
        'This JSON file is not a service account key (the "type" field is not "service_account"). ' +
          'In the Google Cloud Console, go to IAM & Admin → Service Accounts → Keys → Add Key → JSON.',
      ),
    };
  }

  // 3. Required string fields
  const requiredFields = ['project_id', 'client_email', 'private_key', 'private_key_id'] as const;
  for (const field of requiredFields) {
    const value = obj[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      return {
        success: false,
        error: new Error(
          `The service account key file is missing the required field "${field}". ` +
            'Make sure you are uploading the full JSON key file downloaded from Google Cloud Console.',
        ),
      };
    }
  }

  const projectId = (obj['project_id'] as string).trim();
  const clientEmail = (obj['client_email'] as string).trim();
  const privateKeyId = (obj['private_key_id'] as string).trim();
  const privateKey = (obj['private_key'] as string).trim();

  // 4. Private key must contain PEM markers
  if (!privateKey.includes('BEGIN PRIVATE KEY') || !privateKey.includes('END PRIVATE KEY')) {
    return {
      success: false,
      error: new Error(
        'The private_key field does not look like a valid PEM-encoded private key. ' +
          'It must contain "BEGIN PRIVATE KEY" and "END PRIVATE KEY" markers. ' +
          'Download a fresh JSON key from Google Cloud Console.',
      ),
    };
  }

  return {
    success: true,
    value: {
      type: 'service_account',
      project_id: projectId,
      private_key_id: privateKeyId,
      private_key: privateKey,
      client_email: clientEmail,
    },
  };
};
