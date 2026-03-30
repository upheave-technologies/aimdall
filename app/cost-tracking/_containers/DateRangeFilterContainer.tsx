'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { DateRangeFilter, type DateRangePreset } from '../_components/DateRangeFilter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESETS: DateRangePreset[] = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

const DEFAULT_DAYS = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateString(d);
}

function today(): string {
  return toDateString(new Date());
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function DateRangeFilterContainer() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentFrom = searchParams.get('from') ?? '';
  const currentTo = searchParams.get('to') ?? '';
  const todayStr = today();

  // Determine which preset is active, if any.
  function activePresetDays(): number | null {
    if (!currentFrom && !currentTo) return DEFAULT_DAYS;

    for (const preset of PRESETS) {
      if (
        currentFrom === subtractDays(preset.days) &&
        (currentTo === todayStr || !currentTo)
      ) {
        return preset.days;
      }
    }
    return null;
  }

  const applyPreset = useCallback(
    (days: number) => {
      if (days === DEFAULT_DAYS) {
        router.push('?', { scroll: false });
        return;
      }
      const from = subtractDays(days);
      const to = today();
      router.push(`?from=${from}&to=${to}`, { scroll: false });
    },
    [router],
  );

  const handleFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const from = e.target.value;
      if (!from) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set('from', from);
      if (!params.get('to')) params.set('to', today());
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const to = e.target.value;
      if (!to) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set('to', to);
      if (!params.get('from')) params.set('from', subtractDays(DEFAULT_DAYS));
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <DateRangeFilter
      presets={PRESETS}
      activePresetDays={activePresetDays()}
      currentFrom={currentFrom}
      currentTo={currentTo}
      todayStr={todayStr}
      onPresetClick={applyPreset}
      onFromChange={handleFromChange}
      onToChange={handleToChange}
    />
  );
}
