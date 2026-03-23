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
import { KeyAssignment } from './keyAssignment';

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

/** A credential joined with its parent provider's display name. */
export type CredentialWithProvider = {
  id: string;
  label: string;
  keyHint: string | null;
  providerDisplayName: string;
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

  /**
   * Return the most recent bucket_start across all active usage records.
   * Returns null when no records exist.
   * ZOMBIE SHIELD: soft-deleted records are excluded.
   */
  getLatestBucketStart: () => Promise<Date | null>;
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
  /** Find a credential by its internal ID. */
  findById: (id: string) => Promise<ProviderCredential | null>;

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

  /** Find all active credentials joined with their provider display name. */
  findAllWithProvider: () => Promise<CredentialWithProvider[]>;
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

/**
 * A summary row for per-attribution-group usage aggregation.
 * Populated via SQL-level JOIN: attribution_groups → attribution_rules → usage_records.
 * All token counts and costs are summed across the requested date range.
 * totalCost is a numeric string matching the calculatedCostAmount precision
 * convention (8 decimal places) to prevent IEEE-754 rounding.
 *
 * When linkedEntityType = 'principal', linkedEntityName and linkedEntityEmail are
 * populated via LEFT JOIN to identity_principals. Otherwise they are null.
 */
export type AttributionSummaryRow = {
  groupId: string;
  groupSlug: string;
  groupDisplayName: string;
  groupType: string;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  /** Populated via JOIN to identity_principals when linkedEntityType = 'principal'. */
  linkedEntityName: string | null;
  /** Populated via JOIN to identity_principals when linkedEntityType = 'principal'. */
  linkedEntityEmail: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Numeric string, 8 decimal places. */
  totalCost: string;
  recordCount: number;
  /** Number of active rules for this group. */
  ruleCount: number;
};

export type IAttributionRepository = {
  /** Find an attribution group by its slug (active records only). */
  findGroupBySlug: (slug: string) => Promise<AttributionGroup | null>;

  /** Find all active attribution groups. */
  findAllGroups: () => Promise<AttributionGroup[]>;

  /** Insert a new attribution group. */
  createGroup: (group: AttributionGroup) => Promise<void>;

  /** Update a group's mutable fields. */
  updateGroup: (group: AttributionGroup) => Promise<void>;

  /** Soft-delete a group (set deletedAt). */
  softDeleteGroup: (id: string) => Promise<void>;

  /** Find all active attribution rules for a given group. */
  findRulesByGroup: (groupId: string) => Promise<AttributionRule[]>;

  /** Find all active attribution rules across all groups. */
  findAllRules: () => Promise<AttributionRule[]>;

  /** Insert a new attribution rule. */
  createRule: (rule: AttributionRule) => Promise<void>;

  /** Soft-delete a rule (set deletedAt). */
  softDeleteRule: (id: string) => Promise<void>;

  /** Find all active groups, optionally filtered by group type. */
  findGroupsByType: (groupType?: string) => Promise<AttributionGroup[]>;

  /** Find a group by its linked entity. Returns null when no matching group exists. */
  findGroupByEntity: (entityType: string, entityId: string) => Promise<AttributionGroup | null>;

  /**
   * Find an existing rule matching the same group + dimension + matchType + matchValue.
   * Used to prevent duplicate rule creation.
   */
  findDuplicateRule: (
    groupId: string,
    dimension: string,
    matchType: string,
    matchValue: string,
  ) => Promise<AttributionRule | null>;

  /**
   * Aggregate usage by attribution group over a date range.
   *
   * JOIN logic (SQL-level, for exact and in_list match types only):
   *   attribution_groups → attribution_rules → usage_records
   *
   * The join condition varies by rule dimension:
   *   - credential:        usage_records.credential_id
   *   - provider:          usage_records.provider_id
   *   - segment:           usage_records.segment_id
   *   - model:             usage_records.model_id
   *   - model_slug:        usage_records.model_slug
   *   - service_category:  usage_records.service_category
   *   - service_tier:      usage_records.service_tier
   *   - region:            usage_records.region
   *
   * Regex and prefix rules are silently excluded from the SQL aggregation.
   *
   * When linkedEntityType = 'principal', LEFT JOINs identity_principals to populate
   * linkedEntityName and linkedEntityEmail.
   *
   * ZOMBIE SHIELD: all three tables filtered by deletedAt IS NULL.
   */
  getAttributionSummary: (
    startDate: Date,
    endDate: Date,
    groupType?: string,
  ) => Promise<AttributionSummaryRow[]>;
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

// =============================================================================
// SECTION 11: KEY ASSIGNMENT REPOSITORY
// =============================================================================

/**
 * A summary row for per-user usage aggregation.
 * Populated via a three-way JOIN: principals → key_assignments → usage_records.
 * All token counts and costs are summed across the requested date range.
 * totalCost is a numeric string matching the calculatedCostAmount precision
 * convention (8 decimal places) to prevent IEEE-754 rounding.
 */
export type UserUsageRow = {
  /** Internal UUID from identity_principals (soft link). */
  principalId: string;
  /** Display name of the principal. */
  principalName: string;
  /** Email address of the principal, if present. */
  principalEmail: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: string;
  recordCount: number;
  /** Number of distinct credentials assigned to this principal. */
  credentialCount: number;
};

/** A key assignment enriched with credential label and provider name for display. */
export type EnrichedKeyAssignment = KeyAssignment & {
  credentialLabel: string;
  providerDisplayName: string;
};

export type IKeyAssignmentRepository = {
  /**
   * Find an active key assignment by its internal ID.
   * ZOMBIE SHIELD: soft-deleted assignments are excluded.
   */
  findById: (id: string) => Promise<KeyAssignment | null>;

  /**
   * Find all active key assignments for a given principal.
   * ZOMBIE SHIELD: soft-deleted assignments are excluded.
   */
  findByPrincipalId: (principalId: string) => Promise<KeyAssignment[]>;

  /**
   * Find all active key assignments for a given credential.
   * ZOMBIE SHIELD: soft-deleted assignments are excluded.
   */
  findByCredentialId: (credentialId: string) => Promise<KeyAssignment[]>;

  /**
   * Find a single active assignment for a (principalId, credentialId) pair.
   * Used to prevent duplicate assignments.
   * ZOMBIE SHIELD: soft-deleted assignments are excluded.
   */
  findByPrincipalAndCredential: (
    principalId: string,
    credentialId: string,
  ) => Promise<KeyAssignment | null>;

  /** Persist a new key assignment. */
  save: (assignment: KeyAssignment) => Promise<void>;

  /**
   * Soft-delete a key assignment (set deletedAt).
   * Never hard-deletes — preserves audit trail.
   */
  softDelete: (id: string) => Promise<void>;

  /**
   * Aggregate token and cost totals grouped by principal.
   * Performs a three-way JOIN: identity_principals → cost_tracking_key_assignments
   * → cost_tracking_usage_records, then aggregates over the given date range.
   *
   * ZOMBIE SHIELD: soft-deleted assignments and usage records are excluded.
   */
  getUserUsageSummary: (startDate: Date, endDate: Date) => Promise<UserUsageRow[]>;

  /**
   * Find all active key assignments for a principal, enriched with credential
   * label and provider display name via JOINs.
   * ZOMBIE SHIELD: soft-deleted assignments are excluded.
   */
  findByPrincipalIdEnriched: (principalId: string) => Promise<EnrichedKeyAssignment[]>;
};

// =============================================================================
// SECTION 12: PRINCIPAL QUERY REPOSITORY
// =============================================================================

/**
 * A minimal principal record shape used within the cost-tracking module.
 * Defined inline to keep the domain layer free of cross-package type imports.
 */
export type PrincipalRecord = {
  id: string;
  type: string;
  status: string;
  name: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Read-only query interface for Principal records.
 *
 * The identity package's IPrincipalRepository does not expose a findAll
 * method, and it is a nucleus-managed read-only package. This interface
 * defines the query capabilities the cost-tracking module needs from the
 * identity_principals table.
 */
export type IPrincipalQueryRepository = {
  /** Find all active principals, ordered by name. */
  findAll: () => Promise<PrincipalRecord[]>;
};
