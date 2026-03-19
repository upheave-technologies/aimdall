import { NextRequest, NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export const maxDuration = 120;

import * as costTrackingSchema from '@/modules/cost-tracking/schema';
import { makeUsageRecordRepository } from '@/modules/cost-tracking/infrastructure/repositories/DrizzleUsageRecordRepository';
import { makeProviderCostRepository } from '@/modules/cost-tracking/infrastructure/repositories/DrizzleProviderCostRepository';
import { makeSyncLogRepository, makeSyncCursorRepository } from '@/modules/cost-tracking/infrastructure/repositories/DrizzleSyncRepository';
import {
  makeProviderRepository,
  makeProviderCredentialRepository,
  makeModelRepository,
} from '@/modules/cost-tracking/infrastructure/repositories/DrizzleProviderRepository';
import { generateDedupKey } from '@/modules/cost-tracking/infrastructure/dedupKeyHasher';
import { makeSyncProviderUsageUseCase } from '@/modules/cost-tracking/application/syncProviderUsageUseCase';
import { makeOpenAIUsageClient } from '@/modules/cost-tracking/infrastructure/providers/openaiUsageClient';
import { makeAnthropicUsageClient } from '@/modules/cost-tracking/infrastructure/providers/anthropicUsageClient';
import { makeVertexUsageClient } from '@/modules/cost-tracking/infrastructure/providers/vertexUsageClient';
import type { ProviderUsageClient } from '@/modules/cost-tracking/infrastructure/providers/types';
import { logger } from '@/modules/cost-tracking/infrastructure/logger';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: costTrackingSchema });

export async function POST(request: NextRequest) {
  logger.info('route.sync.request', {
    method: 'POST',
    url: request.url,
    userAgent: request.headers.get('user-agent') ?? undefined,
  });

  const secret = process.env.COST_TRACKING_SYNC_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      logger.warn('route.sync.unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const clients: ProviderUsageClient[] = [];

  if (process.env.OPENAI_USAGE_API_KEY) {
    clients.push(makeOpenAIUsageClient(process.env.OPENAI_USAGE_API_KEY));
  }

  if (process.env.ANTHROPIC_ADMIN_API_KEY) {
    clients.push(makeAnthropicUsageClient(process.env.ANTHROPIC_ADMIN_API_KEY));
  }

  if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
    clients.push(makeVertexUsageClient(process.env.GOOGLE_CLOUD_PROJECT_ID));
  }

  if (clients.length === 0) {
    logger.warn('route.sync.no_providers');
    return NextResponse.json(
      { error: 'No provider API keys configured' },
      { status: 400 },
    );
  }

  logger.info('route.sync.providers_configured', {
    providers: clients.map((c) => c.providerSlug),
  });

  const deps = {
    usageRecordRepo: makeUsageRecordRepository(db),
    providerCostRepo: makeProviderCostRepository(db),
    syncLogRepo: makeSyncLogRepository(db),
    syncCursorRepo: makeSyncCursorRepository(db),
    providerRepo: makeProviderRepository(db),
    credentialRepo: makeProviderCredentialRepository(db),
    modelRepo: makeModelRepository(db),
    hashDedupKey: generateDedupKey,
  };

  const syncUsage = makeSyncProviderUsageUseCase(deps, clients);

  let startTime: Date | undefined;
  let endTime: Date | undefined;

  try {
    const body = await request.json().catch(() => ({}));
    if (body.startTime) startTime = new Date(body.startTime);
    if (body.endTime) endTime = new Date(body.endTime);
  } catch {
    // Use defaults
  }

  const result = await syncUsage({ startTime, endTime });

  if (!result.success) {
    logger.error('route.sync.failed', {
      error: result.error.message,
      code: result.error.code,
    });
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: 500 },
    );
  }

  logger.info('route.sync.response', {
    synced: result.value.synced.length,
    failed: result.value.failed.length,
  });

  return NextResponse.json(result.value);
}
