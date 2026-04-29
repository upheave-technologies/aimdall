import { listAttributionGroups } from '@/modules/cost-tracking/application/listAttributionGroupsUseCase';
import { listAttributionRules } from '@/modules/cost-tracking/application/listAttributionRulesUseCase';
import { getAttributionSummary } from '@/modules/cost-tracking/application/getAttributionSummaryUseCase';
import { listUsers } from '@/modules/cost-tracking/application/listUsersUseCase';
import { listCredentials } from '@/modules/cost-tracking/application/listCredentialsUseCase';
import { getAttributionCoverage } from '@/modules/cost-tracking/application/getAttributionCoverageUseCase';
import { getAutoDiscoverySuggestions } from '@/modules/cost-tracking/application/getAutoDiscoverySuggestionsUseCase';
import type {
  AttributionSummaryRow,
  AttributionGroup,
  AttributionRule,
  CredentialWithProvider,
  PrincipalRecord,
  CoverageResult,
  DiscoverySuggestion,
} from '@/modules/cost-tracking/domain/types';
import { resolveSelectedPeriod } from '@/modules/cost-tracking/domain/types';
import {
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
} from './actions';
import { AttributionsView } from './_components/AttributionsView';
import { AttributionDashboard } from './_components/AttributionDashboard';
import { AttributionsErrorView } from './_components/AttributionsErrorView';

// =============================================================================
// VOID WRAPPERS
// =============================================================================
// Next.js requires form action props to be `(formData: FormData) => void |
// Promise<void>`. The exported actions return ActionResult so they can be
// called programmatically. These thin wrappers satisfy the form prop type
// constraint and are used exclusively inside JSX.

async function createGroupFormAction(formData: FormData): Promise<void> {
  'use server';
  await createGroupAction(formData);
}

async function deleteGroupFormAction(formData: FormData): Promise<void> {
  'use server';
  await deleteGroupAction(formData);
}

async function createRuleFormAction(formData: FormData): Promise<void> {
  'use server';
  await createRuleAction(formData);
}

async function deleteRuleFormAction(formData: FormData): Promise<void> {
  'use server';
  await deleteRuleAction(formData);
}

async function runMigrationFormAction(formData: FormData): Promise<void> {
  'use server';
  await runMigrationAction(formData);
}

async function applyTemplateFormAction(formData: FormData): Promise<void> {
  'use server';
  await applyTemplateAction(formData);
}

async function dismissSuggestionFormAction(formData: FormData): Promise<void> {
  'use server';
  await dismissSuggestionAction(formData);
}

async function updateGroupFormAction(formData: FormData): Promise<void> {
  'use server';
  await updateGroupAction(formData);
}

async function applySuggestionFormAction(formData: FormData): Promise<void> {
  'use server';
  await applySuggestionAction(formData);
}

async function assignCredentialFormAction(formData: FormData): Promise<void> {
  'use server';
  await assignCredentialAction(formData);
}

async function previewRuleFormAction(formData: FormData): Promise<void> {
  'use server';
  await previewRuleAction(formData);
}

// =============================================================================
// PAGE
// =============================================================================

type SearchParams = Promise<{
  period?: string;
  from?: string;
  to?: string;
}>;

export default async function AttributionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // ---------------------------------------------------------------------------
  // 1. RESOLVE PERIOD — unified URL contract: `period` + optional `from`/`to`
  // ---------------------------------------------------------------------------
  const params = await searchParams;
  const { startDate, endDate } = resolveSelectedPeriod({
    period: params.period,
    from: params.from,
    to: params.to,
  });

  // ---------------------------------------------------------------------------
  // 2. PARALLEL DATA FETCHING
  // ---------------------------------------------------------------------------
  const [summaryResult, groupsResult, usersResult, credentialsResult, coverageResult, suggestionsResult] = await Promise.all([
    getAttributionSummary({ startDate, endDate }),
    listAttributionGroups({}),
    listUsers(),
    listCredentials(),
    getAttributionCoverage({ startDate, endDate }),
    getAutoDiscoverySuggestions({}),
  ]);

  // ---------------------------------------------------------------------------
  // 3. ERROR HANDLING
  // ---------------------------------------------------------------------------
  if (!summaryResult.success) {
    return <AttributionsErrorView message={`Failed to load attribution summary: ${summaryResult.error.message}`} />;
  }

  if (!groupsResult.success) {
    return <AttributionsErrorView message={`Failed to load attribution groups: ${groupsResult.error.message}`} />;
  }

  if (!usersResult.success) {
    return <AttributionsErrorView message={`Failed to load users: ${usersResult.error.message}`} />;
  }

  if (!credentialsResult.success) {
    return <AttributionsErrorView message={`Failed to load credentials: ${credentialsResult.error.message}`} />;
  }

  const summaryRows: AttributionSummaryRow[] = summaryResult.value;
  const groups: AttributionGroup[] = groupsResult.value;
  const users: PrincipalRecord[] = usersResult.value;
  const credentials: CredentialWithProvider[] = credentialsResult.value;

  // Non-fatal: coverage and suggestions degrade gracefully if unavailable
  const coverage: CoverageResult | null = coverageResult.success ? coverageResult.value : null;
  const suggestions: DiscoverySuggestion[] = suggestionsResult.success ? suggestionsResult.value : [];

  // ---------------------------------------------------------------------------
  // 4. FETCH RULES PER GROUP IN PARALLEL
  // ---------------------------------------------------------------------------
  const rulesMap: Record<string, AttributionRule[]> = Object.fromEntries(
    await Promise.all(
      groups.map(async (g) => {
        const result = await listAttributionRules({ groupId: g.id });
        return [g.id, result.success ? result.value : []] as const;
      }),
    ),
  );

  // ---------------------------------------------------------------------------
  // 5. SORT SUMMARY BY COST DESCENDING
  // ---------------------------------------------------------------------------
  const sortedSummary = [...summaryRows].sort(
    (a, b) => parseFloat(b.totalCost) - parseFloat(a.totalCost),
  );

  // ---------------------------------------------------------------------------
  // 6. DELEGATE RENDERING
  // ---------------------------------------------------------------------------
  return (
    <AttributionDashboard
      summaryRows={sortedSummary}
      groups={groups}
      rulesMap={rulesMap}
      users={users}
      credentials={credentials}
      coverage={coverage}
      suggestions={suggestions}
      createGroupAction={createGroupFormAction}
      updateGroupAction={updateGroupFormAction}
      deleteGroupAction={deleteGroupFormAction}
      createRuleAction={createRuleFormAction}
      deleteRuleAction={deleteRuleFormAction}
      runMigrationAction={runMigrationFormAction}
      applyTemplateAction={applyTemplateFormAction}
      previewRuleAction={previewRuleFormAction}
      dismissSuggestionAction={dismissSuggestionFormAction}
      applySuggestionAction={applySuggestionFormAction}
      assignCredentialAction={assignCredentialFormAction}
    />
  );
}
