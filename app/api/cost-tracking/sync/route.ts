import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

import {
  syncProviderUsageFromEnv,
  syncProviderUsageFromDb,
  syncProviderUsage,
} from '@/modules/cost-tracking/application/syncProviderUsageUseCase';

export async function POST(request: NextRequest) {
  const secret = process.env.COST_TRACKING_SYNC_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Attempt to load DB-stored credentials. If ENCRYPTION_KEY is not configured
  // or the DB query fails, fall back to env-var-only clients with a warning
  // (logged server-side by buildProviderClientsFromDb itself).
  let dbClients: Awaited<ReturnType<typeof syncProviderUsageFromDb>>['clients'] = [];

  try {
    const dbResult = await syncProviderUsageFromDb();
    dbClients = dbResult.clients;
  } catch {
    // ENCRYPTION_KEY not set or DB unavailable — env-var path handles everything
  }

  const envResult = syncProviderUsageFromEnv();

  // Merge clients: DB credentials take precedence by providerSlug. Any provider
  // already covered by a DB client is excluded from the env-var set to avoid
  // fetching the same provider twice.
  let allClients = envResult.clients;

  if (dbClients.length > 0) {
    const dbSlugs = new Set(dbClients.map((c) => c.providerSlug));
    const envOnly = envResult.clients.filter((c) => !dbSlugs.has(c.providerSlug));
    allClients = [...dbClients, ...envOnly];
  }

  if (allClients.length === 0) {
    return NextResponse.json(
      { error: 'No provider API keys configured' },
      { status: 400 },
    );
  }

  let startTime: Date | undefined;
  let endTime: Date | undefined;

  try {
    const body = await request.json().catch(() => ({}));
    if (body.startTime) startTime = new Date(body.startTime);
    if (body.endTime) endTime = new Date(body.endTime);
  } catch {
    // Use defaults
  }

  const result = await syncProviderUsage(allClients)({ startTime, endTime });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: 500 },
    );
  }

  return NextResponse.json(result.value);
}
