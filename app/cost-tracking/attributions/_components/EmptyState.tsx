import Link from 'next/link';
import type {
  CredentialWithProvider,
  DiscoverySuggestion,
} from '@/modules/cost-tracking/domain/types';
import { SuggestionBanner } from './SuggestionBanner';

// =============================================================================
// TEMPLATE CARDS CONSTANT
// =============================================================================

const TEMPLATE_CARDS = [
  {
    type: 'team' as const,
    title: 'Track by Team',
    description: 'Group costs by the teams that use them',
    defaultNames: 'Engineering, Design, Data',
    icon: (
      <svg
        className="h-5 w-5 text-foreground/60"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="7" r="3" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 20c0-3.314 2.686-6 6-6h6c3.314 0 6 2.686 6 6"
        />
      </svg>
    ),
  },
  {
    type: 'project' as const,
    title: 'Track by Project',
    description: 'Organize by the projects they serve',
    defaultNames: '',
    icon: (
      <svg
        className="h-5 w-5 text-foreground/60"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
        />
      </svg>
    ),
  },
  {
    type: 'environment' as const,
    title: 'Track by Environment',
    description: 'Split dev, staging, and production',
    defaultNames: 'Development, Staging, Production',
    icon: (
      <svg
        className="h-5 w-5 text-foreground/60"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3"
        />
      </svg>
    ),
  },
] as const;

// =============================================================================
// COMPONENT
// =============================================================================

type EmptyStateProps = {
  credentials: CredentialWithProvider[];
  suggestions: DiscoverySuggestion[];
  applyTemplateAction: (formData: FormData) => Promise<void>;
  applySuggestionAction: (formData: FormData) => Promise<void>;
  dismissSuggestionAction: (formData: FormData) => Promise<void>;
  createGroupAction: (formData: FormData) => Promise<void>;
};

export function EmptyState({
  suggestions,
  applyTemplateAction,
  applySuggestionAction,
  dismissSuggestionAction,
}: EmptyStateProps) {
  return (
    <div className="mx-auto max-w-3xl py-10 text-center">
      {/* Header link */}
      <div className="mb-12 text-left">
        <Link
          href="/cost-tracking"
          className="text-sm text-foreground/50 hover:text-foreground/70"
        >
          ← Cost Tracking
        </Link>
      </div>

      {/* Hero text */}
      <h1 className="text-3xl font-bold tracking-tight">Know where every dollar goes.</h1>
      <p className="mt-3 text-foreground/60">
        Set up cost attribution in under 2 minutes. Choose how you want to organize your AI spend.
      </p>

      {/* Template cards */}
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TEMPLATE_CARDS.map((card) => (
          <form key={card.type} action={applyTemplateAction}>
            <input type="hidden" name="templateType" value={card.type} />
            <input type="hidden" name="groupNames" value={card.defaultNames} />
            <input type="hidden" name="credentialAssignments" value="{}" />
            <button
              type="submit"
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] p-6 text-left transition-all hover:border-foreground/20 hover:shadow-md"
            >
              <div className="mb-3 h-10 w-10 rounded-lg bg-foreground/10 flex items-center justify-center">
                {card.icon}
              </div>
              <h3 className="font-semibold">{card.title}</h3>
              <p className="mt-1 text-sm text-foreground/50">{card.description}</p>
            </button>
          </form>
        ))}
      </div>

      {/* Discover patterns */}
      <p className="mt-8 text-sm text-foreground/50">or let us look at your data</p>
      <p className="mt-2">
        <span className="text-sm font-medium text-foreground/70 underline-offset-4 hover:underline cursor-pointer">
          Discover Patterns
        </span>
      </p>

      {/* Suggestion banners */}
      {suggestions.length > 0 && (
        <div className="mt-10 space-y-3 text-left">
          <h2 className="text-sm font-semibold text-foreground/70">Based on your data</h2>
          {suggestions.map((s) => (
            <SuggestionBanner
              key={s.id}
              suggestion={s}
              applySuggestionAction={applySuggestionAction}
              dismissSuggestionAction={dismissSuggestionAction}
            />
          ))}
        </div>
      )}

      {/* Manual create link */}
      <p className="mt-10 text-sm text-foreground/40">
        Already know what you&apos;re doing?{' '}
        <span className="text-foreground/60 underline-offset-4 hover:underline cursor-pointer">
          Create group manually
        </span>
      </p>
    </div>
  );
}
