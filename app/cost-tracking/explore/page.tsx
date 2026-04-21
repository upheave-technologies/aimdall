// =============================================================================
// Cost Tracking — Explore Page (Data Layer)
// =============================================================================
// Server Component responsible for:
//   1. Parsing all URL search params (time preset, granularity, grouping, filters)
//   2. Resolving the time preset to concrete UTC dates
//   3. Computing the prior period for delta comparison
//   4. Fetching main data, prior period data, and unassigned spend in parallel
//   5. Computing derived scalar metrics (daily run rate, dominant segment, anomaly days)
//   6. Delegating all rendering to ExploreSurfaceContainer
//
// No raw HTML JSX lives here. All rendering is delegated to named components.
// =============================================================================

import { exploreCostData } from '@/modules/cost-tracking/application/exploreCostDataUseCase';
import { getUnassignedSpend } from '@/modules/cost-tracking/application/getUnassignedSpendUseCase';
import { computeWindowAnomalyCount } from '@/modules/cost-tracking/domain/types';
import type {
  ExplorerDimension,
  ExplorerFilter,
  TimeSeriesPoint,
} from '@/modules/cost-tracking/domain/types';
import { ExploreSurfaceContainer } from './_containers/ExploreSurfaceContainer';
import { ExploreErrorState } from './_components/ExploreErrorState';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

type SearchParams = Promise<{
  time?: string;
  from?: string;
  to?: string;
  gran?: string;
  group?: string;
  groupBy?: string; // backward compat alias
  page?: string;
  provider?: string;
  provider_label?: string;
  model?: string;
  model_label?: string;
  credential?: string;
  credential_label?: string;
  segment?: string;
  segment_label?: string;
  serviceCategory?: string;
  serviceCategory_label?: string;
  serviceTier?: string;
  serviceTier_label?: string;
  contextTier?: string;
  contextTier_label?: string;
  region?: string;
  region_label?: string;
  attributionGroup?: string;
  attributionGroup_label?: string;
}>;

type FilterItem = {
  dimension: ExplorerDimension;
  value: string;
  label: string;
};

// =============================================================================
// SECTION 2: CONSTANTS
// =============================================================================

const VALID_DIMENSIONS: ExplorerDimension[] = [
  'provider',
  'model',
  'credential',
  'segment',
  'serviceCategory',
  'serviceTier',
  'contextTier',
  'region',
  'attributionGroup',
];

const FILTER_PARAM_NAMES = [
  'provider',
  'model',
  'credential',
  'segment',
  'serviceCategory',
  'serviceTier',
  'contextTier',
  'region',
  'attributionGroup',
] as const;

// =============================================================================
// SECTION 3: PURE HELPER FUNCTIONS
// =============================================================================

function resolveTimePreset(
  preset: string,
  customFrom?: string,
  customTo?: string,
): {
  startDate: Date;
  endDate: Date;
  defaultGranularity: 'daily' | 'weekly' | 'monthly';
} {
  const now = new Date();
  const todayEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );

  switch (preset) {
    case 'today': {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      return { startDate: start, endDate: todayEnd, defaultGranularity: 'daily' };
    }

    case '7d': {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6),
      );
      return { startDate: start, endDate: todayEnd, defaultGranularity: 'daily' };
    }

    case '90d': {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 89),
      );
      return { startDate: start, endDate: todayEnd, defaultGranularity: 'weekly' };
    }

    case 'mtd': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const days = Math.ceil((todayEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return {
        startDate: start,
        endDate: todayEnd,
        defaultGranularity: days > 60 ? 'weekly' : 'daily',
      };
    }

    case 'qtd': {
      const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
      const start = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1));
      const days = Math.ceil((todayEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return {
        startDate: start,
        endDate: todayEnd,
        defaultGranularity: days > 60 ? 'weekly' : 'daily',
      };
    }

    case 'ytd': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      return { startDate: start, endDate: todayEnd, defaultGranularity: 'monthly' };
    }

    case 'custom': {
      if (customFrom && customTo) {
        const start = new Date(customFrom + 'T00:00:00Z');
        const end = new Date(customTo + 'T23:59:59.999Z');
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        return {
          startDate: start,
          endDate: end,
          defaultGranularity: days > 60 ? 'weekly' : 'daily',
        };
      }
      // Fallback to 30d when custom params are missing
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29),
      );
      return { startDate: start, endDate: todayEnd, defaultGranularity: 'daily' };
    }

    default: {
      // '30d' and any unrecognised value
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29),
      );
      return { startDate: start, endDate: todayEnd, defaultGranularity: 'daily' };
    }
  }
}

function computePriorPeriod(
  startDate: Date,
  endDate: Date,
): { priorStart: Date; priorEnd: Date } {
  const rangeMs = endDate.getTime() - startDate.getTime();
  const priorEnd = new Date(startDate.getTime() - 1); // 1ms before current window start
  const priorStart = new Date(priorEnd.getTime() - rangeMs);
  return { priorStart, priorEnd };
}

