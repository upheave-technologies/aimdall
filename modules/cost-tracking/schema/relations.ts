// =============================================================================
// Cost Tracking Module — Drizzle Relations
// =============================================================================
// Defines ORM-level relations for the Cost Tracking module's schema. These
// relations enable Drizzle's relational query API (db.query.X.findMany with
// { with: { ... } }) but do NOT affect the database schema — FK constraints
// are defined on the table columns themselves.
//
// Relation naming conventions:
//   - one() relations use the singular entity name (provider, model, etc.)
//   - many() relations use the plural entity name (segments, credentials, etc.)
//   - Self-referential relations use "parent" (one) and "children" (many)
//   - relationName strings disambiguate when a table has multiple FKs to the
//     same target (e.g., sync_logs has both providerId and credentialId)
// =============================================================================

import { relations } from 'drizzle-orm';

import { costTrackingProviders } from './providers';
import { costTrackingProviderSegments } from './providerSegments';
import { costTrackingProviderCredentials } from './providerCredentials';
import { costTrackingModels } from './models';
import { costTrackingModelPricing } from './modelPricing';
import { costTrackingUsageRecords } from './usageRecords';
import { costTrackingProviderCosts } from './providerCosts';
import { costTrackingSyncLogs } from './syncLogs';
import { costTrackingSyncCursors } from './syncCursors';
import { costTrackingAttributionGroups } from './attributionGroups';
import { costTrackingAttributionRules } from './attributionRules';
import { costTrackingKeyAssignments } from './keyAssignments';
import { costTrackingRecommendations } from './recommendations';
import { costTrackingSuggestionDismissals } from './suggestionDismissals';

// ---------------------------------------------------------------------------
// Providers — the top-level entity
// ---------------------------------------------------------------------------
export const costTrackingProvidersRelations = relations(costTrackingProviders, ({ many }) => ({
  segments: many(costTrackingProviderSegments),
  credentials: many(costTrackingProviderCredentials),
  models: many(costTrackingModels),
  usageRecords: many(costTrackingUsageRecords),
  providerCosts: many(costTrackingProviderCosts),
  syncLogs: many(costTrackingSyncLogs),
  syncCursors: many(costTrackingSyncCursors),
}));

// ---------------------------------------------------------------------------
// Provider Segments — organizational units within a provider
// ---------------------------------------------------------------------------
export const costTrackingProviderSegmentsRelations = relations(costTrackingProviderSegments, ({ one, many }) => ({
  provider: one(costTrackingProviders, {
    fields: [costTrackingProviderSegments.providerId],
    references: [costTrackingProviders.id],
  }),
  parent: one(costTrackingProviderSegments, {
    fields: [costTrackingProviderSegments.parentId],
    references: [costTrackingProviderSegments.id],
    relationName: 'segmentHierarchy',
  }),
  children: many(costTrackingProviderSegments, {
    relationName: 'segmentHierarchy',
  }),
  credentials: many(costTrackingProviderCredentials),
  usageRecords: many(costTrackingUsageRecords),
  providerCosts: many(costTrackingProviderCosts),
}));

// ---------------------------------------------------------------------------
// Provider Credentials — API keys and service accounts
// ---------------------------------------------------------------------------
export const costTrackingProviderCredentialsRelations = relations(costTrackingProviderCredentials, ({ one, many }) => ({
  provider: one(costTrackingProviders, {
    fields: [costTrackingProviderCredentials.providerId],
    references: [costTrackingProviders.id],
  }),
  segment: one(costTrackingProviderSegments, {
    fields: [costTrackingProviderCredentials.segmentId],
    references: [costTrackingProviderSegments.id],
  }),
  usageRecords: many(costTrackingUsageRecords),
  syncLogs: many(costTrackingSyncLogs),
  syncCursors: many(costTrackingSyncCursors),
  keyAssignments: many(costTrackingKeyAssignments),
}));

// ---------------------------------------------------------------------------
// Models — canonical model registry
// ---------------------------------------------------------------------------
export const costTrackingModelsRelations = relations(costTrackingModels, ({ one, many }) => ({
  provider: one(costTrackingProviders, {
    fields: [costTrackingModels.providerId],
    references: [costTrackingProviders.id],
  }),
  pricing: many(costTrackingModelPricing),
  usageRecords: many(costTrackingUsageRecords),
}));

// ---------------------------------------------------------------------------
// Model Pricing — time-boxed pricing rates
// ---------------------------------------------------------------------------
export const costTrackingModelPricingRelations = relations(costTrackingModelPricing, ({ one }) => ({
  model: one(costTrackingModels, {
    fields: [costTrackingModelPricing.modelId],
    references: [costTrackingModels.id],
  }),
}));

