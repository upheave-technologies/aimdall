// =============================================================================
// Application — Get Filter Values Use Case
// =============================================================================
// Returns the set of available filter values for a requested explorer dimension.
// Used to populate dropdown menus in the cost explorer UI.
//
// Flow:
//   1. Switch on the requested dimension
//   2. Query the appropriate repository (or use hardcoded values for enums)
//   3. Return a uniform FilterValue[] list { value, label }
//
// Each dimension maps to a different data source:
//   provider        → IProviderRepository.findAll()
//   credential      → IProviderCredentialRepository.findAllWithProvider()
//   segment         → IUsageRecordRepository.getDistinctSegments()
//   model           → IUsageRecordRepository.getDistinctValues('model_slug')
//   serviceCategory → hardcoded ServiceCategory enum values
//   serviceTier     → IUsageRecordRepository.getDistinctValues('service_tier')
//   contextTier     → IUsageRecordRepository.getDistinctValues('context_tier')
//   region          → IUsageRecordRepository.getDistinctValues('region')
//   attributionGroup→ IAttributionRepository.findAllGroups()
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import {
  IUsageRecordRepository,
  IProviderRepository,
  IProviderCredentialRepository,
  IAttributionRepository,
} from '../domain/repositories';
import { ExplorerDimension } from '../domain/explorer';
import { ServiceCategory } from '../domain/model';
import { CostTrackingError } from './costTrackingError';
import { db } from '@/lib/db';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { makeProviderRepository, makeProviderCredentialRepository } from '../infrastructure/repositories/DrizzleProviderRepository';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type FilterValue = {
  value: string;
  label: string;
};

export type GetFilterValuesInput = {
  dimension: ExplorerDimension;
};

// =============================================================================
// SECTION 2: FACTORY
// =============================================================================

export const makeGetFilterValuesUseCase = (
  usageRecordRepo: IUsageRecordRepository,
  providerRepo: IProviderRepository,
  credentialRepo: IProviderCredentialRepository,
  attributionRepo: IAttributionRepository,
) => {
  return async (
    data: GetFilterValuesInput,
  ): Promise<Result<FilterValue[], CostTrackingError>> => {
    try {
      switch (data.dimension) {
        case 'provider': {
          const providers = await providerRepo.findAll();
          return {
            success: true,
            value: providers.map((p) => ({ value: p.id, label: p.displayName })),
          };
        }

        case 'credential': {
          const creds = await credentialRepo.findAllWithProvider();
          return {
            success: true,
            value: creds.map((c) => ({
              value: c.id,
              label: `${c.label}${c.keyHint ? ' (…' + c.keyHint + ')' : ''} — ${c.providerDisplayName}`,
            })),
          };
        }

        case 'segment': {
          const segments = await usageRecordRepo.getDistinctSegments();
          return {
            success: true,
            value: segments.map((s) => ({ value: s.id, label: s.displayName })),
          };
        }

        case 'model': {
          const slugs = await usageRecordRepo.getDistinctValues('model_slug');
          return {
            success: true,
            value: slugs.map((s) => ({ value: s, label: s })),
          };
        }

        case 'serviceCategory': {
          const categories: ServiceCategory[] = [
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
          ];
          return {
            success: true,
            value: categories.map((c) => ({
              value: c,
              label: c.replace(/_/g, ' '),
            })),
          };
        }

        case 'serviceTier': {
          const tiers = await usageRecordRepo.getDistinctValues('service_tier');
          return {
            success: true,
            value: tiers.map((t) => ({ value: t, label: t })),
          };
        }

        case 'contextTier': {
          const tiers = await usageRecordRepo.getDistinctValues('context_tier');
          return {
            success: true,
            value: tiers.map((t) => ({ value: t, label: t })),
          };
        }

        case 'region': {
          const regions = await usageRecordRepo.getDistinctValues('region');
          return {
            success: true,
            value: regions.map((r) => ({ value: r, label: r })),
          };
        }

        case 'attributionGroup': {
          const groups = await attributionRepo.findAllGroups();
          return {
            success: true,
            value: groups.map((g) => ({ value: g.id, label: g.displayName })),
          };
        }

        default: {
          // TypeScript exhaustiveness: the default branch catches unknown dimensions
          // at runtime while keeping the switch exhaustive at compile time.
          const _exhaustive: never = data.dimension;
          return {
            success: false,
            error: new CostTrackingError(
              `Unknown dimension: ${String(_exhaustive)}`,
              'VALIDATION_ERROR',
            ),
          };
        }
      }
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to fetch filter values', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const usageRecordRepo = makeUsageRecordRepository(db);
const providerRepo = makeProviderRepository(db);
const credentialRepo = makeProviderCredentialRepository(db);
const attributionRepo = makeAttributionRepository(db);

export const getFilterValues = makeGetFilterValuesUseCase(
  usageRecordRepo,
  providerRepo,
  credentialRepo,
  attributionRepo,
);
