// =============================================================================
// Cost Tracking Module — Schema Barrel Export
// =============================================================================
// This is the public API of the Cost Tracking module's data model. Consuming
// applications import from here to compose their database schema.
//
// Usage in drizzle.config.ts:
//   schema: ['./modules/cost-tracking/schema/index.ts']
//
// Usage in application code:
//   import { costTrackingProviders, costTrackingUsageRecords } from '@/modules/cost-tracking/schema';
// =============================================================================

// Enums
export {
  costTrackingProviderStatus,
  costTrackingSegmentType,
  costTrackingCredentialType,
  costTrackingCredentialStatus,
  costTrackingServiceCategory,
  costTrackingModelStatus,
  costTrackingBucketWidth,
  costTrackingCostSource,
  costTrackingSyncType,
  costTrackingSyncStatus,
  costTrackingGroupType,
  costTrackingAttributionDimension,
  costTrackingAttributionMatchType,
  costTrackingBudgetType,
  costTrackingBudgetPeriodType,
  costTrackingBudgetStatus,
} from './enums';

// Tables
export { costTrackingProviders } from './providers';
export { costTrackingProviderSegments } from './providerSegments';
export { costTrackingProviderCredentials } from './providerCredentials';
export { costTrackingModels } from './models';
export { costTrackingModelPricing } from './modelPricing';
export { costTrackingUsageRecords } from './usageRecords';
export { costTrackingProviderCosts } from './providerCosts';
export { costTrackingSyncLogs } from './syncLogs';
export { costTrackingSyncCursors } from './syncCursors';
export { costTrackingAttributionGroups } from './attributionGroups';
export { costTrackingAttributionRules } from './attributionRules';
export { costTrackingBudgets } from './budgets';

// Relations
export {
  costTrackingProvidersRelations,
  costTrackingProviderSegmentsRelations,
  costTrackingProviderCredentialsRelations,
  costTrackingModelsRelations,
  costTrackingModelPricingRelations,
  costTrackingUsageRecordsRelations,
  costTrackingProviderCostsRelations,
  costTrackingSyncLogsRelations,
  costTrackingSyncCursorsRelations,
  costTrackingAttributionGroupsRelations,
  costTrackingAttributionRulesRelations,
} from './relations';
