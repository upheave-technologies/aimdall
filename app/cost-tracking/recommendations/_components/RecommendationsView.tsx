import Link from 'next/link';
import type { Recommendation, RecommendationCategory } from '@/modules/cost-tracking/domain/types';

// =============================================================================
// CONSTANTS
// =============================================================================

const CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  model_tier_optimization: 'Model Tier',
  cache_utilization: 'Cache',
  batch_api_opportunity: 'Batch API',
  dormant_credentials: 'Security',
  context_tier_analysis: 'Context Tier',
  provider_concentration_risk: 'Risk',
};

const CATEGORY_COLORS: Record<RecommendationCategory, string> = {
  model_tier_optimization: 'bg-blue-100 text-blue-800',
  cache_utilization: 'bg-green-100 text-green-800',
  batch_api_opportunity: 'bg-purple-100 text-purple-800',
  dormant_credentials: 'bg-amber-100 text-amber-800',
  context_tier_analysis: 'bg-teal-100 text-teal-800',
  provider_concentration_risk: 'bg-red-100 text-red-800',
};

// =============================================================================
// HELPERS
// =============================================================================

function formatSavings(rec: Recommendation): string | null {
  if (rec.estimatedMonthlySavings != null) {
    const amount = parseFloat(rec.estimatedMonthlySavings);
    return `$${amount.toFixed(2)}/mo`;
  }
  return null;
}

function totalMonthlySavings(recs: Recommendation[]): number {
  return recs.reduce((sum, r) => {
    if (r.estimatedMonthlySavings != null) {
      return sum + parseFloat(r.estimatedMonthlySavings);
    }
    return sum;
  }, 0);
}

// =============================================================================
// PROPS
// =============================================================================

type RecommendationsViewProps = {
  recommendations: Recommendation[];
  dismissAction: (formData: FormData) => Promise<void>;
  generateAction: (formData: FormData) => Promise<void>;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function RecommendationsView({
  recommendations,
  dismissAction,
  generateAction,
}: RecommendationsViewProps) {
  const savingsTotal = totalMonthlySavings(recommendations);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">

      {/* ------------------------------------------------------------------- */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recommendations</h1>
        <div className="flex items-center gap-4">
          <form action={generateAction}>
            <button
              type="submit"
              className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Regenerate
            </button>
          </form>
          <Link
            href="/cost-tracking"
            className="text-sm text-foreground/60 underline-offset-4 hover:underline"
          >
            ← Cost Tracker
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Summary Bar                                                          */}
      {/* ------------------------------------------------------------------- */}
      {recommendations.length > 0 && (
        <div className="flex items-center gap-6 rounded-lg border border-foreground/10 bg-foreground/5 px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
              Active Recommendations
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">
              {recommendations.length}
            </p>
          </div>
          {savingsTotal > 0 && (
            <div className="border-l border-foreground/10 pl-6">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                Total Est. Monthly Savings
              </p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-green-600 dark:text-green-400">
                ${savingsTotal.toFixed(2)}/mo
              </p>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Recommendation List                                                  */}
      {/* ------------------------------------------------------------------- */}
      {recommendations.length === 0 ? (
        <div className="rounded-lg border border-foreground/10 bg-foreground/5 px-6 py-10 text-center">
          <p className="text-sm text-foreground/60">
            No recommendations available. Recommendations are generated after each data sync.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec) => {
            const savingsLabel = formatSavings(rec);
            const categoryLabel = CATEGORY_LABELS[rec.category] ?? rec.category;
            const categoryColor =
              CATEGORY_COLORS[rec.category] ?? 'bg-foreground/10 text-foreground/60';

            return (
              <div
                key={rec.id}
                className="rounded-lg border border-foreground/10 bg-foreground/5 p-5"
              >
                <div className="flex items-start justify-between gap-4">

                  {/* Left: content */}
                  <div className="min-w-0 flex-1 space-y-2">

                    {/* Category badge + savings */}
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${categoryColor}`}>
                        {categoryLabel}
                      </span>
                      {savingsLabel != null ? (
                        <span className="text-sm font-semibold tabular-nums text-green-600 dark:text-green-400">
                          {savingsLabel}
                        </span>
                      ) : (
                        <span className="text-xs text-foreground/50">{categoryLabel}</span>
                      )}
                    </div>

                    {/* Title */}
                    <h2 className="font-semibold">{rec.title}</h2>

                    {/* Description */}
                    <p className="text-sm leading-relaxed text-foreground/70">
                      {rec.description}
                    </p>

                    {/* Confidence basis */}
                    {rec.confidenceBasis && (
                      <p className="text-xs text-foreground/50">{rec.confidenceBasis}</p>
                    )}
                  </div>

                  {/* Right: dismiss button */}
                  <form action={dismissAction} className="shrink-0">
                    <input type="hidden" name="id" value={rec.id} />
                    <button
                      type="submit"
                      className="rounded px-3 py-1 text-xs font-medium text-foreground/50 hover:bg-foreground/10 hover:text-foreground/70"
                    >
                      Dismiss
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </main>
  );
}
