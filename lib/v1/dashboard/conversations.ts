// V1 Klantendashboard — gesprek-data wrappers (read-only).
//
// Reads over de V1-tabellen threads / thread_messages / feedback, ALTIJD onder
// de meegegeven session-client (RLS scoped de rows tot de org van het ingelogde
// lid). Defense-in-depth: elke query filtert óók expliciet op organization_id
// (+ chatbot_id waar de tabel die kolom heeft) bovenop RLS. Geen service-role.
//
// V1-schema is gedenormaliseerd t.o.v. V0: threads draagt first_question /
// message_count / last_message_at, dus de lijst hoeft geen first-message-join.
// "Onbeantwoord" komt uit de gedeelde definitie in unanswered-core.ts (fallback,
// geen off-topic, nog niet afgehandeld); threads.status='closed' = "opgelost".

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NegativeFeedbackItem } from '@/lib/v0/klantendashboard/types';
import { parseThreadMessageSources, type ThreadMessageSource } from '@/lib/v1/conversations/sources';

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
  /** WP4.3: gebruikte bronnen (assistant-rijen); null = geen bronnen-paneel. */
  sources: ThreadMessageSource[] | null;
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
// vraag/aantal/laatste-activiteit. "Onbeantwoord" komt uit de gedeelde definitie
// (lib/v1/dashboard/unanswered.ts): de caller geeft de set gesprekken met een open
// onbeantwoorde vraag mee. Met onlyUnanswered filtert de QUERY zelf op die set
// (vóór de LIMIT), zodat er bij veel gesprekken geen onbeantwoorde wegvallen.
// ---------------------------------------------------------------------------
export async function listV1Conversations(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
  filter: V1ConversationFilter = 'last_30_days',
  opts: { openThreadIds?: Set<string>; onlyUnanswered?: boolean } = {},
): Promise<V1ConversationListItem[]> {
  const open = opts.openThreadIds ?? new Set<string>();
  const only = opts.onlyUnanswered === true || filter === 'unanswered';
  try {
    const since = sinceFilter(filter)!;
    type Row = { id: string; first_question: string | null; message_count: number | null; last_message_at: string | null; created_at: string | null };
    const base = () =>
      client
        .from('threads')
        .select('id, first_question, message_count, last_message_at, created_at')
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId)
        .is('deleted_at', null)
        .gte('created_at', since)
        .order('last_message_at', { ascending: false })
        .limit(LIST_LIMIT);

    let rows: Row[] = [];
    if (only) {
      const ids = [...open];
      if (ids.length === 0) return [];
      const parts = await Promise.all(
        chunkIds(ids).map(async (part) => {
          const { data } = await base().in('id', part);
          return (data ?? []) as Row[];
        }),
      );
      rows = parts
        .flat()
        .sort((a, b) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))
        .slice(0, LIST_LIMIT);
    } else {
      const { data, error } = await base();
      if (error || !data) return [];
      rows = data as Row[];
    }

    return rows.map((t) => ({
      id: t.id,
      firstQuestion: t.first_question || '(geen vraag)',
      messageCount: t.message_count ?? 0,
      lastMessageAt: String(t.last_message_at ?? t.created_at ?? ''),
      unanswered: open.has(t.id),
    }));
  } catch {
    return [];
  }
}

/** Aantal gesprekken in de periode met een open onbeantwoorde vraag (filter-teller). */
export async function countV1UnansweredConversations(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
  filter: V1ConversationFilter,
  openThreadIds: Set<string>,
): Promise<number> {
  const ids = [...openThreadIds];
  if (ids.length === 0) return 0;
  try {
    const since = sinceFilter(filter)!;
    const counts = await Promise.all(
      chunkIds(ids).map(async (part) => {
        const { count } = await client
          .from('threads')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('chatbot_id', chatbotId)
          .is('deleted_at', null)
          .gte('created_at', since)
          .in('id', part);
        return count ?? 0;
      }),
    );
    return counts.reduce((a, b) => a + b, 0);
  } catch {
    return 0;
  }
}

/** .in()-lijsten klein houden (URL-lengte). */
function chunkIds(ids: string[], size = 150): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
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
    .select('id, role, content, kind, created_at, sources')
    .eq('organization_id', orgId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  const messages: V1ConversationMessage[] = (msgRows ?? []).map((m) => ({
    id: m.id as string,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content ?? ''),
    kind: (m.kind as string | null) ?? null,
    createdAt: String(m.created_at ?? ''),
    sources: parseThreadMessageSources((m as { sources?: unknown }).sources),
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
