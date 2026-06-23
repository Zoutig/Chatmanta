// V0.5+ knowledge-gap snapshot — read-only DB-laag voor de Knowledge-Gap-tab.
//
// Tracket welke vragen geen antwoord opleverden (= "gaps" in de docs/bot):
//   - kind='fallback': zero-hit retrieval, vaste FALLBACK_MESSAGE getoond
//   - category='off_topic': re-classifier zei "buiten domein" (apart bucket)
//
// V0.6.2 fijnere classificatie via query_log.gap_kind kolom (migratie 0023):
//   - 'zero_hits'      = zelfde als kind='fallback' (back-compat overlap)
//   - 'low_confidence' = claim-regenerate triggered op claimConfidence
//   - 'low_grounding'  = claim-regenerate triggered op hard-fact failure
//   - 'off_topic'      = zelfde als category='off_topic' (back-compat overlap)
// Legacy v0.1-v0.6.1 rijen houden gap_kind=NULL maar worden nog steeds
// gevonden via de oude kind/category queries — dubbel tellen voorkomen via
// distinct id-buckets.
//
// NIET als gap geteld:
//   - category='general': bot gaf wel een algemene uitleg (geen doc-gap maar
//     domein-vraag die de bot al goed oplost)
//   - kind='smalltalk': geen kennis-vraag
//   - kind='answer' met category='search' EN geen regenerate-trigger: normale RAG-success
//
// Gebruik: dev/bot-owner ziet welke vragen klanten stellen die de docs niet
// dekken, en kan content gericht uitbreiden. Per-org gefiltered.
//
// Pattern: copy van latency-snapshot.ts (zie ook commentaar daar over de
// service-role + RLS-bypass redenering).

import 'server-only';

import { getServiceRoleClient } from '@/lib/supabase/admin';

export type KnowledgeGapWindow = '24h' | '7d' | 'all';

export type KnowledgeGapItem = {
  /** Wat de gebruiker letterlijk vroeg (question kolom in query_log). */
  question: string;
  /** Hoe vaak dezelfde (of bijna-identieke) vraag gesteld is in dit window. */
  count: number;
  /** ISO timestamp van de meest recente keer dat deze vraag gesteld werd. */
  lastAsked: string;
  /** Unieke bot-versies waarin deze vraag een gap gaf. Voor diagnose. */
  botVersions: string[];
};

export type KnowledgeGapSnapshot = {
  window: KnowledgeGapWindow;
  /** Totaal aantal queries in window — voor rate-berekening in UI. */
  totalQueries: number;
  /** Queries met kind='fallback' (geen relevante chunks gevonden). */
  fallbackCount: number;
  /** Queries met category='off_topic' (re-classifier wees ze af). */
  offTopicCount: number;
  /** v0.6.2: queries met gap_kind='low_confidence' (claim-regenerate
   *  triggered op verifiedRatio < threshold). 0 voor v0.1-v0.6.1. */
  lowConfidenceCount: number;
  /** v0.6.2: queries met gap_kind='low_grounding' (regenerate triggered op
   *  hard-fact verifier supported=false). 0 voor v0.1-v0.6.1. */
  lowGroundingCount: number;
  /** fallbackCount / totalQueries (0-1). NaN als totalQueries=0. */
  fallbackRate: number;
  /** Top-N (default 20) meest-gestelde unanswered vragen. */
  topUnanswered: KnowledgeGapItem[];
  /** Top-N off-topic vragen, apart bucket. */
  topOffTopic: KnowledgeGapItem[];
  /** v0.6.2: top-N low-confidence queries (verifiedRatio < threshold). */
  topLowConfidence: KnowledgeGapItem[];
  /** v0.6.2: top-N low-grounding queries (hard-fact mismatch). */
  topLowGrounding: KnowledgeGapItem[];
  generatedAt: string;
};

const TOP_N = 20;

