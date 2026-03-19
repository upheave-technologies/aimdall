// =============================================================================
// Cost Tracking Module — Public API (Barrel Export)
// =============================================================================
// This is the single entry point for consuming applications to import from
// the Cost Tracking module. It exports only the public API, hiding internal
// implementation details.
//
// Usage in consuming application:
//   import {
//     type CostTrackingDatabase,
//     makeUsageRecordRepository,
//     makeProviderRepository,
//     makeSyncProviderUsageUseCase,
//     makeGetUsageSummaryUseCase,
//     generateDedupKey,
//     type UsageRecord,
//     type Provider,
//     CostTrackingError,
//   } from '@/modules/cost-tracking';
// =============================================================================

// -----------------------------------------------------------------------------
// Schema (for consuming apps to compose their database)
// -----------------------------------------------------------------------------
export * from './schema';

// -----------------------------------------------------------------------------
// Database Type (for typing the db instance)
// -----------------------------------------------------------------------------
export type { CostTrackingDatabase } from './infrastructure/database';

// -----------------------------------------------------------------------------
// Infrastructure Utility
// -----------------------------------------------------------------------------
export { generateDedupKey } from './infrastructure/dedupKeyHasher';

// -----------------------------------------------------------------------------
// Repository Factories
// -----------------------------------------------------------------------------
export { makeUsageRecordRepository } from './infrastructure/repositories/DrizzleUsageRecordRepository';
export { makeProviderCostRepository } from './infrastructure/repositories/DrizzleProviderCostRepository';
export { makeSyncLogRepository, makeSyncCursorRepository } from './infrastructure/repositories/DrizzleSyncRepository';
export {
  makeProviderRepository,
  makeProviderCredentialRepository,
  makeModelRepository,
} from './infrastructure/repositories/DrizzleProviderRepository';
export { makeAttributionRepository } from './infrastructure/repositories/DrizzleAttributionRepository';
export { makeBudgetRepository } from './infrastructure/repositories/DrizzleBudgetRepository';

// -----------------------------------------------------------------------------
// Provider Client Factories
// -----------------------------------------------------------------------------
export { makeOpenAIUsageClient } from './infrastructure/providers/openaiUsageClient';
export { makeAnthropicUsageClient } from './infrastructure/providers/anthropicUsageClient';
export { makeVertexUsageClient } from './infrastructure/providers/vertexUsageClient';

// -----------------------------------------------------------------------------
// Use Case Factories
// -----------------------------------------------------------------------------
export { makeSyncProviderUsageUseCase } from './application/syncProviderUsageUseCase';
export { makeGetUsageSummaryUseCase } from './application/getUsageSummaryUseCase';

// -----------------------------------------------------------------------------
// Domain Types — Core Entities
// -----------------------------------------------------------------------------
export type { Provider, ProviderSlug, ProviderStatus } from './domain/provider';
export type { ProviderSegment, SegmentType } from './domain/providerSegment';
export type { ProviderCredential, CredentialType, CredentialStatus } from './domain/providerCredential';
export type { Model, ServiceCategory, ModelStatus } from './domain/model';
export type { ModelPricing, PricingRates, UsageMetrics } from './domain/modelPricing';
export type {
  UsageRecord,
  BucketWidth,
  CostSource,
  DedupDimensions,
} from './domain/usageRecord';
export type { ProviderCost } from './domain/providerCost';
export type { SyncLog, SyncType, SyncStatus } from './domain/syncLog';
export type { SyncCursor } from './domain/syncCursor';
export type { AttributionGroup, GroupType } from './domain/attributionGroup';
export type { AttributionRule, AttributionDimension, MatchType } from './domain/attributionRule';
export type { Budget, BudgetType, BudgetPeriodType, BudgetStatus } from './domain/budget';

// -----------------------------------------------------------------------------
// Domain Types — Repository Interfaces and Aggregation Types
// -----------------------------------------------------------------------------
export type {
  IUsageRecordRepository,
  IProviderCostRepository,
  ISyncLogRepository,
  ISyncCursorRepository,
  IProviderRepository,
  IProviderCredentialRepository,
  IModelRepository,
  IAttributionRepository,
  IBudgetRepository,
  UsageSummaryRow,
  DailySpendRow,
} from './domain/repositories';

// -----------------------------------------------------------------------------
// Application Types
// -----------------------------------------------------------------------------
export type { SyncInput, SyncResult, SyncDeps } from './application/syncProviderUsageUseCase';
export type { GetUsageSummaryInput, UsageSummary } from './application/getUsageSummaryUseCase';

// -----------------------------------------------------------------------------
// Provider Client Types
// -----------------------------------------------------------------------------
export type {
  ProviderUsageClient,
  RawProviderUsageData,
  RawProviderCostData,
} from './infrastructure/providers/types';

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------
export { CostTrackingError } from './application/costTrackingError';
