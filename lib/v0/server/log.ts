// V0 query logger — append-only insert in public.query_log.
//
// Failure-mode: NEVER throw. Logging is een leeranalyse-laag, geen kritiek
// pad. Als de insert faalt (DB down, schema-mismatch, etc.) loggen we naar
// console en gaan door zodat de gebruiker zijn antwoord nog krijgt.

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEV_ORG_ID } from './rag';
import type { ChatResponse, HydeModeRequest, HydeModeResolved } from './rag';
import { redactPii } from '@/lib/observability/redact';

/**
 * Per-call HyDE-modus telemetrie. Wordt door route.ts gepasst aan logQuery
 * zodat ook fallback/blocked rijen (die geen ChatResponse.extras hebben) de
 * gevraagde modus loggen. `actual` is null voor smalltalk/blocked omdat HyDE
 * daar niet draait.
 */
export type HydeMeta = {
  requested: HydeModeRequest;
  actual: HydeModeResolved | null;
};

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
  // V0.7+: optioneel pre-gegenereerde id zodat de streaming-API de id al
  // vooruit kan delen met de widget (voor feedback-koppeling) vóór de
  // logQuery-insert plaatsvindt. Zonder override valt insert terug op de
  // DB-default `gen_random_uuid()`.
  id?: string;
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
  // v0 production TTFT (migration 0041). Tijd tot de eerste answer-delta.
  // NULL voor smalltalk/fallback/cache-hit (geen streaming) en legacy rijen.
  first_token_ms: number | null;
  phase_timings_ms: unknown | null;
  // v0.4 injection telemetry (migration 0011). False/NULL voor reguliere
  // queries; true + pattern naam voor verdachte input.
  injection_detected: boolean;
  injection_pattern: string | null;
  // v0.4 cache telemetry (migration 0012). True wanneer answer_cache een hit
  // gaf en de pipeline vroeg-exit deed. False voor smalltalk/fallback/blocked
  // en voor verse RAG-runs.
  from_cache: boolean;
  // v0.5 HyDE-modus logging (migration 0013). Allemaal optioneel — legacy
  // rijen krijgen NULL.
  hyde_mode_requested: HydeModeRequest | null;
  hyde_mode_actual: HydeModeResolved | null;
  hyde_ms: number | null;
  hyde_document: string | null;
  // v0.5 route-category (migratie 0015). NULL voor legacy. Distinguishes
  // 'general' (re-classifier disclaimer-antwoord) van normale 'search' RAG.
  category: 'search' | 'general' | 'off_topic' | 'smalltalk' | null;
  // v0.5+ correlation-ID (migratie 0017). Gevuld voor requests die door
  // /api/v0/chat lopen; NULL voor legacy of niet-API-paden.
  request_id: string | null;
  // v0.5+ general-knowledge gate (migratie 0019). True wanneer de zero-hits
  // gate reclassify dreef (general-knowledge antwoord, off-topic, of via
  // reclassify-fallback), false wanneer de gate hard fallback gaf zonder
  // reclassify-call. NULL voor smalltalk/blocked en legacy rijen.
  general_knowledge_actual: boolean | null;
  // v0.6.1 hard-fact verifier (migratie 0022). NULL voor v0.1-v0.5 én voor
  // v0.6.1-runs waar bot.adaptiveHardFactVerification uit stond (= check
  // niet gedraaid). False = minstens één hard fact missing (regenerate
  // mogelijk getriggered). True = alle harde feiten ondersteund.
  hard_fact_supported: boolean | null;
  missing_hard_facts: unknown | null;
  // V0.6.2 adaptive RAG telemetry (migratie 0023). NULL voor v0.1-v0.6.1.
  //   * gap_kind: zero_hits | low_confidence | low_grounding | off_topic | NULL
  //   * adaptive_decision: volledige RagDecision-blob (path, strength, shouldX, reasons)
  gap_kind: string | null;
  adaptive_decision: unknown | null;
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

