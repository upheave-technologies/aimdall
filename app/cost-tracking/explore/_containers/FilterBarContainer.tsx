'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import { FilterBar, type ActiveFilter, type FilterDropdownState, type FilterValue } from '../_components/FilterBar';
import { DIMENSION_LABELS } from '../_components/constants';
import { getFilterValuesAction } from '../actions';
import type { ExplorerDimension } from '@/modules/cost-tracking/domain/types';

const ALL_DIMENSIONS = Object.keys(DIMENSION_LABELS) as ExplorerDimension[];

type FilterBarContainerProps = {
  filters: ActiveFilter[];
};

export function FilterBarContainer({ filters }: FilterBarContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [dropdownState, setDropdownState] = useState<FilterDropdownState>('closed');
  const [selectedDimension, setSelectedDimension] = useState<ExplorerDimension | null>(null);
  const [availableValues, setAvailableValues] = useState<FilterValue[]>([]);
  const [loadingValues, setLoadingValues] = useState(false);
  const [valuesError, setValuesError] = useState<string | null>(null);

  const activeDimensions = new Set(filters.map((f) => f.dimension));
  const availableDimensions = ALL_DIMENSIONS.filter((d) => !activeDimensions.has(d));

  const removeFilter = useCallback(
    (dimension: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(dimension);
      params.delete('page');
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleDimensionSelect = useCallback(async (dimension: string) => {
    const dim = dimension as ExplorerDimension;
    setSelectedDimension(dim);
    setDropdownState('value');
    setLoadingValues(true);
    setValuesError(null);
    setAvailableValues([]);

    const result = await getFilterValuesAction(dim);
    setLoadingValues(false);

    if ('error' in result) {
      setValuesError(result.error);
      return;
    }

    setAvailableValues(result.values.map((v) => ({ value: v.value, label: v.label })));
  }, []);

  const handleValueSelect = useCallback(
    (value: string) => {
      if (!selectedDimension) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set(selectedDimension, value);
      params.delete('page');
      router.push(`?${params.toString()}`, { scroll: false });
      setDropdownState('closed');
      setSelectedDimension(null);
      setAvailableValues([]);
    },
    [router, searchParams, selectedDimension],
  );

  const closeDropdown = useCallback(() => {
    setDropdownState('closed');
    setSelectedDimension(null);
    setAvailableValues([]);
    setValuesError(null);
  }, []);

  const openDropdown = useCallback(() => {
    setDropdownState('dimension');
  }, []);

  const backToDimension = useCallback(() => {
    setDropdownState('dimension');
  }, []);

  return (
    <FilterBar
      filters={filters}
      availableDimensions={availableDimensions}
      dropdownState={dropdownState}
      selectedDimension={selectedDimension}
      availableValues={availableValues}
      loadingValues={loadingValues}
      valuesError={valuesError}
      onRemoveFilter={removeFilter}
      onOpenDropdown={openDropdown}
      onCloseDropdown={closeDropdown}
      onDimensionSelect={handleDimensionSelect}
      onValueSelect={handleValueSelect}
      onBackToDimension={backToDimension}
    />
  );
}
