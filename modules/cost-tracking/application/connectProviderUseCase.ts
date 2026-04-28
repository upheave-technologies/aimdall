// =============================================================================
// Application — Connect Provider Use Case
// =============================================================================
// Onboards a new AI provider by creating (or locating) the provider record and
// persisting an encrypted sync credential. Idempotent on the provider level —
// if the slug already exists in DB, the existing provider row is reused and a
// new credential is added to it.
//
// Flow:
//   1. Look up provider by slug; create one if it does not exist yet
//   2. Determine which credential field is the primary secret for this provider
//   3. Encrypt the secret using AES-256-GCM
//   4. Compute keyHint (last 4 chars of the plaintext secret)
//   5. Compute externalId (key_hint:XXXX for key-based; projectId for GCP)
//   6. Determine credentialType based on provider
//   7. Insert a new ProviderCredential via credentialRepo.create()
//   8. Return { providerId, credentialId }
//
// Pre-wired export: `connectProvider`
// =============================================================================

import { createId } from '@paralleldrive/cuid2';
import { Result } from '@/packages/shared/lib/result';
import { Provider } from '../domain/provider';
import { ProviderCredential, CredentialType } from '../domain/providerCredential';
import { IProviderRepository, IProviderCredentialRepository } from '../domain/repositories';
import { encrypt } from '../infrastructure/encryption';
import { CostTrackingError } from './costTrackingError';
import { logger } from '../infrastructure/logger';
import { makeProviderRepository, makeProviderCredentialRepository } from '../infrastructure/repositories/DrizzleProviderRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type ConnectProviderInput = {
  providerSlug: string;
  displayName: string;
  credentials: Record<string, string>;
  label?: string;
};

export type ConnectProviderOutput = {
  providerId: string;
  credentialId: string;
};

type SupportedProviderSlug = 'openai' | 'anthropic' | 'google_vertex' | 'google_gemini';

const SUPPORTED_SLUGS: SupportedProviderSlug[] = [
  'openai',
  'anthropic',
  'google_vertex',
  'google_gemini',
];

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the connectProvider use case.
 *
 * @param providerRepo    - Repository for provider CRUD
 * @param credentialRepo  - Repository for credential CRUD
 * @returns Async use case function
 */
export const makeConnectProviderUseCase = (
  providerRepo: IProviderRepository,
  credentialRepo: IProviderCredentialRepository,
) => {
  return async (
    data: ConnectProviderInput,
  ): Promise<Result<ConnectProviderOutput, CostTrackingError>> => {
    // 1. Validate slug
    if (!SUPPORTED_SLUGS.includes(data.providerSlug as SupportedProviderSlug)) {
      return {
        success: false,
        error: new CostTrackingError(
          `Unsupported provider slug "${data.providerSlug}". Must be one of: ${SUPPORTED_SLUGS.join(', ')}.`,
          'VALIDATION_ERROR',
        ),
      };
    }

    const slug = data.providerSlug as SupportedProviderSlug;

    // 2. Find or create provider
    let provider: Provider | null;
    try {
      provider = await providerRepo.findBySlug(slug);
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to look up provider', 'SERVICE_ERROR'),
      };
    }

    if (!provider) {
      const now = new Date();
      const newProvider: Provider = {
        id: createId(),
        slug,
        displayName: data.displayName,
        status: 'active',
        syncState: 'idle',
        syncStartedAt: null,
        syncError: null,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await providerRepo.create(newProvider);
        provider = newProvider;
      } catch {
        return {
          success: false,
          error: new CostTrackingError('Failed to create provider record', 'SERVICE_ERROR'),
        };
      }
    }

    // 3. Determine the primary secret for this provider
    let secret: string;
    let credentialType: CredentialType;
    let externalId: string;

    switch (slug) {
      case 'openai': {
        const apiKey = data.credentials.apiKey;
        if (!apiKey) {
          return {
            success: false,
            error: new CostTrackingError('Missing required credential: apiKey', 'VALIDATION_ERROR'),
          };
        }
        secret = apiKey;
        credentialType = 'api_key';
        const hint = apiKey.slice(-4);
        externalId = `key_hint:${hint}`;
        break;
      }

      case 'anthropic': {
        const adminApiKey = data.credentials.adminApiKey;
        if (!adminApiKey) {
          return {
            success: false,
            error: new CostTrackingError(
              'Missing required credential: adminApiKey',
              'VALIDATION_ERROR',
            ),
          };
        }
        secret = adminApiKey;
        credentialType = 'admin_api_key';
        const hint = adminApiKey.slice(-4);
        externalId = `key_hint:${hint}`;
        break;
      }

      case 'google_vertex': {
        const projectId = data.credentials.projectId;
        if (!projectId) {
          return {
            success: false,
            error: new CostTrackingError(
              'Missing required credential: projectId',
              'VALIDATION_ERROR',
            ),
          };
        }
        secret = projectId;
        credentialType = 'service_account';
        externalId = projectId;
        break;
      }

      case 'google_gemini': {
        const projectId = data.credentials.projectId;
        if (!projectId) {
          return {
            success: false,
            error: new CostTrackingError(
              'Missing required credential: projectId',
              'VALIDATION_ERROR',
            ),
          };
        }
        secret = projectId;
        credentialType = 'service_account';
        externalId = projectId;
        break;
      }
    }

    // 4. Encrypt the secret
    let encryptedSecret: string;
    try {
      encryptedSecret = encrypt(secret);
    } catch (err) {
      logger.error('connectProvider.encrypt_failed', { providerSlug: slug, err });
      return {
        success: false,
        error: new CostTrackingError(
          'Could not save your credentials securely. Please try again or contact support if the problem continues.',
          'SERVICE_ERROR',
        ),
      };
    }

    // 5. Compute keyHint
    const keyHint = secret.slice(-4);

    // 6. Build and persist the credential
    const now = new Date();
    const credentialId = createId();
    const credential: ProviderCredential = {
      id: credentialId,
      providerId: provider.id,
      externalId,
      label: data.label ?? `${data.displayName} Sync Key`,
      keyHint,
      credentialType,
      status: 'active',
      isSyncCredential: true,
      encryptedSecret,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await credentialRepo.create(credential);
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to save provider credential', 'SERVICE_ERROR'),
      };
    }

    // 7. Mark sync as in_progress so the dashboard shows a syncing skeleton
    //    immediately on the next page render. The actual sync is spawned as a
    //    fire-and-forget promise by the server action layer after this returns.
    try {
      await providerRepo.markSyncStarted(provider.id);
    } catch {
      // Best effort — if this fails the credential is still saved; the dashboard
      // will show 'idle' instead of 'in_progress' until the next sync tick.
      logger.warn('connectProvider.markSyncStarted_failed', { providerId: provider.id });
    }

    return {
      success: true,
      value: { providerId: provider.id, credentialId },
    };
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const providerRepo = makeProviderRepository(db);
const credentialRepo = makeProviderCredentialRepository(db);

export const connectProvider = makeConnectProviderUseCase(providerRepo, credentialRepo);
