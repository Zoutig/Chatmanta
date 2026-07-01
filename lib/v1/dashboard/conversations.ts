// V1 Klantendashboard — gesprek-data wrappers (read-only).
//
// Reads over de V1-tabellen threads / thread_messages / feedback, ALTIJD onder
// de meegegeven session-client (RLS scoped de rows tot de org van het ingelogde
// lid). Defense-in-depth: elke query filtert óók expliciet op organization_id
// (+ chatbot_id waar de tabel die kolom heeft) bovenop RLS. Geen service-role.
//
// V1-schema is gedenormaliseerd t.o.v. V0: threads draagt first_question /
// message_count / last_message_at, dus de lijst hoeft geen first-message-join.
// "Onbeantwoord" wordt afgeleid uit een assistant-message met kind='fallback'
// (threads.status is open/closed, niet answered/unanswered).

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NegativeFeedbackItem } from '@/lib/v0/klantendashboard/types';

export type V1ConversationFilter = 'today' | 'last_7_days' | 'last_30_days' | 'unanswered' | 'negative_feedback';

export type V1ConversationListItem = {
  id: string;
  firstQuestion: string;
  messageCount: number;
  lastMessageAt: string;
  unanswered: boolean;
};

export type V1ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  kind: string | null;
  createdAt: string;
};

export type V1ConversationDetail = {
  thread: { id: string; firstQuestion: string; status: string; createdAt: string };
  messages: V1ConversationMessage[];
};

const LIST_LIMIT = 100;

function sinceFilter(filter: V1ConversationFilter): string | null {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (filter === 'today') return d.toISOString();
  if (filter === 'last_7_days') {
    d.setDate(d.getDate() - 6);
    return d.toISOString();
  }
  // 'unanswered' deelt het 30-dagen-venster met 'last_30_days'.
  d.setDate(d.getDate() - 29);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// listV1Conversations — threads (recent eerst) met de denormaliseerde eerste-
// vraag/aantal/laatste-activiteit. `unanswered` per rij afgeleid uit een
// fallback-assistant-message; filter='unanswered' beperkt tot die rijen.
// ---------------------------------------------------------------------------
export async function listV1Conversations(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
  filter: V1ConversationFilter = 'last_30_days',
): Promise<V1ConversationListItem[]> {
  try {
    const { data: threads, error } = await client
      .from('threads')
      .select('id, first_question, message_count, last_message_at, created_at')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .is('deleted_at', null)
      .gte('created_at', sinceFilter(filter)!)
      .order('last_message_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (error || !threads || threads.length === 0) return [];

    const ids = threads.map((t) => t.id as string);

    // Fallback-set: threads met minstens één assistant-message kind='fallback'.
    // Voedt zowel de per-rij-badge als het 'unanswered'-filter.
    const { data: fallbackRows } = await client
      .from('thread_messages')
      .select('thread_id')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .eq('role', 'assistant')
      .eq('kind', 'fallback')
      .in('thread_id', ids);
    const unansweredIds = new Set((fallbackRows ?? []).map((r) => String(r.thread_id)));

    const items: V1ConversationListItem[] = threads.map((t) => {
      const id = t.id as string;
      return {
        id,
        firstQuestion: (t.first_question as string) || '(geen vraag)',
        messageCount: (t.message_count as number) ?? 0,
        lastMessageAt: String(t.last_message_at ?? t.created_at ?? ''),
        unanswered: unansweredIds.has(id),
      };
    });

    return filter === 'unanswered' ? items.filter((i) => i.unanswered) : items;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// getV1Conversation — thread + volledig transcript (op created_at). null als de
// thread niet bestaat / niet van deze org is (RLS geeft 'm dan niet terug).
// ---------------------------------------------------------------------------
export async function getV1Conversation(
  client: SupabaseClient,
  orgId: string,
  threadId: string,
): Promise<V1ConversationDetail | null> {
  const { data: thread, error } = await client
    .from('threads')
    .select('id, first_question, status, created_at')
    .eq('id', threadId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !thread) return null;

  const { data: msgRows } = await client
    .from('thread_messages')
    .select('id, role, content, kind, created_at')
    .eq('organization_id', orgId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  const messages: V1ConversationMessage[] = (msgRows ?? []).map((m) => ({
    id: m.id as string,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content ?? ''),
    kind: (m.kind as string | null) ?? null,
    createdAt: String(m.created_at ?? ''),
  }));

  return {
    thread: {
      id: thread.id as string,
      firstQuestion: (thread.first_question as string) || '(geen vraag)',
      status: (thread.status as string) ?? 'open',
      createdAt: String(thread.created_at ?? ''),
    },
    messages,
  };
}

// ---------------------------------------------------------------------------
// countRecentNegativeFeedback — telt negatieve feedback (rating='down') in de
// laatste `days` dagen voor de DANGER-banner op de gesprekken-lijst.
// ---------------------------------------------------------------------------
export async function countRecentNegativeFeedback(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
  days: number,
): Promise<number> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { count, error } = await client
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .eq('rating', 'down')
      .gte('created_at', since.toISOString());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// listV1NegativeFeedback — feedback rating='down' + de gekoppelde query_log-rij
// (vraag/antwoord/kind) via PostgREST-embed. query_log_id mag null zijn (FK
// ON DELETE SET NULL) → dan geen vraag/antwoord, alleen de comment. Recent eerst.
// Mapt naar V0's NegativeFeedbackItem zodat de bestaande tabel-component werkt.
// ---------------------------------------------------------------------------
export async function listV1NegativeFeedback(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<NegativeFeedbackItem[]> {
  try {
    const { data, error } = await client
      .from('feedback')
      .select('id, query_log_id, rating, comment, created_at, query_log(question, answer, kind)')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .eq('rating', 'down')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (error || !data) return [];

    return data.map((row): NegativeFeedbackItem => {
      const ql = (row as { query_log?: { question?: string; answer?: string; kind?: string } | null })
        .query_log;
      const kind =
        ql?.kind === 'fallback' || ql?.kind === 'smalltalk' || ql?.kind === 'answer'
          ? ql.kind
          : 'answer';
      return {
        id: String(row.id),
        queryLogId: row.query_log_id == null ? '' : String(row.query_log_id),
        threadId: null,
        rating: 'down',
        comment: row.comment == null ? null : String(row.comment),
        createdAt: String(row.created_at ?? ''),
        question: typeof ql?.question === 'string' ? ql.question : '(vraag niet beschikbaar)',
        answer: typeof ql?.answer === 'string' ? ql.answer : '(geen gekoppeld antwoord)',
        kind,
      };
    });
  } catch {
    return [];
  }
}
