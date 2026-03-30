'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { ExplorerResultRow, ExplorerMetricConfig } from '@/modules/cost-tracking/domain/types';
import { ExplorerTable } from '../_components/ExplorerTable';
import type { ExplorerDimension } from '@/modules/cost-tracking/domain/types';

type ExplorerTableContainerProps = {
  rows: ExplorerResultRow[];
  metrics: ExplorerMetricConfig[];
  groupBy?: string;
  groupByLabel?: string;
  columns?: string;
};

export function ExplorerTableContainer({
  rows,
  metrics,
  groupBy,
  groupByLabel,
  columns,
}: ExplorerTableContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleDrillDown = useCallback(
    (drillGroupBy: string, groupKey: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(drillGroupBy as ExplorerDimension, groupKey);
      params.delete('groupBy');
      params.delete('page');
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <ExplorerTable
      rows={rows}
      metrics={metrics}
      groupBy={groupBy}
      groupByLabel={groupByLabel}
      columns={columns}
      onDrillDown={handleDrillDown}
    />
  );
}
