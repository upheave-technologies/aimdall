import Link from 'next/link';
import type {
  AttributionSummaryRow,
  AttributionGroup,
  AttributionRule,
  CredentialWithProvider,
  PrincipalRecord,
  CoverageResult,
  DiscoverySuggestion,
} from '@/modules/cost-tracking/domain/types';
import { CoverageRing } from './CoverageRing';
import { UnattributedPanel } from './UnattributedPanel';
import { SuggestionBanner } from './SuggestionBanner';
import { EmptyState } from './EmptyState';
import { DashboardShell } from '../_containers/DashboardShell';

// =============================================================================
// TYPES
// =============================================================================

type AttributionDashboardProps = {
  summaryRows: AttributionSummaryRow[];
  groups: AttributionGroup[];
  rulesMap: Record<string, AttributionRule[]>;
  users: PrincipalRecord[];
  credentials: CredentialWithProvider[];
  coverage: CoverageResult | null;
  suggestions: DiscoverySuggestion[];
  // Form actions
  createGroupAction: (formData: FormData) => Promise<void>;
  updateGroupAction: (formData: FormData) => Promise<void>;
  deleteGroupAction: (formData: FormData) => Promise<void>;
  createRuleAction: (formData: FormData) => Promise<void>;
  deleteRuleAction: (formData: FormData) => Promise<void>;
  runMigrationAction: (formData: FormData) => Promise<void>;
  applyTemplateAction: (formData: FormData) => Promise<void>;
  previewRuleAction: (formData: FormData) => Promise<void>;
  dismissSuggestionAction: (formData: FormData) => Promise<void>;
  applySuggestionAction: (formData: FormData) => Promise<void>;
  assignCredentialAction: (formData: FormData) => Promise<void>;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function AttributionDashboard({
  summaryRows,
  groups,
  rulesMap,
  users,
  credentials,
  coverage,
  suggestions,
  createGroupAction,
  updateGroupAction,
  deleteGroupAction,
  createRuleAction,
  deleteRuleAction,
  runMigrationAction,
  applyTemplateAction,
  previewRuleAction,
  dismissSuggestionAction,
  applySuggestionAction,
  assignCredentialAction,
}: AttributionDashboardProps) {
  // Empty state: no groups AND no attributed coverage
  const hasNoCoverage =
    coverage === null || coverage.coveragePercentage === 0;

  if (groups.length === 0 && hasNoCoverage) {
    return (
      <EmptyState
        credentials={credentials}
        suggestions={suggestions}
        applyTemplateAction={applyTemplateAction}
        applySuggestionAction={applySuggestionAction}
        dismissSuggestionAction={dismissSuggestionAction}
        createGroupAction={createGroupAction}
      />
    );
  }

  // Full dashboard
  const percentage = coverage?.coveragePercentage ?? 0;
  const attributedSpend = coverage?.attributedSpend ?? 0;
  const totalSpend = coverage?.totalSpend ?? 0;
  const breakdown = coverage?.unattributedBreakdown ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attributions</h1>
          <p className="mt-1 text-sm text-foreground/50">Know where every dollar goes.</p>
        </div>
        <Link
          href="/cost-tracking"
          className="text-sm text-foreground/50 hover:text-foreground/70"
        >
          ← Cost Tracking
        </Link>
      </div>

      {/* Zone 1: Coverage story */}
      <section>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CoverageRing
            percentage={percentage}
            attributedSpend={attributedSpend}
            totalSpend={totalSpend}
          />
          <UnattributedPanel
            breakdown={breakdown}
            groups={groups}
            assignCredentialAction={assignCredentialAction}
          />
        </div>
      </section>

      {/* Suggestion banners between zones */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.slice(0, 3).map((s) => (
            <SuggestionBanner
              key={s.id}
              suggestion={s}
              applySuggestionAction={applySuggestionAction}
              dismissSuggestionAction={dismissSuggestionAction}
            />
          ))}
          {suggestions.length > 3 && (
            <p className="text-sm text-foreground/40">
              {suggestions.length - 3} more suggestion
              {suggestions.length - 3 !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Zone 2+3: Interactive group grid + detail panel */}
      <DashboardShell
        summaryRows={summaryRows}
        groups={groups}
        rulesMap={rulesMap}
        credentials={credentials}
        users={users}
        totalSpend={totalSpend}
        createGroupAction={createGroupAction}
        updateGroupAction={updateGroupAction}
        deleteGroupAction={deleteGroupAction}
        createRuleAction={createRuleAction}
        deleteRuleAction={deleteRuleAction}
        runMigrationAction={runMigrationAction}
        applyTemplateAction={applyTemplateAction}
        previewRuleAction={previewRuleAction}
      />
    </div>
  );
}
