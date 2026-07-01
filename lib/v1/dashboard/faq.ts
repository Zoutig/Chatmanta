// V1 Klantendashboard — "Meest gestelde vragen" snapshot helpers.
//
// Port van lib/v0/klantendashboard/server/top-questions.ts + faq-klant.ts.
// V1-verschillen t.o.v. V0:
//   - chatbot_id in beide tabellen (klant_faq_snapshot + klant_faq_config)
//   - client geïnjecteerd (session-client voor reads, service-role voor writes)
//   - embedTexts uit lib/rag/embeddings (neutraal, niet V0-import)
//   - query_log filtert ook op chatbot_id (V1 heeft NOT NULL chatbot_id)

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { embedTexts } from '@/lib/rag/embeddings';
import { dedupeExact, greedyCluster } from '@/lib/v0/server/faq-cluster';
import { RETENTION_REDACTED } from '@/lib/v0/retention-sentinel';
import {
  TOP_QUESTIONS_LIMITS,
  TOP_QUESTIONS_DEFAULT,
  type TopQuestionsConfig,
} from '@/lib/v0/klantendashboard/types';

export type { TopQuestionsConfig };

// ---------------------------------------------------------------------------
// Types (spiegelt V0's KlantFaqItem / KlantFaqRow / KlantFaqResult)
// ---------------------------------------------------------------------------

export type KlantFaqStatus = 'answered' | 'unanswered';

export type KlantFaqItem = {
  rank: number;
  /** Representative exact-string variant in de cluster. */
  question: string;
  /** Som van alle hits over de cluster. */
  count: number;
  lastAskedAt: string;
  lastStatus: KlantFaqStatus;
  memberQuestions: string[];
};

/** UI-shape voor de ranglijst-rijen. */
export type KlantFaqRow = {
  question: string;
  count: number;
  lastAskedAt: string;
  lastStatus: 'answered' | 'unanswered';
  memberQuestions: string[];
  /** Aantal extra formuleringen (= memberQuestions.length - 1, min 0). */
  paraphraseCount: number;
};

