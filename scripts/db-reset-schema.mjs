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
await pool.query('DROP SCHEMA public CASCADE');
await pool.query('CREATE SCHEMA public');
console.log('Database schema reset successfully');
await pool.end();
