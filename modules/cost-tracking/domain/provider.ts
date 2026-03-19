// =============================================================================
// Domain — Provider Entity
// =============================================================================
// A Provider represents a connected AI service (Anthropic, OpenAI, Google
// Vertex, AWS Bedrock, etc.). This is the root entity that all cost-tracking
// data hangs from.
//
// Design decisions:
//   - slug is the canonical machine-readable identifier ('anthropic', 'openai').
//     Validation enforces non-empty, lowercase, underscore-safe strings.
//   - configuration stores provider-specific JSONB settings and is captured
//     as Record<string, unknown> at the domain level, with no ORM coupling.
//   - All functions are pure: same input always produces the same output.
//   - deletedAt uses undefined (not null) at the domain level to stay free of
//     database-specific null semantics.
// =============================================================================

import { Result } from '@/packages/shared/lib/result';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/** Machine-readable identifier for a provider, e.g. 'anthropic', 'openai'. */
export type ProviderSlug = string;

/** Operational state of a connected provider. */
export type ProviderStatus = 'active' | 'paused' | 'error';

export type Provider = {
  id: string;
  slug: ProviderSlug;
  displayName: string;
  apiBaseUrl?: string;
  status: ProviderStatus;
  configuration?: Record<string, unknown>;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

// =============================================================================
// SECTION 2: FUNCTIONS
// =============================================================================

/**
 * Validates that a provider slug is non-empty and contains only lowercase
 * letters, digits, and underscores.
 *
 * Business rules:
 *   - Cannot be empty or whitespace-only
 *   - Must match /^[a-z0-9_]+$/
 */
export const validateProviderSlug = (slug: string): Result<ProviderSlug, Error> => {
  if (!slug || slug.trim().length === 0) {
    return { success: false, error: new Error('Provider slug cannot be empty') };
  }

  if (!/^[a-z0-9_]+$/.test(slug.trim())) {
    return {
      success: false,
      error: new Error(
        `Provider slug "${slug}" is invalid. Must contain only lowercase letters, digits, and underscores.`,
      ),
    };
  }

  return { success: true, value: slug.trim() };
};

/**
 * Creates a partial Provider value object after validating the slug.
 * The id and timestamps are provided by the application layer.
 *
 * Business rules:
 *   - slug must pass validateProviderSlug
 *   - displayName cannot be empty
 *   - status defaults to 'active'
 */
export const createProvider = (
  slug: string,
  displayName: string,
  options?: {
    apiBaseUrl?: string;
    configuration?: Record<string, unknown>;
    status?: ProviderStatus;
  },
): Result<Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>, Error> => {
  const slugResult = validateProviderSlug(slug);
  if (!slugResult.success) return slugResult;

  if (!displayName || displayName.trim().length === 0) {
    return { success: false, error: new Error('Provider displayName cannot be empty') };
  }

  return {
    success: true,
    value: {
      slug: slugResult.value,
      displayName: displayName.trim(),
      status: options?.status ?? 'active',
      apiBaseUrl: options?.apiBaseUrl,
      configuration: options?.configuration,
    },
  };
};
