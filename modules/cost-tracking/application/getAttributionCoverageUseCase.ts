// =============================================================================
// Application — Get Attribution Coverage Use Case
// =============================================================================
// Calculates what percentage of total spend is attributed to groups, and
// identifies which credentials remain unattributed (with per-credential costs).
//
// Flow:
//   1. Resolve date range (default last 30 days)
//   2. Fetch per-credential spend summary and all attribution rules in parallel
//   3. Build the set of assigned credential IDs (rules with dimension='credential')
//   4. Accumulate attributed vs unattributed spend
//   5. Build unattributed breakdown sorted by cost descending
//   6. Compute coverage percentage via calculateCoverage (domain function)
//   7. Return CoverageResult
//
// Pre-wired export: `getAttributionCoverage`
// =============================================================================

import { Result } from '@/packages/shared/lib/result';
import { IUsageRecordRepository, IAttributionRepository } from '../domain/repositories';
import { CoverageResult, calculateCoverage } from '../domain/attributionTemplate';
import { CostTrackingError } from './costTrackingError';
import { resolveDateRange } from '../domain/dateRange';
import { makeUsageRecordRepository } from '../infrastructure/repositories/DrizzleUsageRecordRepository';
import { makeAttributionRepository } from '../infrastructure/repositories/DrizzleAttributionRepository';
import { db } from '@/lib/db';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

export type GetAttributionCoverageInput = {
  startDate?: Date;
  endDate?: Date;
};

// =============================================================================
// SECTION 2: USE CASE FACTORY
// =============================================================================

/**
 * Higher-order function that creates the getAttributionCoverage use case.
 *
 * @param usageRecordRepo - Repository for per-credential spend summaries
 * @param attributionRepo - Repository for attribution rules
 * @returns Async use case function
 */
export const makeGetAttributionCoverageUseCase = (
  usageRecordRepo: IUsageRecordRepository,
  attributionRepo: IAttributionRepository,
) => {
  return async (
    data: GetAttributionCoverageInput,
  ): Promise<Result<CoverageResult, CostTrackingError>> => {
    try {
      // Step 1: Resolve date range
      const { startDate, endDate } = resolveDateRange(data.startDate, data.endDate);

      // Step 2: Fetch in parallel
      const [credentialRows, allRules] = await Promise.all([
        usageRecordRepo.findSummaryByCredential(startDate, endDate),
        attributionRepo.findAllRules(),
      ]);

      // Step 3: Build set of assigned credential IDs
      // A credential is "attributed" if at least one rule targets it via dimension='credential'
      const assignedCredentialIds = new Set<string>(
        allRules
          .filter((rule) => rule.dimension === 'credential')
          .map((rule) => rule.matchValue),
      );

      let totalSpend = 0;
      let attributedSpend = 0;
      const unattributedItems: Array<{
        credentialId: string;
        credentialLabel: string;
        keyHint: string | null;
        providerDisplayName: string;
        cost: number;
      }> = [];

      // Step 4: Accumulate spend
      for (const row of credentialRows) {
        const cost = parseFloat(row.totalCost);
        totalSpend += cost;

        const credentialId = row.credentialId ?? '';
        if (credentialId && assignedCredentialIds.has(credentialId)) {
          attributedSpend += cost;
        } else {
          unattributedItems.push({
            credentialId,
            credentialLabel: row.credentialLabel ?? credentialId,
            keyHint: row.credentialKeyHint ?? null,
            providerDisplayName: row.providerDisplayName,
            cost,
          });
        }
      }

      // Step 5: Sort unattributed by cost descending
      unattributedItems.sort((a, b) => b.cost - a.cost);

      // Step 6: Compute coverage using domain function
      const { percentage } = calculateCoverage(totalSpend, attributedSpend);

      // Build breakdown with per-credential percentage of total spend
      const unattributedBreakdown: CoverageResult['unattributedBreakdown'] = unattributedItems.map(
        (item) => ({
          credentialId: item.credentialId,
          credentialLabel: item.credentialLabel,
          keyHint: item.keyHint,
          providerDisplayName: item.providerDisplayName,
          cost: item.cost,
          percentage: totalSpend > 0 ? (item.cost / totalSpend) * 100 : 0,
        }),
      );

      return {
        success: true,
        value: {
          totalSpend,
          attributedSpend,
          unattributedSpend: totalSpend - attributedSpend,
          coveragePercentage: percentage,
          unattributedBreakdown,
        },
      };
    } catch {
      return {
        success: false,
        error: new CostTrackingError('Failed to compute attribution coverage', 'SERVICE_ERROR'),
      };
    }
  };
};

// =============================================================================
// SECTION 3: PRE-WIRED INSTANCE
// =============================================================================

const usageRecordRepo = makeUsageRecordRepository(db);
const attributionRepo = makeAttributionRepository(db);

export const getAttributionCoverage = makeGetAttributionCoverageUseCase(
  usageRecordRepo,
  attributionRepo,
);
