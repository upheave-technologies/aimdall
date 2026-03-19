// =============================================================================
// Database Seed — Providers & Model Pricing
// =============================================================================
// Seeds reference data required for the cost-tracking module to operate:
//   1. Providers (openai, anthropic, google_vertex, aws_bedrock)
//   2. Model pricing rates for known models
//
// This script is idempotent — safe to run multiple times. Uses ON CONFLICT
// DO NOTHING so existing records are not overwritten.
//
// Run standalone:  node --env-file=.env scripts/db-seed.mjs
// Run via reset:   pnpm db:reset  (calls this automatically after migration)
// =============================================================================

import { readFileSync } from 'fs';
import pg from 'pg';
import { createId } from '@paralleldrive/cuid2';

// ---------------------------------------------------------------------------
// Load .env manually (same approach as db-reset-schema.mjs — no extra deps)
// ---------------------------------------------------------------------------
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

// =============================================================================
// SECTION 1: PROVIDERS
// =============================================================================

const PROVIDERS = [
  { slug: 'openai', displayName: 'OpenAI', apiBaseUrl: 'https://api.openai.com/v1' },
  { slug: 'anthropic', displayName: 'Anthropic', apiBaseUrl: 'https://api.anthropic.com/v1' },
  { slug: 'google_vertex', displayName: 'Google Vertex AI', apiBaseUrl: 'https://aiplatform.googleapis.com/v1' },
  { slug: 'aws_bedrock', displayName: 'AWS Bedrock', apiBaseUrl: 'https://bedrock-runtime.amazonaws.com' },
];

// =============================================================================
// SECTION 2: MODEL PRICING
// =============================================================================
// Rates use { rate, per } where cost = (quantity / per) * rate.
// inputTokens rate applies to UNCACHED input only (cached has its own rate).

const MODEL_PRICING = {
  openai: {
    'gpt-4o': {
      inputTokens: { rate: 2.5, per: 1_000_000 },
      outputTokens: { rate: 10.0, per: 1_000_000 },
      cachedInputTokens: { rate: 1.25, per: 1_000_000 },
    },
    'gpt-4o-mini': {
      inputTokens: { rate: 0.15, per: 1_000_000 },
      outputTokens: { rate: 0.60, per: 1_000_000 },
      cachedInputTokens: { rate: 0.075, per: 1_000_000 },
    },
    'gpt-4.1': {
      inputTokens: { rate: 2.0, per: 1_000_000 },
      outputTokens: { rate: 8.0, per: 1_000_000 },
      cachedInputTokens: { rate: 0.50, per: 1_000_000 },
    },
    'gpt-4.1-mini': {
      inputTokens: { rate: 0.40, per: 1_000_000 },
      outputTokens: { rate: 1.60, per: 1_000_000 },
      cachedInputTokens: { rate: 0.10, per: 1_000_000 },
    },
    'gpt-4.1-nano': {
      inputTokens: { rate: 0.10, per: 1_000_000 },
      outputTokens: { rate: 0.40, per: 1_000_000 },
      cachedInputTokens: { rate: 0.025, per: 1_000_000 },
    },
    'gpt-5': {
      inputTokens: { rate: 2.0, per: 1_000_000 },
      outputTokens: { rate: 8.0, per: 1_000_000 },
      cachedInputTokens: { rate: 0.50, per: 1_000_000 },
    },
    'gpt-5-mini': {
      inputTokens: { rate: 0.40, per: 1_000_000 },
      outputTokens: { rate: 1.60, per: 1_000_000 },
      cachedInputTokens: { rate: 0.10, per: 1_000_000 },
    },
    'o3': {
      inputTokens: { rate: 2.0, per: 1_000_000 },
      outputTokens: { rate: 8.0, per: 1_000_000 },
      cachedInputTokens: { rate: 0.50, per: 1_000_000 },
    },
    'o3-mini': {
      inputTokens: { rate: 1.10, per: 1_000_000 },
      outputTokens: { rate: 4.40, per: 1_000_000 },
      cachedInputTokens: { rate: 0.55, per: 1_000_000 },
    },
    'o4-mini': {
      inputTokens: { rate: 1.10, per: 1_000_000 },
      outputTokens: { rate: 4.40, per: 1_000_000 },
      cachedInputTokens: { rate: 0.275, per: 1_000_000 },
    },
  },
  anthropic: {
    'claude-opus-4-6': {
      inputTokens: { rate: 15.0, per: 1_000_000 },
      outputTokens: { rate: 75.0, per: 1_000_000 },
      cachedInputTokens: { rate: 1.50, per: 1_000_000 },
      cacheWriteTokens: { rate: 18.75, per: 1_000_000 },
    },
    'claude-sonnet-4-6': {
      inputTokens: { rate: 3.0, per: 1_000_000 },
      outputTokens: { rate: 15.0, per: 1_000_000 },
      cachedInputTokens: { rate: 0.30, per: 1_000_000 },
      cacheWriteTokens: { rate: 3.75, per: 1_000_000 },
    },
    'claude-haiku-4-5': {
      inputTokens: { rate: 0.80, per: 1_000_000 },
      outputTokens: { rate: 4.0, per: 1_000_000 },
      cachedInputTokens: { rate: 0.08, per: 1_000_000 },
      cacheWriteTokens: { rate: 1.0, per: 1_000_000 },
    },
    'claude-3-5-haiku': {
      inputTokens: { rate: 0.80, per: 1_000_000 },
      outputTokens: { rate: 4.0, per: 1_000_000 },
      cachedInputTokens: { rate: 0.08, per: 1_000_000 },
      cacheWriteTokens: { rate: 1.0, per: 1_000_000 },
    },
  },
  google_vertex: {
    'gemini-2.5-pro': {
      inputTokens: { rate: 1.25, per: 1_000_000 },
      outputTokens: { rate: 10.0, per: 1_000_000 },
      cachedInputTokens: { rate: 0.3125, per: 1_000_000 },
    },
    'gemini-2.5-flash': {
      inputTokens: { rate: 0.15, per: 1_000_000 },
      outputTokens: { rate: 0.60, per: 1_000_000 },
      cachedInputTokens: { rate: 0.0375, per: 1_000_000 },
    },
    'gemini-2.0-flash': {
      inputTokens: { rate: 0.10, per: 1_000_000 },
      outputTokens: { rate: 0.40, per: 1_000_000 },
      cachedInputTokens: { rate: 0.025, per: 1_000_000 },
    },
  },
};

