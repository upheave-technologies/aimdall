// =============================================================================
// Application — Get Auto-Discovery Suggestions Use Case
// =============================================================================
// Analyses credentials and usage data to surface discovery suggestions that
// help operators quickly set up attribution groups without manual configuration.
//
// Flow:
//   1. Fetch all credentials with provider info via findAllWithProvider
//   2. Fetch per-credential usage summaries (last 30 days) to determine
//      which model slugs and service categories each credential uses
//   3. Build a CredentialInfo[] enriched with modelSlugs and serviceCategories
//   4. Run discoverCredentialClusters and discoverUsagePatterns (domain functions)
//   5. Merge suggestions, deduplicate by id, and sort by confidence (high first)
//   6. Return sorted DiscoverySuggestion[]
//
// Pre-wired export: `getAutoDiscoverySuggestions`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import {
  IProviderCredentialRepository,
  IUsageRecordRepository,
} from '../domain/repositories';
import {
  CredentialInfo,
  DiscoverySuggestion,
  discoverCredentialClusters,
  discoverUsagePatterns,
} from '../domain/attributionTemplate';
import { CostTrackingError } from './costTrackingError';
import { resolveDateRange } from '../domain/dateRange';
import { makeProviderCredentialRepository } from '../infrastructure/repositories/DrizzleProviderRepository';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type GetAutoDiscoverySuggestionsInput = Record<string, never>;

// =============================================================================
// SECTION 2: CONFIDENCE SORT ORDER
// =============================================================================

const CONFIDENCE_ORDER: Record<DiscoverySuggestion['confidence'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// =============================================================================
// SECTION 3: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the getAutoDiscoverySuggestions use case.
 *
 * @param credentialRepo  - Repository for fetching credentials with provider info
 * @param usageRecordRepo - Repository for per-credential usage summaries
 * @returns Async use case function
 */
export const makeGetAutoDiscoverySuggestionsUseCase = (
  credentialRepo: IProviderCredentialRepository,
  usageRecordRepo: IUsageRecordRepository,
) => {
  return async (
    _data: GetAutoDiscoverySuggestionsInput,
  ): Promise<Result<DiscoverySuggestion[], CostTrackingError>> => {
    try {
      // Step 1: Fetch all credentials with provider display name
      // findAllWithProvider returns: { id, label, keyHint, providerDisplayName }
      const credentialsWithProvider = await credentialRepo.findAllWithProvider();

      // Step 2: Fetch per-credential usage summaries to enrich with model/category data
      // Use default last-30-day range for discovery analysis
      const { startDate, endDate } = resolveDateRange();
      const usageRows = await usageRecordRepo.findSummaryByCredential(startDate, endDate);

      // Build maps: credentialId → Set<modelSlug>, credentialId → Set<serviceCategory>
      // and credentialId → providerId (sourced from usage data)
      const modelsByCredential = new Map<string, Set<string>>();
      const categoriesByCredential = new Map<string, Set<string>>();
      const providerIdByCredential = new Map<string, string>();

      for (const row of usageRows) {
        const credId = row.credentialId;
        if (!credId) continue;

        // Track providerId from usage row
        if (!providerIdByCredential.has(credId)) {
          providerIdByCredential.set(credId, row.providerId);
        }

        if (!modelsByCredential.has(credId)) modelsByCredential.set(credId, new Set());
        if (!categoriesByCredential.has(credId)) categoriesByCredential.set(credId, new Set());

        if (row.modelSlug) modelsByCredential.get(credId)!.add(row.modelSlug);
        if (row.serviceCategory) categoriesByCredential.get(credId)!.add(row.serviceCategory);
      }

      // Step 3: Build enriched CredentialInfo[]
      const credentialInfos: CredentialInfo[] = credentialsWithProvider.map((cred) => ({
        id: cred.id,
        label: cred.label,
        keyHint: cred.keyHint,
        providerDisplayName: cred.providerDisplayName,
        providerId: providerIdByCredential.get(cred.id) ?? '',
        modelSlugs: modelsByCredential.has(cred.id)
          ? Array.from(modelsByCredential.get(cred.id)!)
          : undefined,
        serviceCategories: categoriesByCredential.has(cred.id)
          ? Array.from(categoriesByCredential.get(cred.id)!)
          : undefined,
      }));

      // Step 4: Run domain discovery functions
      const clusterSuggestions = discoverCredentialClusters(credentialInfos);
      const patternSuggestions = discoverUsagePatterns(credentialInfos);

      // Step 5: Merge and deduplicate by id
      const seen = new Set<string>();
      const merged: DiscoverySuggestion[] = [];

      for (const suggestion of [...clusterSuggestions, ...patternSuggestions]) {
        if (!seen.has(suggestion.id)) {
          seen.add(suggestion.id);
          merged.push(suggestion);
        }
      }

      // Step 6: Sort by confidence (high → medium → low)
      merged.sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]);

      return { success: true, value: merged };
    } catch {
      return {
        success: false,
        error: new CostTrackingError(
          'Failed to compute auto-discovery suggestions',
          'SERVICE_ERROR',
        ),
      };
    }
  };
};

// =============================================================================
// SECTION 4: PRE-WIRED INSTANCE
// =============================================================================

const credentialRepo = makeProviderCredentialRepository(db);
const usageRecordRepo = makeUsageRecordRepository(db);

export const getAutoDiscoverySuggestions = makeGetAutoDiscoverySuggestionsUseCase(
  credentialRepo,
  usageRecordRepo,
);
