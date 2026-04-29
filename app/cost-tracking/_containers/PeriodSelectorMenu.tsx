'use client';

// =============================================================================
// PeriodSelectorMenu — client island (slim state proxy)
// =============================================================================
// Minimum-surface client component. Owns:
//   - open/closed dropdown state
//   - preset selection (reads current period via useSearchParams)
//   - custom date inputs (coordinated submission as a single navigation)
//   - URL mutation (useRouter.push with the unified contract)
//
// All JSX lives in PeriodSelectorView (_components/). This container only
// manages state and event handlers, then delegates rendering.
//
// URL contract: `period` + optional `from`/`to`. Stale `window`/`time` params
// are never written and are not read from (RFC Section 3.9).
// =============================================================================

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PeriodPreset } from '@/modules/cost-tracking/domain/types';
import {
  PeriodSelectorView,
  type PresetOption,
} from '../_components/PeriodSelectorView';

// ---------------------------------------------------------------------------
// Preset definitions (UI order)
// ---------------------------------------------------------------------------

const PRESET_OPTIONS: PresetOption[] = [
  { token: 'today', label: 'Today' },
  { token: '7d', label: 'Last 7 days' },
  { token: '30d', label: 'Last 30 days' },
  { token: '90d', label: 'Last 90 days' },
  { token: 'mtd', label: 'Month to date' },
  { token: 'qtd', label: 'Quarter to date' },
  { token: 'ytd', label: 'Year to date' },
  { token: 'all', label: 'All time' },
  { token: 'custom', label: 'Custom range' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildPeriodUrl(token: PeriodPreset, from?: string, to?: string): string {
  if (token === 'custom' && from && to) {
    return `?period=custom&from=${from}&to=${to}`;
  }
  // The 30d default is canonical — omit the param to keep URLs clean.
  if (token === '30d') {
    return '?';
  }
  return `?period=${token}`;
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function PeriodSelectorMenu() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside the selector.
  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  // Derive current selection from URL (client-side read).
  const currentPeriod = (searchParams.get('period') ?? '30d') as PeriodPreset;
  const currentFrom = searchParams.get('from') ?? '';
  const currentTo = searchParams.get('to') ?? '';

  // Local state for custom date inputs — coordinated, submit together.
  const [customFrom, setCustomFrom] = useState(currentFrom);
  const [customTo, setCustomTo] = useState(currentTo);

  const todayStr = todayDateString();

  // Resolve human-readable label for the trigger button.
  const activeOption =
    PRESET_OPTIONS.find((o) => o.token === currentPeriod) ?? PRESET_OPTIONS[2]; // fallback: 30d

  const currentLabel =
    currentPeriod === 'custom' && currentFrom && currentTo
      ? `${currentFrom} – ${currentTo}`
      : activeOption.label;

  const handleToggle = useCallback(() => setOpen((v) => !v), []);

  // Navigate to a preset (non-custom).
  const handlePresetSelect = useCallback(
    (token: PeriodPreset) => {
      setOpen(false);
      router.push(buildPeriodUrl(token), { scroll: false });
    },
    [router],
  );

  // Navigate to a custom range — both dates must be present.
  const handleCustomSubmit = useCallback(() => {
    if (!customFrom || !customTo) return;
    setOpen(false);
    router.push(buildPeriodUrl('custom', customFrom, customTo), { scroll: false });
  }, [router, customFrom, customTo]);

  return (
    <div ref={containerRef}>
      <PeriodSelectorView
        currentLabel={currentLabel}
        open={open}
        currentPeriod={currentPeriod}
        presetOptions={PRESET_OPTIONS}
        customFrom={customFrom}
        customTo={customTo}
        todayStr={todayStr}
        onToggle={handleToggle}
        onPresetSelect={handlePresetSelect}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onCustomSubmit={handleCustomSubmit}
      />
    </div>
  );
}
