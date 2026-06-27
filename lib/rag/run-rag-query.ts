// Neutral RAG engine — version-agnostic, V0/V1-agnostic.
//
// Dit is de gegradueerde retrieval+answer-pijplijn die voorheen in
// lib/v0/server/rag.ts woonde. De engine is nu client-geïnjecteerd: de caller
// geeft een Supabase-client mee (zodat V0 de service-role-client kan injecteren
// en V1 straks een per-org-gescopeerde client), plus config/persona/org/chatbot.
//
// Harde invariant: deze file importeert NIETS uit de V0-laag en bouwt NOOIT
// zelf een service-role-client — de DB-toegang loopt uitsluitend via de
// geïnjecteerde `client`. De V0-laag (lib/v0/server/rag.ts) is een dunne adapter
// die runRagQuery met de service-role-client + V0-persona aanroept.
//
// 'server-only' import zorgt dat een per ongeluk import vanuit een client
// component een build error geeft (geen secrets in de browser).

import 'server-only';

import { performance } from 'node:perf_hooks';
import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RagConfig,
  RagPersona,
  ManualQA,
  RagChatbotOverrides,
} from '@/lib/rag/types';
import { embedTexts } from '@/lib/rag/embeddings';
import { stripQuotes, parsePreProcessOutput } from '@/lib/rag/preprocess-parse';
import { buildSystemPrompt } from '@/lib/rag/style';
import { DEFAULT_LENGTH, DEFAULT_TONE, type Length, type Tone } from '@/lib/rag/style-types';
import { costForModelUsd } from '@/lib/ai/llm';
import { AppError, type AppErrorCode } from '@/lib/errors/app-error';
import {
  buildGeneralClosingStripRegex,
  composeBotPrompts,
  renderPersonaTemplate,
} from '@/lib/rag/persona';
import {
  shouldDeterministicallyRefuseHardFact,
  containsEmergencyHandoff,
  containsCodeOutput,
} from '@/lib/rag/hard-facts';
import { detectLanguage } from '@/lib/rag/hard-eval-checks';
import { buildAllowedUrlSet, sanitizeSourceLinks, stripMarkdownLinks } from '@/lib/rag/source-links';
import { findMatchingManualQA } from '@/lib/rag/manual-qa';

