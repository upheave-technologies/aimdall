import type { DiscoverySuggestion } from '@/modules/cost-tracking/domain/types';

// =============================================================================
// HELPERS
// =============================================================================

function confidenceDotColor(confidence: DiscoverySuggestion['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'bg-emerald-500';
    case 'medium':
      return 'bg-amber-500';
    case 'low':
      return 'bg-foreground/30 border border-foreground/20';
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

type SuggestionBannerProps = {
  suggestion: DiscoverySuggestion;
  applySuggestionAction: (formData: FormData) => Promise<void>;
  dismissSuggestionAction: (formData: FormData) => Promise<void>;
};

export function SuggestionBanner({
  suggestion,
  applySuggestionAction,
  dismissSuggestionAction,
}: SuggestionBannerProps) {
  return (
    <>
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(0.5rem); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-4"
        style={{ animation: 'fade-in-up 300ms ease-out' }}
      >
      <div className="flex items-start justify-between gap-4">
        {/* Left: confidence dot + text */}
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${confidenceDotColor(suggestion.confidence)}`}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{suggestion.title}</p>
            <p className="mt-0.5 text-sm text-foreground/60">{suggestion.description}</p>

            {/* Credential chips */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestion.credentialIds.slice(0, 5).map((id) => (
                <span
                  key={id}
                  className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-foreground/50 font-mono"
                >
                  {id.slice(0, 12)}...
                </span>
              ))}
              {suggestion.credentialIds.length > 5 && (
                <span className="text-xs text-foreground/40">
                  +{suggestion.credentialIds.length - 5} more
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <form action={applySuggestionAction}>
            <input type="hidden" name="suggestedGroupName" value={suggestion.suggestedGroupName} />
            <input
              type="hidden"
              name="suggestedGroupType"
              value={suggestion.suggestedGroupType}
            />
            <input
              type="hidden"
              name="credentialIds"
              value={JSON.stringify(suggestion.credentialIds)}
            />
            <button
              type="submit"
              className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              Apply
            </button>
          </form>

          <form action={dismissSuggestionAction}>
            <input type="hidden" name="suggestionId" value={suggestion.id} />
            <input type="hidden" name="suggestionType" value={suggestion.type} />
            <button
              type="submit"
              className="rounded px-3 py-1.5 text-xs font-medium text-foreground/50 hover:bg-foreground/10 hover:text-foreground/70"
            >
              Dismiss
            </button>
          </form>
        </div>
      </div>
    </div>
    </>
  );
}