export type KlantFaqResult = {
  items: KlantFaqRow[];
  totalUnique: number;
  /** true zolang er nog GEEN snapshot is (cron heeft nog niet gedraaid). */
  pending: boolean;
  generatedAt: string | null;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Lees de FAQ-drempel-config van een org+chatbot.
 * Defensief: null row (of tabel bestaat niet) → default.
 */
export async function getV1FaqConfig(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<TopQuestionsConfig> {
  try {
    const { data } = await client
      .from('klant_faq_config')
      .select('min_count, top_n')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .maybeSingle();
    if (!data) return TOP_QUESTIONS_DEFAULT;
    return {
      minCount: Number(data.min_count ?? TOP_QUESTIONS_DEFAULT.minCount),
      topN: Number(data.top_n ?? TOP_QUESTIONS_DEFAULT.topN),
    };
  } catch {
    return TOP_QUESTIONS_DEFAULT;
  }
}

/**
 * Upsert de FAQ-drempel-config. Caller verantwoordelijk voor SA-1 (service-role
 * client meegeven na requireOrgMember). Klampt de waarden op de DB-CHECK-grenzen.
 */
export async function saveV1FaqConfig(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
  config: TopQuestionsConfig,
): Promise<TopQuestionsConfig> {
  const minCount = Math.max(
    TOP_QUESTIONS_LIMITS.minCountMin,
    Math.min(TOP_QUESTIONS_LIMITS.minCountMax, Math.round(config.minCount)),
  );
  const topN = Math.max(
    TOP_QUESTIONS_LIMITS.topNMin,
    Math.min(TOP_QUESTIONS_LIMITS.topNMax, Math.round(config.topN)),
  );
  const { error } = await client.from('klant_faq_config').upsert(
    { organization_id: orgId, chatbot_id: chatbotId, min_count: minCount, top_n: topN },
    { onConflict: 'organization_id,chatbot_id' },
  );
  if (error) throw new Error(`klant_faq_config upsert: ${error.message}`);
  return { minCount, topN };
}

// ---------------------------------------------------------------------------
// Snapshot read
// ---------------------------------------------------------------------------

type SnapshotRow = {
  generated_at: string;
  items: unknown;
  total_unique: number;
};

async function getLatestSnapshot(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<SnapshotRow | null> {
  try {
    const { data, error } = await client
      .from('klant_faq_snapshot')
      .select('generated_at, items, total_unique')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as SnapshotRow;
  } catch {
    return null;
  }
}

function jsonbToItem(raw: unknown): KlantFaqItem {
  const r = raw as Record<string, unknown>;
  return {
    rank: Number(r.rank ?? 0),
    question: String(r.question ?? ''),
    count: Number(r.count ?? 0),
    lastAskedAt: String(r.last_asked ?? ''),
    lastStatus: r.last_status === 'unanswered' ? 'unanswered' : 'answered',
    memberQuestions: Array.isArray(r.member_questions)
      ? (r.member_questions as unknown[]).map(String)
      : [],
  };
}

function itemToRow(it: KlantFaqItem): KlantFaqRow {
  return {
    question: it.question,
    count: it.count,
    lastAskedAt: it.lastAskedAt,
    lastStatus: it.lastStatus,
    memberQuestions: it.memberQuestions,
    paraphraseCount: Math.max(0, it.memberQuestions.length - 1),
  };
}

/**
 * Dashboard-read: meest recente snapshot + read-time config-filter.
 * Null snapshot → pending-state (cron heeft nog niet gedraaid).
 */
export async function getV1KlantFaqForDashboard(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<KlantFaqResult> {
  const [snapshot, config] = await Promise.all([
    getLatestSnapshot(client, orgId, chatbotId),
    getV1FaqConfig(client, orgId, chatbotId),
  ]);
  if (!snapshot) {
    return { items: [], totalUnique: 0, pending: true, generatedAt: null };
  }
  const rawItems = Array.isArray(snapshot.items) ? (snapshot.items as unknown[]) : [];
  const items = rawItems
    .map(jsonbToItem)
    .filter((it) => it.count >= config.minCount)
    .slice(0, config.topN)
    .map(itemToRow);
  return {
    items,
    totalUnique: snapshot.total_unique,
    pending: false,
    generatedAt: snapshot.generated_at,
  };
}

// ---------------------------------------------------------------------------
// Compute + persist (gebruikt door de cron — service-role client vereist)
// ---------------------------------------------------------------------------

// Bewaar tot topNMax clusters (100) zodat elke geldige klant-config past.
const TOP_N = TOP_QUESTIONS_LIMITS.topNMax;
const MAX_UNIQUE = 2000;
const MAX_EMBED_USD = 0.25;
const PAGE = 1000;
const MAX_ROWS = 200_000;

type RawRow = { question: string; kind: string; created_at: string; from_cache?: boolean | null };
type StatusByQuestion = Map<string, { status: KlantFaqStatus; lastAsked: string }>;

function buildStatusByQuestion(rows: RawRow[]): StatusByQuestion {
  const map: StatusByQuestion = new Map();
  for (const r of rows) {
    const key = String(r.question ?? '').trim().toLowerCase();
    if (!key) continue;
    const createdAt = String(r.created_at ?? '');
    const status: KlantFaqStatus = r.kind === 'fallback' ? 'unanswered' : 'answered';
    const existing = map.get(key);
    if (!existing || createdAt > existing.lastAsked) {
      map.set(key, { status, lastAsked: createdAt });
    }
  }
  return map;
}

function resolveClusterStatus(
  members: number[],
  entries: ReturnType<typeof dedupeExact>,
  statusBy: StatusByQuestion,
): KlantFaqStatus {
  let bestAt = '';
  let bestStatus: KlantFaqStatus = 'answered';
  for (const m of members) {
    const key = entries[m].question.trim().toLowerCase();
    const s = statusBy.get(key);
    if (s && s.lastAsked > bestAt) {
      bestAt = s.lastAsked;
      bestStatus = s.status;
    }
  }
  return bestStatus;
}

function itemToJsonb(it: KlantFaqItem): Record<string, unknown> {
  return {
    rank: it.rank,
    question: it.question,
    count: it.count,
    last_asked: it.lastAskedAt,
    last_status: it.lastStatus,
    member_questions: it.memberQuestions,
  };
}

/**
 * Bereken een nieuwe FAQ-snapshot voor org+chatbot en persisteer 'm (append-only).
 * Vereist een service-role client (klant_faq_snapshot heeft SELECT-only RLS).
 * Gooit bij een INSERT-fout; de cron vangt dit per-chatbot af.
 */
export async function computeV1KlantFaqSnapshot(
  client: SupabaseClient,
  orgId: string,
  chatbotId: string,
): Promise<{ embedCostUsd: number; totalUnique: number; generatedAt: string }> {
  // 1. Pagineer alle kandidaat-rijen (ontwijkt PostgREST-1000-cap).
  const rawRows: RawRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data: page, error } = await client
      .from('query_log')
      .select('question, kind, created_at, from_cache')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .in('kind', ['answer', 'fallback'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`query_log select: ${error.message}`);
    if (!page || page.length === 0) break;
    rawRows.push(...(page as RawRow[]));
    if (page.length < PAGE) break;
  }

  // Filter from_cache=true (feedback-loop) + lege/RETENTION_REDACTED vragen.
  const rows = rawRows
    .filter((r) => r.from_cache !== true)
    .filter((r) => {
      const q = String(r.question ?? '').trim();
      return q.length > 0 && q !== RETENTION_REDACTED;
    });
  const totalQueries = rows.length;

  // 2. Exact-string dedupe.
  const entries = dedupeExact(rows);
  const statusBy = buildStatusByQuestion(rows);
  const totalUnique = entries.length;

  const persist = async (items: KlantFaqItem[], costUsd: number) => {
    const { data, error } = await client
      .from('klant_faq_snapshot')
      .insert({
        organization_id: orgId,
        chatbot_id: chatbotId,
        items: items.map(itemToJsonb),
        total_unique: totalUnique,
        total_queries: totalQueries,
        embed_cost_usd: costUsd,
      })
      .select('generated_at')
      .single();
    if (error) throw new Error(`klant_faq_snapshot insert: ${error.message}`);
    return String((data as { generated_at: unknown }).generated_at);
  };

  if (totalUnique === 0) {
    const generatedAt = await persist([], 0);
    return { embedCostUsd: 0, totalUnique: 0, generatedAt };
  }

  // 3. Sort op count desc (frequentste eerst → greedy rep-keuze), volume-guard.
  entries.sort((a, b) => b.count - a.count || (b.lastAsked > a.lastAsked ? 1 : -1));
  let embedEntries = entries;
  if (entries.length > MAX_UNIQUE) {
    console.warn(
      `[v1/faq] org ${orgId} chatbot ${chatbotId}: ${entries.length} unieke vragen > ${MAX_UNIQUE} — embed top-${MAX_UNIQUE}`,
    );
    embedEntries = entries.slice(0, MAX_UNIQUE);
  }

  // 4. Embeddings + cost-guard.
  const { vectors, costUsd: embedCostUsd } = await embedTexts(
    embedEntries.map((e) => e.question),
  );
  if (embedCostUsd > MAX_EMBED_USD) {
    console.warn(
      `[v1/faq] embed-kost $${embedCostUsd.toFixed(6)} > MAX_EMBED_USD ($${MAX_EMBED_USD})`,
    );
  }

  // 5. Greedy single-link clustering (cosine ≥ 0.88).
  const clusters = greedyCluster(embedEntries, vectors);

  // 6. Rank op som-count desc, top-N.
  const ranked = clusters
    .map((c) => {
      const totalCount = c.members.reduce((sum, m) => sum + embedEntries[m].count, 0);
      const rep = embedEntries[c.repIdx];
      const lastAsked = c.members
        .map((m) => embedEntries[m].lastAsked)
        .reduce((max, v) => (v > max ? v : max), rep.lastAsked);
      const memberQuestions = [
        ...new Set(c.members.flatMap((m) => [...embedEntries[m].variants])),
      ];
      const lastStatus = resolveClusterStatus(c.members, embedEntries, statusBy);
      return { totalCount, rep, lastAsked, lastStatus, memberQuestions };
    })
    .sort((a, b) => b.totalCount - a.totalCount || (b.lastAsked > a.lastAsked ? 1 : -1))
    .slice(0, TOP_N);

  const items: KlantFaqItem[] = ranked.map((r, i) => ({
    rank: i + 1,
    question: r.rep.question,
    count: r.totalCount,
    lastAskedAt: r.lastAsked,
    lastStatus: r.lastStatus,
    memberQuestions: r.memberQuestions,
  }));

  const generatedAt = await persist(items, embedCostUsd);
  return { embedCostUsd, totalUnique, generatedAt };
}