// OpenAI-fouten classificeren naar code: een timeout heeft een specifieke
// title/body in user-messages, de generieke variant is LLM_UNAVAILABLE.
function classifyLlmError(err: unknown): 'LLM_TIMEOUT' | 'LLM_UNAVAILABLE' {
  if (err && typeof err === 'object') {
    const name = (err as { name?: unknown }).name;
    const msg = (err as { message?: unknown }).message;
    const text = `${typeof name === 'string' ? name : ''} ${typeof msg === 'string' ? msg : ''}`.toLowerCase();
    if (text.includes('timeout') || text.includes('timed out') || text.includes('aborted')) {
      return 'LLM_TIMEOUT';
    }
  }
  return 'LLM_UNAVAILABLE';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Cost rates voor gpt-4o-mini (USD per 1M tokens). Wanneer een toekomstige
// bot-versie naar een ander chat-model gaat, moet dit een lookup-tabel
// worden — voor nu is gpt-4o-mini de enige V0-keuze.
const CHAT_INPUT_PER_M_USD = 0.15;
const CHAT_OUTPUT_PER_M_USD = 0.60;

// Structurele defaults — niet bot-versie-specifiek. Voor per-versie variatie
// (prompts, threshold, temperatuur, model) zie lib/v0/server/bots.ts.
export const RAG_DEFAULTS = {
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

// ---------------------------------------------------------------------------
// Lazy clients
// ---------------------------------------------------------------------------
let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AppError('INTERNAL', { message: 'OPENAI_API_KEY missing' });
  _openai = new OpenAI({ apiKey: key });
  return _openai;
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
  maxTokens = RAG_DEFAULTS.CHAT_MAX_TOKENS,
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
  | ({ kind: 'search'; query: string } & PreProcessTokens)
  | ({ kind: 'off_topic' } & PreProcessTokens);

// Beperk hoeveel turns we meegeven aan de LLM-calls. Meer = duurder en
// kan de LLM verwarren met oude context die niet meer relevant is.
const MAX_HISTORY_TURNS = 4;

// Sliding window voor de main answer-LLM call. Lange threads stuurden eerder
// tot 20 turns mee, wat TTFT lineair liet groeien met de gespreks-lengte.
// 8 turns (4 user+assistant paren) dekt empirisch verreweg de meeste
// conversational follow-ups; oudere context blijft in DB en in client-state.
export const RAG_CHAT_HISTORY_TURNS = 8;

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
  bot: RagConfig,
  persona: RagPersona,
  history: ChatHistoryTurn[] = [],
): Promise<PreProcessResult> {
  const trimmed = history.slice(-MAX_HISTORY_TURNS);
  const hasHistory = trimmed.length > 0;
  const userMessage = hasHistory
    ? `${formatHistoryBlock(trimmed)}HUIDIGE INPUT: ${original}`
    : original;
  // V0.5: prepend multi-turn-addon (STAP 0 context-resolutie) ALLEEN bij
  // history-aanwezigheid. Single-turn queries krijgen de base prompt zonder
  // STAP 0 — voorkomt prompt-overload op adversarial cases (zie eval Run 3
  // analyse: grounding-dip op false-premise / out-of-corpus / typo cases was
  // gekoppeld aan langere prompt). v0.1-v0.4 hebben addon='' dus geen effect.
  //
  // V0.6.2: extra conditie via bot.adaptiveHistoryResolution. Dan wordt de
  // addon alleen geprepend wanneer needsHistoryResolution(original)=true —
  // keyword-heuristic die kijkt of de vraag echt referenties heeft die
  // chat-history nodig hebben. Zelfstandige vervolgvragen zoals "Wat is de
  // prijs?" krijgen GEEN addon, korter prompt, minder drift-risico.
  // V0.6.1 en eerder: bot.adaptiveHistoryResolution undefined → falsy →
  // condittie skip, v0.6.1-gedrag behouden.
  let useMultiTurnAddon = hasHistory && bot.preProcessMultiTurnAddon.length > 0;
  if (useMultiTurnAddon && bot.adaptiveHistoryResolution === true) {
    const { needsHistoryResolution } = await import('@/lib/rag/rag-decision');
    useMultiTurnAddon = needsHistoryResolution(original);
  }
  // Persona-rendering: het bot-prompt template bevat {{COMPANY}} / {{AUDIENCE}}
  // etc. placeholders — die moeten gerendered worden voordat we de LLM
  // aanroepen, anders krijgt hij letterlijk "{{COMPANY}}" te zien en lekt de
  // pre-trained naam ("ChatManta") door als invul-default. Multi-turn addon
  // wordt apart gerendered want hij wordt geprepend, niet ingelezen.
  const rendered = composeBotPrompts(bot, persona);
  const systemPrompt = useMultiTurnAddon
    ? `${rendered.preProcessMultiTurnAddon}\n\n${rendered.preProcessSystem}`
    : rendered.preProcessSystem;
  const result = await chatComplete({
    model: bot.chatModel,
    system: systemPrompt,
    user: userMessage,
    temperature: RAG_DEFAULTS.REWRITE_TEMPERATURE,
    maxTokens: RAG_DEFAULTS.REWRITE_MAX_TOKENS,
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
  bot: RagConfig,
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
  bot: RagConfig,
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
  bot: RagConfig,
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
  client: SupabaseClient,
  queryVector: number[],
  queryText: string,
  topK: number,
  /** v0.4: hydrateer parent_content na de hybrid-fusion (RPC kent geen parent join). */
  withParents = false,
  /** v0.4 multi-org: scope retrieval naar deze org. Verplicht (PR-1) — geen stille DEV_ORG-fallback. */
  organizationId: string,
  /** V1: scope retrieval naar deze chatbot wanneer chatbotScoped. */
  chatbotId: string,
  chatbotScoped: boolean,
): Promise<RetrievedChunk[]> {
  const { data, error } = await client.rpc('match_chunks_hybrid', {
    p_organization_id: organizationId,
    query_embedding: queryVector,
    query_text: queryText,
    match_count: topK,
    ...(chatbotScoped ? { p_chatbot_id: chatbotId } : {}),
  });
  if (error) {
    // Fallback: als hybrid RPC ontbreekt (migratie 0004 niet toegepast),
    // val terug op vanilla vector search zodat de app blijft werken.
    console.warn('[hybrid] RPC failed, falling back to vector-only:', error.message);
    return retrieveChunks(
      client,
      queryVector,
      topK,
      withParents,
      organizationId,
      chatbotId,
      chatbotScoped,
    );
  }
  type HybridRow = RawChunk & { combined_score: number; keyword_score: number };
  const rows = (data ?? []) as HybridRow[];
  if (rows.length === 0) return [];

  // Hydrate filenames (zelfde als retrieveChunks).
  const docIds = Array.from(
    new Set(rows.map((c) => c.document_id).filter((v): v is string => !!v)),
  );
  let docNameMap = new Map<string, string>();
  if (docIds.length > 0) {
    const { data: docs } = await client.from('documents').select('id, filename').in('id', docIds);
    docNameMap = new Map((docs ?? []).map((d) => [d.id as string, d.filename as string]));
  }
  // Hybrid RPC retourneert geen parent_chunk_id; haal die op uit document_chunks
  // als withParents aanstaat. Eén batch query — minimale latency.
  let parentIdMap = new Map<string, string | null>();
  if (withParents && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { data: parentRows, error: parentErr } = await client
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
  if (withParents) await hydrateParentContent(client, hydrated);
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
  client: SupabaseClient,
  writeClient: SupabaseClient,
  queryVector: number[],
  chatbotId: string,
  chatbotScoped: boolean,
  botVersion: string,
  organizationId: string,
): Promise<ChatResponse | null> {
  const { data, error } = await client.rpc('lookup_cached_answer', {
    p_organization_id: organizationId,
    // chatbot-scoped (V1): de RPC filtert óók op chatbot_id. V0's RPC heeft die
    // parameter niet → alléén meesturen wanneer chatbotScoped (zie retrieveChunks).
    ...(chatbotScoped ? { p_chatbot_id: chatbotId } : {}),
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
  // Stempel last_hit_at fire-and-forget. (hit_count werd hier ooit "opgehoogd"
  // via `hit_count: undefined`, maar supabase-js stript undefined-keys, dus dat
  // deed nooit iets — en niets in de codebase leest hit_count. Een echte ophoog
  // vereist een atomische RPC; bewust niet gedaan, zie nacht-audit C3.)
  // last_hit_at via de write-client: de injected session-client (V1) mag
  // answer_cache niet muteren onder de SELECT-only RLS. V0's write-client = z'n
  // service-role client, dus daar ongewijzigd gedrag.
  // fire-and-forget; vang óók de rejection (tweede .then-arg) zodat een gefaalde
  // update geen unhandled promise rejection wordt (de cache-hit is al bepaald).
  writeClient.from('answer_cache')
    .update({ last_hit_at: new Date().toISOString() })
    .eq('id', top.id)
    .then(() => undefined, () => undefined);
  return top.response_json;
}

async function writeCachedAnswer(
  // write-enabled client (V1: service-role; V0: z'n service-role main client) — niet
  // de RLS-session-client, die answer_cache niet mag schrijven.
  writeClient: SupabaseClient,
  question: string,
  queryVector: number[],
  chatbotId: string,
  chatbotScoped: boolean,
  botVersion: string,
  response: ChatResponse,
  organizationId: string,
): Promise<void> {
  try {
    await writeClient.from('answer_cache').insert({
      organization_id: organizationId,
      // chatbot-scoped (V1): stempel chatbot_id zodat twee chatbots op dezelfde
      // bot_version elkaars cache niet serveren. V0's tabel heeft geen chatbot_id
      // → alléén meesturen wanneer chatbotScoped.
      ...(chatbotScoped ? { chatbot_id: chatbotId } : {}),
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
  bot: RagConfig,
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
  bot: RagConfig,
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
  bot: RagConfig,
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
  /** v0.6 — parent_chunks.parent_index (0-indexed). NULL als geen parent. UI displayt als parent_index + 1. */
  parent_index?: number | null;
  /** v0.9.1 bron-links — wp.url van de gecrawlde pagina. NULL voor document-chunks
      of wanneer de RPC de kolom niet teruggeeft (legacy match_chunks). */
  source_url?: string | null;
  /** v0.9.1 bron-links — wp.title van de gecrawlde pagina (NULL voor document-chunks). */
  source_title?: string | null;
};

export type RetrievedChunk = RawChunk & { filename: string | null };

async function retrieveChunks(
  client: SupabaseClient,
  queryVector: number[],
  topK: number,
  /** v0.4: gebruik match_chunks_with_parents zodat parent_content meekomt. */
  withParents = false,
  /** v0.4 multi-org: scope retrieval naar deze org. Verplicht (PR-1) — geen stille DEV_ORG-fallback. */
  organizationId: string,
  /** V1: scope retrieval naar deze chatbot wanneer chatbotScoped. */
  chatbotId: string,
  chatbotScoped: boolean,
): Promise<RetrievedChunk[]> {
  const rpcName = withParents ? 'match_chunks_with_parents' : 'match_chunks';
  const { data, error } = await client.rpc(rpcName, {
    p_organization_id: organizationId,
    query_embedding: queryVector,
    match_count: topK,
    ...(chatbotScoped ? { p_chatbot_id: chatbotId } : {}),
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
    const { data: docs, error: docsErr } = await client
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
async function hydrateParentContent(
  client: SupabaseClient,
  chunks: RetrievedChunk[],
): Promise<void> {
  const needsHydration = chunks.filter(
    (c) => c.parent_chunk_id && c.parent_content === undefined,
  );
  if (needsHydration.length === 0) return;
  const parentIds = Array.from(new Set(needsHydration.map((c) => c.parent_chunk_id as string)));
  const { data, error } = await client
    .from('parent_chunks')
    .select('id, content, parent_index')
    .in('id', parentIds);
  if (error) {
    // Niet fataal — fall-back: chunk content gebruikt zoals eerst.
    console.warn('[parent_chunks] hydrate failed:', error.message);
    for (const c of needsHydration) {
      c.parent_content = null;
      c.parent_index = null;
    }
    return;
  }
  const byId = new Map(
    (data ?? []).map((r) => [
      r.id as string,
      { content: r.content as string, parent_index: r.parent_index as number },
    ]),
  );
  for (const c of needsHydration) {
    const hit = byId.get(c.parent_chunk_id as string);
    c.parent_content = hit?.content ?? null;
    c.parent_index = hit?.parent_index ?? null;
  }
}

// ---------------------------------------------------------------------------
// Response-shapes — gedeeld door het streaming-pad, de answer-cache en de
// telemetrie-logging.
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
  /**
   * v0.6 — 0-indexed positie van de parent-chunk binnen het document
   * (parent_chunks.parent_index). De UI displayt als `Sectie {parentIndex + 1}`.
   * NULL of undefined als de chunk geen parent heeft (oude ingest zonder
   * parent_chunk_id) — UI laat dan geen Sectie-badge zien.
   */
  parentIndex?: number | null;
  /**
   * v0.9.1 bron-links — echte URL van de gecrawlde pagina (website_pages.url),
   * NULL voor document-chunks. Wordt mee-gecachet zodat een cache-hit de
   * sanitizer-allowlist kan reconstrueren (oude cache-rijen zonder dit veld →
   * lege allowlist → eventuele verzonnen links worden alsnog gestript).
   */
  url?: string | null;
  /**
   * EVAL-ONLY: de VOLLEDIGE `parent_content` die de answer-LLM als
   * SURROUNDING_CONTEXT kreeg — ONgetrunceerd, in tegenstelling tot het
   * ≤800-char `parentExcerpt`-preview. Alleen gevuld wanneer
   * `runRagQuery({ includeFullParentContent: true })` (de Harde-Dimensie/
   * Productie-gate-eval), zodat de Claude-judge grounding beoordeelt tegen
   * EXACT wat de bot zag i.p.v. een afgekapt beeld. NOOIT gezet op het
   * productie-/chat-pad → de response-cache blijft onaangeraakt.
   */
  parentContentFull?: string;
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
  /**
   * v0.5: gate-outcome voor het zero-hits reclassify-pad. true = pad mocht
   * draaien; false = pad geskipt (bot doesn't support OR user toggle off).
   * null voor smalltalk en non-zero-hits answers (pad niet bereikt).
   */
  generalKnowledgeActual: boolean | null;
  /**
   * v0.6.2: verfijnde knowledge-gap classificatie wanneer bot.knowledgeGapLogging
   * aan stond én het antwoord-pad een gap aanstipt. Mogelijke waarden:
   *  - 'zero_hits': aboveThreshold.length===0 → fallback of reclassify-pad
   *  - 'low_confidence': claimConfidence < threshold (regenerate-trigger)
   *  - 'low_grounding': hardFactSupport.supported === false (regenerate-trigger)
   *  - 'off_topic': re-classifier zei off-topic → polite refusal
   *  - null/undefined: geen gap (normaal answer of smalltalk)
   * Wordt door log.ts naar query_log.gap_kind kolom gemapt. Op fallback-kind
   * antwoorden óók beschikbaar (anders dan extras die alleen op answer-kind zit).
   */
  gapKind?: 'zero_hits' | 'low_confidence' | 'low_grounding' | 'off_topic' | null;
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
  /**
   * v0.6.1 — hard-fact verifier aggregate. Aanwezig wanneer
   * bot.adaptiveHardFactVerification aan stond EN claim-verify draaide.
   *  - supported: true = alle harde feiten (geld/percentages/datums/aantallen/
   *    email/url/telefoon) in het antwoord zijn 1-op-1 of genormaliseerd
   *    terug te vinden in de chunks; false = minstens één feit ontbreekt.
   *  - missing: lijst van missing facts, categorie-prefixed ("money:500",
   *    "phone:0699999999"). Leeg array bij supported=true.
   *  - regenerateTriggered: true wanneer false→true cascade naar claim-
   *    regenerate ging draaien (bestaande v0.5 flow, hergebruikt).
   */
  hardFactSupport?: {
    supported: boolean;
    missing: string[];
    regenerateTriggered?: boolean;
  };
  /**
   * v0.6.2 — adaptive RAG decision. Alleen aanwezig wanneer bot.adaptiveRag
   * aan stond. Bevat het 3-path-result (fast/standard/careful) +
   * retrievalStrength + per-stage booleans + reasonCodes voor debug/eval.
   * Wordt door log.ts opgeslagen in query_log.adaptive_decision (jsonb).
   * Eval-report slicet hierop voor per-path means.
   */
  adaptiveDecision?: {
    path: 'fast' | 'standard' | 'careful';
    retrievalStrength: 'none' | 'weak' | 'medium' | 'strong';
    shouldUseHyDE: boolean;
    shouldRerank: boolean;
    shouldVerifyClaims: boolean;
    shouldRegenerateClaims: boolean;
    shouldCascade: boolean;
    shouldGenerateFollowupsInline: boolean;
    reasonCodes: string[];
  };
  /**
   * v0.8.1 — anti-adoptie telemetrie. Lijst van entiteiten (persoonsnamen) die
   * de user in de chat-history introduceerde, niet in de sources staan, maar
   * tóch in (de eerste poging van) het antwoord verschenen. Niet-leeg =
   * mogelijke adoptie van een geplant feit; triggert claim-regenerate.
   * Alleen aanwezig wanneer bot.historyEntityVerification aan stond én er iets
   * gedetecteerd is.
   */
  adoptedHistoryEntities?: string[];
  /**
   * v0.10 (P4) — true wanneer de DETERMINISTISCHE hard-fact-weiger-gate
   * (shouldDeterministicallyRefuseHardFact) het antwoord heeft vervangen door het
   * eerlijke weiger/doorverwijs-template. Onderscheidt deze weigering van de
   * LLM-claim-regenerate (beide komen als `replacement`-event met reason
   * 'claim-regenerate'). De hard-eval-runner gebruikt dit als het ECHTE
   * refusal-event voor de over-refusal-meting (i.p.v. de regex op de antwoordtekst,
   * die vals-positief is op gegronde "neem contact op"-CTA's). Alleen aanwezig
   * wanneer de gate vuurde.
   */
  deterministicHardFactRefusal?: boolean;
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
  /** V0.7 eval-v2: time-to-first-token vanaf stream-start (ms). Gemerged
      door de eval-runner (scripts/v0-eval-run.ts) op basis van het eerste
      content-bearing event uit runRagQuery — niet door de engine zelf
      ge-set. Op streaming-paden = tijd tot eerste answer-delta; op
      smalltalk/fallback = tijd tot het terminal event (geen streaming). */
  first_token_ms?: number;
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

const EXCERPT_MIN = 180;
const EXCERPT_MAX = 260;
// v0.5 cap parent op 800 chars (was 1500); behoud met smart-truncation window.
const PARENT_EXCERPT_MIN = 600;
const PARENT_EXCERPT_MAX = 800;

/**
 * Smart truncation: knip op zin-grens binnen [min, max] waar mogelijk, anders
 * laatste spatie in venster, anders harde slice. Geeft altijd ` …` suffix als
 * er getrunceerd is. Sentence-end = `.` `!` `?` of newline.
 */
function truncateSentence(text: string, min: number, max: number): string {
  if (text.length <= max) return text;
  // Zoek laatste zin-grens in [min, max]
  const window = text.slice(0, max);
  const sentenceEnd = Math.max(
    window.lastIndexOf('.'),
    window.lastIndexOf('!'),
    window.lastIndexOf('?'),
    window.lastIndexOf('\n'),
  );
  if (sentenceEnd >= min) {
    return text.slice(0, sentenceEnd + 1).trimEnd() + ' …';
  }
  // Fall back op laatste spatie in venster
  const spaceIdx = window.lastIndexOf(' ');
  if (spaceIdx >= min) {
    return text.slice(0, spaceIdx).trimEnd() + ' …';
  }
  // Geen geschikt grenspunt — harde slice (oude gedrag)
  return text.slice(0, max).trimEnd() + '…';
}

function toSource(c: RetrievedChunk, includeFullParent = false): ChatSource {
  const contentExcerpt = truncateSentence(c.content, EXCERPT_MIN, EXCERPT_MAX);
  // Parent-content is alleen aanwezig als bot.parentDocumentRetrieval=true
  // EN de chunk een gehydrateerde parent had. Null of undefined → we slaan
  // parentExcerpt over zodat oude responses (zonder dit veld) backward-compat
  // blijven. Onderscheid: null = hydratie geprobeerd maar gefaald;
  // undefined = geen parent_chunk_id (geen parent-doc-retrieval actief).
  let parentExcerpt: string | null | undefined = undefined;
  if (typeof c.parent_content === 'string' && c.parent_content.length > 0) {
    parentExcerpt = truncateSentence(c.parent_content, PARENT_EXCERPT_MIN, PARENT_EXCERPT_MAX);
  } else if (c.parent_content === null) {
    parentExcerpt = null;
  }
  return {
    id: c.id,
    filename: c.filename,
    similarity: c.similarity,
    contentExcerpt,
    ...(parentExcerpt !== undefined ? { parentExcerpt } : {}),
    // EVAL-ONLY: volledige parent_content (ongetrunceerd) zodat de judge ziet
    // wat de bot zag. Productie zet includeFullParent niet → veld afwezig.
    ...(includeFullParent && typeof c.parent_content === 'string' && c.parent_content.length > 0
      ? { parentContentFull: c.parent_content }
      : {}),
    parentIndex: c.parent_index ?? null,
    ...(c.source_url ? { url: c.source_url } : {}),
  };
}

// ---------------------------------------------------------------------------
// runRagQuery — same pipeline, yields incremental events so the route handler
// can stream them as NDJSON. The final event always carries the complete
// ChatResponse so the route can log it after streaming is done.
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
      // v0.8.1: 'history-entity-adoption' = deterministisch weiger-template bij
      // gedetecteerde adoptie van een history-entiteit (geen LLM-poging).
      // v0.9.1: 'off-domain-code-refusal' = deterministische scope-guard die een
      // off-domein code-antwoord vervangt door de off-topic-refusal.
      reason: 'claim-regenerate' | 'history-entity-adoption' | 'off-domain-code-refusal';
      regeneratedVerifiedRatio: number | null;
    }
  | { kind: 'error'; code: AppErrorCode; retryAfterSec?: number };

export async function* runRagQuery(
  client: SupabaseClient,
  input: {
    question: string;
    threshold: number;
    enableRewrite: boolean;
    /** RAG-config (= V0 BotConfig). */
    config: RagConfig;
    /** Org-persona voor prompt-token-injectie. Door de caller geresolved. */
    persona: RagPersona;
    /** v0.4 multi-org: scope retrieval+cache naar deze org. Verplicht — geen DEV_ORG-fallback. */
    organizationId: string;
    /** V1: scope retrieval naar deze chatbot (alleen actief bij config.chatbotScoped). Verplicht. */
    chatbotId: string;
    /**
     * Optionele service-role client voor geprivilegieerde answer_cache-writes
     * (insert + last_hit_at). Nodig wanneer `client` een RLS-session-client is die
     * answer_cache niet mag muteren (V1: SELECT-only policy). V0 laat dit weg —
     * z'n `client` is al service-role. (Later ook bruikbaar voor query_log-logging.)
     */
    serviceClient?: SupabaseClient;
    history?: ChatHistoryTurn[];
    tone?: Tone;
    length?: Length;
    /**
     * Eval-flag: sla de answer-cache volledig over (geen lookup, geen write).
     * De answer-cache is per bot_version-STRING; bij een code-wijziging binnen
     * dezelfde versie (bv. een nieuwe deterministische gate) serveert de cache
     * anders een stale antwoord van vóór de fix. De Harde-Dimensie-eval zet dit
     * aan zodat hij ALTIJD het huidige bot-gedrag test, niet een gecachte run.
     */
    disableCache?: boolean;
    /**
     * EVAL-ONLY: voeg op elke ChatSource het ongetrunceerde `parentContentFull`
     * toe (de volledige SURROUNDING_CONTEXT die de answer-LLM kreeg). De
     * Harde-Dimensie/Productie-gate-eval zet dit aan zodat de Claude-judge
     * grounding beoordeelt tegen EXACT wat de bot zag i.p.v. het ≤800-char
     * `parentExcerpt`-preview (dat liet gegronde getallen voorbij teken ~800
     * "verzonnen" lijken — false grounding-fails). Default uit → productie/cache
     * onaangeraakt.
     */
    includeFullParentContent?: boolean;
    /**
     * Per-query HyDE-modus override (v0.5 evaluatie-toggle). 'auto' of undefined
     * = volg bot-config. Override wint altijd, ook over bots met useHyDE=false.
     */
    hydeModeOverride?: HydeModeRequest;
    /**
     * v0.5: per-query override voor general-knowledge reclassify-pad. Default true
     * — gated combined with bot.generalKnowledgeEnabled. UI-toggle (SettingsView)
     * stuurt false om de extra LLM-call bij zero-hits over te slaan en direct naar
     * FALLBACK_MESSAGE te gaan.
     */
    enableGeneralKnowledge?: boolean;
    /**
     * Per-org handmatige Q&A items uit v0_org_settings.qa. Wanneer een
     * inkomende vraag voldoende lijkt op een actief Q&A-item (zie
     * findMatchingManualQA), antwoorden we direct met dat item — zonder
     * embed/retrieve/LLM. Maakt de "voortaan direct uit je kennisbank"
     * belofte uit het klantendashboard waar.
     */
    manualQAItems?: ManualQA[];
    /**
     * Klant-dashboard ChatbotSettings → RAG-overrides. Levert tone+length
     * defaults (wanneer caller geen expliciete waarde stuurt), extra system-
     * prompt-instructies (companyDescription, source-strictness, may-mention
     * toggles, etc.) en een custom fallbackMessage. Body-tone/length van een
     * admin-call winnen altijd; dit is alléén de saved-default-laag.
     */
    chatbotOverrides?: RagChatbotOverrides;
  },
): AsyncGenerator<StreamEvent, void, void> {
  const { threshold, enableRewrite, config: bot } = input;
  const chatbotId = input.chatbotId;
  const chatbotScoped = bot.chatbotScoped;
  // Cache-mutaties (answer_cache insert + last_hit_at) draaien via de service-
  // role client. In V1 is `client` een RLS-session-client die answer_cache niet
  // mag schrijven (SELECT-only policy), dus de caller geeft een service-role
  // `serviceClient` mee. V0 geeft alléén z'n service-role client door →
  // serviceClient undefined → val terug op `client` (daar ís dat service-role).
  const cacheWriteClient = input.serviceClient ?? client;
  // Tone/length-resolutie: explicite request-body wint, daarna de klant-
  // dashboard default, daarna de pipeline-default. Dit pad maakt
  // /klantendashboard/instellingen → /widget chat live wired zonder dat
  // de admin-panel (die wel expliciet tone/length stuurt) gebroken raakt.
  const tone: Tone = input.tone ?? input.chatbotOverrides?.tone ?? DEFAULT_TONE;
  const length: Length =
    input.length ?? input.chatbotOverrides?.length ?? DEFAULT_LENGTH;
  // Fallback-tekst: klant-override > vaste default. Wordt gebruikt op alle
  // 'kind: fallback' paden in deze functie. Lege string van de override
  // telt als "klant heeft niets ingevuld" → terug naar default.
  const fallbackMessage =
    input.chatbotOverrides?.fallbackMessage && input.chatbotOverrides.fallbackMessage.length > 0
      ? input.chatbotOverrides.fallbackMessage
      : FALLBACK_MESSAGE;
  const orgId = input.organizationId; // verplicht, geen stille DEV_ORG-fallback meer
  // V0.6 persona-laag: door de caller geresolved en één keer doorgegeven aan de
  // hele pipeline (preProcess, main answer, general-knowledge prompt, off-topic
  // refusal). Voorheen waren de prompts hard-coded op DEV_ORG identiteit,
  // waardoor non-DEV orgs antwoorden kregen die zichzelf "ChatManta van
  // Jorion Solutions" noemden — zelfs als de retrieved chunks uit de juiste
  // org kwamen.
  const persona = input.persona;
  const hydeModeRequested: HydeModeRequest = input.hydeModeOverride ?? 'auto';
  // `let` zodat de off_topic-branch hieronder HyDE kan uitzetten (HyDE's
  // fabricatie-rescue ondermijnt anders het off-topic-signaal).
  let hydeModeActual: HydeModeResolved = resolveHydeMode(bot, hydeModeRequested);
  // General-knowledge gate. Een EXPLICIETE org-/admin-opt-in
  // (input.enableGeneralKnowledge true/false) is autoritatief en wint van de
  // versie-default — zo werkt de klantendashboard-toggle ("mag de bot algemene
  // kennisvragen beantwoorden?") óók op een bot-versie die GK standaard uit heeft
  // (v0.10 = LATEST), zónder die versie-snapshot te muteren (append-only blijft
  // intact). Callers die het veld NIET sturen (eval, oudere scripts) → undefined →
  // terugval op de versie-default bot.generalKnowledgeEnabled, dus eval-baselines
  // blijven exact gelijk. Fail-closed: de chat-route levert false zodra de org niet
  // heeft opt-in'd (route.ts: `... ?? chatbotOverrides?.answerGeneralKnowledge ?? false`).
  const generalKnowledgeActive = input.enableGeneralKnowledge ?? bot.generalKnowledgeEnabled;
  const history = (input.history ?? []).slice(-MAX_HISTORY_TURNS);
  // V0.6.2 config-aware retrieval-sizing. Bij undefined → RAG_DEFAULTS
  // (v0.1-v0.6.1 ongewijzigd). V0.6.2 zet TOP_K=8, rerankInputMax=20, en
  // finalContextMaxChunks=5 om de reranker meer kandidaten te geven zonder
  // de answer-context te vergroten.
  const retrievalTopK = bot.retrievalTopK ?? RAG_DEFAULTS.TOP_K;
  const rerankInputMax = bot.rerankInputMax ?? RAG_DEFAULTS.MAX_RERANK_INPUT;
  const finalContextMax = bot.finalContextMaxChunks ?? RAG_DEFAULTS.TOP_K;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    yield { kind: 'error', code: 'INPUT_INVALID' };
    return;
  }
  const original = input.question.trim();
  if (original.length === 0) {
    yield { kind: 'error', code: 'INPUT_INVALID' };
    return;
  }
  if (original.length > 1000) {
    yield { kind: 'error', code: 'INPUT_INVALID' };
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
  // V0 TTFT (time-to-first-token): tijd vanaf pipeline-start tot de eerste
  // zichtbare answer-delta. Eén keer ge-set op het eerste content-event van een
  // streamend antwoord-pad (main RAG + general-knowledge). Blijft null bij
  // smalltalk/fallback/cache-hit — daar streamt geen antwoord. Wordt in de
  // phaseTimingsMs van de antwoord-paden meegestuurd en door logQuery
  // gepromoveerd tot de query_log.first_token_ms-kolom (was tot nu toe alleen
  // door de eval-runner ge-set, nooit op het productiepad).
  let firstTokenAtMs: number | null = null;
  const markFirstToken = () => {
    if (firstTokenAtMs === null) {
      firstTokenAtMs = Math.round(performance.now() - tPipelineStart);
    }
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
  // Volgorde: persona-template → klant-overrides (klantendashboard-instellingen
  // zoals source-strictness, mayMentionPrices, extraInstructions, …) →
  // STIJL-suffix (tone + length). Klant-overrides staan ná de persona zodat
  // ze persona-velden (bedrijfsnaam, audience) kunnen aanvullen, en vóór de
  // STIJL-suffix omdat die het laatste woord moet hebben over de toon.
  const baseSystemPrompt = renderPersonaTemplate(bot.systemPrompt, persona);
  const extras = input.chatbotOverrides?.extraSystemInstructions ?? '';
  const styledSystemPrompt = buildSystemPrompt(
    extras.length > 0 ? `${baseSystemPrompt}\n\n${extras}` : baseSystemPrompt,
    { tone, length },
    bot.outputStyleVersion,
  );

  // 0. Manual Q&A fast-path — vóór preprocess/cache/embed.
  //
  // De klant heeft expliciet ingevoerd "vraag X = antwoord Y" via het
  // klantendashboard Q&A-tab. Als de huidige vraag dichtbij X ligt is dat
  // sterker signaal dan onze smalltalk-classifier (die "Wat is ChatManta?"
  // soms als smalltalk markeert) of een gecachte respons (mogelijk ouder dan
  // de meest recente Q&A-edit). Daarom checken we DIT als allereerste pad —
  // bespaart bovendien preprocess/embed/retrieve/LLM-cost bij een hit.
  if (input.manualQAItems && input.manualQAItems.length > 0) {
    const qaMatch = findMatchingManualQA(original, input.manualQAItems);
    if (qaMatch) {
      const qaResponse: ChatResponse = {
        botVersion: bot.version,
        tone,
        length,
        generalKnowledgeActual: null,
        kind: 'answer',
        answer: qaMatch.qa.answer,
        rewrite: null,
        sources: [
          {
            filename: qaMatch.qa.category
              ? `Handmatige Q&A · ${qaMatch.qa.category}`
              : 'Handmatige Q&A',
            similarity: qaMatch.score,
            contentExcerpt: qaMatch.qa.question,
          },
        ],
        threshold,
        embedTokens: 0,
        chatInputTokens: 0,
        chatOutputTokens: 0,
        totalCostUsd: 0,
        extras: {
          phaseTimingsMs: {
            embedding_ms: 0,
            retrieval_ms: 0,
            generation_ms: 0,
            total_ms: Math.round(performance.now() - tPipelineStart),
          },
        },
      };
      yield { kind: 'answer-done', response: qaResponse };
      return;
    }
  }

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
  let offTopicSuspected = false;

  const preProcessPromise = enableRewrite ? preProcessInput(original, bot, persona, history) : null;
  // cacheActive: alleen embedden als de cache écht gebruikt wordt. Zónder de
  // disableCache-gate hier zou een eval/script (disableCache:true) op een
  // cacheEnabled-bot tóch embedden — een verspilde call die in dat pad nooit
  // ge-await/gecatcht wordt (alleen het smalltalk-pad catcht 'm) → unhandled
  // rejection. Lookup/write zijn al disableCache-gated; dit sluit de embed mee.
  const cacheActive = bot.cacheEnabled && input.disableCache !== true;
  const cacheEmbedPromise = cacheActive ? embedTexts([original]) : null;

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
          generalKnowledgeActual: null,
          kind: 'smalltalk',
          answer: pp.reply,
          preProcessTokens: { in: pp.inputTokens, out: pp.outputTokens },
          totalCostUsd: pp.costUsd,
        },
      };
      return;
    }
    if (pp.kind === 'off_topic') {
      // Zacht signaal met corpus-veto: geen rewrite, HyDE uit, en bij lege
      // retrieval geeft de fallback hieronder de off-topic-tekst. Een in-scope
      // vraag met treffers passeert en wordt gewoon beantwoord.
      offTopicSuspected = bot.preProcessOffTopicDetection === true;
      if (offTopicSuspected) hydeModeActual = 'off';
      rewriteInfo = {
        original,
        rewritten: original,
        inputTokens: pp.inputTokens,
        outputTokens: pp.outputTokens,
        costUsd: pp.costUsd,
      };
      queryForEmbed = original;
    } else {
      rewriteInfo = {
        original,
        rewritten: pp.query,
        inputTokens: pp.inputTokens,
        outputTokens: pp.outputTokens,
        costUsd: pp.costUsd,
      };
      queryForEmbed = pp.query;
    }
  }
  const rewriteCost = rewriteInfo?.costUsd ?? 0;

  // Cache lookup — embed liep al parallel met preprocess; we awaiten alleen
  // het resultaat (in de best case is hij al klaar). disableCache (eval) slaat
  // de lookup over zodat altijd het huidige bot-gedrag wordt getest.
  if (cacheEmbedPromise && input.disableCache !== true) {
    yield { kind: 'status', phase: 'cache' };
    const stopCache = tMark('cache_lookup_ms');
    const stopEmbedCache = tMark('embedding_ms');
    const cacheEmbed = await cacheEmbedPromise;
    stopEmbedCache();
    preCacheEmbedTokens = cacheEmbed.tokens;
    preCacheEmbedCost = cacheEmbed.costUsd;
    cacheEmbedVector = cacheEmbed.vectors[0];
    const cached = await lookupCachedAnswer(
      client,
      cacheWriteClient,
      cacheEmbedVector,
      chatbotId,
      chatbotScoped,
      bot.version,
      orgId,
    );
    stopCache();
    if (cached) {
      // Mark cache hit + return. Sources/threshold copy uit gecachte response.
      // Tone/length: de gecachte rij is mogelijk geschreven onder andere stijl-
      // toggles; we accepteren die mismatch (zie spec) en BEHOUDEN de gecachte
      // tone/length op de response — het antwoord ís in die toon, dus de
      // telemetrie (Bot-prestaties, PR #173) moet de geserveerde toon loggen, niet
      // de gevraagde (nacht-audit C7).
      //
      // V0.5 fix: vervang de gecachte phaseTimingsMs door de werkelijke cache-
      // hit timings. Zonder dit erft elke cache-hit de full-pipeline timings
      // van de originele write (bv. 13s) en vertekent dat de aggregate p50/p95
      // omhoog — terwijl de UX een ms-snel antwoord is.
      const cacheHitTotalMs = Math.round(performance.now() - tPipelineStart);
      const cacheHitTimings: PhaseTimings = {
        embedding_ms: timings.embedding_ms ?? 0,
        retrieval_ms: 0,
        generation_ms: 0,
        total_ms: cacheHitTotalMs,
        ...(timings.cache_lookup_ms !== undefined
          ? { cache_lookup_ms: timings.cache_lookup_ms }
          : {}),
      };
      // v0.9.1 bron-links: schoon ook cache-hits. Oude cache-rijen (van vóór de
      // fix) kunnen verzonnen [tekst](url)-links bevatten die de renderer nu
      // klikbaar zou maken. Sanitize tegen de mee-gecachte bron-URLs; oude rijen
      // zonder url-veld → lege allowlist → alle links naar platte tekst.
      let cacheServed = cached;
      if (bot.sourceLinksEnabled && cached.kind === 'answer') {
        const cacheAllowed = buildAllowedUrlSet((cached.sources ?? []).map((s) => s.url));
        const cleaned = sanitizeSourceLinks(cached.answer, cacheAllowed);
        if (cleaned !== cached.answer) cacheServed = { ...cached, answer: cleaned };
      }
      const baseEnriched =
        cacheServed.kind === 'answer'
          ? {
              ...cacheServed,
              extras: {
                ...(cacheServed.extras ?? {}),
                fromCache: true,
                phaseTimingsMs: cacheHitTimings,
              },
            }
          : cacheServed;
      // Kost van een cache-hit = alléén de werkelijke marginale spend van DEZE
      // call (lookup-embedding + eventuele preprocess), niet de volledige
      // generatiekost van het oorspronkelijke antwoord uit response_json. Zónder
      // deze override telt het dag-budget (budget.ts somt query_log.cost_usd)
      // fantoom-spend en raakt een org te vroeg BUDGET_EXHAUSTED (nacht-audit SEC2).
      const enriched: ChatResponse = {
        ...baseEnriched,
        generalKnowledgeActual: null,
        totalCostUsd: preCacheEmbedCost + rewriteCost,
      };
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
  // v0.9.2: decompose-gate — skip de decompose-LLM-call op overtuigend single-hop
  // vragen (looksMultiHop=false), bespaart ~820ms p50 vóór het eerste token. Een
  // heuristiek-skip telt NIET als budget-skip (geen markSkipped). Bij
  // decomposeHeuristicGate=false/undefined draait decompose onvoorwaardelijk
  // (v0.9.1-gedrag).
  let decomposeGateAllows = true;
  if (bot.queryDecomposition && bot.decomposeHeuristicGate) {
    const { looksMultiHop } = await import('@/lib/rag/rag-decision');
    // Toets zowel de originele als de herschreven vraag: de rewrite poetst soms
    // de multi-hop-structuur ("...en hoeveel...") weg. Conservatief — decompose
    // blijft draaien als één van beide multi-hop oogt.
    decomposeGateAllows = looksMultiHop(original) || looksMultiHop(queryForEmbed);
  }
  if (
    bot.queryDecomposition &&
    decomposeGateAllows &&
    (withinBudget() || markSkipped('queryDecomposition'))
  ) {
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
        return retrieveChunksHybrid(
          client,
          vectors[i],
          q.text,
          retrievalTopK,
          withParents,
          orgId,
          chatbotId,
          chatbotScoped,
        );
      }
      return retrieveChunks(
        client,
        vectors[i],
        retrievalTopK,
        withParents,
        orgId,
        chatbotId,
        chatbotScoped,
      );
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

  // V0.6.2: adaptive decision — pre-HyDE call zodat we HyDE-gate via
  // decision.shouldUseHyDE (rekent latency-budget mee). Bij adaptiveRag=false
  // returnt de helper shouldUseHyDE=true zodat de bestaande selective-HyDE
  // conditie leidend blijft. We berekenen later nog een post-HyDE decision
  // voor rerank/cascade/verify gating.
  const { decideRagStrategy } = await import('@/lib/rag/rag-decision');
  const decisionPreHyDE = decideRagStrategy({
    bot,
    originalQuestion: original,
    rewrittenQuestion: queryForEmbed,
    top1Sim: topSim,
    top2Sim: merged[1]?.similarity ?? null,
    aboveThresholdCount: merged.filter((c) => c.similarity >= threshold).length,
    subQueryCount: subQueries.length,
    historyLength: history.length,
    elapsedMs: elapsedMs(),
  });

  // Selective HyDE: trigger pas hier, ALS top-1 onder de drempel zat. Eén
  // HyDE generate + embed + retrieve + merge. We zoeken NIET opnieuw met de
  // andere queries (sub-queries / multi-query) want die hadden hun kans al.
  // V0.6.2: extra adaptive-gate via decision.shouldUseHyDE.
  if (
    hydeModeActual === 'selective' &&
    (topSim ?? 0) < bot.selectiveHyDETrigger &&
    (!bot.adaptiveRag || decisionPreHyDE.shouldUseHyDE)
  ) {
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
      client,
      hydeEmbed.vectors[0],
      retrievalTopK,
      withParents,
      orgId,
      chatbotId,
      chatbotScoped,
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
  const allSources = merged.map((c) => toSource(c));

  // 5. Threshold filter.
  const aboveThreshold = merged.filter((c) => c.similarity >= threshold);
  if (aboveThreshold.length === 0) {
    // V0.5: tweede-stage re-classifier wanneer bot.generalKnowledgeEnabled
    // EN de UI-toggle aan staat. We weten nu dat retrieval géén relevante
    // chunks gaf — de vraag is dus ofwel algemene kennis binnen het domein
    // (GENERAL) of buiten het domein (OFF_TOPIC) of een specifiek detail dat
    // we eerlijk niet kennen (FALLBACK).
    //
    // Bij !generalKnowledgeActive (v0.1-v0.4, of v0.5 met toggle-uit)
    // gedragen we ons exact zoals v0.1-v0.4: vaste FALLBACK_MESSAGE, geen
    // LLM-call.
    if (generalKnowledgeActive) {
      const { reclassifyAfterZeroHits } = await import('@/lib/rag/reclassify');
      const rc = await reclassifyAfterZeroHits(original, bot, persona);
      const reclassifyTokensIn = rc.inputTokens;
      const reclassifyTokensOut = rc.outputTokens;
      const reclassifyCost = rc.costUsd;

      if (rc.category === 'general') {
        yield { kind: 'status', phase: 'answer' };
        // Deterministische opening + sluiting: buiten de LLM om geplakt zodat
        // ze 100% letterlijk aanwezig zijn én geen dubbele varianten kunnen
        // ontstaan. Niet-streaming hier: post-hoc sanitization is robuuster
        // dan mid-stream detectie, en latency-impact is acceptabel (GENERAL
        // is zelf al een fallback-pad bij zero retrieval-hits).
        const GENERAL_OPENING =
          'Even kort: dit valt buiten onze specifieke documentatie, maar in het algemeen ';
        // Persona-versie van de closing (Voor DEV_ORG: " Wil je weten hoe
        // ChatManta hier specifiek mee omgaat? Vraag gerust.")
        const GENERAL_CLOSING = persona.generalKnowledgeClosing;
        const generalSystem = renderPersonaTemplate(
          `Je bent een professionele klantcontact-medewerker van {{COMPANY}}{{COMPANY_SUFFIX}}. De gebruiker stelt een algemene-kennis-vraag binnen ons domein ({{DOMAIN_KEYWORDS}}).

Schrijf ALLEEN 1 tot 2 zinnen die kort uitleggen wat het onderwerp is. Schrijf in dezelfde taal als de vraag (default Nederlands).

KRITISCHE FORMAT-REGELS:
- Jouw output wordt geplakt achter de zinhelft "Even kort: dit valt buiten onze specifieke documentatie, maar in het algemeen " — begin daarom met een werkwoord (of voorzetsel) in kleine letter dat grammaticaal aansluit.
- Voorbeelden:
    Vraag: "Wat zijn MKB-bedrijven?" → "zijn MKB-bedrijven kleine en middelgrote ondernemingen die..."
    Vraag: "Wat is SaaS?" → "is SaaS een softwaremodel waarbij..."
    Vraag: "Wat doet een klantcontact-medewerker?" → "behandelt een klantcontact-medewerker vragen van klanten via..."
- Schrijf NOOIT zelf de opening ("Even kort", "In het algemeen", "Dit valt buiten...").
- Schrijf NOOIT zelf een afsluitende vraag of uitnodiging ("Wil je weten...", "Heb je verder...", "Kan ik je nog..."). Die sluiting wordt automatisch na jouw output geplakt.
- Eindig met een punt na de laatste inhoudelijke zin.
- Geen citations, geen <thinking>-tags, geen confidence, geen lijsten — alleen 1-2 vlotte zinnen.`,
          persona,
        );
        yield {
          kind: 'answer-start',
          botVersion: bot.version,
          sources: [],
          rewrite: rewriteInfo,
          threshold,
        };
        let modelText = '';
        let genChatInputTokens = 0;
        let genChatOutputTokens = 0;
        let genChatCostUsd = 0;
        const stopGenerationGen = tMark('generation_ms');
        try {
          const resp = await openai().chat.completions.create({
            model: bot.chatModel,
            temperature: bot.chatTemperature,
            max_tokens: 200,
            messages: [
              { role: 'system', content: generalSystem },
              { role: 'user', content: original },
            ],
          });
          modelText = resp.choices[0]?.message?.content ?? '';
          genChatInputTokens = resp.usage?.prompt_tokens ?? 0;
          genChatOutputTokens = resp.usage?.completion_tokens ?? 0;
          genChatCostUsd =
            (genChatInputTokens / 1_000_000) * CHAT_INPUT_PER_M_USD +
            (genChatOutputTokens / 1_000_000) * CHAT_OUTPUT_PER_M_USD;
        } catch (err) {
          stopGenerationGen();
          const code = classifyLlmError(err);
          console.error('[rag general-knowledge]', code, err instanceof Error ? err.message : err);
          yield { kind: 'error', code };
          return;
        }
        stopGenerationGen();

        // Post-hoc sanitize: strip opening-varianten, sluiting-varianten,
        // en force lowercase op de eerste letter zodat de zin grammaticaal
        // aansluit op "...in het algemeen ".
        let core = modelText.trim();
        core = core.replace(/^Even kort[:,—-]?\s*/i, '');
        core = core.replace(/^Dit valt buiten onze specifieke documentatie,?\s*maar\s*/i, '');
        core = core.replace(/^In het algemeen[:,]?\s*/i, '');
        // Persona-aware: matcht "Wil je weten hoe <companyName> hier ... mee
        // omgaat?" — voor DEV_ORG = "ChatManta", voor anderen de org-naam.
        core = core.replace(buildGeneralClosingStripRegex(persona), '');
        core = core.replace(
          /\s*(?:Heb je verder nog vragen|Kan ik je nog ergens mee helpen|Wil je meer weten)\??\s*$/i,
          '',
        );
        core = core.trim();
        if (core.length > 0 && /^[A-ZÀ-Ý]/.test(core)) {
          core = core[0].toLowerCase() + core.slice(1);
        }
        if (core.length > 0 && !/[.!?]$/.test(core)) {
          core += '.';
        }

        const finalAnswer = GENERAL_OPENING + core + GENERAL_CLOSING;
        // Eén delta met het volledige antwoord — geen streaming voor GENERAL,
        // maar UI-contract (answer-start → delta(s) → answer-done) blijft intact.
        // TTFT = moment dat dit content-event verschijnt (≈ total_ms hier).
        markFirstToken();
        yield { kind: 'answer-delta', text: finalAnswer };
        const genAccText = finalAnswer;

        const phaseTimingsGen: PhaseTimings = {
          embedding_ms: timings.embedding_ms ?? 0,
          retrieval_ms: timings.retrieval_ms ?? 0,
          generation_ms: timings.generation_ms ?? 0,
          total_ms: Math.round(performance.now() - tPipelineStart),
          ...(firstTokenAtMs !== null ? { first_token_ms: firstTokenAtMs } : {}),
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
          generalKnowledgeActual: true,
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
        const OFF_TOPIC_REFUSAL = `Ik help met vragen rondom ${persona.offTopicScope}. Wat wil je weten?`;
        yield {
          kind: 'fallback',
          response: {
            botVersion: bot.version,
            tone,
            length,
            generalKnowledgeActual: true,
            ...(bot.knowledgeGapLogging ? { gapKind: 'off_topic' as const } : {}),
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

      // rc.category === 'fallback' → val door naar de fallback-tekst (klant-
      // override of default).
      yield {
        kind: 'fallback',
        response: {
          botVersion: bot.version,
          tone,
          length,
          generalKnowledgeActual: true,
          ...(bot.knowledgeGapLogging ? { gapKind: 'zero_hits' as const } : {}),
          kind: 'fallback',
          answer: fallbackMessage,
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

    // Legacy pad: vaste fallback. Bij een bevestigd off_topic-signaal (pre-processor
    // zei off_topic ÉN retrieval is leeg → corpus-veto akkoord) gebruiken we de nette
    // off-topic-tekst i.p.v. de generieke fallback (anders klant-override fallbackMessage).
    yield {
      kind: 'fallback',
      response: {
        botVersion: bot.version,
        tone,
        length,
        generalKnowledgeActual: false,
        ...(offTopicSuspected && bot.knowledgeGapLogging
          ? { gapKind: 'off_topic' as const }
          : bot.knowledgeGapLogging
            ? { gapKind: 'zero_hits' as const }
            : {}),
        kind: 'fallback',
        answer: offTopicSuspected
          ? `Ik help met vragen rondom ${persona.offTopicScope}. Wat wil je weten?`
          : fallbackMessage,
        reason: offTopicSuspected
          ? `OFF_TOPIC (pre-processor); geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}).`
          : `Geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}).`,
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
  // V0.6.2: definitieve adaptive decision na threshold-filter + HyDE-augment.
  // Hierop hangen rerank / cascade / claim-verify / followups gates.
  const decision = decideRagStrategy({
    bot,
    originalQuestion: original,
    rewrittenQuestion: queryForEmbed,
    top1Sim: topSim,
    top2Sim: merged[1]?.similarity ?? null,
    aboveThresholdCount: aboveThreshold.length,
    subQueryCount: subQueries.length,
    historyLength: history.length,
    elapsedMs: elapsedMs(),
  });

  let final: RetrievedChunk[] = aboveThreshold.slice(0, finalContextMax);
  if (
    bot.rerank === 'llm' &&
    aboveThreshold.length > 1 &&
    (withinBudget() || markSkipped('rerank')) &&
    (!bot.adaptiveRag || decision.shouldRerank)
  ) {
    yield { kind: 'status', phase: 'rerank' };
    const stopRerank = tMark('rerank_ms');
    const candidates = aboveThreshold.slice(0, rerankInputMax);
    const r = await rerankChunks(original, candidates, finalContextMax, bot);
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
  //
  // v0.6.1 matched-span variant (bot.matchedSpanContext=true): toon de small
  // chunk als MATCHED_SPAN (precision-anker — wat feitelijk de match veroorzaakte)
  // en de parent als SURROUNDING_CONTEXT (nuance + bredere passage). De LLM
  // krijgt zo expliciete signalering wat het kern-bewijs is. Zonder de flag
  // (v0.5 en eerder) blijft de oude blob-aanpak.
  let context = '';
  let used = 0;
  let anyParentSwap = false;
  let usedMatchedSpan = false;
  // v0.9.1 bron-links: bij sourceLinksEnabled krijgt elke website-chunk een
  // `Bron-URL`-regel mee zodat de LLM exact die URL kan citeren. We verzamelen
  // de URLs van de chunks die daadwerkelijk in de context belanden — die set is
  // de allowlist voor de sanitizer (alles daarbuiten = verzonnen → gestript).
  const linkEnabled = bot.sourceLinksEnabled === true;
  const providedUrls: string[] = [];
  for (const c of final) {
    const hasParent = typeof c.parent_content === 'string' && c.parent_content.length > 0;
    if (hasParent) anyParentSwap = true;
    const header = `[chunk ${used + 1}, similarity=${c.similarity.toFixed(3)}]`;
    const urlLine = linkEnabled && c.source_url ? `\nBron-URL: ${c.source_url}` : '';
    let block: string;
    if (bot.matchedSpanContext && hasParent) {
      block = `${header}${urlLine}\nMATCHED_SPAN:\n${c.content}\n\nSURROUNDING_CONTEXT:\n${c.parent_content}\n\n`;
      usedMatchedSpan = true;
    } else {
      const text = c.parent_content ?? c.content;
      block = `${header}${urlLine}\n${text}\n\n`;
    }
    if (context.length + block.length > RAG_DEFAULTS.MAX_CONTEXT_CHARS) break;
    context += block;
    if (linkEnabled && c.source_url) providedUrls.push(c.source_url);
    used++;
  }
  const allowedUrls = buildAllowedUrlSet(providedUrls);
  // V0.6.1 — kort inline-prefix dat de LLM uitlegt hoe matched-span/surrounding
  // context te gebruiken. Alleen als minstens één chunk in matched-span format
  // gerenderd is. Op andere versies / chunks zonder parent: leeg, dus user-
  // prompt is byte-identiek aan v0.5.
  const matchedSpanIntro = usedMatchedSpan
    ? 'Bronnen-format: elke source bevat een MATCHED_SPAN (het exacte fragment dat met de vraag matchte) en SURROUNDING_CONTEXT (bredere passage). Baseer feitelijke claims primair op de MATCHED_SPAN — gebruik SURROUNDING_CONTEXT alleen voor nuance en begrip.\n\n'
    : '';
  // v0.9.1 bron-links: alleen tonen als minstens één bron een Bron-URL heeft.
  // Document-only orgs / DEV_ORG eval krijgen geen URL → deze intro is leeg →
  // de prompt blijft byte-identiek aan voorheen (geen eval-regressie).
  const sourceLinksIntro =
    linkEnabled && providedUrls.length > 0
      ? 'Bron-links: sommige bronnen hierboven hebben een "Bron-URL". Beantwoord de vraag ALTIJD eerst zelf — geef een kort, op de CONTEXT gebaseerd antwoord (enkele zinnen die samenvatten wat je weet). Gebruik links NOOIT als vervanging van een antwoord: antwoord dus niet met alleen "ik heb geen informatie, kijk op deze links" wanneer de context wél iets relevants bevat. Sluit je antwoord daarna — als er een relevante Bron-URL is — af met een korte doorverwijzing voor wie meer wil lezen: één of enkele markdown-links [korte omschrijving](URL). Gebruik UITSLUITEND exact een van de gegeven Bron-URLs, letterlijk overgenomen — verzin NOOIT zelf een URL of pad en wijzig een gegeven URL niet. Schrijf een URL ALTIJD als markdown-link [tekst](URL): nooit als kale URL, en zonder titel of aanhalingstekens achter de URL. Heb je geen passende Bron-URL? Verwijs dan in woorden, zonder link.\n\n'
      : '';
  // Taal-instelling — afgedwongen in de USER-turn (ná de vraag, hoogste salience).
  // Een taalregel in de system-prompt wordt door gpt-4o-mini genegeerd (de
  // Nederlandse STIJL-suffix komt erná → recency wint; empirisch bevestigd).
  // Gedreven door de KLANT-INSTELLING (autoDetectLanguage + primaryLanguage uit het
  // klantendashboard) → geldt voor ALLE bot-versies, niet per versie:
  //   autoDetectLanguage=false → antwoord altijd in primaryLanguage;
  //   autoDetectLanguage=true  → spiegel de taal van de bezoeker.
  // Hybride spiegeling: de deterministische detector dekt nl/en (zo blijft de
  // eval-baseline byte-identiek — die test alleen nl/en); voor élke ándere taal
  // krijgt de LLM een "antwoord in dezelfde taal als de vraag"-instructie i.p.v.
  // een terugval op Nederlands. Anders bleef een Spaanse/Duitse vraag Nederlands
  // beantwoord zodra auto-detectie aan stond (Niels item 10).
  // Nederlands is de natuurlijke default van het model (NL-prompt + NL-bronnen), dus
  // bij doeltaal Nederlands injecteren we géén directive.
  const primaryLanguage = input.chatbotOverrides?.primaryLanguage ?? 'nl';
  const autoDetectLanguage = input.chatbotOverrides?.autoDetectLanguage ?? true;
  const ANSWER_LANGUAGE_NAMES: Record<string, string> = {
    nl: 'Dutch',
    en: 'English',
    de: 'German',
    fr: 'French',
    es: 'Spanish',
  };
  const namedLanguageDirective = (lang: string) =>
    `\n\nIMPORTANT — ANSWER LANGUAGE: write your ENTIRE answer in ${ANSWER_LANGUAGE_NAMES[lang] ?? lang}, regardless of the language of the context or sources. Translate any source facts as needed; stay grounded and invent nothing.`;
  // Spiegel-instructie: laat de LLM zélf de taal van de vraag overnemen — dekt
  // élke taal zonder detector.
  const mirrorLanguageDirective = `\n\nIMPORTANT — ANSWER LANGUAGE: write your ENTIRE answer in the SAME LANGUAGE as the user's question (VRAAG above), regardless of the language of the context or sources. Translate any source facts as needed; stay grounded and invent nothing.`;
  let languageDirective = '';
  if (autoDetectLanguage) {
    const detected = detectLanguage(original);
    if (detected === 'en') languageDirective = namedLanguageDirective('en');
    else if (detected !== 'nl') languageDirective = mirrorLanguageDirective;
    // detected === 'nl' → geen directive (Nederlands = natuurlijke default).
  } else if (primaryLanguage !== 'nl') {
    languageDirective = namedLanguageDirective(primaryLanguage);
  }
  // WP4 (A2) — handmatige Q&A is gezaghebbend bij tegenstrijdigheid. Een
  // klant-bijgewerkte Q&A wordt als 'Vraag: … Antwoord: …'-chunk ge-embed en kan
  // naast een oudere gecrawlde chunk in de context belanden (bv. nieuwe vs oude
  // openingstijden). Deze regel laat de LLM bij conflict de Q&A volgen. Alleen
  // injecteren als de org überhaupt handmatige Q&A heeft → orgs zonder Q&A
  // (incl. DEV_ORG eval) houden een byte-identieke prompt.
  const manualQAAuthorityIntro =
    input.manualQAItems && input.manualQAItems.length > 0
      ? 'Let op: een bron in de vorm "Vraag: … Antwoord: …" is een handmatig door de klant toegevoegde Q&A en is gezaghebbend. Spreekt zo\'n Q&A een andere bron tegen (bijvoorbeeld andere openingstijden, prijzen of voorwaarden), volg dan de Q&A — die is bewust bijgewerkt.\n\n'
      : '';
  const userPrompt = `${manualQAAuthorityIntro}${sourceLinksIntro}${matchedSpanIntro}CONTEXT:\n${context.trim()}\n\nVRAAG: ${original}${languageDirective}`;

  // 8. Emit start event with metadata so UI can show sources panel before
  //    tokens arrive.
  yield { kind: 'status', phase: 'answer' };
  const usedSources = final.slice(0, used).map((c) => toSource(c, input.includeFullParentContent ?? false));
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
  // Sliding window: alléén de laatste N turns gaan mee naar de answer-LLM.
  // Voorkomt dat TTFT lineair groeit met gespreks-lengte. DB-history blijft
  // ongewijzigd; alleen het LLM-payload-venster is begrensd.
  const answerHistory = history.slice(-RAG_CHAT_HISTORY_TURNS);
  try {
    const stream = await openai().chat.completions.create({
      model: bot.chatModel,
      temperature: bot.chatTemperature,
      max_tokens: RAG_DEFAULTS.CHAT_MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: styledSystemPrompt },
        ...answerHistory.map((t) => ({ role: t.role, content: t.content })),
        { role: 'user', content: userPrompt },
      ],
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        markFirstToken();
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
    const code = classifyLlmError(err);
    console.error('[rag answer-stream]', code, err instanceof Error ? err.message : err);
    yield { kind: 'error', code };
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
    // Retrieval-gate (v0.5 hotfix 2026-05-13): cascade alleen als top-1 chunk
    // sterk genoeg is. Op zwakke retrieval (top1_sim < cascadeMinTopSim) is
    // er geen grond om "harder te proberen" — een sterker model vult dan met
    // priors en hallucineert. Zie docs/superpowers/specs/
    // 2026-05-13-v0.5-cascade-hotfix-design.md.
    // V0.6.2: extra adaptive-gate. Bij adaptiveRag=true gebruikt cascade de
    // strengere adaptiveCascadeMinTopSim (0.60 default) i.p.v. bot.cascadeMinTopSim
    // (0.50), én moet decision.shouldCascade aan staan (= retrievalStrength
    // medium/strong + aboveThresholdCount >= 2). Bij weak retrieval: cascade
    // NIET — een sterker model vult dan met priors → hallucinatie.
    const effectiveCascadeMinSim = bot.adaptiveRag
      ? (bot.adaptiveCascadeMinTopSim ?? bot.cascadeMinTopSim)
      : bot.cascadeMinTopSim;
    if (
      bot.cascadeOnLowConfidence &&
      confidence !== null &&
      confidence < 0.5 &&
      topSim !== null &&
      topSim >= effectiveCascadeMinSim &&
      bot.cascadeModel !== bot.chatModel &&
      (withinBudget() || markSkipped('cascade')) &&
      (!bot.adaptiveRag || decision.shouldCascade)
    ) {
      yield { kind: 'status', phase: 'cascade' };
      const stopCascade = tMark('cascade_ms');
      try {
        const stronger = await chatComplete({
          model: bot.cascadeModel,
          system: styledSystemPrompt,
          user: userPrompt,
          temperature: bot.chatTemperature,
          maxTokens: RAG_DEFAULTS.CHAT_MAX_TOKENS,
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

  // v0.9.1 bron-links: strijk elke markdown-link met een niet-aangeleverde of
  // niet-http(s) URL terug naar platte tekst. Gated op allowedUrls.size>0 zodat
  // document-only orgs / DEV_ORG eval (geen Bron-URL) byte-identiek blijven.
  // Vóór claim-verify zodat die de geschoonde tekst beoordeelt.
  if (linkEnabled && allowedUrls.size > 0) {
    finalAnswerText = sanitizeSourceLinks(finalAnswerText, allowedUrls);
  }

  // v0.4 claim verification — split antwoord in claims, embed-vergelijk met
  // de chunks die de LLM zag (parent_content waar beschikbaar). Cheap: één
  // batched embed call, ~$0.0001. Geen LLM-call, geen prompt-cost.
  //
  // v0.6.1: bij bot.adaptiveHardFactVerification ook regex-extractie van
  // harde feiten (geld/percentages/datums/etc.) per claim + check of die
  // letterlijk of genormaliseerd in de chunks staan. Resultaat wordt mee-
  // gegeven aan de regenerate-trigger (Stage 15) zodat een hallucinatie van
  // een specifiek bedrag óók een tweede poging triggert, niet alleen lage
  // embedding-similarity.
  let claimVerifyEmbedTokens = 0;
  let claimVerifyEmbedCost = 0;
  let claimsList: ClaimVerificationData[] | undefined;
  let claimConfidence: number | undefined;
  let hardFactSupported: boolean | undefined;
  let missingHardFacts: string[] | undefined;
  // v0.6.1: bij adaptiveHardFactVerification mag claim-verify NIET geskipt
  // worden door latency-budget — anders draait de hard-fact check (die
  // op claim-verify-output bouwt) nooit op de langzame queries waar
  // hallucinatie-risico het hoogst is. Cost van verify is ~200ms + één
  // embed-call (~$0.0001), acceptabele uitruil voor grounding-correctheid.
  //
  // V0.6.2: extra adaptive-gate via decision.shouldVerifyClaims. Op 'fast'-
  // pad (sterke retrieval + clear winner + single-query) wordt verify
  // overgeslagen — daar is hallucinatie-risico laag genoeg. 'standard' en
  // 'careful' draaien verify altijd.
  const verifyBudgetGate =
    bot.adaptiveHardFactVerification === true
      ? true
      : (withinBudget() || markSkipped('claimVerification'));
  const verifyDecisionGate =
    !bot.adaptiveRag || decision.shouldVerifyClaims;
  if (bot.claimVerification && verifyBudgetGate && verifyDecisionGate) {
    yield { kind: 'status', phase: 'verify' };
    const stopVerify = tMark('verify_ms');
    try {
      const { verifyClaims } = await import('@/lib/rag/claims');
      const chunkInputs = final.slice(0, used).map((c) => ({
        id: c.id,
        text: c.parent_content ?? c.content,
      }));
      const result = await verifyClaims({
        // v0.9.1 bron-links: reduceer markdown-links tot hun label vóór verify.
        // De bron-link-URLs zijn al sanitizer-gevalideerd en zitten in metadata
        // (niet in chunk-content), dus de hard-fact-verifier zou ze anders als
        // ongegronde "url:"-feiten flaggen en het hele antwoord deterministisch
        // weigeren. Proza-feiten (prijs/datum/getal) blijven in de label-tekst.
        // Zelfde gate als sanitizer/prompt (linkEnabled && allowedUrls.size > 0):
        // op paden zonder echte Bron-URL draait de strip niet → de URL-anti-
        // hallucinatie buiten de bron-link-case blijft byte-identiek.
        answerText:
          linkEnabled && allowedUrls.size > 0 ? stripMarkdownLinks(finalAnswerText) : finalAnswerText,
        chunks: chunkInputs,
        threshold: bot.claimVerificationThreshold,
        hardFactCheck: bot.adaptiveHardFactVerification === true,
        hardFactNumericFallback: bot.hardFactNumericFallback,
      });
      claimVerifyEmbedTokens = result.embedTokens;
      claimVerifyEmbedCost = result.costUsd;
      if (result.claims.length > 0) {
        claimsList = result.claims;
        claimConfidence = Number.isFinite(result.confidence) ? result.confidence : undefined;
      }
      if (bot.adaptiveHardFactVerification === true) {
        hardFactSupported = result.hardFactSupported;
        missingHardFacts = result.missingHardFacts ?? [];
      }
    } catch (err) {
      console.warn('[claim verification] failed:', err);
    }
    stopVerify();
  }

  // v0.8.1 anti-adoptie: detecteer of de bot een persoonsnaam/entiteit uit de
  // chat-history heeft overgenomen die NIET in de sources staat (= mogelijke
  // adoptie van een geplant feit). Pure, goedkope check; voedt straks de
  // BESTAANDE claim-regenerate-trigger. Alleen bij historyEntityVerification.
  let adoptedHistoryEntities: string[] = [];
  if (bot.historyEntityVerification === true && history.length > 0) {
    try {
      const { detectAdoptedHistoryEntities } = await import('@/lib/rag/history-entities');
      const historyUserContents = history
        .filter((t) => t.role === 'user')
        .map((t) => t.content);
      const sourceTexts = final.slice(0, used).map((c) => c.parent_content ?? c.content);
      adoptedHistoryEntities = detectAdoptedHistoryEntities(
        historyUserContents,
        finalAnswerText,
        sourceTexts,
      );
    } catch (err) {
      console.warn('[history-entity verification] failed:', err);
    }
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
    ...(firstTokenAtMs !== null ? { first_token_ms: firstTokenAtMs } : {}),
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
    generalKnowledgeActual: null,
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
      // v0.6.1 hard-fact verifier — alleen aanwezig als bot.adaptiveHardFactVerification
      // aan stond. regenerateTriggered wordt door Stage 15 mogelijk later
      // gemuteerd via activeResponse.extras (zie regenExtras hieronder).
      ...(hardFactSupported !== undefined
        ? {
            hardFactSupport: {
              supported: hardFactSupported,
              missing: missingHardFacts ?? [],
            },
          }
        : {}),
      // v0.8.1 anti-adoptie telemetrie — alleen bij detectie.
      ...(adoptedHistoryEntities.length > 0
        ? { adoptedHistoryEntities: [...adoptedHistoryEntities] }
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
      // V0.6.2 adaptive decision — alleen aanwezig wanneer bot.adaptiveRag.
      // Bevat path + retrievalStrength + per-stage booleans + reasonCodes.
      // Wordt door log.ts naar query_log.adaptive_decision (jsonb) gemapt.
      ...(bot.adaptiveRag
        ? {
            adaptiveDecision: {
              path: decision.path,
              retrievalStrength: decision.retrievalStrength,
              shouldUseHyDE: decision.shouldUseHyDE,
              shouldRerank: decision.shouldRerank,
              shouldVerifyClaims: decision.shouldVerifyClaims,
              shouldRegenerateClaims: decision.shouldRegenerateClaims,
              shouldCascade: decision.shouldCascade,
              shouldGenerateFollowupsInline: decision.shouldGenerateFollowupsInline,
              reasonCodes: decision.reasonCodes,
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
  //
  // V0.6.1: regenerate triggert OOK wanneer bot.adaptiveHardFactVerification
  // hardFactSupported=false meldt (= een specifiek bedrag/datum/aantal in het
  // antwoord staat NIET in de chunks). Embedding-similarity vangt zo'n
  // hallucinatie van een concreet getal niet (vector-shape matcht ~hetzelfde).
  // De regenerate met stricter prompt mag dat getal dan weglaten.
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
  let regenerateHardFactSupported: boolean | undefined;
  let regenerateMissingHardFacts: string[] | undefined;
  const lowClaimConfidence =
    typeof claimConfidence === 'number' &&
    Number.isFinite(claimConfidence) &&
    claimConfidence < bot.claimRegenerateThreshold;
  const unsupportedHardFact =
    bot.adaptiveHardFactVerification === true && hardFactSupported === false;
  // v0.8.1 — derde OR-term: de bot nam een history-entiteit over die niet in
  // de bronnen staat. Voegt toe aan de bestaande trigger (OR blijft OR).
  const unsupportedHistoryEntity =
    bot.historyEntityVerification === true && adoptedHistoryEntities.length > 0;
  // v0.8.1 anti-adoptie — DETERMINISTISCH pad. Bij een gedetecteerde adoptie
  // van een history-entiteit vervangen we het antwoord door een vast, eerlijk
  // weiger-template (géén creatieve LLM-call). Reden: een tweede LLM-poging met
  // anti-adoptie-instructie bleek empirisch onbetrouwbaar (de bot adopteerde
  // alsnog). Een deterministisch template verwijdert de hallucinatie hard.
  // Werkt op élk pad (ook fast-path, waar verify/claims geskipt zijn). Dit is
  // de Option-A "deterministisch template"-aanpak, geen parallelle gate.
  if (bot.claimRegenerateEnabled && unsupportedHistoryEntity) {
    const entityList = adoptedHistoryEntities.slice(0, 3).join(', ');
    activeAnswerText =
      `Ik kan ${entityList} niet in onze gegevens terugvinden, dus dat kan ik niet bevestigen. ` +
      `Iets dat in een eerder bericht is genoemd, neem ik niet zomaar over als juist. ` +
      `Voor de juiste persoon of een afspraak kunt u het beste rechtstreeks contact met ons opnemen.`;
    activeResponse = {
      ...activeResponse,
      answer: activeAnswerText,
      extras: {
        ...(activeResponse.extras ?? {}),
        adoptedHistoryEntities: [...adoptedHistoryEntities],
      },
      ...(bot.knowledgeGapLogging ? { gapKind: 'low_grounding' as const } : {}),
    };
    yield {
      kind: 'replacement',
      response: activeResponse,
      reason: 'history-entity-adoption',
      regeneratedVerifiedRatio: null,
    };
  }

  // v0.9 (iter2) anti-hallucinatie — DETERMINISTISCH pad voor ongegronde hard-
  // facts. Zelfde les als v0.8.1 history-entity: een tweede LLM-poging die het
  // verzonnen bedrag/datum moet weglaten is empirisch onbetrouwbaar (de bot
  // produceert het opnieuw). Bij een ONGEGRONDE hard-fact-hallucinatie
  // (hardFactSupported=false ÉN retrieval ZWAK/MEDIUM — NIET claim-confidence,
  // want een fabricatie heeft confidence≈1) vervangen we deterministisch door
  // een eerlijk weiger/doorverwijs-template. De retrieval-sterkte-conditie spaart
  // gegronde tiered-calc bij STRONG retrieval → geen over-refusal op correcte
  // rekenkunde. Geen parallelle gate.
  //
  // v0.9.1 safety-aware verfijning: NUMBER_RE telt élk getal ≥2 cijfers als hard
  // feit, dus een correct "bel 112"-noodadvies telt als ongegrond getal (112
  // staat per definitie niet in het corpus) → v0.9 overschreef een spoed-
  // doorverwijzing met de generieke weigering (hh-globex-spoed-regressie). Onder
  // bot.hardFactRefusalSafetyAware vuurt de gate nooit op een draft die al een
  // nood-/escalatie-doorverwijzing bevat. Prijs-/datum-fabricaties bevatten deze
  // termen nooit → de anti-fabricatie-upside van v0.9 blijft volledig intact.
  const draftHasSafetyHandoff =
    bot.hardFactRefusalSafetyAware === true && containsEmergencyHandoff(activeAnswerText);
  const deterministicHardFactRefusal = shouldDeterministicallyRefuseHardFact({
    enabled: bot.hardFactDeterministicRefusal === true,
    hardFactSupported,
    retrievalStrength: decision.retrievalStrength,
    adoptedHistoryEntity: unsupportedHistoryEntity,
    safetyAware: bot.hardFactRefusalSafetyAware === true,
    draftHasSafetyHandoff,
    // v0.10 (C11) — fabricatie-klasse-lever: benign los getal weigert niet meer.
    fabricationClassOnly: bot.hardFactRefusalFabricationClassOnly === true,
    missingHardFacts,
  });
  if (bot.claimRegenerateEnabled && deterministicHardFactRefusal) {
    activeAnswerText =
      `Ik kan dat specifieke gegeven niet terugvinden in onze informatie, dus dat kan ik niet met zekerheid bevestigen. ` +
      `Voor exacte bedragen, datums of cijfers kunt u het beste even rechtstreeks contact met ons opnemen — dan krijgt u een antwoord waar u op kunt rekenen.`;
    activeResponse = {
      ...activeResponse,
      answer: activeAnswerText,
      extras: {
        ...(activeResponse.extras ?? {}),
        // v0.10 (P4): markeer dit als de DETERMINISTISCHE hard-fact-weigering zodat
        // de eval-runner het echte refusal-event kan tellen (los van de LLM-regenerate).
        deterministicHardFactRefusal: true,
        ...(hardFactSupported !== undefined
          ? {
              hardFactSupport: {
                supported: false,
                missing: missingHardFacts ?? [],
                regenerateTriggered: true,
              },
            }
          : {}),
      },
      ...(bot.knowledgeGapLogging ? { gapKind: 'low_grounding' as const } : {}),
    };
    yield {
      kind: 'replacement',
      response: activeResponse,
      reason: 'claim-regenerate',
      regeneratedVerifiedRatio: null,
    };
  }

  // Claim/hard-fact regenerate (LLM-poging) — alleen wanneer GEEN history-
  // entiteit-adoptie én GEEN deterministische hard-fact-weigering (beide hierboven
  // al afgehandeld) en er geverifieerde claims zijn.
  const claimBasedTrigger =
    (lowClaimConfidence || unsupportedHardFact) && !!claimsList && claimsList.length > 0;
  if (
    bot.claimRegenerateEnabled &&
    !unsupportedHistoryEntity &&
    !deterministicHardFactRefusal &&
    claimBasedTrigger &&
    (withinBudget() || markSkipped('claimRegenerate'))
  ) {
    const REGENERATE_SYSTEM_ADDON = `

[REGENERATE-REGEL — alleen voor deze tweede poging]
Je geeft een tweede poging. Beperk je nu STRIKT tot uitspraken die letterlijk of bijna letterlijk in de aangeleverde chunks staan. Bij twijfel of een feit echt in de context staat: laat het feit weg. Liever een korter, voorzichtiger antwoord dan een antwoord met onverifieerbare claims.${
      unsupportedHardFact && missingHardFacts && missingHardFacts.length > 0
        ? `\n\nSpecifiek: in de vorige poging stonden harde feiten die NIET in de bronnen zijn terug te vinden (${missingHardFacts.slice(0, 5).join(', ')}). Laat zulke bedragen/datums/aantallen/contactgegevens weg of vervang ze met een algemeen "neem contact op voor exacte details".`
        : ''
    }`;
    try {
      const stricter = await chatComplete({
        model: bot.chatModel,
        system: styledSystemPrompt + REGENERATE_SYSTEM_ADDON,
        user: userPrompt,
        temperature: Math.max(0.0, bot.chatTemperature - 0.2),
        maxTokens: RAG_DEFAULTS.CHAT_MAX_TOKENS,
      });
      regenerateInputTokens = stricter.inputTokens;
      regenerateOutputTokens = stricter.outputTokens;
      regenerateCost = stricter.costUsd;
      const reparsedRegen = parseV03Output(stricter.text);
      activeAnswerText = reparsedRegen.answer || stricter.text.trim();
      // Bron-links ook op de regenerate-poging afdwingen (zelfde gate).
      if (linkEnabled && allowedUrls.size > 0) {
        activeAnswerText = sanitizeSourceLinks(activeAnswerText, allowedUrls);
      }

      try {
        const { verifyClaims } = await import('@/lib/rag/claims');
        const chunkInputs2 = final.slice(0, used).map((c) => ({
          id: c.id,
          text: c.parent_content ?? c.content,
        }));
        const verifyResult2 = await verifyClaims({
          // Zie verify hierboven: bron-link-URLs uit de tekst halen vóór verify
          // (zelfde gate als sanitizer → byte-identiek buiten de bron-link-case).
          answerText:
            linkEnabled && allowedUrls.size > 0 ? stripMarkdownLinks(activeAnswerText) : activeAnswerText,
          chunks: chunkInputs2,
          threshold: bot.claimVerificationThreshold,
          hardFactCheck: bot.adaptiveHardFactVerification === true,
          hardFactNumericFallback: bot.hardFactNumericFallback,
        });
        regenerateRatio = Number.isFinite(verifyResult2.confidence)
          ? verifyResult2.confidence
          : null;
        if (verifyResult2.claims.length > 0) regenerateClaims = verifyResult2.claims;
        if (bot.adaptiveHardFactVerification === true) {
          regenerateHardFactSupported = verifyResult2.hardFactSupported;
          regenerateMissingHardFacts = verifyResult2.missingHardFacts ?? [];
        }
      } catch (err) {
        console.warn('[regenerate verify] failed:', err);
      }

      const regenExtras = {
        ...(activeResponse.extras ?? {}),
        ...(regenerateClaims ? { claims: regenerateClaims } : {}),
        ...(regenerateRatio !== null ? { claimConfidence: regenerateRatio } : {}),
        // v0.6.1 — overschrijf hardFactSupport met regenerate-resultaat en
        // markeer dat regenerate getriggered is (waardevol voor eval slicing).
        ...(regenerateHardFactSupported !== undefined
          ? {
              hardFactSupport: {
                supported: regenerateHardFactSupported,
                missing: regenerateMissingHardFacts ?? [],
                regenerateTriggered: true,
              },
            }
          : hardFactSupported !== undefined
            ? {
                hardFactSupport: {
                  supported: hardFactSupported,
                  missing: missingHardFacts ?? [],
                  regenerateTriggered: true,
                },
              }
            : {}),
      };
      // V0.6.2 gapKind classificatie: hard-fact failure → 'low_grounding',
      // anders claimConfidence-trigger → 'low_confidence'. Alleen wanneer
      // bot.knowledgeGapLogging, anders blijft gapKind undefined.
      const gapKindForRegenerate: 'low_grounding' | 'low_confidence' | undefined =
        bot.knowledgeGapLogging
          ? unsupportedHardFact
            ? 'low_grounding'
            : 'low_confidence'
          : undefined;
      activeResponse = {
        ...activeResponse,
        answer: activeAnswerText,
        chatInputTokens: activeResponse.chatInputTokens + regenerateInputTokens,
        chatOutputTokens: activeResponse.chatOutputTokens + regenerateOutputTokens,
        totalCostUsd: activeResponse.totalCostUsd + regenerateCost,
        extras: regenExtras,
        ...(gapKindForRegenerate ? { gapKind: gapKindForRegenerate } : {}),
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

  // v0.9.1 — deterministische off-domein-code-guard. Een klantcontact-bot van een
  // niet-technische org hoort nooit code te produceren; een code-block in het
  // antwoord is per definitie off-scope task-execution. De prompt-instructie alleen
  // houdt gpt-4o-mini hier niet betrouwbaar tegen (scope-acme-code flake), dus
  // vervangen we het code-antwoord deterministisch door de bestaande off-topic-
  // refusal. Laatste answer-mutatie (na regenerate) zodat niets het overschrijft.
  // Flag-guarded → alleen v0.9.1; geen false-positives voor proza-antwoorden.
  if (bot.offDomainCodeRefusal === true && containsCodeOutput(activeAnswerText)) {
    activeAnswerText = `Daar kan ik je helaas niet mee helpen — ik help met vragen rondom ${persona.offTopicScope}. Waar kan ik je mee van dienst zijn?`;
    activeResponse = {
      ...activeResponse,
      answer: activeAnswerText,
      ...(bot.knowledgeGapLogging ? { gapKind: 'off_topic' as const } : {}),
    };
    yield {
      kind: 'replacement',
      response: activeResponse,
      reason: 'off-domain-code-refusal',
      regeneratedVerifiedRatio: null,
    };
  }

  // Followups na de answer-done yield — gebruiker ziet antwoord al, followups
  // verschijnen kort daarna in de UI via het followups-done event.
  // V0.5: hard timeout op 5s zodat een trage OpenAI-call niet de finale
  // metrics-done blokkeert. Bij timeout of throw → emit followups-done met
  // lege array + error-string.
  //
  // V0.6.2: bij adaptiveRag staan inline-followups standaard UIT
  // (decision.shouldGenerateFollowupsInline=false). UI-contract blijft
  // intact door alsnog een lege followups-done te yielden met error-string
  // 'skipped-adaptive-v06'. Followups blijven beschikbaar voor latere
  // sync-call vanuit de UI zelf indien gewenst.
  if (
    bot.adaptiveRag &&
    bot.generateFollowUps &&
    !decision.shouldGenerateFollowupsInline
  ) {
    yield {
      kind: 'followups-done',
      followUps: [],
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      error: 'skipped-adaptive-v06',
    };
  } else if (bot.generateFollowUps && (withinBudget() || markSkipped('followups'))) {
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
  // BLIJFT bevroren op het answer-done moment (time-to-final-answer = wat de
  // gebruiker voelt). Followups draait na de answer-done yield en wordt apart
  // gerapporteerd via followups_ms — dat dubbel optellen in total_ms zou de
  // gerapporteerde SLA ~p95 = 3s slechter maken dan de UX is.
  const phaseTimingsFinal: PhaseTimings = {
    ...phaseTimingsAtAnswer,
    ...(timings.followups_ms !== undefined ? { followups_ms: timings.followups_ms } : {}),
  };
  yield { kind: 'metrics-done', phaseTimingsMs: phaseTimingsFinal };

  // Cache write (fire-and-forget) — v0.4: hergebruik de pre-cache embed
  // vector ipv opnieuw embedden (~1.2s + cost-saving per request). Echte
  // error-log ipv stille catch. We schrijven de COMPLETE response naar de
  // cache (inclusief followups + finale timings), zodat een cache-hit later
  // dezelfde UX levert als een verse RAG-run.
  if (bot.cacheEnabled && cacheEmbedVector && input.disableCache !== true) {
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
    writeCachedAnswer(
      cacheWriteClient,
      original,
      cacheEmbedVector,
      chatbotId,
      chatbotScoped,
      bot.version,
      cachedResponse,
      orgId,
    ).catch((err) => console.warn('[cache write] failed:', err instanceof Error ? err.message : err));
  }
}
