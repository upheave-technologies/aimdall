// =============================================================================
// Domain — Repository Interfaces
// =============================================================================
// Contracts for all persistence operations in the Cost Tracking module.
// The domain layer defines WHAT it needs; the infrastructure layer provides
// the concrete Drizzle implementations.
//
// Zombie Shield
// -------------
// All read operations filter out soft-deleted records (deletedAt IS NULL) by
// default. This prevents "zombie" records — data that appears deleted to the
// system but can still be accidentally loaded — from surfacing in aggregation
// queries and corrupting cost reporting.
//
// Idempotency via upsertBatch
// ---------------------------
// upsertBatch operations are keyed on the dedupKey column. Re-ingesting the
// same data from a provider is therefore safe — the most recent values
// overwrite the previous ones without creating duplicate rows.
//
// Module boundary
// ---------------
// All interfaces are collected here rather than in individual files to avoid
// a proliferation of tiny files and to make the repository surface visible
// in one place. Import these types into infrastructure implementations and
// use case factories.
// =============================================================================

import { UsageRecord } from './usageRecord';
import { ProviderCost } from './providerCost';
import { SyncLog, SyncStatus } from './syncLog';
import { SyncCursor } from './syncCursor';
import { Provider } from './provider';
import { ProviderCredential } from './providerCredential';
import { Model } from './model';
import { ModelPricing } from './modelPricing';
import { AttributionGroup } from './attributionGroup';
import { AttributionRule } from './attributionRule';
import { Budget } from './budget';
import { ServiceCategory } from './model';

// =============================================================================
// SECTION 1: AGGREGATION TYPES
// =============================================================================

/**
 * A summary row for usage aggregation queries.
 * All token counts and costs are summed across the requested date range.
 * totalCost is a numeric string matching the calculatedCostAmount precision
 * convention (8 decimal places) to prevent IEEE-754 rounding.
 *
 * Display name fields are populated via JOIN at query time so the UI never
 * needs a secondary lookup to render human-readable labels.
 */
export type UsageSummaryRow = {
  /** Internal UUID from cost_tracking_providers. */
  providerId: string;
  /** Machine-readable slug, e.g. 'openai', 'anthropic'. */
  providerSlug: string;
  /** Human-readable provider name, e.g. 'OpenAI', 'Anthropic'. */
  providerDisplayName: string;
  modelSlug: string;
  serviceCategory: ServiceCategory;
  credentialId?: string;
  /** Human-readable label for the credential, e.g. 'Production API Key'. */
  credentialLabel?: string;
  /** Last-4 hint for display, e.g. 'hmiT'. Absent when credential has no hint. */
  credentialKeyHint?: string;
  segmentId?: string;
  /** Human-readable name for the segment, e.g. 'Default Workspace'. */
  segmentDisplayName?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedInputTokens: number;
  totalRequests: number;
  totalCost: string;
  currency: string;
};

