// V0 FAQ snapshot — top-vragen ranking per (organization, bot-version, window).
//
// Doel: bot-owner ziet welke vragen het vaakst gesteld worden zodat ze gericht
// gecached kunnen worden voor instant antwoorden. Compute draait handmatig
// (refresh-knop), niet automatisch — V0 is een leeranalyse-platform.
//
// Pipeline:
//   1. Filter query_log: kind='answer' + category IN ('search','general'),
//      window-filter, exclude from_cache=true (voorkomt feedback-loop op
//      eigen cache-hits).
//   2. Exact-string dedupe (lowercase + trim), bewaar member-questions.
//   3. Embed unieke vragen via embedTexts (text-embedding-3-small, 1536-dim).
//   4. Greedy single-link clustering, cosine threshold 0.88 — losser dan
//      cache-hit (0.93) want paraphrasen mogen samenvallen.
//   5. Top-10 clusters by total count, representative = meest recente
//      exact-string variant.
//   6. Persist to faq_snapshot (append, jsonb items).
//
// Pre-cache + invalidate logica komt in commit 4 (faq-snapshot.ts uitbreiding).
//
// Pattern: copy van knowledge-gap-snapshot.ts (sb() singleton, window-mapping).

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { embedTexts } from './rag';

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env missing');
  _sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _sb;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FaqWindow = '24h' | '7d' | 'all';

/** Welke bot-versies de FAQ-tab toont. Bewust hardcoded — alleen de top-2
 *  actieve versies. Bij v0.6 release: update beide constanten. */
export const FAQ_BOT_VERSIONS = ['v0.4', 'v0.5'] as const;
export type FaqBotVersion = (typeof FAQ_BOT_VERSIONS)[number];

export type FaqItem = {
  /** 1-based ranking binnen de snapshot. */
  rank: number;
  /** Representative-question (meest recente exact-string variant in cluster). */
  question: string;
  /** Aantal hits binnen het window (som over alle members). */
  count: number;
  /** ISO timestamp van de meest recente hit. */
  lastAsked: string;
  /** Exact-string varianten die in dit cluster vielen (incl. representative). */
  memberQuestions: string[];
  /** answer_cache.id als deze cluster pre-gecached is, anders null. */
  cachedAnswerId: string | null;
  /** Beknopte reden voor de cache-keuze (zie commit 4). */
  judgeReason?: 'judge-pick' | 'auto-pick-fallback' | 'reuse-existing-cache';
};

export type FaqSnapshot = {
  id: string;
  organizationId: string;
  botVersion: FaqBotVersion;
  window: FaqWindow;
  generatedAt: string;
  totalUnique: number;
  totalQueries: number;
  embedCostUsd: number;
  judgeCostUsd: number;
  items: FaqItem[];
};

// ---------------------------------------------------------------------------
// Clustering config
// ---------------------------------------------------------------------------

/** Cosine-similarity drempel voor "zelfde vraag, andere bewoording".
 *  Losser dan cache-hit (0.93) — daar willen we zekerheid, hier willen we
 *  paraphrasen samenvoegen tot één FAQ-entry. */
const CLUSTER_THRESHOLD = 0.88;

