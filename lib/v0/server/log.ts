// V0 query logger — append-only insert in public.query_log.
//
// Failure-mode: NEVER throw. Logging is een leeranalyse-laag, geen kritiek
// pad. Als de insert faalt (DB down, schema-mismatch, etc.) loggen we naar
// console en gaan door zodat de gebruiker zijn antwoord nog krijgt.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEV_ORG_ID } from './rag';
import type { ChatResponse } from './rag';

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

type QueryLogRow = {
  organization_id: string;
  bot_version: string;
  kind: 'smalltalk' | 'answer' | 'fallback' | 'blocked';
  question: string;
  rewritten: string | null;
  threshold: number | null;
  top_similarity: number | null;
  source_count: number;
  answer: string;
  embed_tokens: number;
  chat_in_tokens: number;
  chat_out_tokens: number;
  pre_in_tokens: number;
  pre_out_tokens: number;
  cost_usd: number;
  tone: string;
  length: string;
  // v0.4 retrieval-telemetry (migration 0008). Allemaal optioneel — oude
  // bot-versies krijgen NULL/false en werken zonder wijziging.
  top1_sim: number | null;
  hyde_triggered: boolean;
  rerank_scores: unknown | null;
  // v0.4 claim verification aggregate (migration 0009). NULL als verification
  // niet draaide voor deze query (oudere bots).
  claim_confidence: number | null;
  // v0.4 latency profiling (migration 0010). 5 named buckets + volledige
  // jsonb-breakdown. NULL voor smalltalk/fallback (eerlijk: oudere bots
  // halen deze velden ook niet).
  embedding_ms: number | null;
  retrieval_ms: number | null;
  rerank_ms: number | null;
  generation_ms: number | null;
  total_ms: number | null;
  phase_timings_ms: unknown | null;
  // v0.4 injection telemetry (migration 0011). False/NULL voor reguliere
  // queries; true + pattern naam voor verdachte input.
  injection_detected: boolean;
  injection_pattern: string | null;
};

/**
 * All-time usage totalen voor de DEV_ORG, gelezen uit query_log.
 *
 * Gebruikt door de sidebar footer ("hoeveel tokens / cost ben ik kwijt sinds
 * we deze setup hebben"). Voor V0 is het corpus klein genoeg dat we alle rijen
 * binnen halen en client-side optellen — een paar honderd queries kost ms.
 * Bij V1 verhuist dit naar een aggregate-RPC of materialized view.
 */
export type AllTimeUsage = {
  queryCount: number;
  totalCostUsd: number;
  embedTokens: number;
  chatInputTokens: number;
  chatOutputTokens: number;
  preTokens: number; // pre_in + pre_out (rewrite/preprocess)
  totalTokens: number;
};

export async function getAllTimeUsage(): Promise<AllTimeUsage> {
  const empty: AllTimeUsage = {
    queryCount: 0,
    totalCostUsd: 0,
    embedTokens: 0,
    chatInputTokens: 0,
    chatOutputTokens: 0,
    preTokens: 0,
    totalTokens: 0,
  };
  try {
    const { data, error } = await sb()
      .from('query_log')
      .select(
        'embed_tokens, chat_in_tokens, chat_out_tokens, pre_in_tokens, pre_out_tokens, cost_usd',
      )
      .eq('organization_id', DEV_ORG_ID);
    if (error || !data) return empty;
    return data.reduce<AllTimeUsage>((acc, r) => {
      const embed = Number(r.embed_tokens) || 0;
      const chatIn = Number(r.chat_in_tokens) || 0;
      const chatOut = Number(r.chat_out_tokens) || 0;
      const preIn = Number(r.pre_in_tokens) || 0;
      const preOut = Number(r.pre_out_tokens) || 0;
      const cost = Number(r.cost_usd) || 0;
      acc.queryCount += 1;
      acc.embedTokens += embed;
      acc.chatInputTokens += chatIn;
      acc.chatOutputTokens += chatOut;
      acc.preTokens += preIn + preOut;
      acc.totalTokens += embed + chatIn + chatOut + preIn + preOut;
      acc.totalCostUsd += cost;
      return acc;
    }, empty);
  } catch {
    // Failure-mode net als logQuery: geen blocker, gewoon nullen tonen.
    return empty;
  }
}