// =============================================================================
// SECTION 4: PAGE COMPONENT
// =============================================================================

export default async function CostExplorePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  // ---------------------------------------------------------------------------
  // 4a. Parse time preset and resolve concrete UTC dates
  // ---------------------------------------------------------------------------
  const timePreset = params.time ?? '30d';
  const { startDate, endDate, defaultGranularity } = resolveTimePreset(
    timePreset,
    params.from,
    params.to,
  );

  // ---------------------------------------------------------------------------
  // 4b. Resolve granularity — explicit param takes precedence over auto default
  // ---------------------------------------------------------------------------
  const allowedGranularities = ['daily', 'weekly', 'monthly'] as const;
  const granularity: 'daily' | 'weekly' | 'monthly' =
    params.gran &&
    allowedGranularities.includes(params.gran as 'daily' | 'weekly' | 'monthly')
      ? (params.gran as 'daily' | 'weekly' | 'monthly')
      : defaultGranularity;

  // ---------------------------------------------------------------------------
  // 4c. Parse groupBy — support both `group` and legacy `groupBy` param
  // ---------------------------------------------------------------------------
  const rawGroup = params.group ?? params.groupBy;
  const groupBy: ExplorerDimension | undefined =
    rawGroup && VALID_DIMENSIONS.includes(rawGroup as ExplorerDimension)
      ? (rawGroup as ExplorerDimension)
      : undefined;

  // ---------------------------------------------------------------------------
  // 4d. Parse pagination
  // ---------------------------------------------------------------------------
  const page = params.page ? Math.max(1, parseInt(params.page, 10)) : 1;

  // ---------------------------------------------------------------------------
  // 4e. Build filters array (AND-combined equality filters)
  // ---------------------------------------------------------------------------
  const filters: ExplorerFilter[] = [];
  const filtersWithLabels: FilterItem[] = [];

  for (const dimension of FILTER_PARAM_NAMES) {
    const value = params[dimension];
    if (value) {
      filters.push({ dimension, value });
      const labelKey = `${dimension}_label` as keyof Awaited<SearchParams>;
      const label = (params[labelKey] as string | undefined) ?? value;
      filtersWithLabels.push({ dimension, value, label });
    }
  }

  // ---------------------------------------------------------------------------
  // 4f. Compute prior period for delta comparison
  // ---------------------------------------------------------------------------
  const { priorStart, priorEnd } = computePriorPeriod(startDate, endDate);

  // ---------------------------------------------------------------------------
  // 4g. Fetch all data in parallel
  // ---------------------------------------------------------------------------
  const [mainResult, priorResult, unassignedResult] = await Promise.all([
    exploreCostData({ groupBy, filters, startDate, endDate, page }),
    exploreCostData({ filters, startDate: priorStart, endDate: priorEnd, page: 1, pageSize: 1 }),
    getUnassignedSpend({ startDate, endDate }),
  ]);

  // ---------------------------------------------------------------------------
  // 4h. Handle hard failure on main query
  // ---------------------------------------------------------------------------
  if (!mainResult.success) {
    return <ExploreErrorState message={mainResult.error?.message} />;
  }

  // ---------------------------------------------------------------------------
  // 4i. Compute derived scalar metrics
  // ---------------------------------------------------------------------------
  const numDays = Math.max(
    1,
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const dailyRunRate = parseFloat(mainResult.value.totalCost) / numDays;

  const dominantSegment =
    groupBy && mainResult.value.rows.length > 0
      ? {
          label:
            mainResult.value.rows[0].groupLabel || mainResult.value.rows[0].groupKey,
          share:
            parseFloat(mainResult.value.rows[0].totalCost) /
            Math.max(0.000001, parseFloat(mainResult.value.totalCost)),
        }
      : null;

  const anomalyDays = computeWindowAnomalyCount(mainResult.value.timeSeries);

  // ---------------------------------------------------------------------------
  // 4j. Delegate rendering to ExploreSurfaceContainer (Frankie's territory)
  // ---------------------------------------------------------------------------
  return (
    <ExploreSurfaceContainer
      timePreset={timePreset}
      granularity={granularity}
      groupBy={groupBy}
      filters={filtersWithLabels}
      startDateStr={startDate.toISOString().slice(0, 10)}
      endDateStr={endDate.toISOString().slice(0, 10)}
      page={page}
      rows={mainResult.value.rows}
      timeSeries={mainResult.value.timeSeries}
      totalRows={mainResult.value.totalRows}
      totalCost={mainResult.value.totalCost}
      totalRequestCount={mainResult.value.totalRequestCount}
      currency={mainResult.value.currency}
      pageSize={mainResult.value.pageSize}
      metrics={mainResult.value.metrics}
      priorTotalCost={priorResult.success ? priorResult.value.totalCost : '0'}
      dailyRunRate={dailyRunRate}
      dominantSegment={dominantSegment}
      anomalyDays={anomalyDays}
      unassignedCredentials={
        unassignedResult.success ? unassignedResult.value.unassignedCredentials : []
      }
    />
  );
}
