import Link from 'next/link';

type ExploreLinkProps = {
  /** Which dimension to filter on */
  dimension: string;
  /** The filter value (ID, slug, etc.) */
  value: string;
  /** Optional: human-readable label for tooltip */
  label?: string;
  /** Optional: additional search params to include (e.g., date range) */
  params?: Record<string, string>;
  /** Optional: render as inline element wrapping children */
  children?: React.ReactNode;
};

function buildExploreUrl(
  dimension: string,
  value: string,
  extraParams?: Record<string, string>,
): string {
  const searchParams = new URLSearchParams();
  searchParams.set(dimension, value);
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      searchParams.set(k, v);
    }
  }
  return `/cost-tracking/explore?${searchParams.toString()}`;
}

export function ExploreLink({
  dimension,
  value,
  label,
  params,
  children,
}: ExploreLinkProps) {
  const url = buildExploreUrl(dimension, value, params);
  const tooltipText = `Explore ${label || value}`;

  if (children) {
    return (
      <Link
        href={url}
        className="group inline-flex items-center gap-1 hover:text-foreground transition-colors"
        title={tooltipText}
      >
        {children}
        <svg
          className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-foreground/40 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </Link>
    );
  }

  return (
    <Link
      href={url}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-foreground/30 hover:text-foreground/70 hover:bg-foreground/10 transition-colors"
      title={tooltipText}
    >
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="6.5" cy="6.5" r="4" />
        <path d="M11 11l3 3" />
      </svg>
    </Link>
  );
}
