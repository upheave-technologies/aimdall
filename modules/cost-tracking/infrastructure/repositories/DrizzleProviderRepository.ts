// =============================================================================
// Infrastructure — Drizzle Provider Repository
// =============================================================================
// Concrete implementations of IProviderRepository, IProviderCredentialRepository,
// and IModelRepository using Drizzle ORM.
//
// Zombie Shield is active on all reads for providers, credentials, and segments:
//   isNull(deletedAt) is included in every WHERE clause.
//
// Models have no deletedAt — they use a status field (available/deprecated/
// retired) instead, so no Zombie Shield applies to model queries.
//
// ModelPricing has no deletedAt either — pricing rows are historical facts
// bounded by effectiveTo.
//
// Factory pattern for dependency injection:
//   const providerRepo = makeProviderRepository(db);
//   const credentialRepo = makeProviderCredentialRepository(db);
//   const modelRepo = makeModelRepository(db);
// =============================================================================

import { eq, and, isNull } from 'drizzle-orm';
import { costTrackingProviders } from '../../schema/providers';
import { costTrackingProviderCredentials } from '../../schema/providerCredentials';
import { costTrackingModels } from '../../schema/models';
import { costTrackingModelPricing } from '../../schema/modelPricing';
import { Provider, ProviderStatus } from '../../domain/provider';
import { ProviderCredential, CredentialType, CredentialStatus } from '../../domain/providerCredential';
import { Model, ModelStatus, ServiceCategory } from '../../domain/model';
import { ModelPricing, PricingRates } from '../../domain/modelPricing';
import {
  IProviderRepository,
  IProviderCredentialRepository,
  IModelRepository,
} from '../../domain/repositories';
import { CostTrackingDatabase } from '../database';

// =============================================================================
// SECTION 1: PROVIDER REPOSITORY FACTORY
// =============================================================================

/**
 * Factory function that creates a Provider repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking schema
 * @returns IProviderRepository implementation
 */
export const makeProviderRepository = (db: CostTrackingDatabase): IProviderRepository => ({
  /**
   * Find an active provider by slug.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findBySlug(slug: string): Promise<Provider | null> {
    const result = await db
      .select()
      .from(costTrackingProviders)
      .where(and(eq(costTrackingProviders.slug, slug), isNull(costTrackingProviders.deletedAt)))
      .limit(1);

    if (result.length === 0) return null;
    return mapToProvider(result[0]);
  },

  /**
   * Find an active provider by internal ID.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findById(id: string): Promise<Provider | null> {
    const result = await db
      .select()
      .from(costTrackingProviders)
      .where(and(eq(costTrackingProviders.id, id), isNull(costTrackingProviders.deletedAt)))
      .limit(1);

    if (result.length === 0) return null;
    return mapToProvider(result[0]);
  },

  /**
   * Find all active providers.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findAll(): Promise<Provider[]> {
    const rows = await db
      .select()
      .from(costTrackingProviders)
      .where(isNull(costTrackingProviders.deletedAt));

    return rows.map(mapToProvider);
  },

  /** Insert a new provider. */
  async create(provider: Provider): Promise<void> {
    await db.insert(costTrackingProviders).values({
      id: provider.id,
      slug: provider.slug,
      displayName: provider.displayName,
      apiBaseUrl: provider.apiBaseUrl ?? null,
      status: provider.status,
      configuration: provider.configuration ?? null,
      lastSyncAt: provider.lastSyncAt ?? null,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
      deletedAt: provider.deletedAt ?? null,
    });
  },

  /** Update an existing provider. */
  async update(provider: Provider): Promise<void> {
    await db
      .update(costTrackingProviders)
      .set({
        displayName: provider.displayName,
        apiBaseUrl: provider.apiBaseUrl ?? null,
        status: provider.status,
        configuration: provider.configuration ?? null,
        lastSyncAt: provider.lastSyncAt ?? null,
        updatedAt: provider.updatedAt,
        deletedAt: provider.deletedAt ?? null,
      })
      .where(eq(costTrackingProviders.id, provider.id));
  },
});

