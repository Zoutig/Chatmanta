'use server';

// V1 admin — Gesprekken-tab zoek/filter server action. Cross-org read via
// getJorionAdminClient() (gate't intern via requireJorionAdmin(), zelfde
// patroon als ../actions.ts). listAdminThreads() doet de eigenlijke query.

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, type ActionResult, type ActionFail } from '@/lib/errors/action';
import {
  listAdminThreads,
  type V1AdminThread,
  type AdminThreadFilters,
} from '@/lib/v1/admin/klant-detail';

export async function searchAdminThreadsAction(
  orgId: string,
  filters: AdminThreadFilters,
): Promise<ActionResult<{ threads: V1AdminThread[] }>> {
  let admin;
  try {
    admin = await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message, code: e.code } satisfies ActionFail;
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }
  return actionTry(async () => ({ threads: await listAdminThreads(admin, orgId, 50, filters) }));
}
