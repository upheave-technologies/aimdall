// =============================================================================
// ExploreSurface — Layout shell for the 4-zone Explore surface
// =============================================================================
// Pure presentational. Owns the page layout: sticky bar + content zones.
// All event handlers flow in as props from ExploreSurfaceContainer.
// No hooks. No 'use client'.
// =============================================================================

import type {
  ExplorerDimension,
  ExplorerResultRow,
  TimeSeriesPoint,
  ExplorerMetricConfig,
} from '@/modules/cost-tracking/domain/types';

import { DimensionBar } from './DimensionBar';
import type { DimensionBarProps } from './DimensionBar';
import { SummaryStrip } from './SummaryStrip';
import { TimeSeriesZone } from './TimeSeriesZone';
import { CompositionTable } from './CompositionTable';
import { ContextPanel } from './ContextPanel';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

type FilterItem = {
  dimension: ExplorerDimension;
  value: string;
  label: string;
};

type UnassignedCredential = {
  credentialId: string;
  credentialLabel: string;
  keyHint: string | null;
  providerDisplayName: string;
  totalCost: number;
  totalRequests: number;
};

type DominantSegment = {
  label: string;
  share: number;
};

export type ExploreSurfaceProps = {
  // DimensionBar props
  dimensionBar: DimensionBarProps;

  // SummaryStrip props
  totalCost: string;
  priorTotalCost: string;
  currency: string;
  dailyRunRate: number;
  dominantSegment: DominantSegment | null;
  anomalyDays: number;
  groupByLabel: string | undefined;

  // TimeSeriesZone props
  granularity: 'daily' | 'weekly' | 'monthly';
  hasTimeSeriesData: boolean;
  hasOther: boolean;
  totalGroupCount: number;
  onGranularityChange: (gran: 'daily' | 'weekly' | 'monthly') => void;

  // Chart (passed as children to TimeSeriesZone)
  chartContent: React.ReactNode;

  // CompositionTable props
  rows: ExplorerResultRow[];
  timeSeries: TimeSeriesPoint[];
  metrics: ExplorerMetricConfig[];
  groupBy: ExplorerDimension | undefined;
  totalRows: number;
  currentPage: number;
  pageSize: number;
  onDrillDown: (dimension: ExplorerDimension, value: string, label: string) => void;
  onPageChange: (page: number) => void;

  // ContextPanel props
  filters: FilterItem[];
  unassignedCredentials: UnassignedCredential[];
  showContextPanel: boolean;
};

// =============================================================================
// SECTION 2: COMPONENT
// =============================================================================

export function ExploreSurface({
  dimensionBar,
  totalCost,
  priorTotalCost,
  currency,
  dailyRunRate,
  dominantSegment,
  anomalyDays,
  groupByLabel,
  granularity,
  hasTimeSeriesData,
  hasOther,
  totalGroupCount,
  onGranularityChange,
  chartContent,
  rows,
  timeSeries,
  metrics,
  groupBy,
  totalRows,
  currentPage,
  pageSize,
  onDrillDown,
  onPageChange,
  filters,
  unassignedCredentials,
  showContextPanel,
}: ExploreSurfaceProps) {
  return (
    <div className="min-h-screen">
      <DimensionBar {...dimensionBar} />

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
        {/* Zone 1: KPI Summary */}
        <SummaryStrip
          totalCost={totalCost}
          priorTotalCost={priorTotalCost}
          currency={currency}
          dailyRunRate={dailyRunRate}
          dominantSegment={dominantSegment}
          anomalyDays={anomalyDays}
          groupByLabel={groupByLabel}
        />

        {/* Zone 2: Time series chart */}
        <TimeSeriesZone
          hasData={hasTimeSeriesData}
          granularity={granularity}
          hasOther={hasOther}
          totalGroupCount={totalGroupCount}
          groupByLabel={groupByLabel}
          anomalyDays={anomalyDays}
          onGranularityChange={onGranularityChange}
        >
          {chartContent}
        </TimeSeriesZone>

        {/* Zone 3: Composition table */}
        <CompositionTable
          rows={rows}
          timeSeries={timeSeries}
          metrics={metrics}
          groupBy={groupBy}
          groupByLabel={groupByLabel}
          totalCost={totalCost}
          totalRows={totalRows}
          currentPage={currentPage}
          pageSize={pageSize}
          onDrillDown={onDrillDown}
          onPageChange={onPageChange}
        />

        {/* Zone 4: Contextual insights */}
        {showContextPanel && (
          <ContextPanel
            anomalyDays={anomalyDays}
            timeSeries={timeSeries}
            unassignedCredentials={unassignedCredentials}
            groupBy={groupBy}
            filters={filters}
            rows={rows}
            totalCost={totalCost}
          />
        )}
      </div>
    </div>
  );
}
