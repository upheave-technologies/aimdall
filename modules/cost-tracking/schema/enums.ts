// =============================================================================
// Cost Tracking Module — Drizzle Enums
// =============================================================================
// PostgreSQL enum types for the Cost Tracking module.
//
// All enums are prefixed with cost_tracking_ to avoid collisions with other
// modules. Each enum is documented with its usage context.
//
// Design note: enums are defined centrally in this file and imported by the
// tables that reference them. This prevents circular imports and makes enum
// changes a single-file edit.
// =============================================================================

import { pgEnum } from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Provider status — indicates the operational state of a connected provider
// ---------------------------------------------------------------------------
export const costTrackingProviderStatus = pgEnum('cost_tracking_provider_status', [
  'active',
  'paused',
  'error',
]);

// ---------------------------------------------------------------------------
// Provider sync state — the current sync lifecycle state of a provider
// ---------------------------------------------------------------------------
export const costTrackingProviderSyncState = pgEnum('cost_tracking_provider_sync_state', [
  'idle',
  'in_progress',
  'success',
  'error',
]);

// ---------------------------------------------------------------------------
// Segment type — the kind of organizational unit a provider exposes
// (workspace, project, folder, etc.)
// ---------------------------------------------------------------------------
export const costTrackingSegmentType = pgEnum('cost_tracking_segment_type', [
  'organization',
  'workspace',
  'project',
  'folder',
  'account',
  'organizational_unit',
  'other',
]);

// ---------------------------------------------------------------------------
// Credential type — how the credential authenticates with the provider
// ---------------------------------------------------------------------------
export const costTrackingCredentialType = pgEnum('cost_tracking_credential_type', [
  'admin_api_key',
  'api_key',
  'service_account',
  'iam_role',
  'oauth_token',
  'other',
]);

// ---------------------------------------------------------------------------
// Credential status — lifecycle state of a credential
// ---------------------------------------------------------------------------
export const costTrackingCredentialStatus = pgEnum('cost_tracking_credential_status', [
  'active',
  'revoked',
  'expired',
  'suspended',
]);

// ---------------------------------------------------------------------------
// Service category — the type of AI service a model provides.
// Used by both the models table and the usage_records fact table.
// ---------------------------------------------------------------------------
export const costTrackingServiceCategory = pgEnum('cost_tracking_service_category', [
  'text_generation',
  'embedding',
  'image_generation',
  'audio_speech',
  'audio_transcription',
  'moderation',
  'video_generation',
  'code_execution',
  'vector_storage',
  'web_search',
  'reranking',
  'other',
]);

// ---------------------------------------------------------------------------
// Model status — availability lifecycle of a model
// ---------------------------------------------------------------------------
export const costTrackingModelStatus = pgEnum('cost_tracking_model_status', [
  'available',
  'deprecated',
  'retired',
]);

// ---------------------------------------------------------------------------
// Bucket width — granularity of usage aggregation windows
// ---------------------------------------------------------------------------
export const costTrackingBucketWidth = pgEnum('cost_tracking_bucket_width', [
  '1m',
  '1h',
  '1d',
]);

// ---------------------------------------------------------------------------
// Cost source — how the cost value was determined
// ---------------------------------------------------------------------------
export const costTrackingCostSource = pgEnum('cost_tracking_cost_source', [
  'provider_reported',
  'calculated',
  'estimated',
  'none',
]);

// ---------------------------------------------------------------------------
// Sync type — the kind of sync operation performed
// ---------------------------------------------------------------------------
export const costTrackingSyncType = pgEnum('cost_tracking_sync_type', [
  'full',
  'incremental',
  'backfill',
]);

// ---------------------------------------------------------------------------
// Sync status — the lifecycle state of a sync operation
// ---------------------------------------------------------------------------
export const costTrackingSyncStatus = pgEnum('cost_tracking_sync_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'partial',
]);

// ---------------------------------------------------------------------------
// Attribution group type — the kind of reporting group
// ---------------------------------------------------------------------------
export const costTrackingGroupType = pgEnum('cost_tracking_group_type', [
  'team',
  'department',
  'project',
  'environment',
  'cost_center',
  'business_unit',
  'user',
  'custom',
]);

// ---------------------------------------------------------------------------
// Attribution dimension — which usage dimension a rule matches against
// ---------------------------------------------------------------------------
export const costTrackingAttributionDimension = pgEnum('cost_tracking_attribution_dimension', [
  'credential',
  'segment',
  'provider',
  'model',
  'model_slug',
  'service_category',
  'service_tier',
  'region',
  'metadata_key',
]);

// ---------------------------------------------------------------------------
// Attribution match type — how the rule value is compared
// ---------------------------------------------------------------------------
export const costTrackingAttributionMatchType = pgEnum('cost_tracking_attribution_match_type', [
  'exact',
  'prefix',
  'regex',
  'in_list',
]);

// ---------------------------------------------------------------------------
// Budget type — what happens when the budget is reached
// ---------------------------------------------------------------------------
export const costTrackingBudgetType = pgEnum('cost_tracking_budget_type', [
  'hard_limit',
  'soft_alert',
  'tracking_only',
]);

// ---------------------------------------------------------------------------
// Budget period type — the time window for budget evaluation
// ---------------------------------------------------------------------------
export const costTrackingBudgetPeriodType = pgEnum('cost_tracking_budget_period_type', [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
  'custom',
]);

// ---------------------------------------------------------------------------
// Budget status — the operational state of a budget
// ---------------------------------------------------------------------------
export const costTrackingBudgetStatus = pgEnum('cost_tracking_budget_status', [
  'active',
  'paused',
  'exceeded',
  'archived',
]);

// ---------------------------------------------------------------------------
// Recommendation category — which analyzer produced the recommendation
// ---------------------------------------------------------------------------
export const costTrackingRecommendationCategory = pgEnum('cost_tracking_recommendation_category', [
  'model_tier_optimization',
  'cache_utilization',
  'batch_api_opportunity',
  'dormant_credentials',
  'context_tier_analysis',
  'provider_concentration_risk',
]);

// ---------------------------------------------------------------------------
// Recommendation status — lifecycle state of a recommendation
// ---------------------------------------------------------------------------
export const costTrackingRecommendationStatus = pgEnum('cost_tracking_recommendation_status', [
  'active',
  'dismissed',
  'expired',
]);
