'use client';

// =============================================================================
// AnomalyDotLayer — SVG overlay for anomaly markers in the Recharts AreaChart
// =============================================================================
// Uses Recharts 3.x hooks (useXAxisScale, useYAxisScale) to resolve data values
// to pixel coordinates, rendering an amber dot + tooltip for each anomaly date.
//
// Lives in _containers/ because it uses useState (for active tooltip tracking)
// and Recharts context hooks.
//
// Rendered as a direct child of <AreaChart> — Recharts 3.x supports arbitrary
// children without needing the deprecated <Customized> wrapper.
// =============================================================================

import { useState } from 'react';
import { useXAxisScale, useYAxisScale } from 'recharts';
import { formatCost, formatXAxisTick } from '../_components/formatters';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type AnomalyDotLayerProps = {
  /** Anomalous dates mapped to their total daily spend (from computeAnomalyDates). */
  anomalyDates: Map<string, number>;
  granularity: 'daily' | 'weekly' | 'monthly';
};

type TooltipState = {
  date: string;
  cx: number;
  cy: number;
  formattedDate: string;
  formattedSpend: string;
} | null;

// =============================================================================
// SECTION 2: COMPONENT
// =============================================================================

export function AnomalyDotLayer({ anomalyDates, granularity }: AnomalyDotLayerProps) {
  const [activeTooltip, setActiveTooltip] = useState<TooltipState>(null);

  // Recharts 3.x: access axis scales via hooks within the chart context.
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();

  if (!xScale || !yScale || !anomalyDates.size) return null;

  // Build resolved marker list — skip any dates outside the chart range.
  type Marker = {
    date: string;
    cx: number;
    cy: number;
    label: string;
    formattedDate: string;
    formattedSpend: string;
  };

  const markers: Marker[] = [];

  for (const [date, spend] of anomalyDates.entries()) {
    const rawCx = xScale(date);
    const rawCy = yScale(spend);

    if (rawCx == null || rawCy == null || !isFinite(rawCx) || !isFinite(rawCy)) continue;

    const formattedDate = new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const formattedSpend = formatCost(spend);

    markers.push({
      date,
      cx: rawCx,
      cy: rawCy,
      label: `Anomaly on ${formattedDate}: ${formattedSpend}`,
      formattedDate,
      formattedSpend,
    });
  }

  if (!markers.length) return null;

  const isActive = (date: string) => activeTooltip?.date === date;

  return (
    <g>
      {/* Dot markers */}
      {markers.map(({ date, cx, cy, label, formattedDate, formattedSpend }) => (
        <g
          key={date}
          role="img"
          aria-label={label}
          tabIndex={0}
          style={{ outline: 'none', cursor: 'default' }}
          onMouseEnter={() =>
            setActiveTooltip({ date, cx, cy, formattedDate, formattedSpend })
          }
          onMouseLeave={() => setActiveTooltip(null)}
          onFocus={() =>
            setActiveTooltip({ date, cx, cy, formattedDate, formattedSpend })
          }
          onBlur={() => setActiveTooltip(null)}
          onKeyDown={(e) => e.key === 'Escape' && setActiveTooltip(null)}
        >
          <title>{label}</title>
          {/* Invisible hit area for easier hover / tap */}
          <circle cx={cx} cy={cy} r={14} fill="transparent" />
          {/* Outer pulse ring */}
          <circle
            cx={cx}
            cy={cy}
            r={7}
            fill="transparent"
            stroke={isActive(date) ? 'rgba(245,158,11,0.6)' : 'rgba(245,158,11,0.3)'}
            strokeWidth={1.5}
          />
          {/* Inner dot */}
          <circle
            cx={cx}
            cy={cy}
            r={isActive(date) ? 5.5 : 4.5}
            fill="rgb(245,158,11)"
            stroke="rgba(245,158,11,0.5)"
            strokeWidth={1}
          />
        </g>
      ))}

      {/* Active tooltip — rendered last so it appears on top */}
      {activeTooltip &&
        (() => {
          const { cx, cy, formattedDate, formattedSpend } = activeTooltip;

          const tooltipWidth = 152;
          const tooltipHeight = 66;
          const halfW = tooltipWidth / 2;
          const caretHeight = 8;
          const gap = 6; // px between dot top and caret tip
          const tx = cx - halfW;
          const ty = cy - tooltipHeight - caretHeight - gap;

          const lines: Array<{ text: string; weight: number }> = [
            { text: formattedDate, weight: 500 },
            { text: formattedSpend, weight: 400 },
            { text: 'Anomaly detected', weight: 600 },
          ];

          return (
            <g style={{ pointerEvents: 'none' }}>
              {/* Drop shadow */}
              <rect
                x={tx + 2}
                y={ty + 2}
                width={tooltipWidth}
                height={tooltipHeight}
                rx={7}
                fill="rgba(0,0,0,0.18)"
              />
              {/* Tooltip background */}
              <rect
                x={tx}
                y={ty}
                width={tooltipWidth}
                height={tooltipHeight}
                rx={7}
                fill="var(--foreground)"
              />
              {/* Amber accent strip at top */}
              <rect
                x={tx}
                y={ty}
                width={tooltipWidth}
                height={3}
                rx={3}
                fill="rgb(245,158,11)"
              />
              {/* Text lines */}
              {lines.map(({ text, weight }, i) => (
                <text
                  key={i}
                  x={cx}
                  y={ty + 16 + i * 16}
                  textAnchor="middle"
                  fill="var(--background)"
                  fontSize={11}
                  fontFamily="inherit"
                  fontWeight={weight}
                >
                  {text}
                </text>
              ))}
              {/* Downward caret */}
              <polygon
                points={`
                  ${cx - caretHeight},${ty + tooltipHeight}
                  ${cx + caretHeight},${ty + tooltipHeight}
                  ${cx},${cy - gap}
                `}
                fill="var(--foreground)"
              />
            </g>
          );
        })()}
    </g>
  );
}
