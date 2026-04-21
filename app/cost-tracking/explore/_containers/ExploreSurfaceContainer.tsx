'use client';

// =============================================================================
// ExploreSurfaceContainer — Root client container for the Explore surface
// =============================================================================
// Responsibilities:
//   1. Hold ephemeral UI state (time picker open, custom date inputs)
//   2. Handle all URL navigation (groupBy, filters, time, pagination)
//   3. Compute derived display state (dimension pill states, isDirty)
//   4. Return a single <ExploreSurface /> call — no raw JSX markup here
//
// Never fetches data. Never defines server actions.
// =============================================================================

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  ExplorerDimension,
  ExplorerResultRow,
  TimeSeriesPoint,
  ExplorerMetricConfig,
} from '@/modules/cost-tracking/domain/types';

import { ExploreSurface } from '../_components/ExploreSurface';
import { TimeSeriesChartContainer, getChartMetrics } from './TimeSeriesChartContainer';
import { DIMENSION_ORDER, DIMENSION_LABELS } from '../_components/constants';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

type FilterItem = {
  dimension: ExplorerDimension;
  value: string;
  label: string;
};

type DominantSegment = {
  label: string;
  share: number;
};

type UnassignedCredential = {
  credentialId: string;
  credentialLabel: string;
  keyHint: string | null;
  providerDisplayName: string;
  totalCost: number;
  totalRequests: number;
};

type ExploreSurfaceContainerProps = {
  timePreset: string;
  granularity: 'daily' | 'weekly' | 'monthly';
  groupBy: ExplorerDimension | undefined;
  filters: FilterItem[];
  startDateStr: string;
  endDateStr: string;
  page: number;
  rows: ExplorerResultRow[];
  timeSeries: TimeSeriesPoint[];
  totalRows: number;
  totalCost: string;
  totalRequestCount: number;
  currency: string;
  pageSize: number;
  metrics: ExplorerMetricConfig[];
  priorTotalCost: string;
  dailyRunRate: number;
  dominantSegment: DominantSegment | null;
  anomalyDays: number;
  unassignedCredentials: UnassignedCredential[];
};

// =============================================================================
// SECTION 2: CONTAINER
// =============================================================================

