// =============================================================================
// Cost Tracking Module — Database Type Definition
// =============================================================================
// Defines the type of the Drizzle database instance this module requires.
//
// The consuming application creates the actual database instance using
// `drizzle()` with this module's schema and passes it to repository factories.
//
// This module does NOT create database connections — it only defines the type
// contract for dependency injection.
//
// Usage in consuming application:
//   import { drizzle } from 'drizzle-orm/node-postgres';
//   import * as costTrackingSchema from '@/modules/cost-tracking/schema';
//
//   const db = drizzle(pool, { schema: costTrackingSchema });
//   // db now matches CostTrackingDatabase type
// =============================================================================

import { drizzle } from 'drizzle-orm/node-postgres';
import * as costTrackingSchema from '../schema';

/**
 * The type of the Drizzle database instance this module requires.
 *
 * Consuming applications must create a `drizzle()` instance with the Cost
 * Tracking schema and pass it to repository factories (makeUsageRecordRepository).
 *
 * This type enforces that the database instance includes:
 *   - All Cost Tracking schema tables (cost_tracking_usage_records)
 *   - All Cost Tracking schema relations (for relational queries)
 *   - TypeScript type safety for queries
 */
export type CostTrackingDatabase = ReturnType<typeof drizzle<typeof costTrackingSchema>>;
