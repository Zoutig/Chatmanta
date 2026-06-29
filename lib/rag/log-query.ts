// Neutrale, client-geïnjecteerde query-logger voor het V1 RAG-pad.
//
// Geport uit V0 lib/v0/server/log.ts logQuery, met deze verschillen:
//   - de service-role-client wordt GEÏNJECTEERD (geen factory-import → lib/rag
//     blijft neutraal; grep-gate no-adhoc-service-client dwingt dit af);
//   - chatbotId is verplicht (V1 query_log.chatbot_id NOT NULL);
//   - cost_eur (EUR-budget-cap M-C) + ip_hash (AVG) extra kolommen;
//   - GEEN claim_verifications-child-insert — die tabel bestaat niet in V1
//     (claim_confidence aggregate-kolom blijft wél geschreven).
//
// Failure-mode: NEVER throw. Telemetrie mag het antwoord niet breken — bij een
// insert-fout loggen we naar console en gaan door.

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatResponse, HydeModeRequest, HydeModeResolved } from '@/lib/rag/run-rag-query';
import { redactPii } from '@/lib/observability/redact';
import { costUsdToEur } from '@/lib/ai/llm';

/**
 * Per-call HyDE-modus telemetrie. Wordt door de caller gepasst zodat ook
 * fallback/smalltalk-rijen (die geen ChatResponse.extras hebben) de gevraagde
 * modus loggen. `actual` is null voor smalltalk omdat HyDE daar niet draait.
 */
export type HydeMeta = {
  requested: HydeModeRequest;
  actual: HydeModeResolved | null;
};

type QueryLogRow = {
  // Optioneel pre-gegenereerde id zodat een streaming-route de id vooruit kan
  // delen met de widget (feedback-koppeling) vóór de insert. Zonder override:
  // DB-default gen_random_uuid().
  id?: string;
  organization_id: string;
  chatbot_id: string;
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
  // M-A: EUR-kosten (= cost_usd * vaste FX). Backstop voor de per-org budget-cap.
  cost_eur: number;
  // M-A: gepseudonimiseerd bezoeker-IP (AVG). NULL voor authed dashboard-chat.
  ip_hash: string | null;
  tone: string;
  length: string;
  top1_sim: number | null;
  hyde_triggered: boolean;
  rerank_scores: unknown | null;
  claim_confidence: number | null;
  embedding_ms: number | null;
  retrieval_ms: number | null;
  rerank_ms: number | null;
  generation_ms: number | null;
  total_ms: number | null;
  first_token_ms: number | null;
  phase_timings_ms: unknown | null;
  injection_detected: boolean;
  injection_pattern: string | null;
  from_cache: boolean;
  hyde_mode_requested: HydeModeRequest | null;
  hyde_mode_actual: HydeModeResolved | null;
  hyde_ms: number | null;
  hyde_document: string | null;
  category: 'search' | 'general' | 'off_topic' | 'smalltalk' | null;
  request_id: string | null;
  general_knowledge_actual: boolean | null;
  hard_fact_supported: boolean | null;
  missing_hard_facts: unknown | null;
  gap_kind: string | null;
  adaptive_decision: unknown | null;
};

/**
 * Log een afgeronde V1 RAG-query naar public.query_log. Best-effort: throwt nooit.
 *
 * @param client  geïnjecteerde V1-service-role-client (query_log is SELECT-only
 *                onder RLS → writes via service-role).
 */
