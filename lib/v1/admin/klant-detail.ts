// V1 admin klant-detail — read helpers voor Gesprekken/Bronnen/Usage tabs.
//
// Alle queries via de admin-client (service-role, bypast RLS). V1-tabelstructuur:
//   - threads + thread_messages (gesprekken)
//   - knowledge_sources + documents (bronnen; geen website_pages-tabel — gecrawlde
//     pagina's zijn documents-rijen met source_url NOT NULL)
//   - query_log (usage; kolom cost_eur + organization_id)

import 'server-only';

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { parseThreadMessageSources, type ThreadMessageSource } from '@/lib/v1/conversations/sources';
import { matchQueryLogRows, MATCH_WINDOW_MS, type AssistantTurn } from './thread-insight';

type AdminClient = Awaited<ReturnType<typeof getJorionAdminClient>>;

// ─────────────────────── Gesprekken ───────────────────────

export type V1AdminThread = {
  id: string;
  firstQuestion: string;
  messageCount: number;
  lastMessageAt: string;
  unanswered: boolean;
};

export type AdminThreadFilters = {
  /** ilike-zoekterm op berichttekst (case-insensitive substring). */
  search?: string;
  /** ISO-timestamp ondergrens (inclusief) op threads.created_at. */
  fromIso?: string;
  /** ISO-timestamp bovengrens (inclusief) op threads.created_at. */
  toIso?: string;
};

/** Escape LIKE/ILIKE-wildcards (%, _, \) zodat een letterlijke zoekterm niet als patroon leest. */
function escapeLikeTerm(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function listAdminThreads(
  admin: AdminClient,
  organizationId: string,
  limit = 50,
  filters: AdminThreadFilters = {},
): Promise<V1AdminThread[]> {
  const rawTerm = filters.search?.trim();

  // Zoeken is twee stappen. Stap 1 (alleen bij een zoekterm): haal enkel de
  // matchende thread-ID's op via een inner-join-embed + ilike — PostgREST filtert
  // de parent-rij (thread) alleen mee als de embed `!inner` is. Stap 2: de
  // ONgefilterde embed-query hieronder (altijd left-join) met `.in('id', matchedIds)`.
  // Niet in één query combineren: een `!inner` + ilike OP de embed filtert ook de
  // teruggegeven thread_messages-array zelf, waardoor messageCount/firstQuestion/
  // lastMessageAt/unanswered verderop uit de gefilterde subset i.p.v. het volledige
  // gesprek zouden komen (bv. een vals "Onbeantwoord" als toevallig alleen het
  // matchende user-bericht terugkomt terwijl er wél een antwoord op volgde).
  let matchedIds: string[] | null = null;
  if (rawTerm) {
    const term = escapeLikeTerm(rawTerm);
    let idQuery = admin
      .from('threads')
      .select('id, thread_messages!inner(content)')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .ilike('thread_messages.content', `%${term}%`);
    if (filters.fromIso) idQuery = idQuery.gte('created_at', filters.fromIso);
    if (filters.toIso) idQuery = idQuery.lte('created_at', filters.toIso);
    // ponytail: cap tegen een pathologische zoekterm die duizenden threads matcht —
    // ruim voldoende bij het huidige klantenaantal.
    const { data: idRows, error: idErr } = await idQuery.limit(1000);
    if (idErr) throw new Error(`listAdminThreads (zoeken) failed: ${idErr.message}`);
    matchedIds = (idRows ?? []).map((r) => (r as { id: string }).id);
    if (matchedIds.length === 0) return [];
  }

  // Eerste user-bericht per thread + berichten-count + timestamp.
  // thread_messages.role in ('user','assistant'); eerste user-bericht = lowest created_at met role='user'.
  let query = admin
    .from('threads')
    .select('id, created_at, thread_messages(id, role, content, created_at)')
    .eq('organization_id', organizationId)
    .is('deleted_at', null);
  if (matchedIds) query = query.in('id', matchedIds);
  if (filters.fromIso) query = query.gte('created_at', filters.fromIso);
  if (filters.toIso) query = query.lte('created_at', filters.toIso);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`listAdminThreads failed: ${error.message}`);

  return (data ?? []).map((t) => {
    type MsgRow = { id: string; role: string; content: string; created_at: string };
    const msgs = ((t as unknown as { thread_messages: MsgRow[] }).thread_messages ?? []);
    const userMsgs = msgs.filter((m) => m.role === 'user').sort(
      (a, b) => a.created_at.localeCompare(b.created_at),
    );
    const assistantMsgs = msgs.filter((m) => m.role === 'assistant');
    const lastMsg = msgs.reduce(
      (latest, m) => (!latest || m.created_at > latest.created_at ? m : latest),
      null as MsgRow | null,
    );
    return {
      id: t.id as string,
      firstQuestion: userMsgs[0]?.content?.slice(0, 200) ?? '(geen vraag)',
      messageCount: msgs.length,
      lastMessageAt: lastMsg?.created_at ?? (t as unknown as { created_at: string }).created_at,
      unanswered: userMsgs.length > 0 && assistantMsgs.length === 0,
    };
  });
}