/** Max clusters in een snapshot. Gebruiker ziet top 10. */
const TOP_N = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function windowSinceIso(window: FaqWindow): string | null {
  if (window === '24h') return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (window === '7d') return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

function cosine(a: number[], b: number[]): number {
  // OpenAI embeddings zijn al L2-normalised → dot-product == cosine.
  // Defensief: bereken explicit voor het geval een upstream-wijziging dat
  // breekt. n=1536 dus 3072 mults per vergelijking — verwaarloosbaar.
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Exact-string-dedupe: lowercase + trim als key, behoud origineel-kapitaal
 *  in de output. Returnt unieke-vragen met hun samengevoegde metadata. */
type DedupeEntry = {
  question: string;
  count: number;
  lastAsked: string;
  /** Alle exact-string varianten die in deze key vielen (geneerd voor
   *  member_questions[] op cluster-niveau). */
  variants: Set<string>;
};

function dedupeExact(
  rows: Array<{ question: string; created_at: string }>,
): DedupeEntry[] {
  const map = new Map<string, DedupeEntry>();
  for (const r of rows) {
    const key = r.question.trim().toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (r.created_at > existing.lastAsked) {
        existing.lastAsked = r.created_at;
        existing.question = r.question.trim();
      }
      existing.variants.add(r.question.trim());
    } else {
      map.set(key, {
        question: r.question.trim(),
        count: 1,
        lastAsked: r.created_at,
        variants: new Set([r.question.trim()]),
      });
    }
  }
  return [...map.values()];
}

/** Greedy single-link clustering — voor elk item: vergelijk met cluster-
 *  representatives, voeg toe aan eerste cluster met cosine ≥ threshold,
 *  anders nieuwe cluster. Niet-deterministisch in volgorde, maar wel
 *  reproducibel als input gesorteerd is op count desc. */
type Cluster = {
  /** Index in `entries` van de representative (=eerste & meest-frequent). */
  repIdx: number;
  /** Member-indices in `entries`. */
  members: number[];
};

function greedyCluster(entries: DedupeEntry[], vectors: number[][]): Cluster[] {
  const clusters: Cluster[] = [];
  for (let i = 0; i < entries.length; i++) {
    let assigned = false;
    for (const c of clusters) {
      const sim = cosine(vectors[i], vectors[c.repIdx]);
      if (sim >= CLUSTER_THRESHOLD) {
        c.members.push(i);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusters.push({ repIdx: i, members: [i] });
    }
  }
  return clusters;
}

// ---------------------------------------------------------------------------
// Public API — read laatste snapshot
// ---------------------------------------------------------------------------

export async function getFaqSnapshot(
  organizationId: string,
  botVersion: FaqBotVersion,
  window: FaqWindow,
): Promise<FaqSnapshot | null> {
  const { data, error } = await sb()
    .from('faq_snapshot')
    .select('id, organization_id, bot_version, time_window, generated_at, items, total_unique, total_queries, embed_cost_usd, judge_cost_usd')
    .eq('organization_id', organizationId)
    .eq('bot_version', botVersion)
    .eq('time_window', window)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`faq_snapshot select: ${error.message}`);
  if (!data) return null;
  return rowToSnapshot(data);
}

// ---------------------------------------------------------------------------
// Public API — compute en persist nieuwe snapshot
// ---------------------------------------------------------------------------

export async function computeFaqSnapshot(
  organizationId: string,
  botVersion: FaqBotVersion,
  window: FaqWindow,
): Promise<FaqSnapshot> {
  const client = sb();
  const since = windowSinceIso(window);

  // 1. Kandidaat-rijen ophalen.
  let query = client
    .from('query_log')
    .select('question, created_at, from_cache')
    .eq('organization_id', organizationId)
    .eq('bot_version', botVersion)
    .eq('kind', 'answer')
    .in('category', ['search', 'general']);
  if (since) query = query.gte('created_at', since);
  const { data: rawRows, error } = await query;
  if (error) throw new Error(`query_log select: ${error.message}`);

  // Exclude from_cache=true om feedback-loop op eigen pre-cache te vermijden.
  // null is acceptabel (kolom kan ouder zijn dan migration 0012) — alleen
  // expliciet true uitsluiten.
  const rows = (rawRows ?? []).filter((r) => r.from_cache !== true) as Array<{
    question: string;
    created_at: string;
  }>;
  const totalQueries = rows.length;

  // 2. Exact-string dedupe.
  const entries = dedupeExact(rows);
  const totalUnique = entries.length;

  // Empty-state: persist een lege snapshot zodat de UI niet steeds opnieuw
  // probeert te computen voor een org zonder data.
  if (totalUnique === 0) {
    return persistSnapshot(client, {
      organizationId,
      botVersion,
      window,
      items: [],
      totalUnique: 0,
      totalQueries,
      embedCostUsd: 0,
      judgeCostUsd: 0,
    });
  }

  // 3. Embeddings — batchcall via bestaande helper.
  // Sort op count desc zodat de greedy clustering frequenteste vragen eerst
  // ziet → die worden representatives.
  entries.sort((a, b) => b.count - a.count || (b.lastAsked > a.lastAsked ? 1 : -1));
  const { vectors, costUsd: embedCostUsd } = await embedTexts(
    entries.map((e) => e.question),
  );

  // 4. Greedy clustering.
  const clusters = greedyCluster(entries, vectors);

  // 5. Top-N sorteren op total count (som per cluster), descending.
  const ranked = clusters
    .map((c, idx) => {
      const totalCount = c.members.reduce((sum, m) => sum + entries[m].count, 0);
      const rep = entries[c.repIdx];
      // last_asked = max van alle members
      const lastAsked = c.members
        .map((m) => entries[m].lastAsked)
        .reduce((max, v) => (v > max ? v : max), rep.lastAsked);
      // members met dedupe over variants
      const memberQuestions = [
        ...new Set(c.members.flatMap((m) => [...entries[m].variants])),
      ];
      return { idx, totalCount, rep, lastAsked, memberQuestions };
    })
    .sort((a, b) => b.totalCount - a.totalCount || (b.lastAsked > a.lastAsked ? 1 : -1))
    .slice(0, TOP_N);

  const items: FaqItem[] = ranked.map((r, i) => ({
    rank: i + 1,
    question: r.rep.question,
    count: r.totalCount,
    lastAsked: r.lastAsked,
    memberQuestions: r.memberQuestions,
    cachedAnswerId: null,
  }));

  // 6. Persist.
  return persistSnapshot(client, {
    organizationId,
    botVersion,
    window,
    items,
    totalUnique,
    totalQueries,
    embedCostUsd,
    judgeCostUsd: 0,
  });
}

// ---------------------------------------------------------------------------
// Persistence — insert nieuwe snapshot-rij (append-only).
// ---------------------------------------------------------------------------

async function persistSnapshot(
  client: SupabaseClient,
  input: {
    organizationId: string;
    botVersion: FaqBotVersion;
    window: FaqWindow;
    items: FaqItem[];
    totalUnique: number;
    totalQueries: number;
    embedCostUsd: number;
    judgeCostUsd: number;
  },
): Promise<FaqSnapshot> {
  const { data, error } = await client
    .from('faq_snapshot')
    .insert({
      organization_id: input.organizationId,
      bot_version: input.botVersion,
      time_window: input.window,
      items: input.items.map(itemToJsonb),
      total_unique: input.totalUnique,
      total_queries: input.totalQueries,
      embed_cost_usd: input.embedCostUsd,
      judge_cost_usd: input.judgeCostUsd,
    })
    .select('id, generated_at')
    .single();
  if (error) throw new Error(`faq_snapshot insert: ${error.message}`);
  return {
    id: data.id as string,
    organizationId: input.organizationId,
    botVersion: input.botVersion,
    window: input.window,
    generatedAt: data.generated_at as string,
    totalUnique: input.totalUnique,
    totalQueries: input.totalQueries,
    embedCostUsd: input.embedCostUsd,
    judgeCostUsd: input.judgeCostUsd,
    items: input.items,
  };
}

// ---------------------------------------------------------------------------
// JSON-mapping — items jsonb ↔ FaqItem
// ---------------------------------------------------------------------------

function itemToJsonb(it: FaqItem): Record<string, unknown> {
  return {
    rank: it.rank,
    question: it.question,
    count: it.count,
    last_asked: it.lastAsked,
    member_questions: it.memberQuestions,
    cached_answer_id: it.cachedAnswerId,
    ...(it.judgeReason ? { judge_reason: it.judgeReason } : {}),
  };
}

function jsonbToItem(raw: unknown): FaqItem {
  const r = raw as Record<string, unknown>;
  return {
    rank: Number(r.rank ?? 0),
    question: String(r.question ?? ''),
    count: Number(r.count ?? 0),
    lastAsked: String(r.last_asked ?? ''),
    memberQuestions: Array.isArray(r.member_questions)
      ? (r.member_questions as unknown[]).map(String)
      : [],
    cachedAnswerId:
      typeof r.cached_answer_id === 'string' ? r.cached_answer_id : null,
    judgeReason:
      r.judge_reason === 'judge-pick' ||
      r.judge_reason === 'auto-pick-fallback' ||
      r.judge_reason === 'reuse-existing-cache'
        ? r.judge_reason
        : undefined,
  };
}

function rowToSnapshot(row: Record<string, unknown>): FaqSnapshot {
  const itemsRaw = Array.isArray(row.items) ? (row.items as unknown[]) : [];
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    botVersion: row.bot_version as FaqBotVersion,
    window: row.time_window as FaqWindow,
    generatedAt: String(row.generated_at),
    totalUnique: Number(row.total_unique ?? 0),
    totalQueries: Number(row.total_queries ?? 0),
    embedCostUsd: Number(row.embed_cost_usd ?? 0),
    judgeCostUsd: Number(row.judge_cost_usd ?? 0),
    items: itemsRaw.map(jsonbToItem),
  };
}