// ---------------------------------------------------------------------------
// groupByQuestion — pure helper. Normaliseert (lowercase + trim) als
// dedupe-key, behoudt de origineel-gekapitalliseerde versie voor de UI.
// ---------------------------------------------------------------------------
function groupByQuestion(
  rows: Array<{
    question: string;
    bot_version: string;
    created_at: string;
  }>,
): KnowledgeGapItem[] {
  const map = new Map<
    string,
    { question: string; count: number; lastAsked: string; versions: Set<string> }
  >();
  for (const r of rows) {
    const key = r.question.trim().toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (r.created_at > existing.lastAsked) existing.lastAsked = r.created_at;
      existing.versions.add(r.bot_version);
    } else {
      map.set(key, {
        question: r.question.trim(),
        count: 1,
        lastAsked: r.created_at,
        versions: new Set([r.bot_version]),
      });
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || (b.lastAsked > a.lastAsked ? 1 : -1))
    .slice(0, TOP_N)
    .map((v) => ({
      question: v.question,
      count: v.count,
      lastAsked: v.lastAsked,
      botVersions: [...v.versions].sort(),
    }));
}

// ---------------------------------------------------------------------------
// getKnowledgeGapSnapshot — main entrypoint
// ---------------------------------------------------------------------------
export async function getKnowledgeGapSnapshot(
  organizationId: string,
  window: KnowledgeGapWindow = '7d',
): Promise<KnowledgeGapSnapshot> {
  const client = getServiceRoleClient();
  const since: string | null =
    window === '24h'
      ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      : window === '7d'
        ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

  // Total count voor de rate-berekening — alle queries in window, ongeacht
  // kind/category.
  const totalPromise = (async (): Promise<number> => {
    let q = client
      .from('query_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
    if (since) q = q.gte('created_at', since);
    const { count, error } = await q;
    if (error) throw new Error(`query_log total count: ${error.message}`);
    return count ?? 0;
  })();

  // Fallback-rows — kind='fallback' = bot vond geen relevante chunks.
  const fallbackPromise = (async () => {
    let q = client
      .from('query_log')
      .select('question, bot_version, created_at')
      .eq('organization_id', organizationId)
      .eq('kind', 'fallback');
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q;
    if (error) throw new Error(`query_log fallback select: ${error.message}`);
    return (data ?? []).map((r) => ({
      question: r.question as string,
      bot_version: r.bot_version as string,
      created_at: r.created_at as string,
    }));
  })();

  // Off-topic-rows — category='off_topic' (re-classifier). Apart bucket want
  // dat zijn niet "missende docs" maar "out-of-scope queries".
  const offTopicPromise = (async () => {
    let q = client
      .from('query_log')
      .select('question, bot_version, created_at')
      .eq('organization_id', organizationId)
      .eq('category', 'off_topic');
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q;
    if (error) throw new Error(`query_log off_topic select: ${error.message}`);
    return (data ?? []).map((r) => ({
      question: r.question as string,
      bot_version: r.bot_version as string,
      created_at: r.created_at as string,
    }));
  })();

  // V0.6.2: low-confidence + low-grounding via gap_kind. Aparte query op
  // gap_kind IN (...), TS-side gesplitst. Bestaat alleen voor v0.6.2+ rijen
  // (oudere bots hebben gap_kind=NULL).
  const adaptiveGapPromise = (async () => {
    let q = client
      .from('query_log')
      .select('question, bot_version, created_at, gap_kind')
      .eq('organization_id', organizationId)
      .in('gap_kind', ['low_confidence', 'low_grounding']);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q;
    if (error) throw new Error(`query_log gap_kind select: ${error.message}`);
    return (data ?? []).map((r) => ({
      question: r.question as string,
      bot_version: r.bot_version as string,
      created_at: r.created_at as string,
      gap_kind: r.gap_kind as string,
    }));
  })();

  const [totalQueries, fallbackRows, offTopicRows, adaptiveGapRows] =
    await Promise.all([totalPromise, fallbackPromise, offTopicPromise, adaptiveGapPromise]);

  const lowConfidenceRows = adaptiveGapRows.filter(
    (r) => r.gap_kind === 'low_confidence',
  );
  const lowGroundingRows = adaptiveGapRows.filter(
    (r) => r.gap_kind === 'low_grounding',
  );

  return {
    window,
    totalQueries,
    fallbackCount: fallbackRows.length,
    offTopicCount: offTopicRows.length,
    lowConfidenceCount: lowConfidenceRows.length,
    lowGroundingCount: lowGroundingRows.length,
    fallbackRate: totalQueries === 0 ? 0 : fallbackRows.length / totalQueries,
    topUnanswered: groupByQuestion(fallbackRows),
    topOffTopic: groupByQuestion(offTopicRows),
    topLowConfidence: groupByQuestion(lowConfidenceRows),
    topLowGrounding: groupByQuestion(lowGroundingRows),
    generatedAt: new Date().toISOString(),
  };
}
