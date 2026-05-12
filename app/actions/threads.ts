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
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';

export async function commitTurnAction(input: {
  threadId: string | null;
  userContent: string;
  response: ChatResponse;
  botVersion: string;
}): Promise<ActionResult<{ summary: ThreadSummary }>> {
  return actionTry(async () => {
    const { id: organizationId } = await getActiveOrgFromCookies();
    const { summary } = await commitTurnImpl({ ...input, organizationId });
    return { summary };
  });
}

export async function getThreadAction(
  threadId: string,
): Promise<ActionResult<{ detail: ThreadDetail }>> {
  return actionTry(async () => {
    const { id: organizationId } = await getActiveOrgFromCookies();
    const detail = await getThreadImpl(threadId, organizationId);
    if (!detail) fail('NOT_FOUND', 'thread not found');
    return { detail };
  });
}

export async function deleteThreadAction(threadId: string): Promise<ActionResult> {
  // commitTurnAction krijgt geen rate-limit: hij wordt door de client gefired
  // na een succesvolle chat-response, en de chat-endpoint heeft zelf al een
  // strenger limiet. Delete is wél destructief en kan zonder chat — daarom
  // wel hier afdekken.
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);
    const { id: organizationId } = await getActiveOrgFromCookies();
    await deleteThreadImpl(threadId, organizationId);
    return {};
  });
}
