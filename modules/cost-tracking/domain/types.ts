// =============================================================================
// Cost Tracking Module — Public Domain Types
// =============================================================================
// This file is the single public surface for domain type imports from outside
// the module (e.g., from app/ server components and actions).
//
// Consumers import from here:
//   import type { UsageSummaryRow } from '@/modules/cost-tracking/domain/types';
//
// Do NOT import from individual domain files (repositories.ts, usageRecord.ts,
// etc.) outside this module — those are private implementation details.
// =============================================================================

export type {
  UsageSummaryRow,
  DailySpendRow,
  UserUsageRow,
  CredentialWithProvider,
  EnrichedKeyAssignment,
  PrincipalRecord,
  AttributionSummaryRow,
} from './repositories';

export type { UsageRecord } from './usageRecord';
export type { KeyAssignment } from './keyAssignment';
export type { Provider, ProviderSyncState } from './provider';
export type { ProviderCredential } from './providerCredential';
export type { ServiceAccountJson } from './serviceAccountCredential';
export type { Model } from './model';
export type { AttributionGroup, GroupType } from './attributionGroup';
export type { AttributionRule, AttributionDimension, MatchType } from './attributionRule';
export type { Budget, BudgetType, BudgetPeriodType, BudgetStatus } from './budget';

export type {
  ExplorerDimension,
  ExplorerFilter,
  ExplorerQuery,
  ExplorerResultRow,
  TimeSeriesPoint,
  ExplorerResult,
  ExplorerMetricKey,
  ExplorerMetricConfig,
} from './explorer';

export { selectMetricsForContext, computeWindowAnomalyCount } from './explorer';

export type {
  Recommendation,
  RecommendationCategory,
  RecommendationStatus,
  RecommendationCandidate,
} from './recommendation';

export type {
  TemplateType,
  TemplateInput,
  TemplateResult,
  DiscoverySuggestion,
  CredentialInfo,
  CoverageResult,
  RulePreviewResult,
} from './attributionTemplate';

export type {
  PeriodPreset,
  PeriodSearchParams,
  ResolvedPeriod,
} from './selectedPeriod';

export { resolveSelectedPeriod } from './selectedPeriod';
