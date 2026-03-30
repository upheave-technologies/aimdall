import Link from 'next/link';
import { exploreCostData } from '@/modules/cost-tracking/application/exploreCostDataUseCase';
import type { ExplorerDimension, ExplorerFilter } from '@/modules/cost-tracking/domain/types';
import { DateRangeFilterContainer } from '../_containers/DateRangeFilterContainer';
import { GroupBySelectorContainer } from './_containers/GroupBySelectorContainer';
import { FilterBarContainer } from './_containers/FilterBarContainer';
import { ExplorerHeadline } from './_components/ExplorerHeadline';
import { ExplorerTableContainer } from './_containers/ExplorerTableContainer';
import { ColumnControlContainer } from './_containers/ColumnControlContainer';
import { SpendChartContainer } from './_containers/SpendChartContainer';
import { PaginationContainer } from './_containers/PaginationContainer';
import { EmptyState } from './_components/EmptyState';
import { DIMENSION_LABELS } from './_components/constants';

// =============================================================================
// Types
// =============================================================================

type SearchParams = Promise<{
  from?: string;
  to?: string;
  groupBy?: string;
  page?: string;
  columns?: string;
  provider?: string;
  model?: string;
  credential?: string;
  segment?: string;
  serviceCategory?: string;
  serviceTier?: string;
  contextTier?: string;
  region?: string;
  attributionGroup?: string;
}>;

// =============================================================================
// Helpers
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

const FILTER_PARAM_MAP: Record<string, ExplorerDimension> = {
  provider: 'provider',
  model: 'model',
  credential: 'credential',
  segment: 'segment',
  serviceCategory: 'serviceCategory',
  serviceTier: 'serviceTier',
  contextTier: 'contextTier',
  region: 'region',
  attributionGroup: 'attributionGroup',
};

function parseFilters(params: Record<string, string | undefined>): ExplorerFilter[] {
  const filters: ExplorerFilter[] = [];
  for (const [paramName, dimension] of Object.entries(FILTER_PARAM_MAP)) {
    const value = params[paramName];
    if (value) {
      filters.push({ dimension, value });
    }
  }
  return filters;
}

function parseGroupBy(value: string | undefined): ExplorerDimension | undefined {
  if (!value) return undefined;
  return VALID_DIMENSIONS.includes(value as ExplorerDimension)
    ? (value as ExplorerDimension)
    : undefined;
}

// =============================================================================
// Page
// =============================================================================

export default async function CostExplorerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const startDate = params.from ? new Date(params.from) : undefined;
  const endDate = params.to ? new Date(params.to) : undefined;
  const groupBy = parseGroupBy(params.groupBy);
  const page = params.page ? parseInt(params.page, 10) : undefined;
  const filters = parseFilters(params);
  const columns = params.columns;

  const result = await exploreCostData({
    groupBy,
    filters,
    startDate,
    endDate,
    page,
  });

  if (!result.success) {
    return (
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-10">
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl font-bold">Explorer</h1>
          <Link href="/cost-tracking" className="text-sm text-foreground/60 underline-offset-4 hover:underline">
            ← Dashboard
          </Link>
        </div>
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 px-6 py-10 text-center">
          <p className="text-base font-medium text-foreground/70">Failed to load explorer data.</p>
          <p className="mt-1 text-sm text-foreground/50">{result.error?.message ?? 'An unexpected error occurred.'}</p>
        </div>
      </main>
    );
  }

  const {
    rows,
    timeSeries,
    totalRows,
    totalCost,
    totalRequestCount,
    currency,
    page: currentPage,
    pageSize,
    metrics,
  } = result.value;

  // Build filter objects for FilterBar (raw values; labels resolved client-side if needed)
  const activeFilters = filters.map((f) => ({
    dimension: f.dimension,
    value: f.value,
    label: f.value,
  }));

  const groupByLabel = groupBy ? (DIMENSION_LABELS[groupBy] ?? groupBy) : undefined;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-10">
      {/* Header with back link */}
      <div className="flex items-baseline gap-4">
        <h1 className="text-2xl font-bold">Explorer</h1>
        <Link
          href="/cost-tracking"
          className="text-sm text-foreground/60 underline-offset-4 hover:underline"
        >
          ← Dashboard
        </Link>
      </div>

      {/* Date range */}
      <DateRangeFilterContainer />

      {/* Group by selector */}
      <GroupBySelectorContainer current={groupBy} />

      {/* Active filters */}
      <FilterBarContainer filters={activeFilters} />

      {/* Summary headline */}
      <ExplorerHeadline
        totalCost={totalCost}
        totalRequestCount={totalRequestCount}
        currency={currency}
      />

      {/* Column visibility control */}
      <ColumnControlContainer allMetrics={metrics} columns={columns} />

      {/* Time series chart */}
      <SpendChartContainer data={timeSeries} groupBy={groupBy} />

      {/* Result table with drill-down rows or empty state */}
      {rows.length > 0 ? (
        <>
          <ExplorerTableContainer
            rows={rows}
            metrics={metrics}
            groupBy={groupBy}
            groupByLabel={groupByLabel}
            columns={columns}
          />
          <PaginationContainer
            currentPage={currentPage}
            pageSize={pageSize}
            totalRows={totalRows}
          />
        </>
      ) : (
        <EmptyState hasFilters={activeFilters.length > 0} />
      )}
    </main>
  );
}