export async function logQuery(
  question: string,
  response: ChatResponse,
  injection?: { detected: boolean; pattern: string | null },
): Promise<void> {
  try {
    // v0.4 retrieval-telemetry + claim verification uit extras (alleen
    // aanwezig op answer-kind); smalltalk en fallback krijgen defaults.
    const extras = response.kind === 'answer' ? response.extras : undefined;
    const top1Sim = extras?.top1Sim ?? null;
    const hydeTriggered = extras?.hydeTriggered ?? false;
    const claimConfidence =
      typeof extras?.claimConfidence === 'number' && Number.isFinite(extras.claimConfidence)
        ? extras.claimConfidence
        : null;
    const claims = extras?.claims;
    const verificationThreshold =
      typeof extras?.claimVerificationThreshold === 'number'
        ? extras.claimVerificationThreshold
        : null;
    // v0.4 latency profiling: pluk de 5 named buckets uit phaseTimingsMs en
    // bewaar de volledige map als jsonb voor diepere analyse.
    const t = extras?.phaseTimingsMs;
    const embeddingMs = typeof t?.embedding_ms === 'number' ? t.embedding_ms : null;
    const retrievalMs = typeof t?.retrieval_ms === 'number' ? t.retrieval_ms : null;
    const rerankMs = typeof t?.rerank_ms === 'number' ? t.rerank_ms : null;
    const generationMs = typeof t?.generation_ms === 'number' ? t.generation_ms : null;
    const totalMs = typeof t?.total_ms === 'number' ? t.total_ms : null;
    const phaseTimings = t ?? null;

    const row: QueryLogRow =
      response.kind === 'smalltalk'
        ? {
            organization_id: DEV_ORG_ID,
            bot_version: response.botVersion,
            kind: 'smalltalk' as const,
            question,
            rewritten: null,
            threshold: null,
            top_similarity: null,
            source_count: 0,
            answer: response.answer,
            embed_tokens: 0,
            chat_in_tokens: 0,
            chat_out_tokens: 0,
            pre_in_tokens: response.preProcessTokens.in,
            pre_out_tokens: response.preProcessTokens.out,
            cost_usd: response.totalCostUsd,
            tone: response.tone,
            length: response.length,
            top1_sim: null,
            hyde_triggered: false,
            rerank_scores: null,
            claim_confidence: null,
            embedding_ms: null,
            retrieval_ms: null,
            rerank_ms: null,
            generation_ms: null,
            total_ms: null,
            phase_timings_ms: null,
            injection_detected: injection?.detected ?? false,
            injection_pattern: injection?.pattern ?? null,
          }
        : {
            organization_id: DEV_ORG_ID,
            bot_version: response.botVersion,
            kind: response.kind,
            question,
            rewritten: response.rewrite?.rewritten ?? null,
            threshold: response.threshold,
            top_similarity:
              response.kind === 'fallback'
                ? response.topSimilarity
                : (response.sources[0]?.similarity ?? null),
            source_count: response.sources.length,
            answer: response.answer,
            embed_tokens: response.embedTokens,
            chat_in_tokens: response.kind === 'answer' ? response.chatInputTokens : 0,
            chat_out_tokens: response.kind === 'answer' ? response.chatOutputTokens : 0,
            pre_in_tokens: response.rewrite?.inputTokens ?? 0,
            pre_out_tokens: response.rewrite?.outputTokens ?? 0,
            cost_usd: response.totalCostUsd,
            tone: response.tone,
            length: response.length,
            top1_sim: top1Sim,
            hyde_triggered: hydeTriggered,
            // rerank_scores: in V0.4 nog niet gevuld — kolom staat klaar voor
            // wanneer Cohere of een gedetailleerde LLM-rerank-trace wordt
            // ingebouwd. Leesbare default = null.
            rerank_scores: null,
            claim_confidence: claimConfidence,
            embedding_ms: embeddingMs,
            retrieval_ms: retrievalMs,
            rerank_ms: rerankMs,
            generation_ms: generationMs,
            total_ms: totalMs,
            phase_timings_ms: phaseTimings,
            injection_detected: injection?.detected ?? false,
            injection_pattern: injection?.pattern ?? null,
          };

    // Insert query_log + retourneer id zodat we claim_verifications kunnen
    // koppelen. Bij fout: log en stop — claim_verifications zonder query_log_id
    // is nutteloos.
    const { data: inserted, error } = await sb()
      .from('query_log')
      .insert(row)
      .select('id')
      .single();
    if (error) {
      console.error('[query_log] insert failed:', error.message);
      return;
    }
    const queryLogId = inserted?.id as string | undefined;

    // v0.4 claim verifications (één rij per claim). Best-effort — fail silently
    // als de tabel/kolom niet bestaat (oude DB) of insert hapert.
    if (queryLogId && claims && claims.length > 0 && verificationThreshold !== null) {
      const cvRows = claims.map((c) => ({
        organization_id: DEV_ORG_ID,
        query_log_id: queryLogId,
        claim_index: c.index,
        claim_text: c.text,
        verified: c.verified,
        best_similarity: c.bestSimilarity,
        best_chunk_id: c.bestChunkId,
        threshold_used: verificationThreshold,
      }));
      const { error: cvErr } = await sb().from('claim_verifications').insert(cvRows);
      if (cvErr) console.error('[claim_verifications] insert failed:', cvErr.message);
    }
  } catch (err) {
    console.error('[query_log] unexpected error:', err);
  }
}

/**
 * v0.4 — log een query die door de injection-filter is geblokkeerd. Geen
 * pipeline gedraaid, dus geen ChatResponse beschikbaar. We schrijven met
 * kind='blocked' en de matchende pattern-naam in injection_pattern.
 *
 * Failure-mode: NEVER throw — net als logQuery is dit best-effort telemetrie.
 */
export async function logBlockedQuery(input: {
  question: string;
  botVersion: string;
  tone: string;
  length: string;
  injectionPattern: string;
  blockedMessage: string;
}): Promise<void> {
  try {
    const row: QueryLogRow = {
      organization_id: DEV_ORG_ID,
      bot_version: input.botVersion,
      kind: 'blocked',
      question: input.question,
      rewritten: null,
      threshold: null,
      top_similarity: null,
      source_count: 0,
      answer: input.blockedMessage,
      embed_tokens: 0,
      chat_in_tokens: 0,
      chat_out_tokens: 0,
      pre_in_tokens: 0,
      pre_out_tokens: 0,
      cost_usd: 0,
      tone: input.tone,
      length: input.length,
      top1_sim: null,
      hyde_triggered: false,
      rerank_scores: null,
      claim_confidence: null,
      embedding_ms: null,
      retrieval_ms: null,
      rerank_ms: null,
      generation_ms: null,
      total_ms: null,
      phase_timings_ms: null,
      injection_detected: true,
      injection_pattern: input.injectionPattern,
    };
    const { error } = await sb().from('query_log').insert(row);
    if (error) console.error('[query_log blocked] insert failed:', error.message);
  } catch (err) {
    console.error('[query_log blocked] unexpected error:', err);
  }
}
