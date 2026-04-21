// =============================================================================
// Sparkline — Tiny inline SVG trend chart
// =============================================================================
// Pure SVG, no recharts dependency. Auto-colors based on trend direction.
// Up trend (cost rising) = red, down trend (cost falling) = green, flat = slate.
// =============================================================================

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
};

export function Sparkline({ data, width = 64, height = 24, color }: SparklineProps) {
  if (data.length < 2) return <div style={{ width, height }} />;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const first = data[0];
  const last = data[data.length - 1];
  const trend =
    last > first * 1.1 ? 'up' : last < first * 0.9 ? 'down' : 'flat';
  const autoColor =
    trend === 'up' ? '#ef4444' : trend === 'down' ? '#10b981' : '#94a3b8';
  const strokeColor = color ?? autoColor;

  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * chartWidth;
    const y = padding + (1 - (v - min) / range) * chartHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polyline = 'M' + points.join('L');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d={polyline}
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
