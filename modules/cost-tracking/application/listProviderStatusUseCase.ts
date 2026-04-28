// =============================================================================
// Application — List Provider Status Use Case
// =============================================================================
// Returns the connection status for ALL supported providers, merging a static
// catalog with live data from the database. Providers that have not been
// connected yet appear in the list with status "not_connected".
//
// Flow:
//   1. Fetch all providers from DB via providerRepo.findAll()
//   2. For each DB provider, fetch its sync credentials via
//      credentialRepo.findSyncCredentials(provider.id)
//   3. Merge with the static SUPPORTED_PROVIDERS catalog
//   4. Return the merged list ordered by catalog position
//
// Pre-wired export: `listProviderStatus`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IProviderRepository, IProviderCredentialRepository } from '../domain/repositories';
import { ProviderSyncState } from '../domain/provider';
import { CostTrackingError } from './costTrackingError';
import { makeProviderRepository, makeProviderCredentialRepository } from '../infrastructure/repositories/DrizzleProviderRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type ProviderStatusItem = {
  slug: string;
  displayName: string;
  description: string;
  connected: boolean;
  status: 'active' | 'paused' | 'error' | 'not_connected';
  lastSyncAt?: Date;
  credentialHint?: string;
  providerId?: string;
  credentialId?: string;
  syncState: ProviderSyncState;
  syncStartedAt: Date | null;
  syncError: string | null;
};

// =============================================================================
// SECTION 2: STATIC CATALOG
// =============================================================================

export const SUPPORTED_PROVIDERS: ReadonlyArray<{
  slug: string;
  displayName: string;
  description: string;
}> = [
  {
    slug: 'openai',
    displayName: 'OpenAI',
    description: 'Usage data, model consumption, and cost data across all API keys',
  },
  {
    slug: 'anthropic',
    displayName: 'Anthropic',
    description: 'Token usage, caching metrics, and batch tier consumption',
  },
  {
    slug: 'google_vertex',
    displayName: 'Google Vertex AI',
    description: 'Service account usage, model metrics, and project-level data',
  },
  {
    slug: 'google_gemini',
    displayName: 'Google Gemini',
    description: 'API usage and model consumption via the Gemini API',
  },
];

// =============================================================================
// SECTION 3: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the listProviderStatus use case.
 *
 * Returns every supported provider, regardless of whether it has been
 * connected. Disconnected providers appear with status "not_connected".
 *
 * @param providerRepo   - Repository for fetching provider records
 * @param credentialRepo - Repository for fetching sync credentials
 * @returns Async use case function
 */
export const makeListProviderStatusUseCase = (
  providerRepo: IProviderRepository,
  credentialRepo: IProviderCredentialRepository,
) => {
  return async (): Promise<Result<ProviderStatusItem[], CostTrackingError>> => {
    try {
      // 1. Fetch all providers currently in the database
      const dbProviders = await providerRepo.findAll();

      // 2. Build a lookup map: slug → { provider, syncCredentials }
      const providerMap = new Map<
        string,
        {
          id: string;
          status: string;
          lastSyncAt?: Date;
          syncCredentialId?: string;
          keyHint?: string;
          syncState: ProviderSyncState;
          syncStartedAt: Date | null;
          syncError: string | null;
        }
      >();

      await Promise.all(
        dbProviders.map(async (provider) => {
          const syncCredentials = await credentialRepo.findSyncCredentials(provider.id);
          const primaryCredential = syncCredentials[0];
          providerMap.set(provider.slug, {
            id: provider.id,
            status: provider.status,
            lastSyncAt: provider.lastSyncAt,
            syncCredentialId: primaryCredential?.id,
            keyHint: primaryCredential?.keyHint,
            syncState: provider.syncState,
            syncStartedAt: provider.syncStartedAt,
            syncError: provider.syncError,
          });
        }),
      );

      // 3. Merge catalog with DB data
      const items: ProviderStatusItem[] = SUPPORTED_PROVIDERS.map((catalogEntry) => {
        const dbEntry = providerMap.get(catalogEntry.slug);

        if (!dbEntry) {
          return {
            slug: catalogEntry.slug,
            displayName: catalogEntry.displayName,
            description: catalogEntry.description,
            connected: false,
            status: 'not_connected' as const,
            syncState: 'idle' as ProviderSyncState,
            syncStartedAt: null,
            syncError: null,
          };
        }

        const connected = !!dbEntry.syncCredentialId;

        return {
          slug: catalogEntry.slug,
          displayName: catalogEntry.displayName,
          description: catalogEntry.description,
          connected,
          status: connected
            ? (dbEntry.status as 'active' | 'paused' | 'error')
            : 'not_connected' as const,
          lastSyncAt: dbEntry.lastSyncAt,
          credentialHint: dbEntry.keyHint,
          providerId: dbEntry.id,
          credentialId: dbEntry.syncCredentialId,
          syncState: dbEntry.syncState,
          syncStartedAt: dbEntry.syncStartedAt,
          syncError: dbEntry.syncError,
        };
      });

      return { success: true, value: items };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to list provider status', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 4: PRE-WIRED INSTANCE
// =============================================================================

const providerRepo = makeProviderRepository(db);
const credentialRepo = makeProviderCredentialRepository(db);

export const listProviderStatus = makeListProviderStatusUseCase(providerRepo, credentialRepo);
