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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema: costTrackingSchema });
