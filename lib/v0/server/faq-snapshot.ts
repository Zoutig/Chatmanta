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
// Pre-cache (precacheTopN) en invalidate (invalidateFaqItem) hieronder
// gebruiken de bestaande answer_cache infrastructuur: lookup_cached_answer
// RPC om dubbele writes te voorkomen, insert into answer_cache via service-
// role. Judge-keuze (faq-judge.ts) bepaalt welk antwoord per cluster wint.
//
// Pattern: copy van knowledge-gap-snapshot.ts (sb() singleton, window-mapping).

import 'server-only';

import { type SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { embedTexts } from './rag';
import { DEFAULT_LENGTH, DEFAULT_TONE } from '../style-types';
import { judgeBestAnswer } from './faq-judge';
import { dedupeExact, greedyCluster } from './faq-cluster';
import {
  FAQ_BOT_VERSIONS,
  type FaqBotVersion,
  type FaqItem,
  type FaqSnapshot,
  type FaqWindow,
} from '../faq-types';

// Re-export client-safe types so callers can keep importing from this module.
export { FAQ_BOT_VERSIONS };
export type { FaqBotVersion, FaqItem, FaqSnapshot, FaqWindow };

// ---------------------------------------------------------------------------
// Clustering config
// ---------------------------------------------------------------------------
//
// De clustering-core (cosine, dedupeExact, greedyCluster + CLUSTER_THRESHOLD)
// leeft sinds M4 in ./faq-cluster.ts zodat de klantendashboard-snapshot
// dezelfde wiskunde deelt. Hier alleen de FAQ-engine-specifieke TOP_N.

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

// ---------------------------------------------------------------------------
// Public API — read laatste snapshot
// ---------------------------------------------------------------------------

export async function getFaqSnapshot(
  organizationId: string,
  botVersion: FaqBotVersion,
  window: FaqWindow,
): Promise<FaqSnapshot | null> {
  const { data, error } = await getServiceRoleClient()
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
  const client = getServiceRoleClient();
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

// ---------------------------------------------------------------------------
// Pre-cache top-N — judge + write naar answer_cache
// ---------------------------------------------------------------------------

/** Cost guard: één precacheTopN-call mag niet meer dan dit bedragen aan
 *  judge-cost. Bij overschrijden: abort + log. Voor n=5 met gpt-4o-mini
 *  is real-world cost ~$0.002 — ruime marge. */
const MAX_PRECACHE_USD = 0.5;

/** Max kandidaat-antwoorden die naar de judge gaan per cluster. Bij meer
 *  members samplen we deterministisch op meest-recente om judge-input
 *  zinnig te houden + cost te cappen. */
const MAX_JUDGE_CANDIDATES = 4;

/** Cache-hit threshold voor dedupe-check vóór nieuwe insert in
 *  answer_cache — consistent met lib/v0/server/rag.ts CACHE_HIT_THRESHOLD. */
const REUSE_EXISTING_CACHE_THRESHOLD = 0.93;

export type PrecacheResult = {
  snapshot: FaqSnapshot;
  cached: number;
  skipped: number;
  judgeCostUsd: number;
};

/**
 * Pre-cacht top-N items van een snapshot in answer_cache. Voor elk item:
 *   - Check of er al een answer_cache rij is voor deze vraag-embedding
 *     (sim ≥ 0.93) → hergebruik die id, geen judge nodig.
 *   - Anders: verzamel kandidaat-antwoorden uit query_log voor deze cluster,
 *     judge → schrijf antwoord naar answer_cache → opslaan id in items.
 *
 * Idempotent-genoeg: een tweede call zou dezelfde representative-question
 * vinden in answer_cache via de sim-check en geen nieuwe rij schrijven.
 */
export async function precacheTopN(
  snapshotId: string,
  topN: number = 5,
): Promise<PrecacheResult> {
  const client = getServiceRoleClient();
  const snapshot = await readSnapshotById(client, snapshotId);
  if (!snapshot) throw new Error(`faq_snapshot ${snapshotId} not found`);

  const targets = snapshot.items.slice(0, topN);
  if (targets.length === 0) {
    return { snapshot, cached: 0, skipped: 0, judgeCostUsd: 0 };
  }

  // 1. Embed alle representative-questions in één batch.
  const { vectors } = await embedTexts(targets.map((t) => t.question));

  let totalJudgeCost = 0;
  let cached = 0;
  let skipped = 0;
  const updatedItems: FaqItem[] = [...snapshot.items];

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const embedding = vectors[i];

    // Skip alleen als de gecachte rij ECHT nog bestaat. Een eerdere
    // purgeAnswerCache (bv. na een kennisbank-/instellings-/Q&A-wijziging) kan de
    // rij hebben verwijderd terwijl cachedAnswerId in de snapshot bleef staan —
    // blind skippen zou het FAQ-antwoord dan permanent kwijt laten (een nieuwe
    // pre-cache-run herstelt 'm nooit). Bestaat de rij niet meer, dan ruimen we de
    // stale id op en cachen we opnieuw via het pad hieronder.
    if (item.cachedAnswerId) {
      const stillExists = await cacheRowExists(client, item.cachedAnswerId, snapshot.organizationId);
      if (stillExists) {
        skipped += 1;
        continue;
      }
      updatedItems[i] = { ...item, cachedAnswerId: null, judgeReason: undefined };
    }

    // 2. Hergebruik bestaande answer_cache rij als sim ≥ 0.93 voor (org, bot).
    const existingId = await findExistingCacheId(
      client,
      snapshot.organizationId,
      snapshot.botVersion,
      embedding,
    );
    if (existingId) {
      updatedItems[i] = {
        ...item,
        cachedAnswerId: existingId,
        judgeReason: 'reuse-existing-cache',
      };
      cached += 1;
      continue;
    }

    // 3. Verzamel kandidaat-antwoorden voor deze cluster uit query_log.
    const candidates = await fetchCandidateAnswers(
      client,
      snapshot.organizationId,
      snapshot.botVersion,
      item.memberQuestions,
    );
    if (candidates.length === 0) {
      // Geen kandidaten — onmogelijk normaal want item komt uit query_log.
      // Defensive: skip.
      skipped += 1;
      continue;
    }

    // 4. Judge — tenzij cost-cap bereikt.
    if (totalJudgeCost >= MAX_PRECACHE_USD) {
      console.warn(
        `[faq-precache] MAX_PRECACHE_USD ($${MAX_PRECACHE_USD}) bereikt na ${cached} items — abort`,
      );
      break;
    }

    const judge = await judgeBestAnswer(
      item.question,
      candidates.map((c) => c.answer),
    );
    let winner: { answer: string; createdAt: string };
    let reason: FaqItem['judgeReason'];
    if (judge) {
      totalJudgeCost += judge.costUsd;
      winner = candidates[judge.winnerIndex];
      reason = 'judge-pick';
    } else {
      // Fallback: meest-recente succesvolle answer.
      winner = candidates[0];
      reason = 'auto-pick-fallback';
    }

    // 5. Insert in answer_cache met representative-question + embedding.
    const newCacheId = await insertAnswerCache(
      client,
      snapshot.organizationId,
      snapshot.botVersion,
      item.question,
      embedding,
      winner.answer,
    );
    updatedItems[i] = {
      ...item,
      cachedAnswerId: newCacheId,
      judgeReason: reason,
    };
    cached += 1;
  }

  // 6. Update snapshot row met nieuwe items + judge_cost_usd cumulatief.
  await updateSnapshotItems(client, snapshotId, updatedItems, totalJudgeCost);

  return {
    snapshot: {
      ...snapshot,
      items: updatedItems,
      judgeCostUsd: snapshot.judgeCostUsd + totalJudgeCost,
    },
    cached,
    skipped,
    judgeCostUsd: totalJudgeCost,
  };
}

// ---------------------------------------------------------------------------
// Invalidate — verwijder de pre-cached answer_cache rij voor één FAQ-item
// ---------------------------------------------------------------------------

export type InvalidateResult = {
  snapshot: FaqSnapshot;
  removed: boolean;
};

export async function invalidateFaqItem(
  snapshotId: string,
  rank: number,
): Promise<InvalidateResult> {
  const client = getServiceRoleClient();
  const snapshot = await readSnapshotById(client, snapshotId);
  if (!snapshot) throw new Error(`faq_snapshot ${snapshotId} not found`);

  const idx = snapshot.items.findIndex((it) => it.rank === rank);
  if (idx === -1) return { snapshot, removed: false };

  const target = snapshot.items[idx];
  if (!target.cachedAnswerId) return { snapshot, removed: false };

  // Delete uit answer_cache (org-scope check als defense-in-depth — RLS
  // dekt dit ook, maar service-role bypasses RLS, dus expliciet meefilteren).
  const { error: delErr } = await client
    .from('answer_cache')
    .delete()
    .eq('id', target.cachedAnswerId)
    .eq('organization_id', snapshot.organizationId);
  if (delErr) throw new Error(`answer_cache delete: ${delErr.message}`);

  // Clear cached_answer_id + judge_reason in snapshot jsonb.
  const updatedItems: FaqItem[] = [...snapshot.items];
  updatedItems[idx] = {
    ...target,
    cachedAnswerId: null,
    judgeReason: undefined,
  };
  await updateSnapshotItems(client, snapshotId, updatedItems, 0);

  return {
    snapshot: { ...snapshot, items: updatedItems },
    removed: true,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers — snapshot/answer_cache reads + writes
// ---------------------------------------------------------------------------

async function readSnapshotById(
  client: SupabaseClient,
  id: string,
): Promise<FaqSnapshot | null> {
  const { data, error } = await client
    .from('faq_snapshot')
    .select('id, organization_id, bot_version, time_window, generated_at, items, total_unique, total_queries, embed_cost_usd, judge_cost_usd')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`faq_snapshot read: ${error.message}`);
  return data ? rowToSnapshot(data) : null;
}

async function updateSnapshotItems(
  client: SupabaseClient,
  id: string,
  items: FaqItem[],
  judgeCostDelta: number,
): Promise<void> {
  // Lees huidige judge_cost_usd om cumulatief op te bouwen.
  const { data: cur, error: readErr } = await client
    .from('faq_snapshot')
    .select('judge_cost_usd')
    .eq('id', id)
    .single();
  if (readErr) throw new Error(`faq_snapshot read for update: ${readErr.message}`);
  const prevCost = Number((cur as { judge_cost_usd: number }).judge_cost_usd ?? 0);

  const { error } = await client
    .from('faq_snapshot')
    .update({
      items: items.map(itemToJsonb),
      judge_cost_usd: prevCost + judgeCostDelta,
    })
    .eq('id', id);
  if (error) throw new Error(`faq_snapshot update: ${error.message}`);
}

/** Bestaat de gerefereerde answer_cache-rij nog (binnen deze org)? Een eerdere
 *  purgeAnswerCache kan 'm hebben verwijderd terwijl de snapshot z'n id bewaarde.
 *  Bij een leesfout: conservatief `true` (liever skippen dan een dubbele insert). */
async function cacheRowExists(
  client: SupabaseClient,
  id: string,
  organizationId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('answer_cache')
    .select('id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) {
    console.warn('[faq-precache] cacheRowExists check faalde:', error.message);
    return true;
  }
  return data !== null;
}

async function findExistingCacheId(
  client: SupabaseClient,
  organizationId: string,
  botVersion: FaqBotVersion,
  queryVector: number[],
): Promise<string | null> {
  const { data, error } = await client.rpc('lookup_cached_answer', {
    p_organization_id: organizationId,
    p_bot_version: botVersion,
    query_embedding: queryVector,
    min_similarity: REUSE_EXISTING_CACHE_THRESHOLD,
  });
  if (error) {
    console.warn('[faq-precache] lookup_cached_answer failed:', error.message);
    return null;
  }
  const top = (data ?? [])[0] as { id: string } | undefined;
  return top?.id ?? null;
}

async function fetchCandidateAnswers(
  client: SupabaseClient,
  organizationId: string,
  botVersion: FaqBotVersion,
  memberQuestions: string[],
): Promise<Array<{ answer: string; createdAt: string }>> {
  if (memberQuestions.length === 0) return [];
  const { data, error } = await client
    .from('query_log')
    .select('answer, created_at')
    .eq('organization_id', organizationId)
    .eq('bot_version', botVersion)
    .eq('kind', 'answer')
    .neq('from_cache', true)
    .in('question', memberQuestions)
    .order('created_at', { ascending: false })
    .limit(MAX_JUDGE_CANDIDATES);
  if (error) throw new Error(`query_log candidates select: ${error.message}`);
  return (data ?? []).map((r) => ({
    answer: String((r as { answer: unknown }).answer ?? ''),
    createdAt: String((r as { created_at: unknown }).created_at ?? ''),
  }));
}

async function insertAnswerCache(
  client: SupabaseClient,
  organizationId: string,
  botVersion: FaqBotVersion,
  question: string,
  queryVector: number[],
  answer: string,
): Promise<string> {
  // response_json moet aan ChatResponse-kind='answer' voldoen want
  // lookupCachedAnswer returnt dit direct als ChatResponse naar de UI.
  // Bron-info (sources, rewrite, tokens) is niet meer beschikbaar — vul
  // sane defaults in zodat client-rendering niet crasht.
  const responseJson = {
    kind: 'answer',
    botVersion,
    tone: DEFAULT_TONE,
    length: DEFAULT_LENGTH,
    answer,
    rewrite: null,
    sources: [],
    threshold: 0,
    embedTokens: 0,
    chatInputTokens: 0,
    chatOutputTokens: 0,
    totalCostUsd: 0,
  };
  const { data, error } = await client
    .from('answer_cache')
    .insert({
      organization_id: organizationId,
      bot_version: botVersion,
      question,
      question_embedding: queryVector,
      response_json: responseJson,
    })
    .select('id')
    .single();
  if (error) throw new Error(`answer_cache insert: ${error.message}`);
  return (data as { id: string }).id;
}
