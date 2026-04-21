import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

import { syncProviderUsageFromEnv } from '@/modules/cost-tracking/application/syncProviderUsageUseCase';

export async function POST(request: NextRequest) {
  const secret = process.env.COST_TRACKING_SYNC_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { clients, sync } = syncProviderUsageFromEnv();

  if (clients.length === 0) {
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

  const result = await sync({ startTime, endTime });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: 500 },
    );
  }

  return NextResponse.json(result.value);
}
