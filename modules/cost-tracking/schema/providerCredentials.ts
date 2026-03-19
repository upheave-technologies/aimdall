// =============================================================================
// Cost Tracking Module — Provider Credentials Table
// =============================================================================
// A ProviderCredential represents an API key, service account, or IAM role
// used to access a provider. This table serves a dual purpose:
//
// 1. Tracking credentials: API keys whose usage we want to monitor and
//    attribute costs to.
// 2. Sync credentials: Admin/elevated keys used to fetch usage data from
//    provider APIs (flagged via is_sync_credential).
//
// Design decisions:
//   - external_id is the provider's own identifier for this credential (e.g.,
//     apikey_01Rj2N8SVvo6BePZj99NhmiT for Anthropic). We never store the
//     actual secret — only the provider's public reference.
//   - key_hint stores the last 4 characters for display purposes only.
//   - segment_id is nullable because some credentials are account-wide
//     (not scoped to a specific workspace/project).
//   - scopes captures the access permissions as JSONB, varying per provider.
// =============================================================================

import { pgTable, text, timestamp, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingCredentialType, costTrackingCredentialStatus } from './enums';
import { costTrackingProviders } from './providers';
import { costTrackingProviderSegments } from './providerSegments';

export const costTrackingProviderCredentials = pgTable(
  'cost_tracking_provider_credentials',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    providerId: text('provider_id')
      .notNull()
      .references(() => costTrackingProviders.id),

    // Nullable: some credentials are account-wide, not scoped to a segment
    segmentId: text('segment_id')
      .references(() => costTrackingProviderSegments.id),

    // Provider's own identifier for this credential
    externalId: text('external_id').notNull(),

    label: text('label').notNull(),

    // Last 4 characters for display (e.g., "hmiT")
    keyHint: text('key_hint'),

    credentialType: costTrackingCredentialType('credential_type').notNull(),

    status: costTrackingCredentialStatus('status').notNull().default('active'),

    // Whether this credential is used to FETCH usage data (admin key)
    isSyncCredential: boolean('is_sync_credential').notNull().default(false),

    // Provider-specific access permissions
    scopes: jsonb('scopes'),

    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),

    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),

    // Provider-specific attributes
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    // Zombie Shield
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Zombie Shield: one active credential per provider + external_id combination
    uniqueIndex('cost_tracking_provider_credentials_provider_external_unique_active')
      .on(table.providerId, table.externalId)
      .where(isNull(table.deletedAt)),

    index('cost_tracking_provider_credentials_provider_id_idx').on(table.providerId),
    index('cost_tracking_provider_credentials_segment_id_idx').on(table.segmentId),
    index('cost_tracking_provider_credentials_status_idx').on(table.status),
    index('cost_tracking_provider_credentials_credential_type_idx').on(table.credentialType),
    index('cost_tracking_provider_credentials_deleted_at_idx').on(table.deletedAt),
  ],
);