export type V1AdminTurnInsight = {
  queryLogId: string;
  fromCache: boolean;
  totalMs: number | null;
  firstTokenMs: number | null;
  costEur: number;
  topSimilarity: number | null;
  sourceCount: number;
  /** Duim van de bezoeker op dit antwoord (laatste), of null. */
  feedback: { rating: 'up' | 'down'; comment: string | null } | null;
};

export type V1AdminMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  /** thread_messages.kind (alleen assistant): answer/fallback/smalltalk/blocked. */
  kind: string | null;
  /** Gebruikte bronnen (zelfde opslag als het klant-bronnenpaneel), of null. */
  sources: ThreadMessageSource[] | null;
  /** Gekoppelde query_log-diagnose (best-effort, zie thread-insight.ts), of null. */
  insight: V1AdminTurnInsight | null;
};

export type V1AdminThreadDetail = {
  id: string;
  organizationId: string;
  createdAt: string;
  messages: V1AdminMessage[];
};

export async function getAdminThread(
  admin: AdminClient,
  threadId: string,
  organizationId: string,
): Promise<V1AdminThreadDetail | null> {
  const { data: thread, error: tErr } = await admin
    .from('threads')
    .select('id, organization_id, chatbot_id, created_at')
    .eq('id', threadId)
    .eq('organization_id', organizationId) // org-scope
    .is('deleted_at', null)
    .maybeSingle();
  if (tErr) throw new Error(`getAdminThread failed: ${tErr.message}`);
  if (!thread) return null;

  const { data: msgs, error: mErr } = await admin
    .from('thread_messages')
    .select('id, role, content, kind, sources, created_at')
    .eq('organization_id', organizationId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (mErr) throw new Error(`getAdminThread messages failed: ${mErr.message}`);

  type T = { id: string; organization_id: string; chatbot_id: string; created_at: string };
  type M = { id: string; role: string; content: string; kind: string | null; sources: unknown; created_at: string };
  const t = thread as T;
  const rows = (msgs ?? []) as M[];

  const insights = await loadTurnInsights(admin, organizationId, t.chatbot_id, rows).catch(
    () => new Map<string, V1AdminTurnInsight>(),
  );

  return {
    id: t.id,
    organizationId: t.organization_id,
    createdAt: t.created_at,
    messages: rows.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.created_at,
      kind: msg.kind ?? null,
      sources: msg.role === 'assistant' ? parseThreadMessageSources(msg.sources) : null,
      insight: insights.get(msg.id) ?? null,
    })),
  };
}

/** query_log-rijen rond de berichten ophalen, koppelen (thread-insight.ts) en de
 *  feedback erbij zoeken. Alles org+chatbot-gescoped; faalt stil naar een lege map. */
async function loadTurnInsights(
  admin: AdminClient,
  organizationId: string,
  chatbotId: string,
  rows: Array<{ id: string; role: string; content: string; kind: string | null; created_at: string }>,
): Promise<Map<string, V1AdminTurnInsight>> {
  const turns: AssistantTurn[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.role !== 'assistant') continue;
    const prevUser = rows.slice(0, i).reverse().find((x) => x.role === 'user');
    turns.push({ messageId: r.id, question: prevUser?.content ?? '', kind: r.kind ?? null, createdAt: r.created_at });
  }
  if (turns.length === 0) return new Map();

  const times = turns.map((x) => Date.parse(x.createdAt)).filter(Number.isFinite);
  if (times.length === 0) return new Map();
  const from = new Date(Math.min(...times) - MATCH_WINDOW_MS).toISOString();
  const to = new Date(Math.max(...times) + MATCH_WINDOW_MS).toISOString();

  const { data: qlData, error: qlErr } = await admin
    .from('query_log')
    .select('id, question, kind, created_at, from_cache, total_ms, first_token_ms, cost_eur, top_similarity, source_count')
    .eq('organization_id', organizationId)
    .eq('chatbot_id', chatbotId)
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: true })
    .limit(500);
  if (qlErr || !qlData) return new Map();

  type Q = {
    id: string;
    question: string;
    kind: string;
    created_at: string;
    from_cache: boolean | null;
    total_ms: number | null;
    first_token_ms: number | null;
    cost_eur: number | string | null;
    top_similarity: number | string | null;
    source_count: number | null;
  };
  const ql = qlData as Q[];
  const match = matchQueryLogRows(
    turns,
    ql.map((q) => ({ id: q.id, question: q.question, kind: q.kind, createdAt: q.created_at })),
  );
  if (match.size === 0) return new Map();

  const matchedIds = [...new Set(match.values())];
  const { data: fbData } = await admin
    .from('feedback')
    .select('query_log_id, rating, comment, created_at')
    .eq('organization_id', organizationId)
    .in('query_log_id', matchedIds)
    .order('created_at', { ascending: true });
  const fbByQl = new Map<string, { rating: 'up' | 'down'; comment: string | null }>();
  for (const f of (fbData ?? []) as Array<{ query_log_id: string; rating: string; comment: string | null }>) {
    if (f.rating === 'up' || f.rating === 'down') fbByQl.set(f.query_log_id, { rating: f.rating, comment: f.comment });
  }

  const byId = new Map(ql.map((q) => [q.id, q]));
  const out = new Map<string, V1AdminTurnInsight>();
  for (const [messageId, qid] of match) {
    const q = byId.get(qid);
    if (!q) continue;
    const sim = q.top_similarity == null ? null : Number(q.top_similarity);
    out.set(messageId, {
      queryLogId: q.id,
      fromCache: q.from_cache === true,
      totalMs: q.total_ms,
      firstTokenMs: q.first_token_ms,
      costEur: Number(q.cost_eur) || 0,
      topSimilarity: sim != null && Number.isFinite(sim) ? sim : null,
      sourceCount: q.source_count ?? 0,
      feedback: fbByQl.get(q.id) ?? null,
    });
  }
  return out;
}

