'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { ExplorerMetricConfig } from '@/modules/cost-tracking/domain/types';
import { ColumnControl } from '../_components/ColumnControl';
import {
  type ColumnPreset,
  type ColumnVisibility,
  parseColumnsParam,
  serializeColumnsParam,
} from '../_components/columnUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ColumnControlContainerProps = {
  allMetrics: ExplorerMetricConfig[];
  columns?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInPresetBase(
  metricKey: string,
  preset: ColumnPreset,
  allMetrics: ExplorerMetricConfig[],
): boolean {
  switch (preset) {
    case 'core':
      return metricKey === 'totalCost' || metricKey === 'totalRequestCount';
    case 'detailed':
      return (allMetrics.find((m) => m.key === metricKey)?.priority ?? '') === 'primary';
    case 'full':
      return true;
  }
}

function computeVisibleKeys(
  allMetrics: ExplorerMetricConfig[],
  visibility: ColumnVisibility,
): Set<string> {
  const { preset, additions, removals } = visibility;
  const keys = new Set<string>(
    allMetrics
      .filter((m) => isInPresetBase(m.key, preset, allMetrics))
      .map((m) => m.key),
  );
  for (const key of removals) keys.delete(key);
  for (const key of additions) keys.add(key);
  return keys;
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function ColumnControlContainer({ allMetrics, columns }: ColumnControlContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const visibility = parseColumnsParam(columns);

  const pushVisibility = useCallback(
    (next: ColumnVisibility) => {
      const params = new URLSearchParams(searchParams.toString());
      const serialized = serializeColumnsParam(next);
      if (serialized === undefined) {
        params.delete('columns');
      } else {
        params.set('columns', serialized);
      }
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handlePresetClick = useCallback(
    (preset: ColumnPreset) => {
      pushVisibility({ preset, additions: [], removals: [] });
    },
    [pushVisibility],
  );

  const handleMetricToggle = useCallback(
    (metricKey: string) => {
      const { preset, additions, removals } = visibility;
      const inBase = isInPresetBase(metricKey, preset, allMetrics);
      const isCurrentlyVisible = inBase
        ? !removals.includes(metricKey)
        : additions.includes(metricKey);

      let nextAdditions = additions.filter((k) => k !== metricKey);
      let nextRemovals = removals.filter((k) => k !== metricKey);

      if (isCurrentlyVisible) {
        if (inBase) {
          nextRemovals = [...nextRemovals, metricKey];
        }
      } else {
        if (!inBase) {
          nextAdditions = [...nextAdditions, metricKey];
        }
      }

      pushVisibility({ preset, additions: nextAdditions, removals: nextRemovals });
    },
    [visibility, allMetrics, pushVisibility],
  );

  const visibleKeys = computeVisibleKeys(allMetrics, visibility);

  return (
    <ColumnControl
      allMetrics={allMetrics}
      visibility={visibility}
      visibleKeys={visibleKeys}
      onPresetClick={handlePresetClick}
      onMetricToggle={handleMetricToggle}
    />
  );
}
