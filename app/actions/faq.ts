'use server';

// V0 FAQ server actions — read + compute + precache + invalidate.
//
// Auth: requireV0Auth() voor elke service-role-call (defense-in-depth boven
// proxy.ts). Pattern identiek aan latency.ts / knowledge-gap.ts.

import {
  getFaqSnapshot,
  computeFaqSnapshot,
  precacheTopN,
  invalidateFaqItem,
  type FaqBotVersion,
  type FaqSnapshot,
  type FaqWindow,
} from '@/lib/v0/server/faq-snapshot';
import { requireV0Auth } from './_auth';
import { actionTry, type ActionResult } from '@/lib/errors/action';

export async function getFaqSnapshotAction(
  organizationId: string,
  botVersion: FaqBotVersion,
  window: FaqWindow,
): Promise<ActionResult<{ snapshot: FaqSnapshot | null }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const snapshot = await getFaqSnapshot(organizationId, botVersion, window);
    return { snapshot };
  });
}

export async function refreshFaqRankingAction(
  organizationId: string,
  botVersion: FaqBotVersion,
  window: FaqWindow,
): Promise<ActionResult<{ snapshot: FaqSnapshot }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const snapshot = await computeFaqSnapshot(organizationId, botVersion, window);
    return { snapshot };
  });
}

export async function precacheFaqTopAction(
  snapshotId: string,
  topN: number = 5,
): Promise<ActionResult<{ snapshot: FaqSnapshot; cached: number; skipped: number; judgeCostUsd: number }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const result = await precacheTopN(snapshotId, topN);
    return result;
  });
}

export async function invalidateFaqCacheItemAction(
  snapshotId: string,
  rank: number,
): Promise<ActionResult<{ snapshot: FaqSnapshot; removed: boolean }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const result = await invalidateFaqItem(snapshotId, rank);
    return result;
  });
}
