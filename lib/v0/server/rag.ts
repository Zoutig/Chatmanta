// V0 server-side RAG logica voor de Next.js demo.
//
// Deze file is een TS-versie van de logica in scripts/v0-{ingest,chat}.mjs en
// lib/v0/{chunker,embeddings,chat}.mjs. Bewuste duplicatie: V0 is wegwerp,
// scripts blijven in .mjs (CLI), Next.js krijgt typed TS. In V1 Phase 4 komt
// alles terug onder lib/ai/llm.ts (canonical).
//
// 'server-only' import zorgt dat een per ongeluk import vanuit een client
// component een build error geeft (geen secrets in de browser).

import 'server-only';

import { performance } from 'node:perf_hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type { BotConfig } from './bots';
import { buildSystemPrompt } from '../style';
import { DEFAULT_LENGTH, DEFAULT_TONE, type Length, type Tone } from '../style-types';
import { costForModelUsd } from '../../ai/llm';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM = 1536;
const EMBED_COST_PER_M_USD = 0.02;
const EMBED_BATCH_SIZE = 100;

// Cost rates voor gpt-4o-mini (USD per 1M tokens). Wanneer een toekomstige
// bot-versie naar een ander chat-model gaat, moet dit een lookup-tabel
// worden — voor nu is gpt-4o-mini de enige V0-keuze.
const CHAT_INPUT_PER_M_USD = 0.15;
const CHAT_OUTPUT_PER_M_USD = 0.60;

// Char-based chunker config. Token-based chunking schuift naar V1 Fase 4.
const CHUNK_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;

// Structurele defaults — niet bot-versie-specifiek. Voor per-versie variatie
// (prompts, threshold, temperatuur, model) zie lib/v0/server/bots.ts.
export const V0_RAG_DEFAULTS = {
  TOP_K: 5,
  MAX_CONTEXT_CHARS: 12000,
  CHAT_MAX_TOKENS: 500,
  REWRITE_TEMPERATURE: 0.3,
  REWRITE_MAX_TOKENS: 200,
  /** Max chunks die naar de rerank-LLM gaan — beperkt latency van rerank-call. */
  MAX_RERANK_INPUT: 10,
} as const;

export const FALLBACK_MESSAGE =
  'Daar heb ik geen informatie over. Stel je vraag anders, of neem contact op met de organisatie.';

// (System prompts leven per bot-versie in lib/v0/server/bots.ts.)

// ---------------------------------------------------------------------------
// Lazy clients
// ---------------------------------------------------------------------------
let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

let _supabase: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

// ---------------------------------------------------------------------------
// Chunker
// ---------------------------------------------------------------------------
export function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= CHUNK_CHARS) return [trimmed];

  const stride = CHUNK_CHARS - CHUNK_OVERLAP_CHARS;
  const chunks: string[] = [];
  for (let start = 0; start < trimmed.length; start += stride) {
    const slice = trimmed.slice(start, start + CHUNK_CHARS).trim();
    if (slice.length > 0) chunks.push(slice);
    if (start + CHUNK_CHARS >= trimmed.length) break;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------
export type EmbedResult = {
  vectors: number[][];
  tokens: number;
  costUsd: number;
};

// V0.4 latency-cap: per-batch timeout 4s + max 1 retry. OpenAI SDK v6 doet de
// retry zelf met exponential backoff op 429/5xx en op aborted timeouts. Zonder
// timeout zagen we p99=5.4s en max=6.0s op embedding-calls, helemaal binnen
// het kritieke pad. 4s + 1 retry = absolute worst-case ~8s, maar p99 zal naar
// ~4-5s zakken (SDK retried snel op transiente fouten).
const EMBED_TIMEOUT_MS = 4000;
const EMBED_MAX_RETRIES = 1;

export async function embedTexts(strings: string[]): Promise<EmbedResult> {
  if (strings.length === 0) return { vectors: [], tokens: 0, costUsd: 0 };
  const vectors: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < strings.length; i += EMBED_BATCH_SIZE) {
    const batch = strings.slice(i, i + EMBED_BATCH_SIZE);
    const resp = await openai().embeddings.create(
      {
        model: EMBED_MODEL,
        input: batch,
      },
      { timeout: EMBED_TIMEOUT_MS, maxRetries: EMBED_MAX_RETRIES },
    );
    for (const item of resp.data) {
      if (item.embedding.length !== EMBED_DIM) {
        throw new Error(`expected ${EMBED_DIM}-dim, got ${item.embedding.length}`);
      }
      vectors.push(item.embedding);
    }
    totalTokens += resp.usage?.total_tokens ?? 0;
  }
  return {
    vectors,
    tokens: totalTokens,
    costUsd: (totalTokens / 1_000_000) * EMBED_COST_PER_M_USD,
  };
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
type ChatCompleteResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

async function chatComplete({
  model,
  system,
  user,
  temperature,
  maxTokens = V0_RAG_DEFAULTS.CHAT_MAX_TOKENS,
}: {
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens?: number;
}): Promise<ChatCompleteResult> {
  const resp = await openai().chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const text = resp.choices[0]?.message?.content ?? '';
  const inputTokens = resp.usage?.prompt_tokens ?? 0;
  const outputTokens = resp.usage?.completion_tokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * CHAT_INPUT_PER_M_USD +
    (outputTokens / 1_000_000) * CHAT_OUTPUT_PER_M_USD;
  return { text, inputTokens, outputTokens, costUsd };
}

// ---------------------------------------------------------------------------
// Pre-processor — een gpt-4o-mini call die beslist of de input smalltalk is
// (begroeting/dank/afscheid: meteen vriendelijk antwoorden, geen retrieval)
// of een echte zoekvraag (rewrite voor betere similarity, dan de RAG-loop in).
// Eén LLM-call dekt beide gevallen, ~$0.0001 met gpt-4o-mini.
// ---------------------------------------------------------------------------
type PreProcessTokens = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

type PreProcessResult =
  | ({ kind: 'smalltalk'; reply: string } & PreProcessTokens)
  | ({ kind: 'search'; query: string } & PreProcessTokens);

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length < 2) return t;
  const first = t[0];
  const last = t[t.length - 1];
  if ((first === '"' && last === '"') || (first === '„' && last === '"') || (first === "'" && last === "'")) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/**
 * Parse the model's two-line output. Returns null on malformed reply so the
 * caller can fall back to default search behavior.
 */
function parsePreProcessOutput(raw: string): { kind: 'smalltalk'; reply: string } | { kind: 'search'; query: string } | null {
  const text = raw.trim();
  const actionMatch = text.match(/^ACTION:\s*(smalltalk|search)\b/im);
  if (!actionMatch) return null;
  const action = actionMatch[1].toLowerCase();

  if (action === 'smalltalk') {
    const replyMatch = text.match(/^REPLY:\s*([\s\S]+?)$/im);
    const reply = stripQuotes(replyMatch?.[1] ?? '').slice(0, 500);
    if (!reply) return null;
    return { kind: 'smalltalk', reply };
  }

  const queryMatch = text.match(/^QUERY:\s*([\s\S]+?)$/im);
  const query = stripQuotes(queryMatch?.[1] ?? '').slice(0, 1000);
  if (!query) return null;
  return { kind: 'search', query };
}

// Beperk hoeveel turns we meegeven aan de LLM-calls. Meer = duurder en
// kan de LLM verwarren met oude context die niet meer relevant is.
const MAX_HISTORY_TURNS = 4;

export type ChatHistoryTurn = { role: 'user' | 'assistant'; content: string };

function formatHistoryBlock(history: ChatHistoryTurn[]): string {
  if (history.length === 0) return '';
  const lines = history.map((t) =>
    t.role === 'user' ? `gebruiker: ${t.content}` : `assistent: ${t.content}`,
  );
  return `GESPREKS-HISTORIE:\n${lines.join('\n')}\n\n`;
}

async function preProcessInput(
  original: string,
  bot: BotConfig,
  history: ChatHistoryTurn[] = [],
): Promise<PreProcessResult> {
  const trimmed = history.slice(-MAX_HISTORY_TURNS);
  const userMessage = trimmed.length === 0
    ? original
    : `${formatHistoryBlock(trimmed)}HUIDIGE INPUT: ${original}`;
  const result = await chatComplete({
    model: bot.chatModel,
    system: bot.preProcessSystem,
    user: userMessage,
    temperature: V0_RAG_DEFAULTS.REWRITE_TEMPERATURE,
    maxTokens: V0_RAG_DEFAULTS.REWRITE_MAX_TOKENS,
  });
  const tokens: PreProcessTokens = {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };
  const parsed = parsePreProcessOutput(result.text);
  if (!parsed) {
    // Defensive: malformed output → assume search with the original query so
    // we still produce a useful response.
    return { kind: 'search', query: original, ...tokens };
  }
  return { ...parsed, ...tokens };
}

// ---------------------------------------------------------------------------
// HyDE — Hypothetical Document Embeddings.
// Genereer een hypothetisch antwoord op de vraag (kan onzin bevatten), embed
// dat antwoord ipv (of naast) de vraag. Werkt vaak beter dan vraag-embedding
// omdat hypothetische antwoorden lijken op de echte chunks in de corpus.
// ---------------------------------------------------------------------------

/**
 * HyDE-modus die per query gekozen kan worden via UI-toggle of eval-script.
 * 'auto' = volg bot-versie config, anders override (wint altijd, ook over
 * bots waar useHyDE=false in config staat — dat is bewust voor evaluatie).
 */
export type HydeModeRequest = 'auto' | 'off' | 'upfront' | 'selective';
export type HydeModeResolved = 'off' | 'upfront' | 'selective';

const HYDE_MODE_VALUES: readonly HydeModeRequest[] = ['auto', 'off', 'upfront', 'selective'];
export function isHydeModeRequest(v: unknown): v is HydeModeRequest {
  return typeof v === 'string' && (HYDE_MODE_VALUES as readonly string[]).includes(v);
}

/**
 * Leid de feitelijke HyDE-modus af. Bij 'auto' (default) volgt bot-config:
 * useHyDE=false → 'off', useHyDE+selective → 'selective', useHyDE only →
 * 'upfront'. Bij elke andere waarde wint de override.
 */
export function resolveHydeMode(
  bot: BotConfig,
  override?: HydeModeRequest,
): HydeModeResolved {
  if (override && override !== 'auto') return override;
  if (!bot.useHyDE) return 'off';
  return bot.selectiveHyDE ? 'selective' : 'upfront';
}

const HYDE_SYSTEM = `Je bent een hypothese-generator voor een vector-zoekmachine.

Schrijf een KORTE, plausibel klinkende paragraaf (2-4 zinnen) die de gebruikersvraag zou kunnen beantwoorden — alsof je de informatie uit een bedrijfsdocument citeert. De inhoud mag verzonnen zijn, het doel is alleen dat de schrijfstijl en het onderwerp lijken op echte bron-documenten.

Geef ALLEEN de paragraaf — geen uitleg, geen aanhalingstekens.`;

