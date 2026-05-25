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
  HelpfulnessRate,
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
  // 'unanswered' deelt het 30-dagen-venster van 'last_30_days' zodat het
  // Overzicht-bannergetal exact gelijk is aan wat deze gefilterde lijst toont.
  if (filter === 'last_30_days' || filter === 'unanswered') {
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
        // Toon updated_at, niet created_at: widget-turns binnen 24u worden door
        // findRecentThreadByVisitor aan een bestaande thread geappend i.p.v.
        // een nieuwe rij te maken. Met created_at zou een net-bijgewerkte
        // thread visueel "vast" lijken op haar startdatum; updated_at maakt de
        // bumped-naar-boven-positie consistent met de getoonde datum.
        lastActivityAt: String(t.updated_at ?? t.created_at ?? ''),
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

// ---------------------------------------------------------------------------
// countUnansweredThreads — DE bron van waarheid voor het Overzicht-scherm.
// Hergebruikt listConversations('unanswered') zodat het getal per definitie
// gelijk is aan de rijen op /klantendashboard/gesprekken?filter=unanswered.
// latestUnansweredAt voedt de dismiss-signature van de banner: verandert dit
// (nieuwe onbeantwoorde vraag), dan komt een weggeklikte banner weer terug.
// ---------------------------------------------------------------------------
export async function countUnansweredThreads(
  orgSlug: OrgSlug,
): Promise<{ count: number; latestUnansweredAt: string | null }> {
  const items = await listConversations(orgSlug, 'unanswered');
  // items zijn al gesorteerd op updated_at desc; [0] is dus de meest recente.
  return {
    count: items.length,
    latestUnansweredAt: items[0]?.lastActivityAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// getConversationSuccessRate — % succesvolle gesprekken deze kalendermaand.
// Voedt de "Behulpzaam"-metric op Overzicht.
//
// Een gesprek is NIET succesvol als:
//   - het laatste assistant-antwoord een 'fallback' was (zelfde afleiding als
//     listConversations: v0_thread_messages.response.kind), OF
//   - het minstens één duim-omlaag kreeg (v0_feedback.rating='down' met dat
//     thread_id).
// De twee verzamelingen worden als set ge-unied, dus een gesprek dat aan beide
// voldoet telt één keer.
//
// Noemer = alle niet-verwijderde threads met created_at >= begin van de maand —
// dezelfde set als conversationsThisMonth.threads, zodat de getallen op het
// Overzicht reconciliëren. `rate` is null bij 0 gesprekken zodat de UI een
// eerlijke "nog geen gesprekken"-staat kan tonen i.p.v. "0%".
// ---------------------------------------------------------------------------

// V0-cap: max aantal threads dat we scannen voor de in-JS aggregatie. V0-
// volumes zijn klein (orde tientallen/maand), dus dit raakt in de praktijk niet.
// Bij V1 wordt dit een SQL-aggregatie/materialized view i.p.v. een rij-scan.
const MAX_SUCCESS_THREADS = 1000;

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Pure rekenkern — losgekoppeld van Supabase zodat de ratio-logica triviaal te
 * redeneren/testen is. `unsuccessful` mag nooit groter zijn dan `total` (de
 * DB-laag bouwt unsuccessful uit een subset van de thread-ids).
 */
export function computeSuccessRate(input: { total: number; unsuccessful: number }): HelpfulnessRate {
  const { total } = input;
  if (total === 0) return { rate: null, successful: 0, total: 0 };
  const successful = total - input.unsuccessful;
  return { rate: Math.round((successful / total) * 100), successful, total };
}

export async function getConversationSuccessRate(orgSlug: OrgSlug): Promise<HelpfulnessRate> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  try {
    const since = startOfMonthIso();

    // 1. Alle gesprekken van deze maand (de noemer).
    const { data: threads, error } = await sb()
      .from('v0_threads')
      .select('id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_SUCCESS_THREADS);
    if (error || !threads || threads.length === 0) {
      return computeSuccessRate({ total: 0, unsuccessful: 0 });
    }
    const ids = threads.map((t) => t.id as string);

    // 2. Laatste assistant-antwoord per thread + down-vote thread-ids, parallel.
    const [msgRes, downRes] = await Promise.all([
      sb()
        .from('v0_thread_messages')
        .select('thread_id, role, position, response')
        .in('thread_id', ids)
        .order('position', { ascending: false }),
      sb()
        .from('v0_feedback')
        .select('thread_id')
        .eq('organization_id', orgId)
        .eq('rating', 'down')
        .in('thread_id', ids),
    ]);

    // Rijen komen aflopend op position binnen, dus de EERSTE assistant-rij die we
    // per thread zien is de hoogste positie = het laatste antwoord (set-if-absent).
    // DESC i.p.v. de ASC+last-wins van listConversations: mocht een server-side
    // row-cap de select ooit afkappen, dan vallen de láágste posities weg — niet
    // de finale antwoorden die we hier nodig hebben. Bij V0-volumes (honderden
    // rijen) wordt niets afgekapt; de echte schaal-fix is de SQL-aggregatie bij V1.
    const lastResponseByThread = new Map<string, { kind?: string }>();
    for (const r of msgRes.data ?? []) {
      const tid = r.thread_id as string;
      if (r.role === 'assistant' && r.response && !lastResponseByThread.has(tid)) {
        lastResponseByThread.set(tid, r.response as { kind?: string });
      }
    }

    const unsuccessful = new Set<string>();
    for (const id of ids) {
      if (lastResponseByThread.get(id)?.kind === 'fallback') unsuccessful.add(id);
    }
    for (const r of downRes.data ?? []) {
      // thread_id is genest in de filter al beperkt tot `ids`; null-guard voor de
      // zekerheid (een down-vote zonder thread_id is niet aan een gesprek te koppelen).
      if (r.thread_id != null) unsuccessful.add(String(r.thread_id));
    }

    return computeSuccessRate({ total: ids.length, unsuccessful: unsuccessful.size });
  } catch {
    return computeSuccessRate({ total: 0, unsuccessful: 0 });
  }
}