// ---------------------------------------------------------------------------
// Usage Records — the core fact table
// ---------------------------------------------------------------------------
export const costTrackingUsageRecordsRelations = relations(costTrackingUsageRecords, ({ one }) => ({
  provider: one(costTrackingProviders, {
    fields: [costTrackingUsageRecords.providerId],
    references: [costTrackingProviders.id],
  }),
  credential: one(costTrackingProviderCredentials, {
    fields: [costTrackingUsageRecords.credentialId],
    references: [costTrackingProviderCredentials.id],
  }),
  segment: one(costTrackingProviderSegments, {
    fields: [costTrackingUsageRecords.segmentId],
    references: [costTrackingProviderSegments.id],
  }),
  model: one(costTrackingModels, {
    fields: [costTrackingUsageRecords.modelId],
    references: [costTrackingModels.id],
  }),
  syncLog: one(costTrackingSyncLogs, {
    fields: [costTrackingUsageRecords.syncId],
    references: [costTrackingSyncLogs.id],
  }),
}));

// ---------------------------------------------------------------------------
// Provider Costs — provider-reported cost data
// ---------------------------------------------------------------------------
export const costTrackingProviderCostsRelations = relations(costTrackingProviderCosts, ({ one }) => ({
  provider: one(costTrackingProviders, {
    fields: [costTrackingProviderCosts.providerId],
    references: [costTrackingProviders.id],
  }),
  segment: one(costTrackingProviderSegments, {
    fields: [costTrackingProviderCosts.segmentId],
    references: [costTrackingProviderSegments.id],
  }),
  syncLog: one(costTrackingSyncLogs, {
    fields: [costTrackingProviderCosts.syncId],
    references: [costTrackingSyncLogs.id],
  }),
}));

// ---------------------------------------------------------------------------
// Sync Logs — sync operation audit trail
// ---------------------------------------------------------------------------
export const costTrackingSyncLogsRelations = relations(costTrackingSyncLogs, ({ one, many }) => ({
  provider: one(costTrackingProviders, {
    fields: [costTrackingSyncLogs.providerId],
    references: [costTrackingProviders.id],
  }),
  credential: one(costTrackingProviderCredentials, {
    fields: [costTrackingSyncLogs.credentialId],
    references: [costTrackingProviderCredentials.id],
  }),
  usageRecords: many(costTrackingUsageRecords),
  providerCosts: many(costTrackingProviderCosts),
}));

// ---------------------------------------------------------------------------
// Sync Cursors — incremental sync watermarks
// ---------------------------------------------------------------------------
export const costTrackingSyncCursorsRelations = relations(costTrackingSyncCursors, ({ one }) => ({
  provider: one(costTrackingProviders, {
    fields: [costTrackingSyncCursors.providerId],
    references: [costTrackingProviders.id],
  }),
  credential: one(costTrackingProviderCredentials, {
    fields: [costTrackingSyncCursors.credentialId],
    references: [costTrackingProviderCredentials.id],
  }),
}));

// ---------------------------------------------------------------------------
// Attribution Groups — custom reporting groups
// ---------------------------------------------------------------------------
export const costTrackingAttributionGroupsRelations = relations(costTrackingAttributionGroups, ({ one, many }) => ({
  parent: one(costTrackingAttributionGroups, {
    fields: [costTrackingAttributionGroups.parentId],
    references: [costTrackingAttributionGroups.id],
    relationName: 'groupHierarchy',
  }),
  children: many(costTrackingAttributionGroups, {
    relationName: 'groupHierarchy',
  }),
  rules: many(costTrackingAttributionRules),
}));

// ---------------------------------------------------------------------------
// Attribution Rules — dimension-to-group mappings
// ---------------------------------------------------------------------------
export const costTrackingAttributionRulesRelations = relations(costTrackingAttributionRules, ({ one }) => ({
  group: one(costTrackingAttributionGroups, {
    fields: [costTrackingAttributionRules.groupId],
    references: [costTrackingAttributionGroups.id],
  }),
}));

// ---------------------------------------------------------------------------
// Key Assignments — principal-to-credential mappings
// ---------------------------------------------------------------------------
export const costTrackingKeyAssignmentsRelations = relations(costTrackingKeyAssignments, ({ one }) => ({
  credential: one(costTrackingProviderCredentials, {
    fields: [costTrackingKeyAssignments.credentialId],
    references: [costTrackingProviderCredentials.id],
  }),
}));

// ---------------------------------------------------------------------------
// Recommendations — cost-optimization recommendations (no FK relations)
// ---------------------------------------------------------------------------
export const costTrackingRecommendationsRelations = relations(costTrackingRecommendations, ({}) => ({}));

// ---------------------------------------------------------------------------
// Suggestion Dismissals — auto-discovery dismissal tracking (no FK relations)
// ---------------------------------------------------------------------------
export const costTrackingSuggestionDismissalsRelations = relations(costTrackingSuggestionDismissals, ({}) => ({}));
