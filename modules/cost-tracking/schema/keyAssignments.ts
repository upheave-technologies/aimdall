// =============================================================================
// Cost Tracking Module — Key Assignments Table
// =============================================================================
// A KeyAssignment maps a Principal (user) to a ProviderCredential (API key).
// This is the link that says "this person uses this API key" — enabling
// per-user cost attribution for shared provider accounts.
//
// Design decisions:
//   - principalId is a SOFT LINK (plain text) to the Identity module. No foreign
//     key is created across module boundaries per the Axiom of Data Sovereignty.
//     This matches the pattern used in the Auth module's credentials table.
//   - credentialId is a hard FK to cost_tracking_provider_credentials because
//     both tables live within the same module boundary.
//   - The partial unique index on (principalId, credentialId) WHERE deletedAt
//     IS NULL ensures a principal can only be assigned to a given credential
//     once at a time, while allowing re-assignment after soft deletion.
//   - assignedAt records when the assignment was made (distinct from createdAt
//     for cases where the row is created retroactively from historical data).
// =============================================================================

import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingProviderCredentials } from './providerCredentials';

export const costTrackingKeyAssignments = pgTable(
  'cost_tracking_key_assignments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    // Soft link to the Identity module — intentionally no FK constraint
    principalId: text('principal_id').notNull(),

    credentialId: text('credential_id')
      .notNull()
      .references(() => costTrackingProviderCredentials.id),

    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),

    // Soft delete: NULL means active, timestamp means soft-deleted
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Zombie Shield: a principal can only be assigned to a credential once while active
    uniqueIndex('cost_tracking_key_assignments_principal_credential_unique_active')
      .on(table.principalId, table.credentialId)
      .where(isNull(table.deletedAt)),

    // Lookup by principal (e.g., "which keys does this user have?")
    index('cost_tracking_key_assignments_principal_id_idx')
      .on(table.principalId)
      .where(isNull(table.deletedAt)),

    // Lookup by credential (e.g., "who is assigned to this key?")
    index('cost_tracking_key_assignments_credential_id_idx')
      .on(table.credentialId)
      .where(isNull(table.deletedAt)),

    // Zombie Shield bookkeeping
    index('cost_tracking_key_assignments_deleted_at_idx').on(table.deletedAt),
  ],
);
