// =============================================================================
// Cost Tracking Module — Provider Client Builder (Database)
// =============================================================================
// Builds ProviderUsageClient instances from credentials stored in the database.
// Complements buildProviderClients.ts (which reads from environment variables).
//
// For each active provider, this function fetches sync credentials that have an
// encrypted secret, decrypts each secret, and constructs the appropriate client.
//
// Error isolation: if a single credential fails to decrypt, it is skipped with
// a warning log — the remaining credentials continue to be processed.
// =============================================================================

import { decrypt } from '../encryption';
import { makeOpenAIUsageClient } from './openaiUsageClient';
import { makeAnthropicUsageClient } from './anthropicUsageClient';
import { makeVertexUsageClient } from './vertexUsageClient';
import { makeGeminiUsageClient } from './geminiUsageClient';
import { ProviderUsageClient } from './types';
import { IProviderRepository, IProviderCredentialRepository } from '../../domain/repositories';
import { logger } from '../logger';

/**
 * Constructs ProviderUsageClient instances from sync credentials stored in the
 * database. Decrypts each credential's encryptedSecret using AES-256-GCM via
 * the ENCRYPTION_KEY environment variable.
 *
 * Provider slug → client factory mapping:
 *   openai         → makeOpenAIUsageClient(apiKey)
 *   anthropic      → makeAnthropicUsageClient(apiKey)
 *   google_vertex  → makeVertexUsageClient(projectId)
 *   google_gemini  → makeGeminiUsageClient({ projectId })
 *
 * Credentials that fail decryption are skipped with a warning. If no
 * ENCRYPTION_KEY is set, all decryptions throw and the returned array is empty.
 *
 * @param providerRepo    - Repository for fetching all active providers
 * @param credentialRepo  - Repository for fetching sync credentials per provider
 * @returns Array of constructed provider usage clients (may be empty)
 */
export const buildProviderClientsFromDb = async (
  providerRepo: IProviderRepository,
  credentialRepo: IProviderCredentialRepository,
): Promise<ProviderUsageClient[]> => {
  const clients: ProviderUsageClient[] = [];

  const providers = await providerRepo.findAll();

  for (const provider of providers) {
    const syncCredentials = await credentialRepo.findSyncCredentials(provider.id);

    for (const credential of syncCredentials) {
      if (!credential.encryptedSecret) {
        continue;
      }

      let decryptedSecret: string;

      try {
        decryptedSecret = decrypt(credential.encryptedSecret);
      } catch (err) {
        logger.warn('buildProviderClientsFromDb.decrypt_failed', {
          providerId: provider.id,
          providerSlug: provider.slug,
          credentialId: credential.id,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      try {
        switch (provider.slug) {
          case 'openai':
            clients.push(makeOpenAIUsageClient(decryptedSecret));
            break;

          case 'anthropic':
            clients.push(makeAnthropicUsageClient(decryptedSecret));
            break;

          case 'google_vertex':
            clients.push(makeVertexUsageClient(decryptedSecret));
            break;

          case 'google_gemini':
            clients.push(makeGeminiUsageClient({ projectId: decryptedSecret }));
            break;

          default:
            logger.warn('buildProviderClientsFromDb.unknown_slug', {
              providerId: provider.id,
              providerSlug: provider.slug,
              credentialId: credential.id,
            });
        }
      } catch (err) {
        logger.warn('buildProviderClientsFromDb.client_build_failed', {
          providerId: provider.id,
          providerSlug: provider.slug,
          credentialId: credential.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  logger.info('buildProviderClientsFromDb', { clientCount: clients.length });

  return clients;
};
