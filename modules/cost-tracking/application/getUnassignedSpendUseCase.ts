// =============================================================================
// Application — Get Unassigned Spend Use Case
// =============================================================================
// Identifies credentials that have spend but no attribution rules, so operators
// can prioritise which credentials to map to attribution groups.
//
// Flow:
//   1. Resolve date range (default last 30 days)
//   2. Fetch per-credential spend summary
//   3. Fetch all attribution rules to build the assigned-credential set
//   4. Classify each credential as assigned or unassigned
//   5. Compute totals and return result
//
// Pre-wired export: `getUnassignedSpend`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IUsageRecordRepository, IAttributionRepository } from '../domain/repositories';
import { CostTrackingError } from './costTrackingError';
import { resolveDateRange } from '../domain/dateRange';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type GetUnassignedSpendInput = {
  startDate?: Date;
  endDate?: Date;
};

export type UnassignedSpendResult = {
  totalSpend: number;
  assignedSpend: number;
  unassignedSpend: number;
  assignedPercentage: number;
  unassignedCredentials: Array<{
    credentialId: string;
    credentialLabel: string;
    keyHint: string | null;
    providerDisplayName: string;
    totalCost: number;
    totalRequests: number;
  }>;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the getUnassignedSpend use case.
 *
 * @param usageRecordRepo - Repository for credential spend summaries
 * @param attributionRepo - Repository for attribution rules
 * @returns Async use case function
 */
export const makeGetUnassignedSpendUseCase = (
  usageRecordRepo: IUsageRecordRepository,
  attributionRepo: IAttributionRepository,
) => {
  return async (
    data: GetUnassignedSpendInput,
  ): Promise<Result<UnassignedSpendResult, CostTrackingError>> => {
    try {
      // Step 1: Resolve date range
      const { startDate, endDate } = resolveDateRange(data.startDate, data.endDate);

      // Steps 2 & 3: Fetch in parallel
      const [credentialRows, allRules] = await Promise.all([
        usageRecordRepo.findSummaryByCredential(startDate, endDate),
        attributionRepo.findAllRules(),
      ]);

      // Step 4: Build set of assigned credential IDs
      // A credential is "assigned" if at least one rule targets it via dimension='credential'
      const assignedCredentialIds = new Set<string>(
        allRules
          .filter((rule) => rule.dimension === 'credential')
          .map((rule) => rule.matchValue),
      );

      let totalSpend = 0;
      let assignedSpend = 0;
      let unassignedSpend = 0;
      const unassignedCredentials: UnassignedSpendResult['unassignedCredentials'] = [];

      for (const row of credentialRows) {
        const cost = parseFloat(row.totalCost);
        totalSpend += cost;

        const credentialId = row.credentialId ?? '';
        if (credentialId && assignedCredentialIds.has(credentialId)) {
          assignedSpend += cost;
        } else {
          unassignedSpend += cost;
          unassignedCredentials.push({
            credentialId,
            credentialLabel: row.credentialLabel ?? credentialId,
            keyHint: row.credentialKeyHint ?? null,
            providerDisplayName: row.providerDisplayName,
            totalCost: cost,
            totalRequests: row.totalRequests,
          });
        }
      }

      // Sort unassigned by totalCost descending
      unassignedCredentials.sort((a, b) => b.totalCost - a.totalCost);

      const assignedPercentage = totalSpend > 0 ? (assignedSpend / totalSpend) * 100 : 0;

      return {
        success: true,
        value: {
          totalSpend,
          assignedSpend,
          unassignedSpend,
          assignedPercentage,
          unassignedCredentials,
        },
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to compute unassigned spend', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const usageRecordRepo = makeUsageRecordRepository(db);
const attributionRepo = makeAttributionRepository(db);

export const getUnassignedSpend = makeGetUnassignedSpendUseCase(
  usageRecordRepo,
  attributionRepo,
);
