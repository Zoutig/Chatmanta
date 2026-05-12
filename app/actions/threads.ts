'use server';

// Thread server actions — thin wrappers around lib/v0/server/threads.ts.
//
// Auth: relies on proxy.ts page-gate (V0 demo). Server actions zijn alleen
// vanuit ingelogde sessies bereikbaar. Defense-in-depth zou een expliciete
// cookie check toevoegen — V0 accepteert proxy alleen.
//
// v0.4 multi-org: alle actions lezen de actieve org uit de cookie en geven
// die door aan de impl-laag. Reads en writes zijn daarmee strikt scoped per
// org — switchen via de UI ververst de sidebar (page.tsx), commits/deletes
// raken alleen rijen van de op dat moment actieve org.

import {
  commitTurn as commitTurnImpl,
  deleteThread as deleteThreadImpl,
  getThread as getThreadImpl,
  type ThreadDetail,
  type ThreadSummary,
} from '@/lib/v0/server/threads';
import type { ChatResponse } from '@/lib/v0/server/rag';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { checkMutationLimit } from '@/lib/v0/server/rate-limit';

export async function commitTurnAction(input: {
  threadId: string | null;
  userContent: string;
  response: ChatResponse;
  botVersion: string;
}): Promise<{ ok: true; summary: ThreadSummary } | { ok: false; error: string }> {
  try {
    const { id: organizationId } = await getActiveOrgFromCookies();
    const { summary } = await commitTurnImpl({ ...input, organizationId });
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'commit failed' };
  }
}

export async function getThreadAction(
  threadId: string,
): Promise<{ ok: true; detail: ThreadDetail } | { ok: false; error: string }> {
  try {
    const { id: organizationId } = await getActiveOrgFromCookies();
    const detail = await getThreadImpl(threadId, organizationId);
    if (!detail) return { ok: false, error: 'Thread niet gevonden' };
    return { ok: true, detail };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'load failed' };
  }
}

export async function deleteThreadAction(
  threadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // commitTurnAction krijgt geen rate-limit: hij wordt door de client gefired
  // na een succesvolle chat-response, en de chat-endpoint heeft zelf al een
  // strenger limiet. Delete is wél destructief en kan zonder chat — daarom
  // wel hier afdekken.
  const limit = await checkMutationLimit();
  if (!limit.allowed) {
    return { ok: false, error: limit.message };
  }
  try {
    const { id: organizationId } = await getActiveOrgFromCookies();
    await deleteThreadImpl(threadId, organizationId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' };
  }
}