export async function logRagQuery(
  client: SupabaseClient,
  args: {
    question: string;
    response: ChatResponse;
    organizationId: string;
    chatbotId: string;
    injection?: { detected: boolean; pattern: string | null };
    hydeMeta?: HydeMeta;
    requestId?: string;
    ipHash?: string | null;
    overrideId?: string;
  },
): Promise<void> {
  const { question, response, organizationId, chatbotId, injection, hydeMeta, requestId, ipHash, overrideId } = args;
  try {
    // Retrieval-telemetry + claim-confidence uit extras (alleen op answer-kind);
    // smalltalk en fallback krijgen defaults.
    const extras = response.kind === 'answer' ? response.extras : undefined;

    // Route-category: distinguisht de weg die een query nam.
    const category: 'search' | 'general' | 'off_topic' | 'smalltalk' | null =
      response.kind === 'smalltalk'
        ? 'smalltalk'
        : response.kind === 'answer'
        ? (extras?.category ?? 'search')
        : response.kind === 'fallback'
        ? response.reason?.startsWith('OFF_TOPIC')
          ? 'off_topic'
          : null
        : null;

    const top1Sim = extras?.top1Sim ?? null;
    const hydeTriggered = extras?.hydeTriggered ?? false;
    const hydeModeRequested = hydeMeta?.requested ?? null;
    const hydeModeActual = hydeMeta?.actual ?? null;
    const hydeDocument = extras?.hydeDocument ?? null;
    const claimConfidence =
      typeof extras?.claimConfidence === 'number' && Number.isFinite(extras.claimConfidence)
        ? extras.claimConfidence
        : null;
    // Latency profiling: pluk de 5 named buckets uit phaseTimingsMs en bewaar de
    // volledige map als jsonb voor diepere analyse.
    const t = extras?.phaseTimingsMs;
    const embeddingMs = typeof t?.embedding_ms === 'number' ? t.embedding_ms : null;
    const retrievalMs = typeof t?.retrieval_ms === 'number' ? t.retrieval_ms : null;
    const rerankMs = typeof t?.rerank_ms === 'number' ? t.rerank_ms : null;
    const generationMs = typeof t?.generation_ms === 'number' ? t.generation_ms : null;
    const totalMs = typeof t?.total_ms === 'number' ? t.total_ms : null;
    const firstTokenMs = typeof t?.first_token_ms === 'number' ? t.first_token_ms : null;
    const hydeMs = typeof t?.hyde_ms === 'number' ? t.hyde_ms : null;
    const lbe = extras?.latencyBudgetExceeded;
    const phaseTimings = t
      ? lbe
        ? { ...t, latencyBudgetExceeded: lbe }
        : t
      : null;
    const fromCache = extras?.fromCache === true;
    const generalKnowledgeActual =
      response.kind === 'smalltalk' ? null : response.generalKnowledgeActual ?? null;

    // Adaptive RAG telemetrie. gapKind zit op de top-level response (werkt zo ook
    // voor fallback-kind); adaptiveDecision in extras (alleen answer-kind).
    const gapKind =
      response.kind === 'smalltalk'
        ? null
        : (response as { gapKind?: string | null }).gapKind ?? null;
    const adaptiveDecision = extras?.adaptiveDecision ?? null;

    // Hard-fact verifier. Aanwezig in extras alleen wanneer de check draaide;
    // anders NULL.
    const hfs = extras?.hardFactSupport;
    const hardFactSupported = typeof hfs?.supported === 'boolean' ? hfs.supported : null;
    const missingHardFacts = hfs?.missing ?? null;

    // AVG: redacteer PII (e-mail/telefoon/IBAN/BSN) uit de vrije-tekst vóór de
    // insert. Geldt voor vraag én antwoord (een bot kan PII echoën).
    const redactedQuestion = redactPii(question);
    const redactedAnswer = redactPii(response.answer);

    const costEur = costUsdToEur(response.totalCostUsd);

    const row: QueryLogRow =
      response.kind === 'smalltalk'
        ? {
            organization_id: organizationId,
            chatbot_id: chatbotId,
            bot_version: response.botVersion,
            kind: 'smalltalk' as const,
            question: redactedQuestion,
            rewritten: null,
            threshold: null,
            top_similarity: null,
            source_count: 0,
            answer: redactedAnswer,
            embed_tokens: 0,
            chat_in_tokens: 0,
            chat_out_tokens: 0,
            pre_in_tokens: response.preProcessTokens.in,
            pre_out_tokens: response.preProcessTokens.out,
            cost_usd: response.totalCostUsd,
            cost_eur: costEur,
            ip_hash: ipHash ?? null,
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
            first_token_ms: null,
            phase_timings_ms: null,
            injection_detected: injection?.detected ?? false,
            injection_pattern: injection?.pattern ?? null,
            from_cache: false,
            hyde_mode_requested: hydeModeRequested,
            // Smalltalk shortcuit vóór de HyDE-branch — actual is null.
            hyde_mode_actual: null,
            hyde_ms: null,
            hyde_document: null,
            category: 'smalltalk' as const,
            request_id: requestId ?? null,
            general_knowledge_actual: null,
            hard_fact_supported: null,
            missing_hard_facts: null,
            gap_kind: null,
            adaptive_decision: null,
          }
        : {
            organization_id: organizationId,
            chatbot_id: chatbotId,
            bot_version: response.botVersion,
            kind: response.kind,
            question: redactedQuestion,
            rewritten: response.rewrite?.rewritten ?? null,
            threshold: response.threshold,
            top_similarity:
              response.kind === 'fallback'
                ? response.topSimilarity
                : (response.sources[0]?.similarity ?? null),
            source_count: response.sources.length,
            answer: redactedAnswer,
            embed_tokens: response.embedTokens,
            chat_in_tokens: response.kind === 'answer' ? response.chatInputTokens : 0,
            chat_out_tokens: response.kind === 'answer' ? response.chatOutputTokens : 0,
            pre_in_tokens: response.rewrite?.inputTokens ?? 0,
            pre_out_tokens: response.rewrite?.outputTokens ?? 0,
            cost_usd: response.totalCostUsd,
            cost_eur: costEur,
            ip_hash: ipHash ?? null,
            tone: response.tone,
            length: response.length,
            top1_sim: top1Sim,
            hyde_triggered: hydeTriggered,
            // rerank_scores: nog niet gevuld — kolom staat klaar. Default null.
            rerank_scores: null,
            claim_confidence: claimConfidence,
            embedding_ms: embeddingMs,
            retrieval_ms: retrievalMs,
            rerank_ms: rerankMs,
            generation_ms: generationMs,
            total_ms: totalMs,
            first_token_ms: firstTokenMs,
            phase_timings_ms: phaseTimings,
            injection_detected: injection?.detected ?? false,
            injection_pattern: injection?.pattern ?? null,
            from_cache: fromCache,
            hyde_mode_requested: hydeModeRequested,
            hyde_mode_actual: hydeModeActual,
            hyde_ms: hydeMs,
            hyde_document: hydeDocument,
            category,
            request_id: requestId ?? null,
            general_knowledge_actual: generalKnowledgeActual,
            hard_fact_supported: hardFactSupported,
            missing_hard_facts: missingHardFacts,
            gap_kind: gapKind,
            adaptive_decision: adaptiveDecision,
          };

    // Pre-gegenereerde id van een streaming-route → garandeert dat de id die de
    // widget al kent (via 'meta'-event) en de uiteindelijke row overeenkomen.
    if (overrideId) row.id = overrideId;

    const { error } = await client.from('query_log').insert(row);
    if (error) {
      console.error('[query_log] insert failed:', error.message);
      return;
    }
  } catch (err) {
    console.error('[query_log] unexpected error:', err);
  }
}
