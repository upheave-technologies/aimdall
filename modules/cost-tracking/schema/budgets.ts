// =============================================================================
// Cost Tracking Module — Budgets Table
// =============================================================================
// Spending limits and alert thresholds. Each budget defines a ceiling for a
// specific scope (provider, credential, attribution group, or global) over
// a time period.
//
// Design decisions:
//   - scope is a JSONB column that defines what the budget covers. An empty
//     object {} means "everything." Specific keys narrow the scope:
//     { "providerId": "...", "credentialId": "...", "groupId": "..." }
//     This is intentionally flexible to avoid a combinatorial explosion of
//     nullable FK columns.
//   - current_spend is a denormalized running total, refreshed by the sync
//     pipeline after each usage ingestion. This avoids expensive SUM queries
//     on the fact table for every budget check.
//   - alert_thresholds is a JSONB array of percentage thresholds (e.g.,
//     [50, 75, 90, 100]) that trigger notifications when current_spend
//     crosses them.
//   - budget_type determines the consequence of exceeding the budget:
//     hard_limit blocks further usage, soft_alert sends notifications,
//     tracking_only just records the overage.
// =============================================================================

import { pgTable, text, timestamp, numeric, jsonb, index } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import {
  costTrackingBudgetType,
  costTrackingBudgetPeriodType,
  costTrackingBudgetStatus,
} from './enums';

export const costTrackingBudgets = pgTable(
  'cost_tracking_budgets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),

    name: text('name').notNull(),

    // Defines what this budget covers — {} means "everything"
    scope: jsonb('scope').notNull(),

    budgetType: costTrackingBudgetType('budget_type').notNull(),

    periodType: costTrackingBudgetPeriodType('period_type').notNull(),

    // Budget ceiling
    amount: numeric('amount', { precision: 16, scale: 8 }).notNull(),
    currency: text('currency').notNull().default('USD'),

    // Percentage thresholds that trigger alerts (e.g., [50, 75, 90, 100])
    alertThresholds: jsonb('alert_thresholds'),

    // Denormalized running total — refreshed by sync pipeline
    currentSpend: numeric('current_spend', { precision: 16, scale: 8 }).notNull().default('0'),

    // Current evaluation window
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),

    status: costTrackingBudgetStatus('status').notNull().default('active'),

    lastEvaluatedAt: timestamp('last_evaluated_at', { withTimezone: true }),

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
    index('cost_tracking_budgets_status_idx').on(table.status),
    index('cost_tracking_budgets_budget_type_idx').on(table.budgetType),
    index('cost_tracking_budgets_deleted_at_idx').on(table.deletedAt),
  ],
);
