'use server';

// Thread server actions — thin wrappers around lib/v0/server/threads.ts.
//
// Auth: relies on proxy.ts page-gate (V0 demo). Server actions zijn alleen
// vanuit ingelogde sessies bereikbaar. Defense-in-depth zou een expliciete
// cookie check toevoegen — V0 accepteert proxy alleen.
//
// 'use server' export voorwaarde: alle exports moeten async functions zijn —
// type aliases mogen niet via re-export. Importeer types vanuit
// `lib/v0/server/threads` in plaats vanuit dit bestand.

import {
  commitTurn as commitTurnImpl,
  deleteThread as deleteThreadImpl,
  getThread as getThreadImpl,
  type ThreadDetail,
  type ThreadSummary,
} from '@/lib/v0/server/threads';
import type { ChatResponse } from '@/lib/v0/server/rag';

export async function commitTurnAction(input: {
  threadId: string | null;
  userContent: string;
  response: ChatResponse;
  botVersion: string;
}): Promise<{ ok: true; summary: ThreadSummary } | { ok: false; error: string }> {
  try {
    const { summary } = await commitTurnImpl(input);
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'commit failed' };
  }
}

export async function getThreadAction(
  threadId: string,
): Promise<{ ok: true; detail: ThreadDetail } | { ok: false; error: string }> {
  try {
    const detail = await getThreadImpl(threadId);
    if (!detail) return { ok: false, error: 'Thread niet gevonden' };
    return { ok: true, detail };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'load failed' };
  }
}

export async function deleteThreadAction(
  threadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteThreadImpl(threadId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' };
  }
}
