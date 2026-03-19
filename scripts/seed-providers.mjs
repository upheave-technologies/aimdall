/**
 * Seeds the cost_tracking_providers table with the supported LLM providers.
 * Run: node scripts/seed-providers.mjs
 */
import pg from 'pg';
import { createId } from '@paralleldrive/cuid2';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const providers = [
  {
    slug: 'openai',
    display_name: 'OpenAI',
    api_base_url: 'https://api.openai.com/v1',
  },
  {
    slug: 'anthropic',
    display_name: 'Anthropic',
    api_base_url: 'https://api.anthropic.com/v1',
  },
  {
    slug: 'google_vertex',
    display_name: 'Google Vertex AI',
    api_base_url: 'https://aiplatform.googleapis.com/v1',
  },
  {
    slug: 'aws_bedrock',
    display_name: 'AWS Bedrock',
    api_base_url: 'https://bedrock-runtime.amazonaws.com',
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    for (const p of providers) {
      const id = createId();
      await client.query(
        `INSERT INTO cost_tracking_providers (id, slug, display_name, api_base_url, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [id, p.slug, p.display_name, p.api_base_url],
      );
      console.log(`  seeded: ${p.slug}`);
    }
    console.log('done.');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