// =============================================================================
// SECTION 3: SEED LOGIC
// =============================================================================

/** Strip date suffix: "gpt-4.1-mini-2025-04-14" → "gpt-4.1-mini" */
function baseSlug(slug) {
  return slug.replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

async function seed() {
  const pool = new pg.Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    // --- Step 1: Seed providers ---
    console.log('seeding providers...');
    const providerIds = {};

    for (const p of PROVIDERS) {
      const id = createId();
      const result = await client.query(
        `INSERT INTO cost_tracking_providers (id, slug, display_name, api_base_url, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [id, p.slug, p.displayName, p.apiBaseUrl],
      );
      // If ON CONFLICT hit, fetch existing
      if (result.rows.length > 0) {
        providerIds[p.slug] = result.rows[0].id;
        console.log(`  created: ${p.slug}`);
      } else {
        const existing = await client.query(
          `SELECT id FROM cost_tracking_providers WHERE slug = $1 AND deleted_at IS NULL`,
          [p.slug],
        );
        providerIds[p.slug] = existing.rows[0]?.id;
        console.log(`  exists:  ${p.slug}`);
      }
    }

    // --- Step 2: Seed models + pricing ---
    console.log('\nseeding models & pricing...');
    let modelCount = 0;
    let pricingCount = 0;

    for (const [providerSlug, models] of Object.entries(MODEL_PRICING)) {
      const providerId = providerIds[providerSlug];
      if (!providerId) {
        console.log(`  skip: ${providerSlug} (no provider ID)`);
        continue;
      }

      for (const [modelSlug, rates] of Object.entries(models)) {
        // Upsert model
        const modelId = createId();
        const modelResult = await client.query(
          `INSERT INTO cost_tracking_models (id, provider_id, slug, display_name, service_category, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'text_generation', 'available', NOW(), NOW())
           ON CONFLICT (provider_id, slug) DO NOTHING
           RETURNING id`,
          [modelId, providerId, modelSlug, modelSlug],
        );

        let resolvedModelId;
        if (modelResult.rows.length > 0) {
          resolvedModelId = modelResult.rows[0].id;
          modelCount++;
        } else {
          const existing = await client.query(
            `SELECT id FROM cost_tracking_models WHERE provider_id = $1 AND slug = $2`,
            [providerId, modelSlug],
          );
          resolvedModelId = existing.rows[0]?.id;
        }

        if (!resolvedModelId) continue;

        // Upsert pricing (ON CONFLICT on the unique index)
        const pricingId = createId();
        const pricingResult = await client.query(
          `INSERT INTO cost_tracking_model_pricing (id, model_id, effective_from, service_tier, rates, currency, source, created_at, updated_at)
           VALUES ($1, $2, '2024-01-01', 'on_demand', $3, 'USD', 'manual', NOW(), NOW())
           ON CONFLICT (model_id, effective_from, service_tier, context_tier, region) DO NOTHING
           RETURNING id`,
          [pricingId, resolvedModelId, JSON.stringify(rates)],
        );

        if (pricingResult.rows.length > 0) {
          pricingCount++;
          console.log(`  seeded: ${providerSlug}/${modelSlug}`);
        } else {
          console.log(`  exists: ${providerSlug}/${modelSlug}`);
        }
      }
    }

    console.log(`\ndone. ${PROVIDERS.length} providers, ${modelCount} models, ${pricingCount} pricing entries.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