export function ExploreSurfaceContainer({
  timePreset,
  granularity,
  groupBy,
  filters,
  startDateStr,
  endDateStr,
  page,
  rows,
  timeSeries,
  totalRows,
  totalCost,
  totalRequestCount: _totalRequestCount,
  currency,
  pageSize,
  metrics,
  priorTotalCost,
  dailyRunRate,
  dominantSegment,
  anomalyDays,
  unassignedCredentials,
}: ExploreSurfaceContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(startDateStr);
  const [customTo, setCustomTo] = useState(endDateStr);

  // -------------------------------------------------------------------------
  // URL mutation helper
  // -------------------------------------------------------------------------
  function buildUrl(mutations: Record<string, string | null>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(mutations)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    return `/cost-tracking/explore${qs ? `?${qs}` : ''}`;
  }

  // -------------------------------------------------------------------------
  // Navigation handlers
  // -------------------------------------------------------------------------

  function handleGroupByToggle(dimension: ExplorerDimension) {
    router.push(
      groupBy === dimension
        ? buildUrl({ group: null, page: null })
        : buildUrl({ group: dimension, page: null }),
    );
  }

  function handleDrillDown(dimension: ExplorerDimension, value: string, label: string) {
    router.push(
      buildUrl({
        [dimension]: value,
        [`${dimension}_label`]: label,
        group: null,
        page: null,
      }),
    );
  }

  function handleClearFilter(dimension: ExplorerDimension) {
    router.push(
      buildUrl({
        [dimension]: null,
        [`${dimension}_label`]: null,
        page: null,
      }),
    );
  }

  function handleFilterToGrouped(dimension: ExplorerDimension) {
    router.push(
      buildUrl({
        [dimension]: null,
        [`${dimension}_label`]: null,
        group: dimension,
        page: null,
      }),
    );
  }

  function handleTimePresetSelect(preset: string) {
    if (preset === 'custom') {
      router.push(buildUrl({ time: 'custom', from: customFrom, to: customTo, page: null }));
    } else {
      router.push(buildUrl({ time: preset, from: null, to: null, page: null }));
    }
  }

  function handleCustomFromChange(val: string) {
    setCustomFrom(val);
    if (val && customTo) {
      router.push(buildUrl({ time: 'custom', from: val, to: customTo, page: null }));
    }
  }

  function handleCustomToChange(val: string) {
    setCustomTo(val);
    if (customFrom && val) {
      router.push(buildUrl({ time: 'custom', from: customFrom, to: val, page: null }));
    }
  }

  function handleReset() {
    router.push('/cost-tracking/explore');
  }

  function handlePageChange(newPage: number) {
    router.push(buildUrl({ page: String(newPage) }));
  }

  function handleGranularityChange(gran: 'daily' | 'weekly' | 'monthly') {
    router.push(buildUrl({ gran }));
  }

  function handleChartSegmentClick(groupKey: string, groupLabel: string) {
    if (!groupBy) return;
    handleDrillDown(groupBy, groupKey, groupLabel);
  }

  // -------------------------------------------------------------------------
  // Derived display state
  // -------------------------------------------------------------------------

  const dimensionStates = DIMENSION_ORDER.map((dim) => {
    const filterMatch = filters.find((f) => f.dimension === dim);
    const isFiltered = !!filterMatch;
    const isGrouped = groupBy === dim;
    return {
      dimension: dim,
      label: DIMENSION_LABELS[dim],
      state: (isFiltered ? 'filtered' : isGrouped ? 'grouped' : 'ungrouped') as
        | 'filtered'
        | 'grouped'
        | 'ungrouped',
      filterValue: filterMatch?.value,
      filterLabel: filterMatch?.label,
    };
  });

  const isDirty = !!groupBy || filters.length > 0 || timePreset !== '30d';
  const groupByLabel = groupBy ? DIMENSION_LABELS[groupBy] : undefined;

  const { hasOther, totalGroupCount } = getChartMetrics(timeSeries, granularity, !!groupBy);

  const showContextPanel =
    anomalyDays > 0 ||
    (unassignedCredentials.length > 0 &&
      !filters.some((f) => f.dimension === 'credential'));

  // -------------------------------------------------------------------------
  // Single component return — no raw JSX markup in this container
  // -------------------------------------------------------------------------

  return (
    <ExploreSurface
      dimensionBar={{
        timePreset,
        isTimePickerOpen,
        onTimePillClick: () => setIsTimePickerOpen((v) => !v),
        onTimePickerClose: () => setIsTimePickerOpen(false),
        onTimePresetSelect: handleTimePresetSelect,
        customFrom,
        customTo,
        onCustomFromChange: handleCustomFromChange,
        onCustomToChange: handleCustomToChange,
        dimensions: dimensionStates,
        onGroupByToggle: handleGroupByToggle,
        onClearFilter: handleClearFilter,
        onFilterToGrouped: handleFilterToGrouped,
        onReset: handleReset,
        isDirty,
      }}
      totalCost={totalCost}
      priorTotalCost={priorTotalCost}
      currency={currency}
      dailyRunRate={dailyRunRate}
      dominantSegment={dominantSegment}
      anomalyDays={anomalyDays}
      groupByLabel={groupByLabel}
      granularity={granularity}
      hasTimeSeriesData={timeSeries.length > 0}
      hasOther={hasOther}
      totalGroupCount={totalGroupCount}
      onGranularityChange={handleGranularityChange}
      chartContent={
        <TimeSeriesChartContainer
          timeSeries={timeSeries}
          groupBy={groupBy}
          granularity={granularity}
          onSegmentClick={handleChartSegmentClick}
        />
      }
      rows={rows}
      timeSeries={timeSeries}
      metrics={metrics}
      groupBy={groupBy}
      totalRows={totalRows}
      currentPage={page}
      pageSize={pageSize}
      onDrillDown={handleDrillDown}
      onPageChange={handlePageChange}
      filters={filters}
      unassignedCredentials={unassignedCredentials}
      showContextPanel={showContextPanel}
    />
  );
}
