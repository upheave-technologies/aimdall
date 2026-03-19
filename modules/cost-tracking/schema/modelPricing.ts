// =============================================================================
// Cost Tracking Module — Model Pricing Table
// =============================================================================
// Time-boxed pricing rates for models. Each row represents a pricing period
// for a specific model + service_tier + context_tier + region combination.
//
// Design decisions:
//   - Pricing is versioned by time range (effective_from / effective_to).
//     A NULL effective_to means "current/active pricing".
//   - The composite unique index on (model_id, effective_from, service_tier,
//     context_tier, region) prevents conflicting prices for the same dimensions
//     at the same point in time.
//   - rates is a JSONB column containing the structured rate card. Only the
//     rate keys relevant to the model's service category are present. See the
//     module documentation for the full rate key schema.
//   - We use date (not timestamp) for effective_from/effective_to because
//     pricing changes happen at day boundaries, not mid-day.
//   - service_tier and context_tier are plain text (not enums) because
//     providers invent new tiers frequently and we don't want a migration
//     every time OpenAI adds a "turbo" tier.
//   - No deletedAt: pricing records are historical facts. Old prices are
//     bounded by effective_to and superseded by newer rows, never deleted.
// =============================================================================

import { pgTable, text, date, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

import { costTrackingModels } from './models';

export const costTrackingModelPricing = pgTable(
  'cost_tracking_model_pricing',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    modelId: text('model_id')
      .notNull()
      .references(() => costTrackingModels.id),

    // Inclusive start of the pricing period
    effectiveFrom: date('effective_from').notNull(),

    // Exclusive end — NULL means "current/active"
    effectiveTo: date('effective_to'),

    // 'on_demand', 'batch', 'priority', 'flex', 'provisioned'
    serviceTier: text('service_tier').notNull().default('on_demand'),

    // 'standard', 'extended' (for long-context pricing surcharges)
    contextTier: text('context_tier'),

    // For region-specific pricing (null = global/default)
    region: text('region'),

    // Structured rate card — see module docs for schema
    rates: jsonb('rates').notNull(),

    currency: text('currency').notNull().default('USD'),

    // Where the pricing data came from
    source: text('source'),

    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // No two prices for the same model + tier + context + region at the same time
    uniqueIndex('cost_tracking_model_pricing_combo_unique')
      .on(table.modelId, table.effectiveFrom, table.serviceTier, table.contextTier, table.region),

    index('cost_tracking_model_pricing_model_id_idx').on(table.modelId),
    index('cost_tracking_model_pricing_effective_range_idx').on(table.effectiveFrom, table.effectiveTo),
  ],
);