async function generateHydeDocument(
  query: string,
  bot: BotConfig,
): Promise<{ hypothetical: string; inputTokens: number; outputTokens: number; costUsd: number }> {
  const result = await chatComplete({
    model: bot.chatModel,
    system: HYDE_SYSTEM,
    user: query,
    temperature: 0.5,
    maxTokens: 200,
  });
  const text = stripQuotes(result.text).slice(0, 1500);
  return {
    hypothetical: text || query,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };
}

// ---------------------------------------------------------------------------
// Query decomposition — split samengestelde vragen in atomaire sub-queries.
// "Wat is de prijs en levertijd?" → ["Wat is de prijs?", "Wat is de levertijd?"]
// Eenvoudige vragen geven [originele query] terug.
// ---------------------------------------------------------------------------
const DECOMP_SYSTEM = `Je splitst samengestelde vragen in losse deelvragen.

Regels:
- Als de vraag MEERDERE onafhankelijke informatie-verzoeken bevat, geef ze één per regel terug.
- Als de vraag ÉÉN verzoek is, geef alleen die ene vraag terug.
- Behoud de oorspronkelijke woordkeuze zoveel mogelijk — herformuleer alleen als dat helpt.
- Geef ALLEEN de deelvragen — geen nummering, geen uitleg.

Voorbeelden:
"Wat is de prijs en hoe lang duurt levering?" →
Wat is de prijs?
Hoe lang duurt levering?

"Wat doet ChatManta?" →
Wat doet ChatManta?`;

async function decomposeQuery(
  query: string,
  bot: BotConfig,
): Promise<{ subQueries: string[]; inputTokens: number; outputTokens: number; costUsd: number }> {
  const result = await chatComplete({
    model: bot.chatModel,
    system: DECOMP_SYSTEM,
    user: query,
    temperature: 0.2,
    maxTokens: 200,
  });
  const lines = result.text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .map((l) => stripQuotes(l))
    .filter((l) => l.length > 0 && l.length < 500);
  const subQueries = lines.length > 0 ? lines : [query];
  return {
    subQueries,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };
}

// ---------------------------------------------------------------------------
// Hybrid retrieve — combineert vector similarity met keyword-search via
// match_chunks_hybrid RPC (RRF-fusion in SQL).
// ---------------------------------------------------------------------------
async function retrieveChunksHybrid(
  queryVector: number[],
  queryText: string,
  topK: number,
  /** v0.4: hydrateer parent_content na de hybrid-fusion (RPC kent geen parent join). */
  withParents = false,
  /** v0.4 multi-org: scope retrieval naar deze org. Default DEV_ORG voor backward compat. */
  organizationId: string = DEV_ORG_ID,
): Promise<RetrievedChunk[]> {
  const sb = supabase();
  const { data, error } = await sb.rpc('match_chunks_hybrid', {
    p_organization_id: organizationId,
    query_embedding: queryVector,
    query_text: queryText,
    match_count: topK,
  });
  if (error) {
    // Fallback: als hybrid RPC ontbreekt (migratie 0004 niet toegepast),
    // val terug op vanilla vector search zodat de app blijft werken.
    console.warn('[hybrid] RPC failed, falling back to vector-only:', error.message);
    return retrieveChunks(queryVector, topK, withParents, organizationId);
  }
  type HybridRow = RawChunk & { combined_score: number; keyword_score: number };
  const rows = (data ?? []) as HybridRow[];
  if (rows.length === 0) return [];

  // Hydrate filenames (zelfde als retrieveChunks).
  const sb2 = supabase();
  const docIds = Array.from(
    new Set(rows.map((c) => c.document_id).filter((v): v is string => !!v)),
  );
  let docNameMap = new Map<string, string>();
  if (docIds.length > 0) {
    const { data: docs } = await sb2.from('documents').select('id, filename').in('id', docIds);
    docNameMap = new Map((docs ?? []).map((d) => [d.id as string, d.filename as string]));
  }
  // Hybrid RPC retourneert geen parent_chunk_id; haal die op uit document_chunks
  // als withParents aanstaat. Eén batch query — minimale latency.
  let parentIdMap = new Map<string, string | null>();
  if (withParents && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { data: parentRows, error: parentErr } = await sb2
      .from('document_chunks')
      .select('id, parent_chunk_id')
      .in('id', ids);
    if (parentErr) {
      console.warn('[parent lookup via hybrid] failed:', parentErr.message);
    } else {
      parentIdMap = new Map(
        (parentRows ?? []).map((r) => [r.id as string, (r.parent_chunk_id as string | null) ?? null]),
      );
    }
  }
  const hydrated: RetrievedChunk[] = rows.map((c) => ({
    ...c,
    filename: c.document_id ? docNameMap.get(c.document_id) ?? null : null,
    parent_chunk_id: withParents ? parentIdMap.get(c.id) ?? null : c.parent_chunk_id ?? null,
    // parent_content is undefined hier — wordt door hydrateParentContent gevuld.
  }));
  if (withParents) await hydrateParentContent(hydrated);
  return hydrated;
}

// ---------------------------------------------------------------------------
// Answer cache — embedding-based near-duplicate lookup. Hit threshold ~0.97.
//
// V0.4 latency-werk: we roepen de RPC nu met min_similarity=0 aan en filteren
// de threshold in TS, zodat we bij een miss alsnog de top-1 similarity kunnen
// loggen. Eerste latency-analyse vond 0/17 hits in productie inclusief 3×
// dezelfde vraag — zonder best-sim-log is niet te zien of dat door (a) lege
// cache, (b) te streng threshold, of (c) andere oorzaak komt.
// ---------------------------------------------------------------------------
// v0.5 — 0.97 was te streng (test-set 17 vragen → 0 hits). 0.93 = "zelfde
// vraag-ish" volgens text-embedding-3-small op NL-tekst. Bij regressie
// (false-hits) snel terug naar 0.95. Hit + miss top-1-sim wordt nu beide
// gelogd zodat we de optimale waarde later op echte data kunnen bisecten.
const CACHE_HIT_THRESHOLD = 0.93;

async function lookupCachedAnswer(
  queryVector: number[],
  botVersion: string,
  organizationId: string = DEV_ORG_ID,
): Promise<ChatResponse | null> {
  const sb = supabase();
  const { data, error } = await sb.rpc('lookup_cached_answer', {
    p_organization_id: organizationId,
    p_bot_version: botVersion,
    query_embedding: queryVector,
    min_similarity: 0,
  });
  if (error) {
    console.warn('[cache] lookup failed:', error.message);
    return null;
  }
  const top = (data ?? [])[0] as { id: string; response_json: ChatResponse; similarity: number } | undefined;
  if (!top) {
    console.info(`[cache] miss — no candidates org=${organizationId} ver=${botVersion}`);
    return null;
  }
  if (top.similarity < CACHE_HIT_THRESHOLD) {
    console.info(
      `[cache] miss — best_sim=${top.similarity.toFixed(3)} (need ≥${CACHE_HIT_THRESHOLD}) org=${organizationId} ver=${botVersion}`,
    );
    return null;
  }
  console.info(
    `[cache] HIT — top_sim=${top.similarity.toFixed(3)} (≥${CACHE_HIT_THRESHOLD}) org=${organizationId} ver=${botVersion} id=${top.id}`,
  );
  // Bump hit_count fire-and-forget.
  sb.from('answer_cache')
    .update({ hit_count: undefined, last_hit_at: new Date().toISOString() })
    .eq('id', top.id)
    .then(() => undefined);
  return top.response_json;
}

