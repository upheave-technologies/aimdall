import { readFileSync } from 'fs';
import pg from 'pg';

// Load .env manually (no extra dependency needed)
const envPath = new URL('../.env', import.meta.url);
try {
  const envFile = readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env may not exist
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
// Drop the drizzle migrations journal first so a partial failure leaves a
// recognizable state (data tables may still exist, but the journal is gone —
// re-running the reset will then wipe data and we end up clean).
await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
await pool.query('DROP SCHEMA public CASCADE');
await pool.query('CREATE SCHEMA public');
console.log('Database schemas (public + drizzle) reset successfully');
await pool.end();
