// =============================================================================
// Domain — Usage Record Repository (compatibility shim)
// =============================================================================
// This file forwards to the consolidated repositories.ts. It exists solely
// to preserve the file path for any external references. All repository
// interfaces are now defined in repositories.ts.
// =============================================================================

export type {
  IUsageRecordRepository,
  UsageSummaryRow,
  DailySpendRow,
} from './repositories';
