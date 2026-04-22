// =============================================================================
// Application-Level Database Singleton
// =============================================================================
// Creates a single shared Drizzle + pg Pool instance for the entire Next.js
// app. Modules define CostTrackingDatabase as a type-only contract; this file
// is the one place where the actual connection pool and ORM instance live.
//
// All consumers (Server Components, Server Actions, API route handlers) import
// `db` from here instead of creating their own Pool instances. This prevents
// connection pool exhaustion across serverless/edge cold starts.
//
// Schema: the cost-tracking module schema is merged in so every table is typed.
// Add additional module schemas here as the app grows.
// =============================================================================

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as costTrackingSchema from '@/modules/cost-tracking/schema';
import * as identitySchema from '@/packages/@core/identity/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 60_000,
  query_timeout: 60_000,
});

pool.on('error', (err) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    module: 'database',
    operation: 'pool.error',
    error: err.message,
  }));
});

export const db = drizzle(pool, {
  schema: { ...costTrackingSchema, ...identitySchema },
});
