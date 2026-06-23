// V0 chat-thread persistentie.
//
// Single-tenant tegen DEV_ORG_ID via service-role client (zelfde patroon als
// rag.ts). RLS staat aan in de DB; service-role bypasst die en de
// `organization_id = DEV_ORG_ID`-clause is hier de daadwerkelijke isolatie.
//
// API ontworpen rond paren: een "turn" is een user-message + assistant-response.
// commitTurn() schrijft beide atomair (of geen van beide), zodat we nooit
// orphan user-rijen krijgen wanneer de LLM-call faalt.

import 'server-only';

import { getServiceRoleClient } from '@/lib/supabase/admin';
import { DEV_ORG_ID, type ChatResponse } from './rag';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export type ThreadSummary = {
  id: string;
  title: string;
  botVersion: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type ThreadMessage =
  | { id: string; position: number; role: 'user'; content: string }
  | {
      id: string;
      position: number;
      role: 'assistant';
      content: string;
      response: ChatResponse;
    };

export type ThreadDetail = {
  thread: {
    id: string;
    title: string;
    botVersion: string;
    createdAt: string;
    updatedAt: string;
  };
  messages: ThreadMessage[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TITLE_MAX = 60;

function deriveTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.trim().replace(/\s+/g, ' ');
  if (cleaned.length === 0) return 'Nieuw gesprek';
  if (cleaned.length <= TITLE_MAX) return cleaned;
  const slice = cleaned.slice(0, TITLE_MAX);
  const lastSpace = slice.lastIndexOf(' ');
  // Alleen op spatie afkappen als die niet te ver vooraan zit (anders krijg je
  // hele korte titels). Drempel 30 = ruwweg 50% van TITLE_MAX.
  if (lastSpace > 30) return slice.slice(0, lastSpace) + '…';
  return slice + '…';
}

// ---------------------------------------------------------------------------
// listThreads — sidebar lijst, gesorteerd op recente activiteit.
// v0.4 multi-org: scope op actieve org. Default DEV_ORG voor backward compat.
// ---------------------------------------------------------------------------
export async function listThreads(organizationId: string = DEV_ORG_ID): Promise<ThreadSummary[]> {
  const sb = getServiceRoleClient();
  const { data: threads, error } = await sb
    .from('v0_threads')
    .select('id, bot_version, title, created_at, updated_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`listThreads: ${error.message}`);
  if (!threads || threads.length === 0) return [];

  // Message-count per thread — single batch query, group client-side.
  const ids = threads.map((t) => t.id as string);
  const { data: msgRows, error: cErr } = await sb
    .from('v0_thread_messages')
    .select('thread_id')
    .in('thread_id', ids);
  if (cErr) throw new Error(`listThreads chunk count: ${cErr.message}`);
  const counts = new Map<string, number>();
  for (const r of msgRows ?? []) {
    const id = r.thread_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return threads.map((t) => ({
    id: t.id as string,
    title: t.title as string,
    botVersion: t.bot_version as string,
    createdAt: t.created_at as string,
    updatedAt: t.updated_at as string,
    messageCount: counts.get(t.id as string) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// getThread — laad volledige conversatie (header + messages in volgorde).
// Returns null als thread niet bestaat / soft-deleted is.
// ---------------------------------------------------------------------------
export async function getThread(
  threadId: string,
  organizationId: string = DEV_ORG_ID,
): Promise<ThreadDetail | null> {
  const sb = getServiceRoleClient();
  const { data: t, error: tErr } = await sb
    .from('v0_threads')
    .select('id, bot_version, title, created_at, updated_at')
    .eq('id', threadId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (tErr) throw new Error(`getThread: ${tErr.message}`);
  if (!t) return null;

  const { data: rows, error: mErr } = await sb
    .from('v0_thread_messages')
    .select('id, position, role, content, response')
    .eq('thread_id', threadId)
    .order('position', { ascending: true });
  if (mErr) throw new Error(`getThread messages: ${mErr.message}`);

  const messages: ThreadMessage[] = (rows ?? []).map((r) => {
    if (r.role === 'assistant') {
      return {
        id: r.id as string,
        position: r.position as number,
        role: 'assistant' as const,
        content: r.content as string,
        // jsonb komt als parsed object terug — geen JSON.parse nodig.
        response: r.response as ChatResponse,
      };
    }
    return {
      id: r.id as string,
      position: r.position as number,
      role: 'user' as const,
      content: r.content as string,
    };
  });

  return {
    thread: {
      id: t.id as string,
      title: t.title as string,
      botVersion: t.bot_version as string,
      createdAt: t.created_at as string,
      updatedAt: t.updated_at as string,
    },
    messages,
  };
}

// ---------------------------------------------------------------------------
// commitTurn — atomair (paargewijs) schrijven van user + assistant.
//
// Als threadId null is: maakt een nieuwe thread aan met titel afgeleid uit
// userContent, en schrijft de eerste turn op posities 0+1.
// Als threadId gegeven is: zoekt MAX(position), schrijft op N+1, N+2,
// en bumpt updated_at op de thread voor sidebar-sortering.
//
// Bij een fout halverwege blijft de DB in een coherente staat: óf het paar
// is geschreven, óf niets (we cleanen de partial niet up — V0 acceptable).
// ---------------------------------------------------------------------------
export async function commitTurn(opts: {
  threadId: string | null;
  userContent: string;
  response: ChatResponse;
  botVersion: string;
  /** v0.4 multi-org: schrijven naar deze org. Default DEV_ORG voor backward compat. */
  organizationId?: string;
  /**
   * Anonieme cookie-UUID (zie lib/v0/server/visitor.ts). Wordt alleen gezet
   * bij nieuwe threads en stelt /api/v0/chat in staat opvolgende widget-turns
   * binnen 24u via findRecentThreadByVisitor te groeperen. Testtool-paden
   * laten dit weg → kolom blijft NULL.
   */
  visitorId?: string;
}): Promise<{ summary: ThreadSummary }> {
  const orgId = opts.organizationId ?? DEV_ORG_ID;
  const sb = getServiceRoleClient();
  const trimmedUser = opts.userContent.trim();
  if (trimmedUser.length === 0) {
    throw new Error('commitTurn: userContent is empty');
  }

  let threadId = opts.threadId;
  let nextPosition = 0;
  let createdAt: string;
  let title: string;
  let botVersion: string;

  if (threadId === null) {
    // Nieuwe thread.
    title = deriveTitle(trimmedUser);
    botVersion = opts.botVersion;
    const { data: created, error: cErr } = await sb
      .from('v0_threads')
      .insert({
        organization_id: orgId,
        bot_version: botVersion,
        title,
        visitor_id: opts.visitorId ?? null,
      })
      .select('id, created_at, updated_at')
      .single();
    if (cErr || !created) {
      throw new Error(`commitTurn create: ${cErr?.message ?? 'no row'}`);
    }
    threadId = created.id as string;
    createdAt = created.created_at as string;
    nextPosition = 0;
  } else {
    // Bestaande thread — valideer dat hij bestaat. nextPosition wordt
    // per retry-attempt opnieuw bepaald (zie loop hieronder).
    const { data: t, error: tErr } = await sb
      .from('v0_threads')
      .select('id, title, bot_version, created_at')
      .eq('id', threadId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (tErr) throw new Error(`commitTurn fetch: ${tErr.message}`);
    if (!t) throw new Error(`commitTurn: thread ${threadId} bestaat niet`);
    title = t.title as string;
    botVersion = t.bot_version as string;
    createdAt = t.created_at as string;
  }

  // Schrijf het paar in één insert call. Voor bestaande threads is het
  // (max-pos lookup → insert) paar een race: twee concurrent commits
  // kunnen dezelfde max-pos lezen en op identieke posities willen
  // schrijven. UNIQUE(thread_id, position) vangt de tweede; we lezen
  // dan vers en proberen opnieuw. Voor nieuwe threads kan dit niet —
  // de id is vers en niemand anders schrijft erop. (Finding 2, codex
  // adversarial-review 2026-05-13.)
  const isExisting = opts.threadId !== null;
  const MAX_RETRIES = 5;
  let attempt = 0;
  while (true) {
    if (isExisting) {
      const { data: maxRow, error: mErr } = await sb
        .from('v0_thread_messages')
        .select('position')
        .eq('thread_id', threadId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mErr) throw new Error(`commitTurn maxpos: ${mErr.message}`);
      nextPosition = (maxRow?.position ?? -1) + 1;
    }

    const { error: insErr } = await sb.from('v0_thread_messages').insert([
      {
        thread_id: threadId,
        position: nextPosition,
        role: 'user',
        content: trimmedUser,
        response: null,
      },
      {
        thread_id: threadId,
        position: nextPosition + 1,
        role: 'assistant',
        content: opts.response.answer,
        response: opts.response,
      },
    ]);
    if (!insErr) break;

    // Postgres unique_violation = 23505. Bij race: re-read max-pos en
    // probeer opnieuw. Andere fouten of nieuwe-thread pad: direct gooien.
    const isConflict = (insErr as { code?: string }).code === '23505';
    if (!isExisting || !isConflict || ++attempt >= MAX_RETRIES) {
      throw new Error(`commitTurn insert: ${insErr.message}`);
    }
  }

  // Bump updated_at op de thread zodat hij bovenaan in de sidebar komt.
  // (Niet nodig voor net-aangemaakte threads, maar idempotent — telt niet.)
  const nowIso = new Date().toISOString();
  const { error: uErr } = await sb
    .from('v0_threads')
    .update({ updated_at: nowIso })
    .eq('id', threadId)
    .eq('organization_id', orgId);
  if (uErr) throw new Error(`commitTurn touch: ${uErr.message}`);

  // messageCount in summary = 2 * (turns) — handig voor sidebar-preview.
  // We tellen op basis van nextPosition + 2 (totaal aantal rijen na deze insert).
  const messageCount = nextPosition + 2;

  return {
    summary: {
      id: threadId,
      title,
      botVersion,
      createdAt,
      updatedAt: nowIso,
      messageCount,
    },
  };
}

// ---------------------------------------------------------------------------
// findRecentThreadByVisitor — zoek meest recente thread voor een widget-
// visitor binnen het idle-venster.
//
// /api/v0/chat gebruikt dit om opvolgende widget-turns van dezelfde bezoeker
// in één thread te groeperen. Geen treffer → caller maakt een nieuwe thread.
//
// Het index v0_threads_org_visitor_updated_idx (migration 0030) ondersteunt
// deze exacte WHERE-clause.
// ---------------------------------------------------------------------------
export async function findRecentThreadByVisitor(
  organizationId: string,
  visitorId: string,
  idleHours = 24,
): Promise<string | null> {
  const sb = getServiceRoleClient();
  const sinceIso = new Date(Date.now() - idleHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('v0_threads')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('visitor_id', visitorId)
    .is('deleted_at', null)
    .gte('updated_at', sinceIso)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findRecentThreadByVisitor: ${error.message}`);
  return (data?.id as string) ?? null;
}

// ---------------------------------------------------------------------------
// deleteThread — soft-delete; messages blijven via FK cascade staan tot
// een eventuele hard-cleanup.
// ---------------------------------------------------------------------------
export async function deleteThread(
  threadId: string,
  organizationId: string = DEV_ORG_ID,
): Promise<void> {
  const sb = getServiceRoleClient();
  const { error } = await sb
    .from('v0_threads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null);
  if (error) throw new Error(`deleteThread: ${error.message}`);
}

// ---------------------------------------------------------------------------
// C9 (v0.10) — AVG-verwijderrecht: HARD-delete alle gesprekken van één visitor
// binnen één org. Anders dan deleteThread (soft-delete op thread-id) en C8-retentie
// (org-brede anonimisering op leeftijd): dit wist de daadwerkelijke rijen voor een
// specifieke visitor_id, strikt org-gescoped.
//
// v0_thread_messages heeft GEEN organization_id → org-scope loopt via thread_id IN
// de (org + visitor)-eigen threads (zelfde JOIN-idee als listThreads/retention).
// orgId is verplicht (geen DEV_ORG_ID-default): een verwijderactie mag nooit stil op
// de verkeerde tenant landen.
// ---------------------------------------------------------------------------
export async function deleteVisitorData(
  organizationId: string,
  visitorId: string,
): Promise<{ threadsDeleted: number; messagesDeleted: number }> {
  if (!organizationId) throw new Error('deleteVisitorData: organizationId verplicht');
  if (!visitorId) return { threadsDeleted: 0, messagesDeleted: 0 };
  const sb = getServiceRoleClient();

  // 1. Thread-ids van deze visitor BINNEN deze org (de org-grens).
  const { data: threads, error: selErr } = await sb
    .from('v0_threads')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('visitor_id', visitorId);
  if (selErr) throw new Error(`deleteVisitorData(select): ${selErr.message}`);
  const ids = (threads ?? []).map((t) => (t as { id: string }).id);
  if (ids.length === 0) return { threadsDeleted: 0, messagesDeleted: 0 };

  // 2. Messages eerst (org-scope via thread_id IN de org-eigen threads).
  const { data: delMsgs, error: msgErr } = await sb
    .from('v0_thread_messages')
    .delete()
    .in('thread_id', ids)
    .select('id');
  if (msgErr) throw new Error(`deleteVisitorData(messages): ${msgErr.message}`);

  // 3. Threads zelf — dubbel-gescoped op org + visitor (defense-in-depth).
  const { data: delThreads, error: thrErr } = await sb
    .from('v0_threads')
    .delete()
    .eq('organization_id', organizationId)
    .eq('visitor_id', visitorId)
    .select('id');
  if (thrErr) throw new Error(`deleteVisitorData(threads): ${thrErr.message}`);

  return {
    threadsDeleted: (delThreads ?? []).length,
    messagesDeleted: (delMsgs ?? []).length,
  };
}