// =============================================================================
// SECTION 2: PROVIDER CREDENTIAL REPOSITORY FACTORY
// =============================================================================

/**
 * Factory function that creates a ProviderCredential repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking schema
 * @returns IProviderCredentialRepository implementation
 */
export const makeProviderCredentialRepository = (
  db: CostTrackingDatabase,
): IProviderCredentialRepository => ({
  /**
   * Find an active credential by provider ID + external ID.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findByExternalId(
    providerId: string,
    externalId: string,
  ): Promise<ProviderCredential | null> {
    const result = await db
      .select()
      .from(costTrackingProviderCredentials)
      .where(
        and(
          eq(costTrackingProviderCredentials.providerId, providerId),
          eq(costTrackingProviderCredentials.externalId, externalId),
          isNull(costTrackingProviderCredentials.deletedAt),
        ),
      )
      .limit(1);

    if (result.length === 0) return null;
    return mapToCredential(result[0]);
  },

  /**
   * Find all active credentials for a provider.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findByProvider(providerId: string): Promise<ProviderCredential[]> {
    const rows = await db
      .select()
      .from(costTrackingProviderCredentials)
      .where(
        and(
          eq(costTrackingProviderCredentials.providerId, providerId),
          isNull(costTrackingProviderCredentials.deletedAt),
        ),
      );

    return rows.map(mapToCredential);
  },

  /**
   * Find all active credentials flagged as sync credentials for a provider.
   * ZOMBIE SHIELD: excludes soft-deleted records.
   */
  async findSyncCredentials(providerId: string): Promise<ProviderCredential[]> {
    const rows = await db
      .select()
      .from(costTrackingProviderCredentials)
      .where(
        and(
          eq(costTrackingProviderCredentials.providerId, providerId),
          eq(costTrackingProviderCredentials.isSyncCredential, true),
          isNull(costTrackingProviderCredentials.deletedAt),
        ),
      );

    return rows.map(mapToCredential);
  },

  /** Insert a new credential. */
  async create(credential: ProviderCredential): Promise<void> {
    await db.insert(costTrackingProviderCredentials).values({
      id: credential.id,
      providerId: credential.providerId,
      segmentId: credential.segmentId ?? null,
      externalId: credential.externalId,
      label: credential.label,
      keyHint: credential.keyHint ?? null,
      credentialType: credential.credentialType,
      status: credential.status,
      isSyncCredential: credential.isSyncCredential,
      scopes: credential.scopes ?? null,
      lastUsedAt: credential.lastUsedAt ?? null,
      lastSyncAt: credential.lastSyncAt ?? null,
      metadata: credential.metadata ?? null,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      deletedAt: credential.deletedAt ?? null,
    });
  },

  /** Update an existing credential. */
  async update(credential: ProviderCredential): Promise<void> {
    await db
      .update(costTrackingProviderCredentials)
      .set({
        label: credential.label,
        keyHint: credential.keyHint ?? null,
        status: credential.status,
        isSyncCredential: credential.isSyncCredential,
        scopes: credential.scopes ?? null,
        lastUsedAt: credential.lastUsedAt ?? null,
        lastSyncAt: credential.lastSyncAt ?? null,
        metadata: credential.metadata ?? null,
        updatedAt: credential.updatedAt,
        deletedAt: credential.deletedAt ?? null,
      })
      .where(eq(costTrackingProviderCredentials.id, credential.id));
  },
});

// =============================================================================
// SECTION 3: MODEL REPOSITORY FACTORY
// =============================================================================

/**
 * Factory function that creates a Model repository instance.
 *
 * @param db - Drizzle database instance with Cost Tracking schema
 * @returns IModelRepository implementation
 */