// ─────────────────────── Bronnen ──────────────────────────

export type V1AdminSource = {
  id: string;
  type: string;
  normalizedHost: string | null;
  rootUrl: string | null;
  status: string;
  documentCount: number;
  crawledPageCount: number;
  createdAt: string;
};

export async function listAdminSources(
  admin: AdminClient,
  organizationId: string,
  chatbotId: string | null,
): Promise<V1AdminSource[]> {
  let q = admin
    .from('knowledge_sources')
    .select('id, type, normalized_host, root_url, status, created_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (chatbotId) q = q.eq('chatbot_id', chatbotId);
  const { data, error } = await q;
  if (error) throw new Error(`listAdminSources failed: ${error.message}`);

  type SRow = { id: string; type: string; normalized_host: string | null; root_url: string | null; status: string; created_at: string };
  const sources = (data ?? []) as SRow[];

  // Document-counts per source in één query
  const sourceIds = sources.map((s) => s.id);
  let docCounts = new Map<string, { total: number; crawled: number }>();
  if (sourceIds.length > 0) {
    const { data: docs, error: dErr } = await admin
      .from('documents')
      .select('knowledge_source_id, source_url:metadata->>source_url')
      .in('knowledge_source_id', sourceIds)
      .is('deleted_at', null);
    if (dErr) throw new Error(`listAdminSources docs failed: ${dErr.message}`);
    type DRow = { knowledge_source_id: string; source_url: string | null };
    for (const d of (docs ?? []) as DRow[]) {
      const prev = docCounts.get(d.knowledge_source_id) ?? { total: 0, crawled: 0 };
      docCounts.set(d.knowledge_source_id, {
        total: prev.total + 1,
        crawled: prev.crawled + (d.source_url ? 1 : 0),
      });
    }
  }

  return sources.map((s) => {
    const counts = docCounts.get(s.id) ?? { total: 0, crawled: 0 };
    return {
      id: s.id,
      type: s.type,
      normalizedHost: s.normalized_host,
      rootUrl: s.root_url,
      status: s.status,
      documentCount: counts.total,
      crawledPageCount: counts.crawled,
      createdAt: s.created_at,
    };
  });
}

// ─────────────────────── Usage ────────────────────────────

export type V1AdminUsage = {
  queryCount: number;
  totalCostEur: number;
  thisMonthCostEur: number;
  thisMonthQueryCount: number;
};

export async function getAdminUsage(
  admin: AdminClient,
  organizationId: string,
): Promise<V1AdminUsage> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [allRes, monthRes] = await Promise.all([
    admin
      .from('query_log')
      .select('cost_eur', { count: 'exact' })
      .eq('organization_id', organizationId),
    admin
      .from('query_log')
      .select('cost_eur', { count: 'exact' })
      .eq('organization_id', organizationId)
      .gte('created_at', monthStart),
  ]);

  type LogRow = { cost_eur: number | null };

  const sumCost = (rows: LogRow[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + (r.cost_eur ?? 0), 0);

  return {
    queryCount: allRes.count ?? 0,
    totalCostEur: sumCost((allRes.data ?? []) as LogRow[]),
    thisMonthCostEur: sumCost((monthRes.data ?? []) as LogRow[]),
    thisMonthQueryCount: monthRes.count ?? 0,
  };
}
