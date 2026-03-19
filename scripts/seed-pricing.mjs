/**
 * Seeds the cost_tracking_model_pricing table with current pricing rates.
 * Also backfills calculated_cost_amount on existing usage records.
 * Run: node --env-file=.env scripts/seed-pricing.mjs
 */
import pg from 'pg';
import { createId } from '@paralleldrive/cuid2';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Pricing data: { modelSlugPattern: rates }
// Rates use { rate, per } where cost = (quantity / per) * rate
const PRICING = {
  // OpenAI
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
  // Anthropic
  'claude-sonnet-4-6': {
    inputTokens: { rate: 3.0, per: 1_000_000 },
    outputTokens: { rate: 15.0, per: 1_000_000 },
    cachedInputTokens: { rate: 0.30, per: 1_000_000 },
    cacheWriteTokens: { rate: 3.75, per: 1_000_000 },
  },
  'claude-opus-4-6': {
    inputTokens: { rate: 15.0, per: 1_000_000 },
    outputTokens: { rate: 75.0, per: 1_000_000 },
    cachedInputTokens: { rate: 1.50, per: 1_000_000 },
    cacheWriteTokens: { rate: 18.75, per: 1_000_000 },
  },
  'claude-haiku-4-5': {
    inputTokens: { rate: 0.80, per: 1_000_000 },
    outputTokens: { rate: 4.0, per: 1_000_000 },
    cachedInputTokens: { rate: 0.08, per: 1_000_000 },
    cacheWriteTokens: { rate: 1.0, per: 1_000_000 },
  },
  // Google Vertex
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
};

/**
 * Strips date suffix from model slug: "gpt-4.1-mini-2025-04-14" → "gpt-4.1-mini"
 */
function baseModelSlug(slug) {
  return slug.replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

async function seed() {
  const client = await pool.connect();
  try {
    // 1. Get all registered models
    const { rows: models } = await client.query(
      'SELECT id, slug FROM cost_tracking_models',
    );

    let seeded = 0;
    for (const model of models) {
      const base = baseModelSlug(model.slug);
      const rates = PRICING[base];
      if (!rates) {
        console.log(`  skip: ${model.slug} (no pricing for "${base}")`);
        continue;
      }

      // Check if pricing already exists
      const { rows: existing } = await client.query(
        `SELECT id FROM cost_tracking_model_pricing
         WHERE model_id = $1 AND effective_to IS NULL AND service_tier = 'on_demand'`,
        [model.id],
      );

      if (existing.length > 0) {
        console.log(`  skip: ${model.slug} (pricing exists)`);
        continue;
      }

      await client.query(
        `INSERT INTO cost_tracking_model_pricing
         (id, model_id, effective_from, service_tier, rates, currency, source, created_at, updated_at)
         VALUES ($1, $2, '2024-01-01', 'on_demand', $3, 'USD', 'manual', NOW(), NOW())`,
        [createId(), model.id, JSON.stringify(rates)],
      );
      console.log(`  seeded: ${model.slug} → ${base}`);
      seeded++;
    }

    // 2. Backfill calculated costs on existing records
    console.log('\nbackfilling costs on existing records...');
    const { rows: records } = await client.query(`
      SELECT ur.id, ur.input_tokens, ur.output_tokens, ur.cached_input_tokens,
             ur.cache_write_tokens, ur.model_id, ur.bucket_start
      FROM cost_tracking_usage_records ur
      WHERE ur.deleted_at IS NULL
        AND ur.calculated_cost_amount IS NULL
        AND ur.model_id IS NOT NULL
    `);

    // Load all pricing
    const { rows: allPricing } = await client.query(
      `SELECT model_id, rates FROM cost_tracking_model_pricing
       WHERE effective_to IS NULL AND service_tier = 'on_demand'`,
    );
    const pricingMap = new Map(allPricing.map((p) => [p.model_id, p.rates]));

    let backfilled = 0;
    for (const rec of records) {
      const rates = pricingMap.get(rec.model_id);
      if (!rates) continue;

      let cost = 0;
      const input = Number(rec.input_tokens ?? 0);
      const output = Number(rec.output_tokens ?? 0);
      const cached = Number(rec.cached_input_tokens ?? 0);
      const cacheWrite = Number(rec.cache_write_tokens ?? 0);

      if (rates.inputTokens) cost += (input / rates.inputTokens.per) * rates.inputTokens.rate;
      if (rates.outputTokens) cost += (output / rates.outputTokens.per) * rates.outputTokens.rate;
      if (rates.cachedInputTokens) cost += (cached / rates.cachedInputTokens.per) * rates.cachedInputTokens.rate;
      if (rates.cacheWriteTokens) cost += (cacheWrite / rates.cacheWriteTokens.per) * rates.cacheWriteTokens.rate;

      await client.query(
        `UPDATE cost_tracking_usage_records
         SET calculated_cost_amount = $1, cost_source = 'calculated', updated_at = NOW()
         WHERE id = $2`,
        [cost.toFixed(8), rec.id],
      );
      backfilled++;
    }

    console.log(`  backfilled: ${backfilled} records`);
    console.log(`\ndone. seeded ${seeded} pricing entries, backfilled ${backfilled} records.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