export async function getAllTimeUsage(
  organizationId: string,
): Promise<AllTimeUsage> {
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
      .eq('organization_id', organizationId);
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
  // C10 (v0.10): injection is verplicht (mag `undefined` zijn) zodat organizationId
  // erna verplicht kan zijn zonder TS "required-na-optional"-fout. Geen stille
  // DEV_ORG_ID-fallback meer op het productie-logpad — de caller MOET de org leveren.
  injection: { detected: boolean; pattern: string | null } | undefined,
  organizationId: string,
  hydeMeta?: HydeMeta,
  requestId?: string,
  /**
   * Pre-gegenereerde query_log-id. De /api/v0/chat-route gebruikt dit om de
   * id al via een meta-event aan de widget mee te geven vóór de log-insert
   * gebeurt — anders heeft de widget geen koppeling om feedback aan op te
   * hangen. Bij undefined: DB-default gen_random_uuid().
   */
  overrideId?: string,
): Promise<void> {
  try {
    // v0.4 retrieval-telemetry + claim verification uit extras (alleen
    // aanwezig op answer-kind); smalltalk en fallback krijgen defaults.
    const extras = response.kind === 'answer' ? response.extras : undefined;

    // v0.5 route-category: distinguishes de weg die een query nam.
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
    // HyDE-modus komt uit route (al bekend voor de pipeline draait). Voor
    // smalltalk schrijft route.ts actual=null omdat HyDE daar niet draait.
    const hydeModeRequested = hydeMeta?.requested ?? null;
    const hydeModeActual = hydeMeta?.actual ?? null;
    const hydeDocument = extras?.hydeDocument ?? null;
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
    // v0 TTFT (migration 0041). rag.ts zet first_token_ms in phaseTimingsMs op
    // de streamende antwoord-paden; smalltalk/cache-hit laten 'm undefined → null.
    const firstTokenMs = typeof t?.first_token_ms === 'number' ? t.first_token_ms : null;
    const hydeMs = typeof t?.hyde_ms === 'number' ? t.hyde_ms : null;
    // V0.5 latency-budget telemetry: extras.latencyBudgetExceeded zit als
    // broer-veld náást phaseTimingsMs op extras. Mergen we in de jsonb mee,
    // anders is de skip-logica observability-loos buiten de live SSE-stream.
    const lbe = extras?.latencyBudgetExceeded;
    const phaseTimings = t
      ? lbe
        ? { ...t, latencyBudgetExceeded: lbe }
        : t
      : null;
    const fromCache = extras?.fromCache === true;
    // v0.5+ general-knowledge actual. NULL voor smalltalk (gate draait niet);
    // anders pluk uit response. Defensieve `?? null` voor oude threads-table
    // rijen die nog zonder dit veld zijn gedeserialiseerd.
    const generalKnowledgeActual =
      response.kind === 'smalltalk' ? null : response.generalKnowledgeActual ?? null;

    // v0.6.2 adaptive RAG telemetry. gapKind zit op de top-level response
    // (BaseChatResponse), niet in extras — werkt zo ook voor fallback-kind
    // waar response.extras niet bestaat. adaptiveDecision wel in extras
    // (alleen op answer-kind aanwezig).
    const gapKind =
      response.kind === 'smalltalk'
        ? null
        : (response as { gapKind?: string | null }).gapKind ?? null;
    const adaptiveDecision = extras?.adaptiveDecision ?? null;

    // v0.6.1 hard-fact verifier. Aanwezig in extras alleen wanneer
    // bot.adaptiveHardFactVerification aanstond. Voor smalltalk/blocked
    // en oudere versies blijft het NULL.
    const hfs = extras?.hardFactSupport;
    const hardFactSupported = typeof hfs?.supported === 'boolean' ? hfs.supported : null;
    const missingHardFacts = hfs?.missing ?? null;

    // C7 (v0.10) — AVG: redacteer PII (e-mail/telefoon/IBAN/BSN) uit de vrije-tekst
    // vóór de insert. De query_log is de analyse-/telemetrie-laag (de operator-
    // conversatieweergave leest v0_threads, niet dit); we redacteren altijd (const
    // default-aan) — logQuery is best-effort/never-throws, dus geen per-query DB-flag-
    // lookup die de insert kan laten falen. Geldt voor vraag én antwoord (een bot kan
    // door de gebruiker genoemde PII echoën).
    const redactedQuestion = redactPii(question);
    const redactedAnswer = redactPii(response.answer);

    const row: QueryLogRow =
      response.kind === 'smalltalk'
        ? {
            organization_id: organizationId,
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

    // Pre-gegenereerde id van de streaming-route → garandeert dat de id die
    // de widget al kent (via 'meta'-event) en de uiteindelijke row overeenkomen.
    if (overrideId) row.id = overrideId;

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
        organization_id: organizationId,
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
  organizationId?: string;
  requestId?: string;
}): Promise<void> {
  try {
    const row: QueryLogRow = {
      organization_id: input.organizationId ?? DEV_ORG_ID,
      bot_version: input.botVersion,
      kind: 'blocked',
      // C7 (v0.10) — AVG: ook de geblokkeerde (injection-)vraag PII-redacteren.
      question: redactPii(input.question),
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
      first_token_ms: null,
      phase_timings_ms: null,
      injection_detected: true,
      injection_pattern: input.injectionPattern,
      from_cache: false,
      // Blocked queries draaien geen HyDE — actual = null. Requested kunnen
      // we nog niet koppelen (geen HydeMeta param hier; toevoegen kan later).
      hyde_mode_requested: null,
      hyde_mode_actual: null,
      hyde_ms: null,
      hyde_document: null,
      category: null,
      request_id: input.requestId ?? null,
      // Blocked queries draaien de general-knowledge gate niet — NULL.
      general_knowledge_actual: null,
      // Blocked queries genereren geen antwoord → geen hard-fact check.
      hard_fact_supported: null,
      missing_hard_facts: null,
      // Blocked queries draaien geen adaptive pipeline.
      gap_kind: null,
      adaptive_decision: null,
    };
    const { error } = await sb().from('query_log').insert(row);
    if (error) console.error('[query_log blocked] insert failed:', error.message);
  } catch (err) {
    console.error('[query_log blocked] unexpected error:', err);
  }
}
