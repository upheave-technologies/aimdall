// =============================================================================
// ProviderIcon — Server Component
// =============================================================================
// Simple SVG icons for each provider. Inline SVGs using currentColor so they
// inherit text color from parent containers.
// =============================================================================

type ProviderIconProps = {
  slug: string;
  className?: string;
};

export function ProviderIcon({ slug, className = 'h-5 w-5' }: ProviderIconProps) {
  switch (slug) {
    case 'openai':
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          {/* Abstract AI / circuit node pattern */}
          <circle cx="12" cy="12" r="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v2M12 17v2M5 12H3M21 12h-2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.05 7.05 8.46 8.46M15.54 15.54l1.41 1.41M7.05 16.95l1.41-1.41M15.54 8.46l1.41-1.41" />
        </svg>
      );

    case 'anthropic':
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          {/* Abstract shield / hexagon */}
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 4v5c0 4.418-3.582 8-8 9-4.418-1-8-4.582-8-9V7l8-4z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4M12 14h.01" />
        </svg>
      );

    case 'google_vertex':
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          {/* Cloud icon */}
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
        </svg>
      );

    case 'google_gemini':
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          {/* Diamond / gem shape */}
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 6-9 12-9-12 9-6z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18M12 3l-4.5 6M12 3l4.5 6" />
        </svg>
      );

    default:
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
        </svg>
      );
  }
}
