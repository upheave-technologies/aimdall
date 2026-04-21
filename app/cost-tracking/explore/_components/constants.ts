import type { ExplorerDimension } from '@/modules/cost-tracking/domain/types';

export const DIMENSION_LABELS: Record<string, string> = {
  provider: 'Provider',
  model: 'Model',
  credential: 'API Key',
  segment: 'Workspace',
  serviceCategory: 'Service',
  serviceTier: 'Tier',
  contextTier: 'Context',
  region: 'Region',
  attributionGroup: 'Group',
};

export const TIME_PRESET_LABELS: Record<string, string> = {
  today: 'Today',
  '7d': '7D',
  '30d': '30D',
  '90d': '90D',
  mtd: 'MTD',
  qtd: 'QTD',
  ytd: 'YTD',
  custom: 'Custom',
};

export const DIMENSION_ORDER: ExplorerDimension[] = [
  'provider',
  'model',
  'credential',
  'attributionGroup',
  'segment',
  'serviceCategory',
  'region',
];
