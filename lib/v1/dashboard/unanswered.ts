// V1 klant-dashboard: loader voor de gedeelde "onbeantwoord"-definitie
// (zie unanswered-core.ts). Read-only, onder de caller-geleverde session-client
// (RLS) + expliciete org/chatbot-filter (defense-in-depth). Geen service-role.
//
// Eén ronde van maximaal zes kleine queries over de laatste 30 dagen; zonder
// fallbacks blijft het bij één. Caps (SCAN_LIMIT) houden het begrensd; bij meer
// fallbacks dan dat in 30 dagen telt de nieuwste SCAN_LIMIT (zoals metrics.ts).
// getUnansweredForOrg dedupliceert per request (React cache): zijbalk-layout en
// pagina delen zo één resultaat.

import 'server-only';

import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/v1/server';
import {
  deriveUnanswered,
  openQuestions,
  pairFallbackTurns,
  threadsWithOpenQuestions,
  UNANSWERED_WINDOW_DAYS,
  type LogRow,
  type QaRow,
  type UnansweredQuestion,
} from './unanswered-core';

const SCAN_LIMIT = 1000;
/** Brokgrootte voor .in(): kleiner houdt ook de 1000-rijen-cap per brok buiten bereik. */
const IN_CHUNK = 100;

export type UnansweredOverview = {
  /** Alle vragen met een fallback in het venster, open eerst. */
  questions: UnansweredQuestion[];
  /** Aantal open (nog niet afgehandelde) vragen: de teller in zijbalk en werklijst. */
  openCount: number;
  /** Gesprekken met minstens één open vraag (badge + filter "Alleen onbeantwoord"). */
  openThreadIds: Set<string>;
  /** created_at van de nieuwste open vraag, of null. */
  latestOpenAt: string | null;
};

export const EMPTY_UNANSWERED: UnansweredOverview = {
  questions: [],
  openCount: 0,
  openThreadIds: new Set(),
  latestOpenAt: null,
};

export function unansweredSinceIso(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - (UNANSWERED_WINDOW_DAYS - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function loadUnanswered(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<UnansweredOverview> {
  try {
    const since = unansweredSinceIso();
    const userSince = new Date(Date.parse(since) - 60 * 60 * 1000).toISOString();

    const { data: fallbackRows, error } = await client
      .from('query_log')
      .select('question, kind, category, gap_kind, created_at')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .eq('kind', 'fallback')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(SCAN_LIMIT);
    if (error || !fallbackRows || fallbackRows.length === 0) return EMPTY_UNANSWERED;

    const [answersRes, qaRes, fbMsgRes] = await Promise.all([
      client
        .from('query_log')
        .select('question, kind, created_at')
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId)
        .eq('kind', 'answer')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(SCAN_LIMIT),
      client
        .from('org_qa_items')
        .select('id, question, active, ingested_document_id, updated_at, created_at')
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId),
      client
        .from('thread_messages')
        .select('thread_id, created_at')
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId)
        .eq('role', 'assistant')
        .eq('kind', 'fallback')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(SCAN_LIMIT),
    ]);

    const fallbacks = (fbMsgRes.data ?? []).map((r) => ({
      thread_id: String(r.thread_id),
      created_at: String(r.created_at ?? ''),
    }));
    const threadIds = [...new Set(fallbacks.map((f) => f.thread_id))];

    const userMessages: { thread_id: string; content: string; created_at: string }[] = [];
    const threads = new Map<string, { closed: boolean; lastMessageAt: string | null }>();
    await Promise.all(
      chunks(threadIds, IN_CHUNK).map(async (ids) => {
        const [uRes, tRes] = await Promise.all([
          client
            .from('thread_messages')
            .select('thread_id, content, created_at')
            .eq('organization_id', orgId)
            .eq('chatbot_id', chatbotId)
            .eq('role', 'user')
            .in('thread_id', ids)
            // Alleen het venster (+1 uur speling voor de vraag vlak vóór een fallback op
            // de venstergrens), nieuwste eerst: bij de cap vallen oude berichten weg,
            // niet willekeurige.
            .gte('created_at', userSince)
            .order('created_at', { ascending: false })
            .limit(SCAN_LIMIT),
          client
            .from('threads')
            .select('id, status, last_message_at')
            .eq('organization_id', orgId)
            .eq('chatbot_id', chatbotId)
            .is('deleted_at', null)
            .in('id', ids),
        ]);
        for (const u of uRes.data ?? []) {
          userMessages.push({
            thread_id: String(u.thread_id),
            content: String(u.content ?? ''),
            created_at: String(u.created_at ?? ''),
          });
        }
        for (const t of tRes.data ?? []) {
          threads.set(String(t.id), {
            closed: t.status === 'closed',
            lastMessageAt: (t.last_message_at as string | null) ?? null,
          });
        }
      }),
    );

    const questions = deriveUnanswered({
      logRows: [...(fallbackRows as LogRow[]), ...((answersRes.data ?? []) as LogRow[])],
      qaItems: (qaRes.data ?? []) as QaRow[],
      turns: pairFallbackTurns(fallbacks, userMessages, threads),
    });
    const open = openQuestions(questions);
    return {
      questions,
      openCount: open.length,
      openThreadIds: threadsWithOpenQuestions(questions),
      latestOpenAt: open.reduce<string | null>((m, q) => (!m || q.lastSeenAt > m ? q.lastSeenAt : m), null),
    };
  } catch {
    return EMPTY_UNANSWERED;
  }
}

/** Per request gedeeld (zijbalk-layout + pagina): org+chatbot als sleutel. */
export const getUnansweredForOrg = cache(async (orgId: string, chatbotId: string): Promise<UnansweredOverview> => {
  try {
    const client = await createClient();
    return await loadUnanswered(client, orgId, chatbotId);
  } catch {
    return EMPTY_UNANSWERED; // faalveilig: een teller mag de schil nooit breken
  }
});
