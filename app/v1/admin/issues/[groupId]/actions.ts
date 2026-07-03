'use server';

// V1 admin Issues — status-actions. Port van app/actions/controlroom.ts (error-sectie).
// Auth: getJorionAdminClient() gate't alles (cross-org service-role na AAL2-check).

import { revalidatePath } from 'next/cache';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { setErrorGroupStatus } from '@/lib/v1/admin/errors';
import type { ActionResult, ActionFail } from '@/lib/errors/action';

function revalidate() {
  revalidatePath('/v1/admin/issues', 'layout');
}

function authFail(e: unknown): ActionFail {
  if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  throw e;
}

export async function resolveErrorGroupV1Action(id: string): Promise<ActionResult<{ id: string }>> {
  try { await getJorionAdminClient(); } catch (e) { return authFail(e); }
  try {
    await setErrorGroupStatus(id, 'resolved');
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout', code: 'INTERNAL' };
  }
}

export async function ignoreErrorGroupV1Action(id: string): Promise<ActionResult<{ id: string }>> {
  try { await getJorionAdminClient(); } catch (e) { return authFail(e); }
  try {
    await setErrorGroupStatus(id, 'ignored');
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout', code: 'INTERNAL' };
  }
}

export async function reopenErrorGroupV1Action(id: string): Promise<ActionResult<{ id: string }>> {
  try { await getJorionAdminClient(); } catch (e) { return authFail(e); }
  try {
    await setErrorGroupStatus(id, 'open');
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout', code: 'INTERNAL' };
  }
}