export const makeModelRepository = (db: CostTrackingDatabase): IModelRepository => ({
  /**
   * Find a model by provider ID + slug.
   * No Zombie Shield: models are never soft-deleted (they use status instead).
   */
  async findBySlug(providerId: string, slug: string): Promise<Model | null> {
    const result = await db
      .select()
      .from(costTrackingModels)
      .where(
        and(eq(costTrackingModels.providerId, providerId), eq(costTrackingModels.slug, slug)),
      )
      .limit(1);

    if (result.length === 0) return null;
    return mapToModel(result[0]);
  },

  /** Insert a new model. */
  async create(model: Model): Promise<void> {
    await db.insert(costTrackingModels).values({
      id: model.id,
      providerId: model.providerId,
      slug: model.slug,
      displayName: model.displayName,
      serviceCategory: model.serviceCategory,
      status: model.status,
      capabilities: model.capabilities ?? null,
      metadata: model.metadata ?? null,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  },

  /**
   * Find all pricing entries for a model.
   * No Zombie Shield: pricing rows are historical facts, never soft-deleted.
   * Callers use findApplicablePricing() to select the entry matching a date.
   */
  async findPricingForModel(modelId: string): Promise<ModelPricing[]> {
    const rows = await db
      .select()
      .from(costTrackingModelPricing)
      .where(eq(costTrackingModelPricing.modelId, modelId));

    return rows.map(mapToModelPricing);
  },

  /** Insert a new pricing entry. */
  async createPricing(pricing: ModelPricing): Promise<void> {
    await db.insert(costTrackingModelPricing).values({
      id: pricing.id,
      modelId: pricing.modelId,
      effectiveFrom: pricing.effectiveFrom,
      effectiveTo: pricing.effectiveTo ?? null,
      serviceTier: pricing.serviceTier,
      contextTier: pricing.contextTier ?? null,
      region: pricing.region ?? null,
      rates: pricing.rates,
      currency: pricing.currency,
      source: pricing.source ?? null,
      notes: pricing.notes ?? null,
      createdAt: pricing.createdAt,
      updatedAt: pricing.updatedAt,
    });
  },
});

// =============================================================================
// SECTION 4: INTERNAL MAPPING
// =============================================================================

function mapToProvider(row: typeof costTrackingProviders.$inferSelect): Provider {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    apiBaseUrl: row.apiBaseUrl ?? undefined,
    status: row.status as ProviderStatus,
    configuration: (row.configuration as Record<string, unknown> | null) ?? undefined,
    lastSyncAt: row.lastSyncAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
  };
}

function mapToCredential(
  row: typeof costTrackingProviderCredentials.$inferSelect,
): ProviderCredential {
  return {
    id: row.id,
    providerId: row.providerId,
    segmentId: row.segmentId ?? undefined,
    externalId: row.externalId,
    label: row.label,
    keyHint: row.keyHint ?? undefined,
    credentialType: row.credentialType as CredentialType,
    status: row.status as CredentialStatus,
    isSyncCredential: row.isSyncCredential,
    scopes: (row.scopes as Record<string, unknown> | null) ?? undefined,
    lastUsedAt: row.lastUsedAt ?? undefined,
    lastSyncAt: row.lastSyncAt ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
  };
}

function mapToModel(row: typeof costTrackingModels.$inferSelect): Model {
  return {
    id: row.id,
    providerId: row.providerId,
    slug: row.slug,
    displayName: row.displayName,
    serviceCategory: row.serviceCategory as ServiceCategory,
    status: row.status as ModelStatus,
    capabilities: (row.capabilities as Record<string, unknown> | null) ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapToModelPricing(row: typeof costTrackingModelPricing.$inferSelect): ModelPricing {
  return {
    id: row.id,
    modelId: row.modelId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo ?? undefined,
    serviceTier: row.serviceTier,
    contextTier: row.contextTier ?? undefined,
    region: row.region ?? undefined,
    rates: row.rates as PricingRates,
    currency: row.currency,
    source: row.source ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
