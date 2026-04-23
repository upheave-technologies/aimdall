import type { CoverageResult } from '@/modules/cost-tracking/domain/types';
import { formatCost } from './_types';

// =============================================================================
// COMPONENT
// =============================================================================

type CoverageRingProps = {
  percentage: number;
  attributedSpend: number;
  totalSpend: number;
};

export function CoverageRing({ percentage, attributedSpend, totalSpend }: CoverageRingProps) {
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const hasData = totalSpend > 0;
  const clampedPct = Math.min(100, Math.max(0, percentage));
  const dashOffset = hasData
    ? circumference - (clampedPct / 100) * circumference
    : circumference;

  return (
    <div className="rounded-xl border border-foreground/10 p-6 flex flex-col items-center justify-center">
      {/* Ring */}
      <div className="relative h-40 w-40">
        <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
          {/* Background track */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            strokeWidth={12}
            stroke="currentColor"
            className="text-foreground/10"
          />
          {/* Foreground arc */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            strokeWidth={12}
            stroke="currentColor"
            className="text-foreground"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 800ms ease-out' }}
          />
        </svg>

        {/* Center overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {hasData ? (
            <>
              <span className="text-4xl font-bold tabular-nums">{Math.round(clampedPct)}%</span>
              <span className="text-sm text-foreground/60">Attributed</span>
            </>
          ) : (
            <>
              <span className="text-4xl font-bold tabular-nums">--</span>
              <span className="text-sm text-foreground/60">No data</span>
            </>
          )}
        </div>
      </div>

      {/* Below-ring label */}
      {hasData ? (
        <p className="mt-3 text-center text-sm text-foreground/40">
          {formatCost(attributedSpend)} of {formatCost(totalSpend)}
        </p>
      ) : (
        <p className="mt-3 text-center text-sm text-foreground/40">No usage data yet</p>
      )}
    </div>
  );
}
