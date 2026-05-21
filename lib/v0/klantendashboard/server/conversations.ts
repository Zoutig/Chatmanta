// V0 Klantendashboard — gesprek-data wrappers.
//
// Read-only views over v0_threads + v0_thread_messages, gefilterd op de
// actieve org. Bewust naast bestaande lib/v0/server/threads.ts (die voor de
// admintool sidebar dient) zodat wijzigingen aan UI-shape de admintool niet
// raken.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { getThread } from '@/lib/v0/server/threads';
import type {
  ConversationFilter,
  ConversationListItem,
  ConversationStatus,
} from '../types';

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

function sinceFilter(filter: ConversationFilter): string | null {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (filter === 'today') return d.toISOString();
  if (filter === 'last_7_days') {
    d.setDate(d.getDate() - 6);
    return d.toISOString();
  }
  if (filter === 'last_30_days') {
    d.setDate(d.getDate() - 29);
    return d.toISOString();
  }
  return null;
}

// ---------------------------------------------------------------------------
// listConversations — lijst van threads voor het gesprekken-scherm.
// Combineert thread-data met eerste user-message (positie 0) en kind-status
// uit query_log (laatste message → answered/unanswered).
// ---------------------------------------------------------------------------
export async function listConversations(
  orgSlug: OrgSlug,
  filter: ConversationFilter = 'last_30_days',
): Promise<ConversationListItem[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;

  try {
    let q = sb()
      .from('v0_threads')
      .select('id, title, created_at, updated_at')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(100);

    const since = sinceFilter(filter);
    if (since) q = q.gte('created_at', since);

    const { data: threads, error } = await q;
    if (error || !threads) return [];

    if (threads.length === 0) return [];
    const ids = threads.map((t) => t.id as string);

    // Eerste user-message + totaal aantal messages + laatste assistant-response
    // (voor de status-afleiding) — alles in één query per relatie.
    const [msgRows, firstMsgs] = await Promise.all([
      sb()
        .from('v0_thread_messages')
        .select('thread_id, role, content, position, response')
        .in('thread_id', ids)
        .order('position', { ascending: true }),
      sb()
        .from('v0_thread_messages')
        .select('thread_id, content')
        .in('thread_id', ids)
        .eq('role', 'user')
        .eq('position', 0),
    ]);

    const firstQByThread = new Map<string, string>();
    for (const r of firstMsgs.data ?? []) {
      firstQByThread.set(r.thread_id as string, String(r.content ?? ''));
    }

    const countByThread = new Map<string, number>();
    const lastResponseByThread = new Map<string, unknown>();
    for (const r of msgRows.data ?? []) {
      const tid = r.thread_id as string;
      countByThread.set(tid, (countByThread.get(tid) ?? 0) + 1);
      if (r.role === 'assistant' && r.response) {
        lastResponseByThread.set(tid, r.response);
      }
    }

    let items: ConversationListItem[] = threads.map((t) => {
      const tid = t.id as string;
      const firstQ = firstQByThread.get(tid) ?? (t.title as string) ?? '(geen vraag)';
      const resp = lastResponseByThread.get(tid) as { kind?: string } | undefined;
      const status: ConversationStatus =
        resp?.kind === 'fallback' ? 'unanswered' : 'answered';
      return {
        id: tid,
        startedAt: String(t.created_at ?? ''),
        firstQuestion: firstQ,
        messageCount: countByThread.get(tid) ?? 0,
        status,
        language: 'NL',
        visitorLabel: 'Bezoeker',
      };
    });

    if (filter === 'unanswered') {
      items = items.filter((x) => x.status === 'unanswered');
    }
    // filter === 'negative_feedback' wordt op page-level afgehandeld via
    // listNegativeFeedback() + NegativeFeedbackTable; die rendert een eigen
    // shape (feedback-rij, niet thread-rij), dus deze functie hoeft hem niet
    // te vertalen.

    return items;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// getConversationDetail — volledige conversatie + assistant-response.sources.
// ---------------------------------------------------------------------------
export async function getConversationDetail(orgSlug: OrgSlug, threadId: string) {
  const orgId = KNOWN_ORGS[orgSlug].id;
  return getThread(threadId, orgId);
}
