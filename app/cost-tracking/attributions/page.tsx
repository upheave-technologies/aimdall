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
import {
  createGroupAction,
  deleteGroupAction,
  createRuleAction,
  deleteRuleAction,
  runMigrationAction,
  applyTemplateAction,
  dismissSuggestionAction,
} from './actions';
import { AttributionsView } from './_components/AttributionsView';
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

// =============================================================================
// PAGE
// =============================================================================

export default async function AttributionsPage() {
  // ---------------------------------------------------------------------------
  // 1. PARALLEL DATA FETCHING
  // ---------------------------------------------------------------------------
  const [summaryResult, groupsResult, usersResult, credentialsResult, coverageResult, suggestionsResult] = await Promise.all([
    getAttributionSummary({}),
    listAttributionGroups({}),
    listUsers(),
    listCredentials(),
    getAttributionCoverage({}),
    getAutoDiscoverySuggestions({}),
  ]);

  // ---------------------------------------------------------------------------
  // 2. ERROR HANDLING
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
  // 3. FETCH RULES PER GROUP IN PARALLEL
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
  // 4. SORT SUMMARY BY COST DESCENDING
  // ---------------------------------------------------------------------------
  const sortedSummary = [...summaryRows].sort(
    (a, b) => parseFloat(b.totalCost) - parseFloat(a.totalCost),
  );

  // ---------------------------------------------------------------------------
  // 5. DELEGATE RENDERING
  // ---------------------------------------------------------------------------
  return (
    <AttributionsView
      summaryRows={sortedSummary}
      groups={groups}
      rulesMap={rulesMap}
      users={users}
      credentials={credentials}
      coverage={coverage}
      suggestions={suggestions}
      createGroupAction={createGroupFormAction}
      deleteGroupAction={deleteGroupFormAction}
      createRuleAction={createRuleFormAction}
      deleteRuleAction={deleteRuleFormAction}
      runMigrationAction={runMigrationFormAction}
      applyTemplateAction={applyTemplateFormAction}
      dismissSuggestionAction={dismissSuggestionFormAction}
    />
  );
}