async function writeCachedAnswer(
  question: string,
  queryVector: number[],
  botVersion: string,
  response: ChatResponse,
  organizationId: string = DEV_ORG_ID,
): Promise<void> {
  try {
    const sb = supabase();
    await sb.from('answer_cache').insert({
      organization_id: organizationId,
      bot_version: botVersion,
      question,
      question_embedding: queryVector,
      response_json: response,
    });
  } catch (err) {
    console.warn('[cache] write failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Multi-query expansion — generate N variant search queries via one LLM call.
// Returns the variants (always includes the original as one of them) plus the
// LLM call's tokens/cost. Defensive parser tolerates numbered, bulleted, or
// plain-line outputs.
// ---------------------------------------------------------------------------
const MULTI_QUERY_SYSTEM = `Je bent een zoekvragen-expander. Je krijgt één zoekvraag in en geeft N alternatieve formuleringen terug die hetzelfde willen vinden, maar in verschillende bewoordingen, opdat een vector-search meer kans heeft om relevante fragmenten op te halen.

Regels:
- Gebruik synoniemen, andere zinsconstructies, of een andere kijk-hoek.
- Behoud de oorspronkelijke INTENTIE — vraag niets nieuws.
- Geef ALLEEN de varianten — één per regel, geen nummering, geen aanhalingstekens, geen uitleg.`;

async function generateMultiQueries(
  baseQuery: string,
  count: number,
  bot: BotConfig,
): Promise<{ queries: string[]; inputTokens: number; outputTokens: number; costUsd: number }> {
  if (count <= 1) {
    return { queries: [baseQuery], inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
  const result = await chatComplete({
    model: bot.chatModel,
    system: MULTI_QUERY_SYSTEM,
    user: `Geef ${count - 1} alternatieve formuleringen van deze zoekvraag (één per regel):\n\n${baseQuery}`,
    temperature: 0.5,
    maxTokens: 300,
  });
  // Parse one query per line, strip bullets/numbering/quotes.
  const lines = result.text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .map((l) => l.replace(/^["'„](.+)["'"]$/, '$1').trim())
    .filter((l) => l.length > 0 && l.length < 500);
  // Always start with the base query so even malformed output is useful.
  const seen = new Set<string>([baseQuery.toLowerCase()]);
  const queries: string[] = [baseQuery];
  for (const l of lines) {
    const key = l.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(l);
    if (queries.length >= count) break;
  }
  return {
    queries,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };
}

// ---------------------------------------------------------------------------
// V0.3 structured-output parser — extract <thinking>, <answer>, <confidence>
// uit een (mogelijk gedeeltelijke) tekst. Tolerant voor missende tags.
// ---------------------------------------------------------------------------
export type ParsedV03Output = {
  thinking: string | null;
  answer: string;
  confidence: number | null;
};

export function parseV03Output(raw: string): ParsedV03Output {
  const thinkingMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const answerMatch = raw.match(/<answer>([\s\S]*?)(?:<\/answer>|$)/i);
  const confMatch = raw.match(/<confidence>\s*([0-9]*\.?[0-9]+)/i);

  let answer = answerMatch?.[1]?.trim() ?? '';
  // Als geen <answer>-tag aanwezig is, val terug op alles na </thinking>
  // of op de hele tekst — defensief tegen modellen die het format negeren.
  if (!answerMatch) {
    if (thinkingMatch) {
      answer = raw.slice(raw.indexOf('</thinking>') + 11).trim();
      // Strip eventuele <confidence>... aan het einde.
      answer = answer.replace(/<confidence>[\s\S]*$/i, '').trim();
    } else {
      answer = raw.replace(/<confidence>[\s\S]*$/i, '').trim();
    }
  }

  const confidence = confMatch ? Number.parseFloat(confMatch[1]) : null;
  return {
    thinking: thinkingMatch?.[1]?.trim() ?? null,
    answer,
    confidence: confidence !== null && Number.isFinite(confidence) ? confidence : null,
  };
}

// ---------------------------------------------------------------------------
// Follow-up question generator — produceert 2-3 logische vervolgvragen op
// basis van de zojuist gegeven antwoord. Gebruikt voor "Suggested follow-ups"
// chips in de UI.
// ---------------------------------------------------------------------------
const FOLLOWUP_SYSTEM = `Je krijgt een vraag-antwoord-paar te zien. Bedenk 2 of 3 logische vervolgvragen die de gebruiker waarschijnlijk daarna wil stellen.

Regels:
- Houd elke vervolgvraag kort (max ~10 woorden).
- Verschillend van de oorspronkelijke vraag.
- Sluit aan op het besproken onderwerp.
- Geef ALLEEN de vragen — één per regel, geen nummering, geen uitleg.`;

async function generateFollowUps(
  question: string,
  answer: string,
  bot: BotConfig,
): Promise<{ followUps: string[]; inputTokens: number; outputTokens: number; costUsd: number }> {
  const result = await chatComplete({
    model: bot.chatModel,
    system: FOLLOWUP_SYSTEM,
    user: `Vraag: ${question}\n\nAntwoord: ${answer}\n\nVervolgvragen:`,
    temperature: 0.6,
    maxTokens: 150,
  });
  const lines = result.text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .map((l) => stripQuotes(l))
    .filter((l) => l.length > 0 && l.length < 200);
  return {
    followUps: lines.slice(0, 3),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };
}

// ---------------------------------------------------------------------------
// LLM-based rerank — given the question + N candidate chunks, return their
// indices in best-to-worst order. Used to improve precision when multi-query
// has flooded the candidate pool with weak hits.
// ---------------------------------------------------------------------------
const RERANK_SYSTEM = `Je rangschikt fragmenten op relevantie. Je krijgt een vraag en genummerde fragmenten. Geef de nummers terug in volgorde van MEEST naar MINST relevant, gescheiden door komma's. Geen uitleg, geen nummering, alleen de getallen. Voorbeeld output: 3, 1, 5, 2, 4`;

async function rerankChunks(
  question: string,
  chunks: RetrievedChunk[],
  topN: number,
  bot: BotConfig,
): Promise<{ ranked: RetrievedChunk[]; inputTokens: number; outputTokens: number; costUsd: number }> {
  if (chunks.length <= 1 || topN >= chunks.length) {
    return { ranked: chunks.slice(0, topN), inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
  const numbered = chunks
    .map((c, i) => `[${i + 1}] ${c.content.slice(0, 300).replace(/\s+/g, ' ').trim()}`)
    .join('\n\n');

  const result = await chatComplete({
    model: bot.chatModel,
    system: RERANK_SYSTEM,
    user: `Vraag: ${question}\n\nFragmenten:\n${numbered}\n\nGeef de top ${topN} fragmenten op relevantie:`,
    temperature: 0.0,
    maxTokens: 100,
  });

  // Parse "3, 1, 5, 2" → [2, 0, 4, 1] (0-based indices into chunks)
  const indices = result.text
    .split(/[,\s]+/)
    .map((s) => Number.parseInt(s, 10) - 1)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < chunks.length);

  // Dedup while preserving order; if parser failed (no valid indices), fall
  // back to the original similarity order.
  const seen = new Set<number>();
  const ordered: RetrievedChunk[] = [];
  for (const idx of indices) {
    if (seen.has(idx)) continue;
    seen.add(idx);
    ordered.push(chunks[idx]);
    if (ordered.length >= topN) break;
  }
  // If reranker ignored some chunks, append them at the back so we still
  // return up to topN.
  if (ordered.length < topN) {
    for (let i = 0; i < chunks.length && ordered.length < topN; i++) {
      if (!seen.has(i)) ordered.push(chunks[i]);
    }
  }

  return {
    ranked: ordered,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };
}

// ---------------------------------------------------------------------------
// match_chunks RPC + JOIN with documents for filenames
// ---------------------------------------------------------------------------
type RawChunk = {
  id: string;
  document_id: string | null;
  website_page_id: string | null;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  /** v0.4 parent-document retrieval — null als chunk geen parent heeft (oude ingest). */
  parent_chunk_id?: string | null;
  parent_content?: string | null;
};

export type RetrievedChunk = RawChunk & { filename: string | null };

async function retrieveChunks(
  queryVector: number[],
  topK: number,
  /** v0.4: gebruik match_chunks_with_parents zodat parent_content meekomt. */
  withParents = false,
  /** v0.4 multi-org: scope retrieval naar deze org. Default DEV_ORG voor backward compat. */
  organizationId: string = DEV_ORG_ID,
): Promise<RetrievedChunk[]> {
  const sb = supabase();
  const rpcName = withParents ? 'match_chunks_with_parents' : 'match_chunks';
  const { data, error } = await sb.rpc(rpcName, {
    p_organization_id: organizationId,
    query_embedding: queryVector,
    match_count: topK,
  });
  if (error) throw new Error(`${rpcName}: ${error.message}`);

  const raw = (data ?? []) as RawChunk[];
  if (raw.length === 0) return [];

  // Hydrate filename via single batch query op documents.
  const docIds = Array.from(
    new Set(raw.map((c) => c.document_id).filter((v): v is string => !!v)),
  );
  let docNameMap = new Map<string, string>();
  if (docIds.length > 0) {
    const { data: docs, error: docsErr } = await sb
      .from('documents')
      .select('id, filename')
      .in('id', docIds);
    if (docsErr) throw new Error(`documents lookup: ${docsErr.message}`);
    docNameMap = new Map((docs ?? []).map((d) => [d.id as string, d.filename as string]));
  }

  return raw.map((c) => ({
    ...c,
    filename: c.document_id ? docNameMap.get(c.document_id) ?? null : null,
  }));
}

/**
 * v0.4 parent-document retrieval helper — given chunks die mogelijk een
 * parent_chunk_id hebben maar geen parent_content (omdat ze via de hybrid-RPC
 * binnenkwamen die geen parent join doet), batch-fetch alle parents en vul
 * parent_content in. Chunks zonder parent_chunk_id blijven onaangeroerd.
 */
async function hydrateParentContent(chunks: RetrievedChunk[]): Promise<void> {
  const needsHydration = chunks.filter(
    (c) => c.parent_chunk_id && c.parent_content === undefined,
  );
  if (needsHydration.length === 0) return;
  const parentIds = Array.from(new Set(needsHydration.map((c) => c.parent_chunk_id as string)));
  const sb = supabase();
  const { data, error } = await sb
    .from('parent_chunks')
    .select('id, content')
    .in('id', parentIds);
  if (error) {
    // Niet fataal — fall-back: chunk content gebruikt zoals eerst.
    console.warn('[parent_chunks] hydrate failed:', error.message);
    for (const c of needsHydration) c.parent_content = null;
    return;
  }
  const byId = new Map((data ?? []).map((r) => [r.id as string, r.content as string]));
  for (const c of needsHydration) {
    c.parent_content = byId.get(c.parent_chunk_id as string) ?? null;
  }
}

// ---------------------------------------------------------------------------
// runRagQuery — public entrypoint for chat server action
// ---------------------------------------------------------------------------
export type ChatSource = {
  /** chunk-id — gebruikt door claim-verification UI om claims naar hun
      best-matching bron-chunk te linken. Optioneel zodat oude gecachte
      responses zonder id-veld blijven werken. */
  id?: string;
  filename: string | null;
  similarity: number;
  /** Small-chunk excerpt (~240 chars) — gebruikt voor precision-highlighting
      in de UI ("welke zin precies matchte"). Blijft de "kern-match" indicator. */
  contentExcerpt: string;
  /**
   * v0.5: Parent-chunk excerpt (~800 chars) — wat de answer-LLM daadwerkelijk
   * als context kreeg (mits parent-document retrieval aanstond én de chunk een
   * parent had). Null wanneer de chunk geen parent_chunk_id heeft of de
   * parent-content niet gehydrateerd kon worden. De judge in eval.ts en de
   * sources-tab in de UI prefereren dit veld boven contentExcerpt om
   * eerlijk te beoordelen wat de LLM zag.
   */
  parentExcerpt?: string | null;
};

export type ChatRewriteInfo = {
  original: string;
  rewritten: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

type BaseChatResponse = {
  /** Bot version that produced this response. */
  botVersion: string;
  /** Tone toggle waarmee deze response gegenereerd is. */
  tone: Tone;
  /** Length toggle waarmee deze response gegenereerd is. */
  length: Length;
};

/** Per-claim verification result (v0.4 feature 3). Compact structure voor extras. */
export type ClaimVerificationData = {
  index: number;
  text: string;
  verified: boolean;
  bestSimilarity: number;
  bestChunkId: string | null;
};

/** Optionele v0.3+ velden die extra context over het antwoord geven. */
export type V03Extras = {
  /** Confidence 0..1 zoals gerapporteerd door het antwoord-model. */
  confidence?: number;
  /** Werd cascading toegepast (regenerate met sterker model)? */
  cascadeUsed?: boolean;
  /** Suggested follow-up questions voor de UI. */
  followUps?: string[];
  /** Cache hit (geen pipeline gerund)? */
  fromCache?: boolean;
  /** Gebruikte sub-queries na decomposition. */
  subQueries?: string[];
  /** HyDE hypothetisch document (voor inspectie). */
  hydeDocument?: string;
  /** v0.4: top-1 cosine similarity uit eerste retrieve (vóór threshold filter). */
  top1Sim?: number | null;
  /** v0.4: werd selective HyDE daadwerkelijk getriggerd? */
  hydeTriggered?: boolean;
  /** v0.4: parent-document retrieval gebruikt (chunk → parent context substituut). */
  parentDocUsed?: boolean;
  /** v0.4: per-claim verification (alleen aanwezig als bot.claimVerification aan stond). */
  claims?: ClaimVerificationData[];
  /** v0.4: aggregate verified-ratio (0..1). NaN als 0 claims gefilterd uit antwoord. */
  claimConfidence?: number;
  /** v0.4: drempel die gebruikt is voor verified-flag (uit bot config). */
  claimVerificationThreshold?: number;
  /**
   * v0.4 latency profiling: per-fase timings in ms, plus total. Wordt door
   * log.ts gemapped naar query_log.{embedding_ms,retrieval_ms,rerank_ms,
   * generation_ms,total_ms} kolommen plus phase_timings_ms (jsonb).
   */
  phaseTimingsMs?: PhaseTimings;
  /**
   * v0.5: route-category van het antwoord. 'search' = normale RAG-answer met
   * sources. 'general' = re-classifier zei "algemene kennis" en we hebben een
   * disclaimer-antwoord gegenereerd zonder retrieval. Wordt gelogd in
   * query_log.category zodat eval/UI weten welk pad de query nam.
   *
   * 'off_topic' en 'smalltalk' verschijnen NIET hier — die zijn aparte
   * ChatResponse.kind-waarden ('fallback' resp. 'smalltalk').
   */
  category?: 'search' | 'general';
  /**
   * v0.5: latency-budget telemetrie. Aanwezig wanneer minimaal één optionele
   * fase werd overgeslagen omdat de cumulative elapsed time de
   * bot.latencyBudgetMs drempel passeerde. Veld leeg/afwezig = budget niet
   * overschreden (= geen skip).
   */
  latencyBudgetExceeded?: {
    /** Cumulative elapsed time in ms toen de eerste skip plaatsvond. */
    elapsed: number;
    /** Budget-drempel in ms (= bot.latencyBudgetMs op moment van de run). */
    budgetMs: number;
    /** Lijst van fase-namen die zijn overgeslagen (volgorde = chronologisch). */
    skipped: string[];
  };
};

/** v0.4 latency telemetrie. Alle waarden afgerond naar hele ms. */
export type PhaseTimings = {
  preprocess_ms?: number;
  cache_lookup_ms?: number;
  decompose_ms?: number;
  hyde_ms?: number;
  expand_ms?: number;
  embedding_ms: number;
  retrieval_ms: number;
  rerank_ms?: number;
  generation_ms: number;
  verify_ms?: number;
  followups_ms?: number;
  cascade_ms?: number;
  total_ms: number;
};

export type ChatResponse =
  | (BaseChatResponse & {
      kind: 'smalltalk';
      answer: string;
      preProcessTokens: { in: number; out: number };
      totalCostUsd: number;
    })
  | (BaseChatResponse & {
      kind: 'answer';
      answer: string;
      rewrite: ChatRewriteInfo | null;
      sources: ChatSource[];
      threshold: number;
      embedTokens: number;
      chatInputTokens: number;
      chatOutputTokens: number;
      totalCostUsd: number;
      extras?: V03Extras;
    })
  | (BaseChatResponse & {
      kind: 'fallback';
      answer: string;
      reason: string;
      topSimilarity: number | null;
      rewrite: ChatRewriteInfo | null;
      sources: ChatSource[];
      threshold: number;
      embedTokens: number;
      totalCostUsd: number;
    });

const EXCERPT_CHARS = 240;
const PARENT_EXCERPT_CHARS = 800;

function toSource(c: RetrievedChunk): ChatSource {
  const contentExcerpt =
    c.content.length > EXCERPT_CHARS
      ? c.content.slice(0, EXCERPT_CHARS).trimEnd() + '…'
      : c.content;
  // Parent-content is alleen aanwezig als bot.parentDocumentRetrieval=true
  // EN de chunk een gehydrateerde parent had. In de huidige codebase wordt
  // parent_content op de RetrievedChunk gezet door retrieveChunks(withParents)
  // / retrieveChunksHybrid(withParents) of door hydrateParentContent() (zie
  // regel ~768). Null of undefined → we slaan parentExcerpt over zodat oude
  // responses (zonder dit veld) backward-compat blijven.
  let parentExcerpt: string | null | undefined = undefined;
  if (typeof c.parent_content === 'string' && c.parent_content.length > 0) {
    parentExcerpt =
      c.parent_content.length > PARENT_EXCERPT_CHARS
        ? c.parent_content.slice(0, PARENT_EXCERPT_CHARS).trimEnd() + '…'
        : c.parent_content;
  } else if (c.parent_content === null) {
    parentExcerpt = null;
  }
  return {
    id: c.id,
    filename: c.filename,
    similarity: c.similarity,
    contentExcerpt,
    ...(parentExcerpt !== undefined ? { parentExcerpt } : {}),
  };
}

export async function runRagQuery({
  question,
  threshold,
  enableRewrite,
  bot,
  tone = DEFAULT_TONE,
  length = DEFAULT_LENGTH,
}: {
  question: string;
  threshold: number;
  enableRewrite: boolean;
  bot: BotConfig;
  tone?: Tone;
  length?: Length;
}): Promise<ChatResponse> {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('threshold must be in [0, 1]');
  }
  const original = question.trim();
  if (original.length === 0) throw new Error('question is empty');
  if (original.length > 1000) throw new Error('question too long (max 1000 chars)');

  const styledSystemPrompt = buildSystemPrompt(bot.systemPrompt, { tone, length });

  // 1. Optional pre-processor — classifies smalltalk vs search and rewrites
  //    the query in one shot. Smalltalk is answered immediately without any
  //    retrieval (the assistant should be able to say "hoi" without searching
  //    the knowledge base).
  let rewriteInfo: ChatRewriteInfo | null = null;
  let queryForEmbed = original;
  if (enableRewrite) {
    const pp = await preProcessInput(original, bot);
    if (pp.kind === 'smalltalk') {
      return {
        botVersion: bot.version,
        tone,
        length,
        kind: 'smalltalk',
        answer: pp.reply,
        preProcessTokens: { in: pp.inputTokens, out: pp.outputTokens },
        totalCostUsd: pp.costUsd,
      };
    }
    rewriteInfo = {
      original,
      rewritten: pp.query,
      inputTokens: pp.inputTokens,
      outputTokens: pp.outputTokens,
      costUsd: pp.costUsd,
    };
    queryForEmbed = pp.query;
  }

  // 2. Optional multi-query expansion. Cost: extra LLM call when count > 1.
  const mq = await generateMultiQueries(queryForEmbed, bot.multiQueryCount, bot);
  const expansionCost = mq.costUsd;

  // 3. Embed all queries (1 OpenAI call, batched).
  const { vectors, tokens: embedTokens, costUsd: embedCost } = await embedTexts(mq.queries);

  // 4. Retrieve per query, then dedup on chunk id keeping the highest
  //    similarity seen across queries.
  const bestById = new Map<string, RetrievedChunk>();
  for (const v of vectors) {
    const hits = await retrieveChunks(v, V0_RAG_DEFAULTS.TOP_K);
    for (const h of hits) {
      const prev = bestById.get(h.id);
      if (!prev || h.similarity > prev.similarity) bestById.set(h.id, h);
    }
  }
  const merged = [...bestById.values()].sort((a, b) => b.similarity - a.similarity);
  const allSources = merged.map(toSource);
  const topSim = merged[0]?.similarity ?? null;

  // 5. Threshold filter.
  const aboveThreshold = merged.filter((c) => c.similarity >= threshold);
  const rewriteCost = rewriteInfo?.costUsd ?? 0;
  if (aboveThreshold.length === 0) {
    return {
      botVersion: bot.version,
      tone,
      length,
      kind: 'fallback',
      answer: FALLBACK_MESSAGE,
      reason: `Geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}).`,
      topSimilarity: topSim,
      rewrite: rewriteInfo,
      sources: allSources,
      threshold,
      embedTokens,
      totalCostUsd: embedCost + rewriteCost + expansionCost,
    };
  }

  // 6. Optional LLM rerank — pick the best TOP_K from the above-threshold pool.
  let rerankCost = 0;
  let rerankInputTokens = 0;
  let rerankOutputTokens = 0;
  let final: RetrievedChunk[] = aboveThreshold.slice(0, V0_RAG_DEFAULTS.TOP_K);
  if (bot.rerank === 'llm' && aboveThreshold.length > 1) {
    const r = await rerankChunks(original, aboveThreshold, V0_RAG_DEFAULTS.TOP_K, bot);
    final = r.ranked;
    rerankCost = r.costUsd;
    rerankInputTokens = r.inputTokens;
    rerankOutputTokens = r.outputTokens;
  }

  // 7. Format context (cap at MAX_CONTEXT_CHARS).
  let context = '';
  let used = 0;
  for (const c of final) {
    const block = `[chunk ${used + 1}, similarity=${c.similarity.toFixed(3)}]\n${c.content}\n\n`;
    if (context.length + block.length > V0_RAG_DEFAULTS.MAX_CONTEXT_CHARS) break;
    context += block;
    used++;
  }
  // Use the ORIGINAL question in the answer prompt — model should answer the
  // user's actual question, not the rewritten search-query form. The rewrite
  // is purely an embedding-time tactic.
  const userPrompt = `CONTEXT:\n${context.trim()}\n\nVRAAG: ${original}`;

  // 8. LLM call.
  const chat = await chatComplete({
    model: bot.chatModel,
    system: styledSystemPrompt,
    user: userPrompt,
    temperature: bot.chatTemperature,
  });

  return {
    botVersion: bot.version,
    tone,
    length,
    kind: 'answer',
    answer: chat.text.trim(),
    rewrite: rewriteInfo,
    sources: final.slice(0, used).map(toSource),
    threshold,
    embedTokens,
    chatInputTokens: chat.inputTokens + rerankInputTokens,
    chatOutputTokens: chat.outputTokens + rerankOutputTokens,
    totalCostUsd: embedCost + chat.costUsd + rewriteCost + expansionCost + rerankCost,
  };
}

// ---------------------------------------------------------------------------
// runRagQueryStreaming — same pipeline, but yields incremental events so the
// route handler can stream them as NDJSON. The final event always carries
// the complete ChatResponse so the route can log it after streaming is done.
// ---------------------------------------------------------------------------
/** Pipeline-fase events voor UI-feedback tijdens de pre-streaming fase. */
export type PipelinePhase =
  | 'cache'
  | 'preprocess'
  | 'decompose'
  | 'hyde'
  | 'expand'
  | 'embed'
  | 'retrieve'
  | 'rerank'
  | 'answer'
  | 'reflect'
  | 'cascade'
  | 'followups'
  | 'verify';

export type StreamEvent =
  | { kind: 'status'; phase: PipelinePhase }
  | { kind: 'smalltalk'; response: ChatResponse }
  | { kind: 'fallback'; response: ChatResponse }
  | {
      kind: 'answer-start';
      botVersion: string;
      sources: ChatSource[];
      rewrite: ChatRewriteInfo | null;
      threshold: number;
    }
  | { kind: 'answer-delta'; text: string }
  | { kind: 'answer-done'; response: ChatResponse }
  // V0.4: followups draaien nu ná answer-done zodat de gebruiker het antwoord
  // direct ziet i.p.v. ~0.8s te wachten. Dit event levert de followUps na
  // (samen met de extra token/cost-deltas die nog niet in answer-done zaten).
  // V0.5: error-veld optioneel — gevuld bij timeout of LLM-fout zodat
  // monitoring de failure-mode kan onderscheiden van "nooit aangeroepen".
  | {
      kind: 'followups-done';
      followUps: string[];
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      error?: string;
    }
  // V0.4: finale phaseTimingsMs nadat followups_ms is gemeten. Consumer moet
  // hierop wachten vóór logQuery anders mist query_log de followups-fase.
  | { kind: 'metrics-done'; phaseTimingsMs: PhaseTimings }
  // V0.5 claim-regenerate: bij verifiedRatio < bot.claimRegenerateThreshold
  // draaien we een tweede answer-LLM-call met stricter prompt. Het resultaat
  // vervangt de eerder gestreamede answer in de UI. Wordt tussen answer-done
  // en metrics-done geyield (cache-write krijgt het regenerate-antwoord).
  | {
      kind: 'replacement';
      response: ChatResponse;
      reason: 'claim-regenerate';
      regeneratedVerifiedRatio: number | null;
    }
  | { kind: 'error'; message: string };

export async function* runRagQueryStreaming(input: {
  question: string;
  threshold: number;
  enableRewrite: boolean;
  bot: BotConfig;
  history?: ChatHistoryTurn[];
  tone?: Tone;
  length?: Length;
  /** v0.4 multi-org: scope retrieval+cache naar deze org. Default DEV_ORG. */
  organizationId?: string;
  /**
   * Per-query HyDE-modus override (v0.5 evaluatie-toggle). 'auto' of undefined
   * = volg bot-config. Override wint altijd, ook over bots met useHyDE=false.
   */
  hydeModeOverride?: HydeModeRequest;
}): AsyncGenerator<StreamEvent, void, void> {
  const { threshold, enableRewrite, bot } = input;
  const tone: Tone = input.tone ?? DEFAULT_TONE;
  const length: Length = input.length ?? DEFAULT_LENGTH;
  const orgId = input.organizationId ?? DEV_ORG_ID;
  const hydeModeRequested: HydeModeRequest = input.hydeModeOverride ?? 'auto';
  const hydeModeActual: HydeModeResolved = resolveHydeMode(bot, hydeModeRequested);
  const history = (input.history ?? []).slice(-MAX_HISTORY_TURNS);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    yield { kind: 'error', message: 'threshold must be in [0, 1]' };
    return;
  }
  const original = input.question.trim();
  if (original.length === 0) {
    yield { kind: 'error', message: 'question is empty' };
    return;
  }
  if (original.length > 1000) {
    yield { kind: 'error', message: 'question too long (max 1000 chars)' };
    return;
  }

  // v0.4 latency profiling: t0 = pipeline-start. Per-fase delta's worden
  // hieronder gecapture-d via tMark() helper en opgeteld in `timings`.
  const tPipelineStart = performance.now();
  const timings: Partial<PhaseTimings> = {};
  const tMark = (key: keyof PhaseTimings) => {
    const start = performance.now();
    return () => {
      const dt = Math.round(performance.now() - start);
      timings[key] = ((timings[key] as number | undefined) ?? 0) + dt;
    };
  };
  // V0.5 latency-budgeting: bij bot.latencyBudgetEnabled wordt elke optionele
  // fase pas uitgevoerd als de cumulative elapsed onder bot.latencyBudgetMs
  // zit. Skipped fases worden gelogd in `skippedPhases` (komt mee in extras).
  // Bij !latencyBudgetEnabled (v0.1-v0.4): withinBudget() retourneert altijd
  // true — gedrag identiek aan voorheen.
  const skippedPhases: string[] = [];
  const elapsedMs = (): number => Math.round(performance.now() - tPipelineStart);
  const withinBudget = (): boolean => {
    if (!bot.latencyBudgetEnabled) return true;
    return elapsedMs() < bot.latencyBudgetMs;
  };
  const markSkipped = (phase: string): false => {
    skippedPhases.push(phase);
    return false;
  };

  // Bouw de samengestelde system prompt één keer; gebruikt door main answer-call
  // en (v0.3) cascade-call. Pre-processor en helper-LLM-calls (rerank, hyde,
  // decompose, follow-ups) gebruiken hun eigen task-specifieke prompts.
  const styledSystemPrompt = buildSystemPrompt(bot.systemPrompt, { tone, length });

  // V0.4 latency: bewaar de pre-cache embed-vector op outer scope zodat we
  // hem kunnen hergebruiken bij de fire-and-forget cache-write na het
  // antwoord (zie verderop). Spaart één embed-call (~1.2s) per request waar
  // bot.cacheEnabled aan staat.
  let cacheEmbedVector: number[] | null = null;

  // 1+2. Pre-process & cache-embed — parallel.
  //
  // V0.4: preProcessInput(original) en embedTexts([original]) hangen beide
  // alleen af van `original`, niet van elkaars output. We firen ze parallel
  // om ~1s p50 te besparen (was preprocess + cache_lookup seriëel ≈ 2.1s,
  // nu max ≈ 1.1s). Smalltalk-pad: cache-embed is dan wasted work — laat de
  // promise stil aflopen via void/.catch om unhandled rejection te
  // voorkomen.
  //
  // LET OP: preprocess_ms en cache_lookup_ms timers overlappen nu in wall-
  // clock tijd, dus hun som > totaal. Gebruik total_ms voor gevoelde latency.
  let rewriteInfo: ChatRewriteInfo | null = null;
  let queryForEmbed = original;
  let preCacheEmbedTokens = 0;
  let preCacheEmbedCost = 0;

  const preProcessPromise = enableRewrite ? preProcessInput(original, bot, history) : null;
  const cacheEmbedPromise = bot.cacheEnabled ? embedTexts([original]) : null;

  if (preProcessPromise) {
    yield { kind: 'status', phase: 'preprocess' };
    const stopPp = tMark('preprocess_ms');
    const pp = await preProcessPromise;
    stopPp();
    if (pp.kind === 'smalltalk') {
      // Discard de parallel-gestarte cache-embed — voorkom unhandled rejection.
      if (cacheEmbedPromise) void cacheEmbedPromise.catch(() => undefined);
      yield {
        kind: 'smalltalk',
        response: {
          botVersion: bot.version,
          tone,
          length,
          kind: 'smalltalk',
          answer: pp.reply,
          preProcessTokens: { in: pp.inputTokens, out: pp.outputTokens },
          totalCostUsd: pp.costUsd,
        },
      };
      return;
    }
    rewriteInfo = {
      original,
      rewritten: pp.query,
      inputTokens: pp.inputTokens,
      outputTokens: pp.outputTokens,
      costUsd: pp.costUsd,
    };
    queryForEmbed = pp.query;
  }
  const rewriteCost = rewriteInfo?.costUsd ?? 0;

  // Cache lookup — embed liep al parallel met preprocess; we awaiten alleen
  // het resultaat (in de best case is hij al klaar).
  if (cacheEmbedPromise) {
    yield { kind: 'status', phase: 'cache' };
    const stopCache = tMark('cache_lookup_ms');
    const stopEmbedCache = tMark('embedding_ms');
    const cacheEmbed = await cacheEmbedPromise;
    stopEmbedCache();
    preCacheEmbedTokens = cacheEmbed.tokens;
    preCacheEmbedCost = cacheEmbed.costUsd;
    cacheEmbedVector = cacheEmbed.vectors[0];
    const cached = await lookupCachedAnswer(cacheEmbedVector, bot.version, orgId);
    stopCache();
    if (cached) {
      // Mark cache hit + return. Sources/threshold copy uit gecachte response.
      // Tone/length: gecachte rij is mogelijk geschreven onder andere stijl-
      // toggles; we accepteren mismatch (zie spec) en zetten de huidige call's
      // toggles op de response zodat logging klopt.
      const baseEnriched =
        cached.kind === 'answer'
          ? { ...cached, extras: { ...(cached.extras ?? {}), fromCache: true } }
          : cached;
      const enriched: ChatResponse = { ...baseEnriched, tone, length };
      yield {
        kind: enriched.kind === 'answer' ? 'answer-done' : enriched.kind === 'fallback' ? 'fallback' : 'smalltalk',
        response: enriched,
      } as StreamEvent;
      return;
    }
  }

  // 3. Build query set:
  //    - v0.3: query decomposition (sub-queries) + HyDE per sub-query
  //    - v0.2: multi-query expansion
  //    - v0.1: single query
  let subQueries: string[] = [queryForEmbed];
  let decomposeCost = 0;
  let decomposeInputTokens = 0;
  let decomposeOutputTokens = 0;
  if (bot.queryDecomposition && (withinBudget() || markSkipped('queryDecomposition'))) {
    yield { kind: 'status', phase: 'decompose' };
    const stopDec = tMark('decompose_ms');
    const dec = await decomposeQuery(queryForEmbed, bot);
    stopDec();
    subQueries = dec.subQueries;
    decomposeCost = dec.costUsd;
    decomposeInputTokens = dec.inputTokens;
    decomposeOutputTokens = dec.outputTokens;
  }

  let hydeCost = 0;
  let hydeInputTokens = 0;
  let hydeOutputTokens = 0;
  let hydeDoc: string | null = null;
  let hydeTriggered = false;
  const querySet: { text: string; isHyde: boolean }[] = subQueries.map((q) => ({
    text: q,
    isHyde: false,
  }));
  // HyDE-mode is afgeleid van bot-config + optionele per-query override
  // (zie resolveHydeMode). 'upfront' = altijd genereren vóór retrieve.
  // 'selective' = pas genereren als top-1 sim onder de trigger valt (zie
  // verderop). 'off' = nooit.
  if (hydeModeActual === 'upfront') {
    yield { kind: 'status', phase: 'hyde' };
    const stopHyde = tMark('hyde_ms');
    // Eén HyDE-doc voor de eerste sub-query (de "main" intent) — meerdere
    // HyDE-calls bij decompose zou cost vermenigvuldigen.
    const hyde = await generateHydeDocument(subQueries[0], bot);
    stopHyde();
    hydeDoc = hyde.hypothetical;
    hydeCost = hyde.costUsd;
    hydeInputTokens = hyde.inputTokens;
    hydeOutputTokens = hyde.outputTokens;
    hydeTriggered = true;
    querySet.push({ text: hyde.hypothetical, isHyde: true });
  }

  // Multi-query expansion (alleen bot.multiQueryCount > 1; v0.2 pad).
  let mq;
  if (bot.multiQueryCount > 1 && (withinBudget() || markSkipped('multiQueryExpand'))) {
    yield { kind: 'status', phase: 'expand' };
    const stopExp = tMark('expand_ms');
    mq = await generateMultiQueries(queryForEmbed, bot.multiQueryCount, bot);
    stopExp();
    for (const q of mq.queries.slice(1)) querySet.push({ text: q, isHyde: false });
  } else {
    mq = { queries: [], inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
  const expansionCost = mq.costUsd;

  // 4. Embed all queries (batched).
  yield { kind: 'status', phase: 'embed' };
  const stopEmbed = tMark('embedding_ms');
  const queryTexts = querySet.map((q) => q.text);
  const { vectors, tokens: embedTokens, costUsd: embedCost } = await embedTexts(queryTexts);
  stopEmbed();
  // Selective-HyDE embed wordt later optioneel toegevoegd (v0.4). Zelfde
  // vorm als de hoofd-embed; we splitsen voor logging-helderheid.
  let selectiveHyDEEmbedTokens = 0;
  let selectiveHyDEEmbedCost = 0;

  // 5. Retrieve per query (parallel). Hybrid (vector + FTS) als bot.hybridSearch,
  //    anders pure vector. HyDE-vectoren skippen FTS (hypothetisch document is
  //    geen oorspronkelijke gebruikersvraag-text — keyword search heeft daar
  //    geen waarde over). Parent-doc retrieval propagated via withParents.
  yield { kind: 'status', phase: 'retrieve' };
  const stopRetrieve = tMark('retrieval_ms');
  const withParents = bot.parentDocumentRetrieval;
  const allHits = await Promise.all(
    querySet.map((q, i) => {
      if (bot.hybridSearch && !q.isHyde) {
        return retrieveChunksHybrid(vectors[i], q.text, V0_RAG_DEFAULTS.TOP_K, withParents, orgId);
      }
      return retrieveChunks(vectors[i], V0_RAG_DEFAULTS.TOP_K, withParents, orgId);
    }),
  );
  stopRetrieve();
  const bestById = new Map<string, RetrievedChunk>();
  for (const hits of allHits) {
    for (const h of hits) {
      const prev = bestById.get(h.id);
      if (!prev || h.similarity > prev.similarity) bestById.set(h.id, h);
    }
  }
  let merged = [...bestById.values()].sort((a, b) => b.similarity - a.similarity);
  let topSim = merged[0]?.similarity ?? null;
  // Snapshot van top-1 sim NA de eerste retrieve, vóór eventuele HyDE-augment.
  // Wordt gelogd ongeacht selective HyDE (interessante baseline-metriek).
  const top1SimInitial = topSim;

  // Selective HyDE: trigger pas hier, ALS top-1 onder de drempel zat. Eén
  // HyDE generate + embed + retrieve + merge. We zoeken NIET opnieuw met de
  // andere queries (sub-queries / multi-query) want die hadden hun kans al.
  if (hydeModeActual === 'selective' && (topSim ?? 0) < bot.selectiveHyDETrigger) {
    yield { kind: 'status', phase: 'hyde' };
    const stopHydeGen = tMark('hyde_ms');
    const hyde = await generateHydeDocument(subQueries[0], bot);
    stopHydeGen();
    hydeDoc = hyde.hypothetical;
    hydeCost = hyde.costUsd;
    hydeInputTokens = hyde.inputTokens;
    hydeOutputTokens = hyde.outputTokens;
    hydeTriggered = true;

    const stopHydeEmbed = tMark('embedding_ms');
    const hydeEmbed = await embedTexts([hyde.hypothetical]);
    stopHydeEmbed();
    const stopHydeRetrieve = tMark('retrieval_ms');
    const hydeRetrieved = await retrieveChunks(
      hydeEmbed.vectors[0],
      V0_RAG_DEFAULTS.TOP_K,
      withParents,
      orgId,
    );
    stopHydeRetrieve();
    for (const h of hydeRetrieved) {
      const prev = bestById.get(h.id);
      if (!prev || h.similarity > prev.similarity) bestById.set(h.id, h);
    }
    merged = [...bestById.values()].sort((a, b) => b.similarity - a.similarity);
    topSim = merged[0]?.similarity ?? null;
    // hydeEmbed kost extra embed-tokens en cost — tel ze bij de embed-totalen.
    // (Deze worden verderop in het response object opgeteld.)
    selectiveHyDEEmbedTokens = hydeEmbed.tokens;
    selectiveHyDEEmbedCost = hydeEmbed.costUsd;
  }
  const allSources = merged.map(toSource);

  // 5. Threshold filter.
  const aboveThreshold = merged.filter((c) => c.similarity >= threshold);
  if (aboveThreshold.length === 0) {
    // V0.5: tweede-stage re-classifier wanneer bot.generalKnowledgeEnabled.
    // We weten nu dat retrieval géén relevante chunks gaf — de vraag is dus
    // ofwel algemene kennis binnen het domein (GENERAL) of buiten het domein
    // (OFF_TOPIC) of een specifiek detail dat we eerlijk niet kennen
    // (FALLBACK).
    //
    // Bij !generalKnowledgeEnabled (v0.1-v0.4) gedragen we ons exact zoals
    // voorheen: vaste FALLBACK_MESSAGE, geen LLM-call.
    if (bot.generalKnowledgeEnabled) {
      const { reclassifyAfterZeroHits } = await import('./reclassify');
      const rc = await reclassifyAfterZeroHits(original, bot);
      const reclassifyTokensIn = rc.inputTokens;
      const reclassifyTokensOut = rc.outputTokens;
      const reclassifyCost = rc.costUsd;

      if (rc.category === 'general') {
        yield { kind: 'status', phase: 'answer' };
        const generalSystem = `Je bent een professionele klantcontact-medewerker van ChatManta — een product van Jorion Solutions. De gebruiker stelt een algemene-kennis-vraag binnen ons domein (MKB, SaaS, AI, RAG, chatbots, klantcontact, ondernemerschap, marketing).

Geef een KORT antwoord — maximaal 3 zinnen — over wat dit onderwerp is. Schrijf in dezelfde taal als de vraag (default Nederlands).

BEGIN je antwoord ALTIJD met deze exacte zin: "Even kort: dit valt buiten onze specifieke documentatie, maar in het algemeen…"

EINDIG je antwoord ALTIJD met: "Wil je weten hoe ChatManta hier specifiek mee omgaat? Vraag gerust."

Geen citations, geen <thinking>-tags, geen confidence — alleen het korte vlotte antwoord. Schrijf alsof je het zelf weet.`;
        yield {
          kind: 'answer-start',
          botVersion: bot.version,
          sources: [],
          rewrite: rewriteInfo,
          threshold,
        };
        let genAccText = '';
        let genChatInputTokens = 0;
        let genChatOutputTokens = 0;
        let genChatCostUsd = 0;
        const stopGenerationGen = tMark('generation_ms');
        try {
          const stream = await openai().chat.completions.create({
            model: bot.chatModel,
            temperature: bot.chatTemperature,
            max_tokens: 200,
            stream: true,
            stream_options: { include_usage: true },
            messages: [
              { role: 'system', content: generalSystem },
              { role: 'user', content: original },
            ],
          });
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              genAccText += delta;
              yield { kind: 'answer-delta', text: delta };
            }
            if (chunk.usage) {
              genChatInputTokens = chunk.usage.prompt_tokens ?? 0;
              genChatOutputTokens = chunk.usage.completion_tokens ?? 0;
              genChatCostUsd =
                (genChatInputTokens / 1_000_000) * CHAT_INPUT_PER_M_USD +
                (genChatOutputTokens / 1_000_000) * CHAT_OUTPUT_PER_M_USD;
            }
          }
        } catch (err) {
          stopGenerationGen();
          yield {
            kind: 'error',
            message: `general-knowledge stream failed: ${err instanceof Error ? err.message : 'unknown'}`,
          };
          return;
        }
        stopGenerationGen();

        const phaseTimingsGen: PhaseTimings = {
          embedding_ms: timings.embedding_ms ?? 0,
          retrieval_ms: timings.retrieval_ms ?? 0,
          generation_ms: timings.generation_ms ?? 0,
          total_ms: Math.round(performance.now() - tPipelineStart),
          ...(timings.preprocess_ms !== undefined ? { preprocess_ms: timings.preprocess_ms } : {}),
          ...(timings.cache_lookup_ms !== undefined
            ? { cache_lookup_ms: timings.cache_lookup_ms }
            : {}),
          ...(timings.decompose_ms !== undefined ? { decompose_ms: timings.decompose_ms } : {}),
          ...(timings.hyde_ms !== undefined ? { hyde_ms: timings.hyde_ms } : {}),
          ...(timings.expand_ms !== undefined ? { expand_ms: timings.expand_ms } : {}),
        };

        const generalResponse: ChatResponse = {
          botVersion: bot.version,
          tone,
          length,
          kind: 'answer',
          answer: genAccText.trim(),
          rewrite: rewriteInfo,
          sources: [],
          threshold,
          embedTokens: embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens,
          chatInputTokens: genChatInputTokens + reclassifyTokensIn,
          chatOutputTokens: genChatOutputTokens + reclassifyTokensOut,
          totalCostUsd:
            embedCost +
            preCacheEmbedCost +
            selectiveHyDEEmbedCost +
            rewriteCost +
            expansionCost +
            hydeCost +
            decomposeCost +
            reclassifyCost +
            genChatCostUsd,
          extras: {
            category: 'general',
            ...(top1SimInitial !== null ? { top1Sim: top1SimInitial } : {}),
            phaseTimingsMs: phaseTimingsGen,
          },
        };
        yield { kind: 'answer-done', response: generalResponse };
        yield { kind: 'metrics-done', phaseTimingsMs: phaseTimingsGen };
        return;
      }

      if (rc.category === 'off_topic') {
        const OFF_TOPIC_REFUSAL =
          'Ik help met vragen rondom ChatManta en aanverwante onderwerpen — denk aan MKB-tech, chatbots, klantcontact. Wat wil je weten?';
        yield {
          kind: 'fallback',
          response: {
            botVersion: bot.version,
            tone,
            length,
            kind: 'fallback',
            answer: OFF_TOPIC_REFUSAL,
            reason: 'OFF_TOPIC re-classify — vraag buiten domein',
            topSimilarity: topSim,
            rewrite: rewriteInfo,
            sources: allSources,
            threshold,
            embedTokens: embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens,
            totalCostUsd:
              embedCost +
              preCacheEmbedCost +
              selectiveHyDEEmbedCost +
              rewriteCost +
              expansionCost +
              hydeCost +
              decomposeCost +
              reclassifyCost,
          },
        };
        return;
      }

      // rc.category === 'fallback' → val door naar de gewone FALLBACK_MESSAGE.
      yield {
        kind: 'fallback',
        response: {
          botVersion: bot.version,
          tone,
          length,
          kind: 'fallback',
          answer: FALLBACK_MESSAGE,
          reason: `Geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}); re-classify=fallback.`,
          topSimilarity: topSim,
          rewrite: rewriteInfo,
          sources: allSources,
          threshold,
          embedTokens: embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens,
          totalCostUsd:
            embedCost +
            preCacheEmbedCost +
            selectiveHyDEEmbedCost +
            rewriteCost +
            expansionCost +
            hydeCost +
            decomposeCost +
            reclassifyCost,
        },
      };
      return;
    }

    // Legacy pad (v0.1-v0.4): vaste fallback zoals voorheen.
    yield {
      kind: 'fallback',
      response: {
        botVersion: bot.version,
        tone,
        length,
        kind: 'fallback',
        answer: FALLBACK_MESSAGE,
        reason: `Geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}).`,
        topSimilarity: topSim,
        rewrite: rewriteInfo,
        sources: allSources,
        threshold,
        embedTokens: embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens,
        totalCostUsd:
          embedCost +
          preCacheEmbedCost +
          selectiveHyDEEmbedCost +
          rewriteCost +
          expansionCost +
          hydeCost +
          decomposeCost,
      },
    };
    return;
  }

  // 6. Optional rerank — cap input op MAX_RERANK_INPUT om de LLM-call kort
  //    te houden. Top-N op similarity is een goede pre-filter.
  let rerankCost = 0;
  let rerankInputTokens = 0;
  let rerankOutputTokens = 0;
  let final: RetrievedChunk[] = aboveThreshold.slice(0, V0_RAG_DEFAULTS.TOP_K);
  if (bot.rerank === 'llm' && aboveThreshold.length > 1 && (withinBudget() || markSkipped('rerank'))) {
    yield { kind: 'status', phase: 'rerank' };
    const stopRerank = tMark('rerank_ms');
    const candidates = aboveThreshold.slice(0, V0_RAG_DEFAULTS.MAX_RERANK_INPUT);
    const r = await rerankChunks(original, candidates, V0_RAG_DEFAULTS.TOP_K, bot);
    stopRerank();
    final = r.ranked;
    rerankCost = r.costUsd;
    rerankInputTokens = r.inputTokens;
    rerankOutputTokens = r.outputTokens;
  }

  // 7. Format context.
  // v0.4 parent-document retrieval: als parent_content niet null is, sturen we
  // dat naar de LLM ipv de small chunk content (parent geeft meer omringende
  // context, small chunk had alleen het exacte match-fragment).
  // Backwards-compat: chunks zonder parent (oude ingest) krijgen gewoon hun
  // eigen content.
  let context = '';
  let used = 0;
  let anyParentSwap = false;
  for (const c of final) {
    const text = c.parent_content ?? c.content;
    if (c.parent_content) anyParentSwap = true;
    const block = `[chunk ${used + 1}, similarity=${c.similarity.toFixed(3)}]\n${text}\n\n`;
    if (context.length + block.length > V0_RAG_DEFAULTS.MAX_CONTEXT_CHARS) break;
    context += block;
    used++;
  }
  const userPrompt = `CONTEXT:\n${context.trim()}\n\nVRAAG: ${original}`;

  // 8. Emit start event with metadata so UI can show sources panel before
  //    tokens arrive.
  yield { kind: 'status', phase: 'answer' };
  const usedSources = final.slice(0, used).map(toSource);
  yield {
    kind: 'answer-start',
    botVersion: bot.version,
    sources: usedSources,
    rewrite: rewriteInfo,
    threshold,
  };

  // 9. Stream the LLM answer.
  let accText = '';
  let chatInputTokens = 0;
  let chatOutputTokens = 0;
  let chatCostUsd = 0;
  const stopGeneration = tMark('generation_ms');
  try {
    const stream = await openai().chat.completions.create({
      model: bot.chatModel,
      temperature: bot.chatTemperature,
      max_tokens: V0_RAG_DEFAULTS.CHAT_MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: styledSystemPrompt },
        ...history.map((t) => ({ role: t.role, content: t.content })),
        { role: 'user', content: userPrompt },
      ],
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        accText += delta;
        yield { kind: 'answer-delta', text: delta };
      }
      // Last chunk in OpenAI stream carries the usage when stream_options
      // include_usage:true is set.
      if (chunk.usage) {
        chatInputTokens = chunk.usage.prompt_tokens ?? 0;
        chatOutputTokens = chunk.usage.completion_tokens ?? 0;
        chatCostUsd =
          (chatInputTokens / 1_000_000) * CHAT_INPUT_PER_M_USD +
          (chatOutputTokens / 1_000_000) * CHAT_OUTPUT_PER_M_USD;
      }
    }
  } catch (err) {
    stopGeneration();
    yield {
      kind: 'error',
      message: `LLM stream failed: ${err instanceof Error ? err.message : 'unknown'}`,
    };
    return;
  }
  stopGeneration();

  // 10. Post-processing for v0.3: parse structured output, optional cascade,
  //     follow-ups, cache write.
  let finalAnswerText = accText.trim();
  let confidence: number | null = null;
  let cascadeUsed = false;
  let cascadeInputTokens = 0;
  let cascadeOutputTokens = 0;
  let cascadeCost = 0;
  let followUps: string[] | undefined;
  let followUpsCost = 0;
  let followUpsInputTokens = 0;
  let followUpsOutputTokens = 0;

  if (bot.citationStyle === 'inline' || bot.chainOfThought) {
    const parsed = parseV03Output(accText);
    finalAnswerText = parsed.answer || accText.trim();
    confidence = parsed.confidence;

    // Cascade naar sterker model bij low confidence.
    if (
      bot.cascadeOnLowConfidence &&
      confidence !== null &&
      confidence < 0.5 &&
      bot.cascadeModel !== bot.chatModel &&
      (withinBudget() || markSkipped('cascade'))
    ) {
      yield { kind: 'status', phase: 'cascade' };
      const stopCascade = tMark('cascade_ms');
      try {
        const stronger = await chatComplete({
          model: bot.cascadeModel,
          system: styledSystemPrompt,
          user: userPrompt,
          temperature: bot.chatTemperature,
          maxTokens: V0_RAG_DEFAULTS.CHAT_MAX_TOKENS,
        });
        const reparsed = parseV03Output(stronger.text);
        finalAnswerText = reparsed.answer || stronger.text.trim();
        confidence = reparsed.confidence ?? confidence;
        cascadeInputTokens = stronger.inputTokens;
        cascadeOutputTokens = stronger.outputTokens;
        // Cascade gebruikt bot.cascadeModel — kost wordt opgezocht in de
        // centrale MODEL_COSTS_USD-tabel (lib/ai/llm.ts). Onbekend model
        // → 0 met warn (zie costForModelUsd).
        cascadeCost = costForModelUsd(
          bot.cascadeModel,
          stronger.inputTokens,
          stronger.outputTokens,
        );
        cascadeUsed = true;
      } catch (err) {
        console.warn('[cascade] failed, keeping initial answer:', err);
      }
      stopCascade();
    }
  }

  // v0.4 claim verification — split antwoord in claims, embed-vergelijk met
  // de chunks die de LLM zag (parent_content waar beschikbaar). Cheap: één
  // batched embed call, ~$0.0001. Geen LLM-call, geen prompt-cost.
  let claimVerifyEmbedTokens = 0;
  let claimVerifyEmbedCost = 0;
  let claimsList: ClaimVerificationData[] | undefined;
  let claimConfidence: number | undefined;
  if (bot.claimVerification && (withinBudget() || markSkipped('claimVerification'))) {
    yield { kind: 'status', phase: 'verify' };
    const stopVerify = tMark('verify_ms');
    try {
      const { verifyClaims } = await import('./claims');
      const chunkInputs = final.slice(0, used).map((c) => ({
        id: c.id,
        text: c.parent_content ?? c.content,
      }));
      const result = await verifyClaims({
        answerText: finalAnswerText,
        chunks: chunkInputs,
        threshold: bot.claimVerificationThreshold,
      });
      claimVerifyEmbedTokens = result.embedTokens;
      claimVerifyEmbedCost = result.costUsd;
      if (result.claims.length > 0) {
        claimsList = result.claims;
        claimConfidence = Number.isFinite(result.confidence) ? result.confidence : undefined;
      }
    } catch (err) {
      console.warn('[claim verification] failed:', err);
    }
    stopVerify();
  }

  // V0.4: followups draaien hier nog NIET. We yielden eerst answer-done met
  // alle data exclusief followups, daarna pas (na een aparte status+yield)
  // de followups-done en metrics-done events. Dit haalt ~0.8s p50 van de
  // time-to-final-answer voor de gebruiker — followups zijn UI-bonus, geen
  // onderdeel van het kernantwoord.

  const totalCostBeforeFollowups =
    embedCost +
    preCacheEmbedCost +
    selectiveHyDEEmbedCost +
    claimVerifyEmbedCost +
    chatCostUsd +
    rewriteCost +
    expansionCost +
    rerankCost +
    decomposeCost +
    hydeCost +
    cascadeCost;

  // phaseTimingsMs op answer-done — followups_ms ontbreekt nog (komt via
  // metrics-done event nadat followups is gemeten). total_ms is hier de
  // time-to-final-answer; metrics-done stuurt later de geüpdate total.
  const phaseTimingsAtAnswer: PhaseTimings = {
    embedding_ms: timings.embedding_ms ?? 0,
    retrieval_ms: timings.retrieval_ms ?? 0,
    generation_ms: timings.generation_ms ?? 0,
    total_ms: Math.round(performance.now() - tPipelineStart),
    ...(timings.preprocess_ms !== undefined ? { preprocess_ms: timings.preprocess_ms } : {}),
    ...(timings.cache_lookup_ms !== undefined
      ? { cache_lookup_ms: timings.cache_lookup_ms }
      : {}),
    ...(timings.decompose_ms !== undefined ? { decompose_ms: timings.decompose_ms } : {}),
    ...(timings.hyde_ms !== undefined ? { hyde_ms: timings.hyde_ms } : {}),
    ...(timings.expand_ms !== undefined ? { expand_ms: timings.expand_ms } : {}),
    ...(timings.rerank_ms !== undefined ? { rerank_ms: timings.rerank_ms } : {}),
    ...(timings.cascade_ms !== undefined ? { cascade_ms: timings.cascade_ms } : {}),
    ...(timings.verify_ms !== undefined ? { verify_ms: timings.verify_ms } : {}),
  };

  const initialResponse: ChatResponse = {
    botVersion: bot.version,
    tone,
    length,
    kind: 'answer',
    answer: finalAnswerText,
    rewrite: rewriteInfo,
    sources: usedSources,
    threshold,
    embedTokens:
      embedTokens + preCacheEmbedTokens + selectiveHyDEEmbedTokens + claimVerifyEmbedTokens,
    chatInputTokens:
      chatInputTokens +
      rerankInputTokens +
      cascadeInputTokens +
      decomposeInputTokens +
      hydeInputTokens,
    chatOutputTokens:
      chatOutputTokens +
      rerankOutputTokens +
      cascadeOutputTokens +
      decomposeOutputTokens +
      hydeOutputTokens,
    totalCostUsd: totalCostBeforeFollowups,
    extras: {
      ...(confidence !== null ? { confidence } : {}),
      ...(cascadeUsed ? { cascadeUsed: true } : {}),
      // followUps wordt apart geyield via 'followups-done' — niet hier.
      ...(subQueries.length > 1 ? { subQueries } : {}),
      ...(hydeDoc ? { hydeDocument: hydeDoc } : {}),
      // v0.4 retrieval-telemetry — top-1 sim vóór threshold + HyDE-augment,
      // selective-HyDE flag, parent-doc usage. Door log.ts gelezen voor
      // query_log.{top1_sim, hyde_triggered}.
      ...(top1SimInitial !== null ? { top1Sim: top1SimInitial } : {}),
      ...(hydeTriggered ? { hydeTriggered: true } : {}),
      ...(anyParentSwap ? { parentDocUsed: true } : {}),
      // v0.4 claim verification (data-only — UI rendering apart).
      ...(claimsList ? { claims: claimsList } : {}),
      ...(claimConfidence !== undefined ? { claimConfidence } : {}),
      ...(bot.claimVerification
        ? { claimVerificationThreshold: bot.claimVerificationThreshold }
        : {}),
      // V0.5 latency-budget — alleen aanwezig als minimaal één fase werd
      // overgeslagen. Bij empty skippedPhases = budget niet overschreden.
      ...(skippedPhases.length > 0
        ? {
            latencyBudgetExceeded: {
              elapsed: elapsedMs(),
              budgetMs: bot.latencyBudgetMs,
              skipped: [...skippedPhases],
            },
          }
        : {}),
      phaseTimingsMs: phaseTimingsAtAnswer,
    },
  };

  yield { kind: 'answer-done', response: initialResponse };

  // V0.5 claim-regenerate: bij verifiedRatio < threshold, regenereer met
  // stricter prompt. Max één extra poging. Het regenerate-antwoord vervangt
  // het oorspronkelijke via een 'replacement' event; cache krijgt het
  // regenerate-antwoord (= wat de gebruiker uiteindelijk zag).
  let activeResponse: Extract<ChatResponse, { kind: 'answer' }> = initialResponse as Extract<
    ChatResponse,
    { kind: 'answer' }
  >;
  let activeAnswerText = finalAnswerText;
  let regenerateInputTokens = 0;
  let regenerateOutputTokens = 0;
  let regenerateCost = 0;
  let regenerateRatio: number | null = null;
  let regenerateClaims: ClaimVerificationData[] | undefined;
  if (
    bot.claimRegenerateEnabled &&
    typeof claimConfidence === 'number' &&
    Number.isFinite(claimConfidence) &&
    claimConfidence < bot.claimRegenerateThreshold &&
    claimsList && claimsList.length > 0 &&
    (withinBudget() || markSkipped('claimRegenerate'))
  ) {
    const REGENERATE_SYSTEM_ADDON = `

[REGENERATE-REGEL — alleen voor deze tweede poging]
Je geeft een tweede poging. Beperk je nu STRIKT tot uitspraken die letterlijk of bijna letterlijk in de aangeleverde chunks staan. Bij twijfel of een feit echt in de context staat: laat het feit weg. Liever een korter, voorzichtiger antwoord dan een antwoord met onverifieerbare claims.`;
    try {
      const stricter = await chatComplete({
        model: bot.chatModel,
        system: styledSystemPrompt + REGENERATE_SYSTEM_ADDON,
        user: userPrompt,
        temperature: Math.max(0.0, bot.chatTemperature - 0.2),
        maxTokens: V0_RAG_DEFAULTS.CHAT_MAX_TOKENS,
      });
      regenerateInputTokens = stricter.inputTokens;
      regenerateOutputTokens = stricter.outputTokens;
      regenerateCost = stricter.costUsd;
      const reparsedRegen = parseV03Output(stricter.text);
      activeAnswerText = reparsedRegen.answer || stricter.text.trim();

      try {
        const { verifyClaims } = await import('./claims');
        const chunkInputs2 = final.slice(0, used).map((c) => ({
          id: c.id,
          text: c.parent_content ?? c.content,
        }));
        const verifyResult2 = await verifyClaims({
          answerText: activeAnswerText,
          chunks: chunkInputs2,
          threshold: bot.claimVerificationThreshold,
        });
        regenerateRatio = Number.isFinite(verifyResult2.confidence)
          ? verifyResult2.confidence
          : null;
        if (verifyResult2.claims.length > 0) regenerateClaims = verifyResult2.claims;
      } catch (err) {
        console.warn('[regenerate verify] failed:', err);
      }

      const regenExtras = {
        ...(activeResponse.extras ?? {}),
        ...(regenerateClaims ? { claims: regenerateClaims } : {}),
        ...(regenerateRatio !== null ? { claimConfidence: regenerateRatio } : {}),
      };
      activeResponse = {
        ...activeResponse,
        answer: activeAnswerText,
        chatInputTokens: activeResponse.chatInputTokens + regenerateInputTokens,
        chatOutputTokens: activeResponse.chatOutputTokens + regenerateOutputTokens,
        totalCostUsd: activeResponse.totalCostUsd + regenerateCost,
        extras: regenExtras,
      };
      yield {
        kind: 'replacement',
        response: activeResponse,
        reason: 'claim-regenerate',
        regeneratedVerifiedRatio: regenerateRatio,
      };
    } catch (err) {
      console.warn('[claim-regenerate] failed, keeping initial answer:', err);
    }
  }

  // Followups na de answer-done yield — gebruiker ziet antwoord al, followups
  // verschijnen kort daarna in de UI via het followups-done event.
  // V0.5: hard timeout op 5s zodat een trage OpenAI-call niet de finale
  // metrics-done blokkeert. Bij timeout of throw → emit followups-done met
  // lege array + error-string.
  if (bot.generateFollowUps && (withinBudget() || markSkipped('followups'))) {
    yield { kind: 'status', phase: 'followups' };
    const stopFollowups = tMark('followups_ms');
    let followupsError: string | null = null;
    try {
      const FOLLOWUPS_TIMEOUT_MS = 5_000;
      const timeoutSignal = new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error(`followups timeout (${FOLLOWUPS_TIMEOUT_MS}ms)`)),
          FOLLOWUPS_TIMEOUT_MS,
        );
      });
      const fu = await Promise.race([
        generateFollowUps(original, finalAnswerText, bot),
        timeoutSignal,
      ]);
      followUps = fu.followUps;
      followUpsInputTokens = fu.inputTokens;
      followUpsOutputTokens = fu.outputTokens;
      followUpsCost = fu.costUsd;
    } catch (err) {
      followupsError = err instanceof Error ? err.message : 'unknown';
      console.warn('[followups] failed:', followupsError);
    }
    stopFollowups();
    yield {
      kind: 'followups-done',
      followUps: followUps ?? [],
      inputTokens: followUpsInputTokens,
      outputTokens: followUpsOutputTokens,
      costUsd: followUpsCost,
      ...(followupsError ? { error: followupsError } : {}),
    };
  }

  // Finale phaseTimingsMs — bevat nu ook followups_ms (als die ran). total_ms
  // wordt opnieuw berekend zodat de followups-tijd erin meetelt.
  const phaseTimingsFinal: PhaseTimings = {
    ...phaseTimingsAtAnswer,
    total_ms: Math.round(performance.now() - tPipelineStart),
    ...(timings.followups_ms !== undefined ? { followups_ms: timings.followups_ms } : {}),
  };
  yield { kind: 'metrics-done', phaseTimingsMs: phaseTimingsFinal };

  // Cache write (fire-and-forget) — v0.4: hergebruik de pre-cache embed
  // vector ipv opnieuw embedden (~1.2s + cost-saving per request). Echte
  // error-log ipv stille catch. We schrijven de COMPLETE response naar de
  // cache (inclusief followups + finale timings), zodat een cache-hit later
  // dezelfde UX levert als een verse RAG-run.
  if (bot.cacheEnabled && cacheEmbedVector) {
    const cachedResponse: ChatResponse = {
      ...activeResponse,
      chatInputTokens: activeResponse.chatInputTokens + followUpsInputTokens,
      chatOutputTokens: activeResponse.chatOutputTokens + followUpsOutputTokens,
      totalCostUsd: activeResponse.totalCostUsd + followUpsCost,
      extras: {
        ...activeResponse.extras,
        ...(followUps && followUps.length > 0 ? { followUps } : {}),
        phaseTimingsMs: phaseTimingsFinal,
      },
    };
    writeCachedAnswer(original, cacheEmbedVector, bot.version, cachedResponse, orgId).catch(
      (err) => console.warn('[cache write] failed:', err instanceof Error ? err.message : err),
    );
  }
}

// ---------------------------------------------------------------------------
// Document admin (used by V0-C-3 ingest + list + delete)
// ---------------------------------------------------------------------------
export type DocSummary = {
  id: string;
  filename: string;
  status: string;
  chunkCount: number;
  createdAt: string;
};

export async function listDocs(organizationId: string = DEV_ORG_ID): Promise<DocSummary[]> {
  const sb = supabase();
  const { data: docs, error } = await sb
    .from('documents')
    .select('id, filename, status, created_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listDocs: ${error.message}`);
  if (!docs || docs.length === 0) return [];

  // Count chunks per doc — single query grouped client-side.
  const ids = docs.map((d) => d.id as string);
  const { data: chunkRows, error: cErr } = await sb
    .from('document_chunks')
    .select('document_id')
    .in('document_id', ids);
  if (cErr) throw new Error(`chunk count: ${cErr.message}`);
  const counts = new Map<string, number>();
  for (const r of chunkRows ?? []) {
    const id = r.document_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return docs.map((d) => ({
    id: d.id as string,
    filename: d.filename as string,
    status: d.status as string,
    chunkCount: counts.get(d.id as string) ?? 0,
    createdAt: d.created_at as string,
  }));
}

export type IngestResult = {
  docId: string;
  chunks: number;
  embedTokens: number;
  costUsd: number;
};

export async function ingestText({
  filename,
  text,
}: {
  filename: string;
  text: string;
}): Promise<IngestResult> {
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error('document is empty after trimming');

  const sb = supabase();

  const { data: doc, error: docErr } = await sb
    .from('documents')
    .insert({
      organization_id: DEV_ORG_ID,
      filename,
      source: 'v0_local',
      status: 'processing',
      metadata: { chars: text.length, chunk_count: chunks.length },
    })
    .select('id')
    .single();
  if (docErr) throw new Error(`document insert: ${docErr.message}`);
  const docId = doc.id as string;

  let embedResult: EmbedResult;
  try {
    embedResult = await embedTexts(chunks);
  } catch (err) {
    await sb.from('documents').update({ status: 'failed' }).eq('id', docId);
    throw err;
  }

  const rows = chunks.map((content, i) => ({
    organization_id: DEV_ORG_ID,
    document_id: docId,
    content,
    embedding: embedResult.vectors[i],
    metadata: { chunk_index: i },
  }));
  const { error: chunkErr } = await sb.from('document_chunks').insert(rows);
  if (chunkErr) {
    await sb.from('documents').update({ status: 'failed' }).eq('id', docId);
    throw new Error(`chunk insert: ${chunkErr.message}`);
  }

  await sb.from('documents').update({ status: 'ready' }).eq('id', docId);

  return {
    docId,
    chunks: chunks.length,
    embedTokens: embedResult.tokens,
    costUsd: embedResult.costUsd,
  };
}

export async function deleteDoc(docId: string): Promise<void> {
  // CASCADE op document_chunks.document_id ruimt chunks automatisch.
  const sb = supabase();
  const { error } = await sb
    .from('documents')
    .delete()
    .eq('organization_id', DEV_ORG_ID)
    .eq('id', docId);
  if (error) throw new Error(`deleteDoc: ${error.message}`);
}