/** A row of daily spend, aggregated by date. */
export type DailySpendRow = {
  date: string; // YYYY-MM-DD
  /** Internal UUID from cost_tracking_providers. */
  providerId: string;
  /** Machine-readable slug, e.g. 'openai', 'anthropic'. */
  providerSlug: string;
  /** Human-readable provider name, e.g. 'OpenAI', 'Anthropic'. */
  providerDisplayName: string;
  totalCost: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

// =============================================================================
// SECTION 2: USAGE RECORD REPOSITORY
// =============================================================================

export type IUsageRecordRepository = {
  /**
   * Idempotently insert or update a batch of UsageRecords.
   * Conflict resolution is keyed on dedupKey WHERE deletedAt IS NULL.
   * ZOMBIE SHIELD: only non-deleted records participate in conflict detection.
   */
  upsertBatch: (records: UsageRecord[]) => Promise<{ created: number; updated: number }>;

  /**
   * Aggregate token and cost totals grouped by provider over a date range.
   * ZOMBIE SHIELD: soft-deleted records are excluded.
   */
  findSummaryByProvider: (startDate: Date, endDate: Date) => Promise<UsageSummaryRow[]>;

  /**
   * Aggregate token and cost totals grouped by provider + modelSlug.
   * ZOMBIE SHIELD: soft-deleted records are excluded.
   */
  findSummaryByModel: (startDate: Date, endDate: Date) => Promise<UsageSummaryRow[]>;

  /**
   * Aggregate token and cost totals grouped by credentialId.
   * ZOMBIE SHIELD: soft-deleted records are excluded.
   */
  findSummaryByCredential: (startDate: Date, endDate: Date) => Promise<UsageSummaryRow[]>;

  /**
   * Aggregate token and cost totals grouped by segmentId.
   * ZOMBIE SHIELD: soft-deleted records are excluded.
   */
  findSummaryBySegment: (startDate: Date, endDate: Date) => Promise<UsageSummaryRow[]>;

  /**
   * Aggregate cost and usage grouped by calendar day and provider.
   * ZOMBIE SHIELD: soft-deleted records are excluded.
   */
  findDailySpend: (startDate: Date, endDate: Date) => Promise<DailySpendRow[]>;
};

// =============================================================================
// SECTION 3: PROVIDER COST REPOSITORY
// =============================================================================

export type IProviderCostRepository = {
  /**
   * Idempotently insert or update a batch of ProviderCosts.
   * Conflict resolution is keyed on dedupKey WHERE deletedAt IS NULL.
   */
  upsertBatch: (costs: ProviderCost[]) => Promise<{ created: number; updated: number }>;

  /**
   * Find all provider costs for a given provider and date range.
   * ZOMBIE SHIELD: soft-deleted records are excluded.
   */
  findByProvider: (providerId: string, startDate: Date, endDate: Date) => Promise<ProviderCost[]>;
};

// =============================================================================
// SECTION 4: SYNC LOG REPOSITORY
// =============================================================================

export type ISyncLogRepository = {
  /** Insert a new sync log entry and return the created record. */
  create: (log: Omit<SyncLog, 'id' | 'createdAt'>) => Promise<SyncLog>;

  /**
   * Update the status and counters of a sync log at completion.
   * Used to transition from 'running' → 'completed' | 'failed' | 'partial'.
   */
  updateStatus: (
    id: string,
    status: SyncStatus,
    updates: {
      recordsFetched?: number;
      recordsCreated?: number;
      recordsUpdated?: number;
      recordsSkipped?: number;
      errorMessage?: string;
      errorDetails?: Record<string, unknown>;
      completedAt?: Date;
      durationMs?: number;
    },
  ) => Promise<void>;

  /** Find a sync log by its ID. */
  findById: (id: string) => Promise<SyncLog | null>;
};

// =============================================================================
// SECTION 5: SYNC CURSOR REPOSITORY
// =============================================================================

export type ISyncCursorRepository = {
  /**
   * Upsert a sync cursor — insert if it doesn't exist, update if it does.
   * Keyed on (providerId, credentialId, serviceCategory).
   */
  upsert: (cursor: Omit<SyncCursor, 'id' | 'createdAt' | 'updatedAt'>) => Promise<SyncCursor>;

  /**
   * Find the cursor for a given provider + credential + service category.
   * Returns null when no cursor exists (first sync).
   */
  findCursor: (
    providerId: string,
    credentialId: string | undefined,
    serviceCategory: ServiceCategory,
  ) => Promise<SyncCursor | null>;
};

// =============================================================================
// SECTION 6: PROVIDER REPOSITORY
// =============================================================================

export type IProviderRepository = {
  /** Find a provider by its slug (among active records). */
  findBySlug: (slug: string) => Promise<Provider | null>;

  /** Find a provider by its internal ID. */
  findById: (id: string) => Promise<Provider | null>;

  /** Find all active providers. */
  findAll: () => Promise<Provider[]>;

  /** Insert a new provider. */
  create: (provider: Provider) => Promise<void>;

  /** Update an existing provider (e.g. lastSyncAt, status). */
  update: (provider: Provider) => Promise<void>;
};

// =============================================================================
// SECTION 7: PROVIDER CREDENTIAL REPOSITORY
// =============================================================================

export type IProviderCredentialRepository = {
  /** Find a credential by provider ID + external ID (provider's reference). */
  findByExternalId: (providerId: string, externalId: string) => Promise<ProviderCredential | null>;

  /** Find all active credentials for a provider. */
  findByProvider: (providerId: string) => Promise<ProviderCredential[]>;

  /** Find all active credentials that are flagged as sync credentials. */
  findSyncCredentials: (providerId: string) => Promise<ProviderCredential[]>;

  /** Insert a new credential. */
  create: (credential: ProviderCredential) => Promise<void>;

  /** Update an existing credential. */
  update: (credential: ProviderCredential) => Promise<void>;
};

// =============================================================================
// SECTION 8: MODEL REPOSITORY
// =============================================================================

export type IModelRepository = {
  /** Find a model by provider ID + slug. */
  findBySlug: (providerId: string, slug: string) => Promise<Model | null>;

  /** Insert a new model. */
  create: (model: Model) => Promise<void>;

  /**
   * Find all active pricing entries for a model.
   * Callers use findApplicablePricing() from modelPricing.ts to select the
   * correct entry for a given date.
   */
  findPricingForModel: (modelId: string) => Promise<ModelPricing[]>;

  /** Insert a new pricing entry. */
  createPricing: (pricing: ModelPricing) => Promise<void>;
};

// =============================================================================
// SECTION 9: ATTRIBUTION REPOSITORY
// =============================================================================

export type IAttributionRepository = {
  /** Find an attribution group by its slug (active records only). */
  findGroupBySlug: (slug: string) => Promise<AttributionGroup | null>;

  /** Find all active attribution groups. */
  findAllGroups: () => Promise<AttributionGroup[]>;

  /** Insert a new attribution group. */
  createGroup: (group: AttributionGroup) => Promise<void>;

  /** Find all active attribution rules for a given group. */
  findRulesByGroup: (groupId: string) => Promise<AttributionRule[]>;

  /** Find all active attribution rules across all groups. */
  findAllRules: () => Promise<AttributionRule[]>;

  /** Insert a new attribution rule. */
  createRule: (rule: AttributionRule) => Promise<void>;
};

// =============================================================================
// SECTION 10: BUDGET REPOSITORY
// =============================================================================

export type IBudgetRepository = {
  /** Find all active budgets. */
  findAll: () => Promise<Budget[]>;

  /** Find a budget by its internal ID. */
  findById: (id: string) => Promise<Budget | null>;

  /** Insert a new budget. */
  create: (budget: Budget) => Promise<void>;

  /** Update an existing budget (e.g. currentSpend, status). */
  update: (budget: Budget) => Promise<void>;

  /** Soft-delete a budget (set deletedAt). */
  softDelete: (id: string) => Promise<void>;

  /**
   * Update the current_spend and status fields for a budget after a
   * spend evaluation. Narrower than full update for performance.
   */
  updateSpend: (
    id: string,
    currentSpend: string,
    status: Budget['status'],
    lastEvaluatedAt: Date,
  ) => Promise<void>;
};
