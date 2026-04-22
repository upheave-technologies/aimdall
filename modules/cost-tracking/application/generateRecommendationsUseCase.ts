// =============================================================================
// Application — Generate Recommendations Use Case
// =============================================================================
// Runs all six smart-recommendation analyzers against aggregated usage data
// and persists the resulting candidates as fresh Recommendation records.
//
// Flow:
//   1. Determine the analysis window (analysisDays, defaulting to 30)
//   2. Fetch aggregated usage summaries grouped by model from the usage repo
//   3. Fetch all active credentials to check for dormant ones
//   4. Build analyzer input shapes from the aggregated data
//   5. Run all 6 pure analyzer functions
//   6. Expire all existing active recommendations
//   7. Convert candidates to Recommendation entities (assign cuid2 IDs)
//   8. Persist the new recommendations via createBatch
//   9. Return result metadata
//
// Pre-wired export: `generateRecommendations`
// =============================================================================

import { createId } from '@paralleldrive/cuid2';
import { Result } from '@/packages/shared/lib/result';
import {
  Recommendation,
  RecommendationCandidate,
  ModelTierAnalysisInput,
  CacheAnalysisInput,
  BatchAnalysisInput,
  DormantCredentialInput,
  ContextTierAnalysisInput,
  ProviderConcentrationInput,
  analyzeModelTierOptimization,
  analyzeCacheUtilization,
  analyzeBatchApiOpportunity,
  analyzeDormantCredentials,
  analyzeContextTierUsage,
  analyzeProviderConcentration,
  sortRecommendationsBySavings,
} from '../domain/recommendation';
import {
  IUsageRecordRepository,
  IProviderCredentialRepository,
  IRecommendationRepository,
} from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { makeProviderCredentialRepository } from '../infrastructure/repositories/DrizzleProviderRepository';
import { makeRecommendationRepository } from '../infrastructure/repositories/DrizzleRecommendationRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type GenerateRecommendationsInput = {
  /** Number of days to include in the analysis window. Defaults to 30. */
  analysisDays?: 30 | 90;
};

export type GenerateRecommendationsResult = {
  recommendations: Recommendation[];
  analyzersRun: number;
  generatedAt: string;
};

// =============================================================================
// SECTION 2: INTERNAL HELPERS
// =============================================================================

/**
 * Convert a RecommendationCandidate to a persisted Recommendation entity.
 * Dollar amounts are serialised to numeric strings at this boundary.
 */
const candidateToRecommendation = (candidate: RecommendationCandidate, now: Date): Recommendation => ({
  id: createId(),
  category: candidate.category,
  title: candidate.title,
  description: candidate.description,
  estimatedMonthlySavings:
    candidate.estimatedMonthlySavings != null
      ? candidate.estimatedMonthlySavings.toFixed(8)
      : undefined,
  savingsPercentage:
    candidate.savingsPercentage != null
      ? candidate.savingsPercentage.toFixed(2)
      : undefined,
  confidenceBasis: candidate.confidenceBasis,
  status: 'active',
  data: candidate.data,
  createdAt: now,
  updatedAt: now,
});

// =============================================================================
// SECTION 3: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the generateRecommendations use case.
 *
 * @param usageRepo      - Usage record repository for aggregated spend data
 * @param credentialRepo - Provider credential repository for dormancy analysis
 * @param recommendationRepo - Repository for persisting and expiring recommendations
 * @returns Async use case function
 */
