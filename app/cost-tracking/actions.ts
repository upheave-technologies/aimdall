'use server';

import { revalidatePath } from 'next/cache';
import {
  syncProviderUsageFromDb,
  syncProviderUsageFromEnv,
  syncProviderUsage,
} from '@/modules/cost-tracking/application/syncProviderUsageUseCase';

export type ManualSyncResult = {
  success: true;
  data: {
    synced: {
      providerSlug: string;
      usageRecordsCreated: number;
      usageRecordsUpdated: number;
    }[];
    failed: { providerSlug: string; error: string }[];
  };
} | {
  success: false;
  error: string;
  code: string;
};

export async function triggerManualSyncAction(input?: {
  startTime?: string;
  endTime?: string;
}): Promise<ManualSyncResult> {
  // Load DB-stored credentials. If ENCRYPTION_KEY is not set or DB is
  // unavailable, fall back to env-var-only clients (same logic as the route).
  let dbClients: Awaited<ReturnType<typeof syncProviderUsageFromDb>>['clients'] = [];

  try {
    const dbResult = await syncProviderUsageFromDb();
    dbClients = dbResult.clients;
  } catch {
    // ENCRYPTION_KEY not set or DB unavailable — env-var path handles everything
  }

  const envResult = syncProviderUsageFromEnv();

  // Merge clients: DB credentials take precedence by providerSlug.
  let allClients = envResult.clients;
  if (dbClients.length > 0) {
    const dbSlugs = new Set(dbClients.map((c) => c.providerSlug));
    const envOnly = envResult.clients.filter((c) => !dbSlugs.has(c.providerSlug));
    allClients = [...dbClients, ...envOnly];
  }

  if (allClients.length === 0) {
    return { success: false, error: 'No provider API keys configured', code: 'NO_PROVIDERS' };
  }

  const startTime = input?.startTime ? new Date(input.startTime) : undefined;
  const endTime = input?.endTime ? new Date(input.endTime) : undefined;

  const result = await syncProviderUsage(allClients)({ startTime, endTime });

  if (!result.success) {
    return {
      success: false,
      error: result.error.message,
      code: result.error.code,
    };
  }

  revalidatePath('/cost-tracking', 'layout');

  return {
    success: true,
    data: {
      synced: result.value.synced.map((s) => ({
        providerSlug: s.providerSlug,
        usageRecordsCreated: s.usageRecordsCreated,
        usageRecordsUpdated: s.usageRecordsUpdated,
      })),
      failed: result.value.failed,
    },
  };
}
