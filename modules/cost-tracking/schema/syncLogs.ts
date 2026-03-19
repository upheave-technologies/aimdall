// =============================================================================
// Cost Tracking Module — Sync Logs Table
// =============================================================================
// Audit trail for every sync operation. Each row represents one execution of
// the sync pipeline for a specific provider, covering a specific time range.
//
// Design decisions:
//   - This table must be defined BEFORE usageRecords and providerCosts because
//     those tables have FK references to sync_logs.sync_id.
//   - records_fetched/created/updated/skipped provide a quick summary of what
//     happened without querying the fact tables.
//   - duration_ms is computed at completion (completed_at - started_at) and
//     stored for easy performance monitoring without timestamp arithmetic.
//   - error_details stores the full error context as JSONB (stack traces,
//     HTTP status codes, rate-limit headers) for debugging.
//   - No deletedAt: sync logs are immutable audit records. They are never
//     deleted because they provide the provenance chain for usage data.
// =============================================================================

import { pgTable, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingSyncType, costTrackingSyncStatus } from './enums';
import { costTrackingProviders } from './providers';
import { costTrackingProviderCredentials } from './providerCredentials';

export const costTrackingSyncLogs = pgTable(
  'cost_tracking_sync_logs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    providerId: text('provider_id')
      .notNull()
      .references(() => costTrackingProviders.id),

    credentialId: text('credential_id')
      .references(() => costTrackingProviderCredentials.id),

    syncType: costTrackingSyncType('sync_type').notNull(),

    status: costTrackingSyncStatus('status').notNull().default('pending'),

    // What time range was synced
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),

    // Summary counters
    recordsFetched: integer('records_fetched').notNull().default(0),
    recordsCreated: integer('records_created').notNull().default(0),
    recordsUpdated: integer('records_updated').notNull().default(0),
    recordsSkipped: integer('records_skipped').notNull().default(0),

    // Error tracking
    errorMessage: text('error_message'),
    errorDetails: jsonb('error_details'),

    // Timing
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),

    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('cost_tracking_sync_logs_provider_id_idx').on(table.providerId),
    index('cost_tracking_sync_logs_credential_id_idx').on(table.credentialId),
    index('cost_tracking_sync_logs_status_idx').on(table.status),
    index('cost_tracking_sync_logs_started_at_idx').on(table.startedAt),
  ],
);