export const makeGenerateRecommendationsUseCase = (
  usageRepo: IUsageRecordRepository,
  credentialRepo: IProviderCredentialRepository,
  recommendationRepo: IRecommendationRepository,
) => {
  return async (
    data: GenerateRecommendationsInput,
  ): Promise<Result<GenerateRecommendationsResult, CostTrackingError>> => {
    try {
      const analysisDays = data.analysisDays ?? 30;
      const now = new Date();

      // Step 1: Determine the analysis window (UTC).
      const endDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
      );
      const startDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - analysisDays + 1),
      );

      // Step 2: Fetch aggregated usage summaries.
      const [modelSummaries, providerSummaries, credentials] = await Promise.all([
        usageRepo.findSummaryByModel(startDate, endDate),
        usageRepo.findSummaryByProvider(startDate, endDate),
        credentialRepo.findAllWithProvider(),
      ]);

      // -----------------------------------------------------------------------
      // Step 3: Build ModelTierAnalysisInput
      // We have no per-request output-token distribution from summary rows alone.
      // We use totalCost as a proxy: 100% of requests are considered, with
      // low-output requests estimated as 0 (analyzers require pre-aggregated data
      // from the caller). The infrastructure layer can provide richer counts via
      // a future dedicated repository method. For now we pass what we have —
      // the analyzer will return no candidates when lowOutputRequests = 0.
      // -----------------------------------------------------------------------
      const modelTierInputs: ModelTierAnalysisInput[] = modelSummaries.map((row) => ({
        modelSlug: row.modelSlug,
        providerSlug: row.providerSlug,
        providerDisplayName: row.providerDisplayName,
        serviceCategory: row.serviceCategory,
        totalRequests: row.totalRequests,
        totalCost: parseFloat(row.totalCost),
        lowOutputRequests: 0,
        lowOutputCost: 0,
      }));

      // -----------------------------------------------------------------------
      // Step 4: Build CacheAnalysisInput
      // -----------------------------------------------------------------------
      const cacheInputs: CacheAnalysisInput[] = modelSummaries
        .filter((row) => row.totalCachedInputTokens > 0)
        .map((row) => {
          // Estimate input cost as proportional to total cost by input token share.
          const totalTokens = row.totalInputTokens + row.totalOutputTokens;
          const inputCostShare = totalTokens > 0 ? row.totalInputTokens / totalTokens : 0.5;
          const totalInputCost = parseFloat(row.totalCost) * inputCostShare;
          return {
            providerSlug: row.providerSlug,
            providerDisplayName: row.providerDisplayName,
            modelSlug: row.modelSlug,
            totalInputTokens: row.totalInputTokens,
            cachedInputTokens: row.totalCachedInputTokens,
            totalInputCost,
          };
        });

      // -----------------------------------------------------------------------
      // Step 5: Build BatchAnalysisInput
      // No batch discount information is available from usage summaries alone.
      // We pass batchTierDiscount = 0 so the analyzer produces no candidates
      // until a richer data source is available.
      // -----------------------------------------------------------------------
      const batchInputs: BatchAnalysisInput[] = modelSummaries.map((row) => ({
        providerSlug: row.providerSlug,
        providerDisplayName: row.providerDisplayName,
        modelSlug: row.modelSlug,
        totalRequests: row.totalRequests,
        totalCost: parseFloat(row.totalCost),
        averageDailyRequests: row.totalRequests / analysisDays,
        batchTierDiscount: 0,
      }));

      // -----------------------------------------------------------------------
      // Step 6: Build DormantCredentialInput
      // -----------------------------------------------------------------------
      const dormantInputs: DormantCredentialInput[] = credentials.map((cred) => {
        // CredentialWithProvider only exposes id, label, keyHint, providerDisplayName.
        // lastUsedAt is not available in the CredentialWithProvider projection —
        // treat all credentials as having unknown last-use date (null) with 0 days.
        // A richer query method can be added to IProviderCredentialRepository later.
        return {
          credentialId: cred.id,
          credentialLabel: cred.label,
          keyHint: cred.keyHint ?? null,
          providerDisplayName: cred.providerDisplayName,
          lastUsedAt: null,
          daysSinceLastUse: 0,
        };
      });

      // -----------------------------------------------------------------------
      // Step 7: Build ContextTierAnalysisInput
      // Context tier breakdown requires service_tier / context_tier columns
      // in the usage summary. We skip this analyzer for now (empty inputs).
      // -----------------------------------------------------------------------
      const contextInputs: ContextTierAnalysisInput[] = [];

      // -----------------------------------------------------------------------
      // Step 8: Build ProviderConcentrationInput
      // -----------------------------------------------------------------------
      const totalSpend = providerSummaries.reduce(
        (sum, row) => sum + parseFloat(row.totalCost),
        0,
      );
      const concentrationInput: ProviderConcentrationInput = {
        providers: providerSummaries.map((row) => ({
          providerSlug: row.providerSlug,
          providerDisplayName: row.providerDisplayName,
          totalCost: parseFloat(row.totalCost),
        })),
        totalSpend,
      };

      // -----------------------------------------------------------------------
      // Step 9: Run all 6 analyzers and merge candidates
      // -----------------------------------------------------------------------
      const allCandidates: RecommendationCandidate[] = [
        ...analyzeModelTierOptimization(modelTierInputs),
        ...analyzeCacheUtilization(cacheInputs),
        ...analyzeBatchApiOpportunity(batchInputs),
        ...analyzeDormantCredentials(dormantInputs),
        ...analyzeContextTierUsage(contextInputs),
        ...analyzeProviderConcentration(concentrationInput),
      ];

      const sorted = sortRecommendationsBySavings(allCandidates);

      // Step 10: Expire existing active recommendations.
      await recommendationRepo.expireAll();

      // Step 11: Convert candidates to persisted entities and save.
      const recommendations = sorted.map((c) => candidateToRecommendation(c, now));

      if (recommendations.length > 0) {
        await recommendationRepo.createBatch(recommendations);
      }

      return {
        success: true,
        value: {
          recommendations,
          analyzersRun: 6,
          generatedAt: now.toISOString(),
        },
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to generate recommendations', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 4: PRE-WIRED INSTANCE
// =============================================================================

const usageRecordRepo = makeUsageRecordRepository(db);
const credentialRepo = makeProviderCredentialRepository(db);
const recommendationRepo = makeRecommendationRepository(db);

export const generateRecommendations = makeGenerateRecommendationsUseCase(
  usageRecordRepo,
  credentialRepo,
  recommendationRepo,
);
