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

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM = 1536;
const EMBED_COST_PER_M_USD = 0.02;
const EMBED_BATCH_SIZE = 100;

const CHAT_MODEL = 'gpt-4o-mini';
const CHAT_INPUT_PER_M_USD = 0.15;
const CHAT_OUTPUT_PER_M_USD = 0.60;

// Char-based chunker config. Token-based chunking schuift naar V1 Fase 4.
const CHUNK_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;

// V0 RAG config (parallel aan lib/rag/config.ts; V0 wegwerp dus apart).
// Default 0.4 in plaats van blueprint-default 0.7: V0 testing toont dat
// OpenAI text-embedding-3-small + NL content scoort in 0.4-0.6 range zelfs
// voor goede matches (zie git commit b8d74b5 + project memory).
export const V0_RAG_DEFAULTS = {
  TOP_K: 5,
  SIMILARITY_THRESHOLD: 0.4,
  MAX_CONTEXT_CHARS: 12000,
  CHAT_MAX_TOKENS: 500,
  // 0.4 (was 0.2): geeft het model wat ruimte om te herformuleren ipv woordelijk
  // citeren, zonder feitelijkheid op te offeren. Anti-hallucinatie blijft via
  // de system prompt afgedwongen.
  CHAT_TEMPERATURE: 0.4,
  REWRITE_TEMPERATURE: 0.3,
  REWRITE_MAX_TOKENS: 200,
  ENABLE_REWRITE_BY_DEFAULT: true,
} as const;

export const FALLBACK_MESSAGE =
  'Daar heb ik geen informatie over. Stel je vraag anders, of neem contact op met de organisatie.';

const SYSTEM_PROMPT = `Je bent een Nederlandse kennisassistent voor MKB-bedrijven.

Beantwoord de vraag van de gebruiker op basis van de gegeven context-fragmenten:
- Synthetiseer de relevante informatie tot een natuurlijke, behulpzame uitleg.
- Herformuleer in eigen woorden waar dat de leesbaarheid helpt; herhaal niet woordelijk.
- Geef NOOIT feiten die niet in de context staan. Als de informatie ontbreekt of onduidelijk is: zeg dat eerlijk in plaats van iets aan te nemen.
- Antwoord in dezelfde taal als de (originele) vraag — default Nederlands.
- Houd het beknopt maar volledig — typisch 2-5 zinnen.`;

const REWRITE_SYSTEM = `Je bent een query-herschrijver voor een semantische zoekmachine. Je herformuleert de vraag van de gebruiker tot een vorm die beter aansluit bij hoe de bron-documenten geschreven zijn.

Regels:
- Corrigeer evidente typfouten en grammaticafouten.
- Maak impliciete onderwerpen expliciet als die uit de vraag zelf duidelijk zijn (bv. "wat doet het?" → "wat doet ChatManta?" wanneer dat duidelijk de intentie is).
- Voeg synoniemen of verwante termen toe die de vraag verduidelijken.
- Behoud de oorspronkelijke intentie EXACT — voeg geen interpretaties of antwoorden toe.
- Geef ALLEEN de herschreven vraag terug — geen uitleg, geen aanhalingstekens, geen prefix.`;

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

export async function embedTexts(strings: string[]): Promise<EmbedResult> {
  if (strings.length === 0) return { vectors: [], tokens: 0, costUsd: 0 };
  const vectors: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < strings.length; i += EMBED_BATCH_SIZE) {
    const batch = strings.slice(i, i + EMBED_BATCH_SIZE);
    const resp = await openai().embeddings.create({
      model: EMBED_MODEL,
      input: batch,
    });
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
  system,
  user,
  temperature = V0_RAG_DEFAULTS.CHAT_TEMPERATURE,
  maxTokens = V0_RAG_DEFAULTS.CHAT_MAX_TOKENS,
}: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatCompleteResult> {
  const resp = await openai().chat.completions.create({
    model: CHAT_MODEL,
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
// Query rewriting — optional pre-embed step that fixes typos, expands
// underspecified queries, and adds synonyms. Improves retrieval quality on
// ambiguous or typo-heavy user input at the cost of one extra LLM call
// (~$0.0001 per question with gpt-4o-mini).
// ---------------------------------------------------------------------------
type RewriteResult = {
  rewritten: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

async function rewriteQuery(original: string): Promise<RewriteResult> {
  const result = await chatComplete({
    system: REWRITE_SYSTEM,
    user: original,
    temperature: V0_RAG_DEFAULTS.REWRITE_TEMPERATURE,
    maxTokens: V0_RAG_DEFAULTS.REWRITE_MAX_TOKENS,
  });
  // Strip surrounding quotes the model sometimes adds despite the system prompt.
  let rewritten = result.text.trim();
  if (
    (rewritten.startsWith('"') && rewritten.endsWith('"')) ||
    (rewritten.startsWith('„') && rewritten.endsWith('"'))
  ) {
    rewritten = rewritten.slice(1, -1).trim();
  }
  // Defensive: fall back to original if rewrite is empty or too long.
  if (rewritten.length === 0 || rewritten.length > 1000) rewritten = original;
  return {
    rewritten,
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
};

export type RetrievedChunk = RawChunk & { filename: string | null };

async function retrieveChunks(
  queryVector: number[],
  topK: number,
): Promise<RetrievedChunk[]> {
  const sb = supabase();
  const { data, error } = await sb.rpc('match_chunks', {
    p_organization_id: DEV_ORG_ID,
    query_embedding: queryVector,
    match_count: topK,
  });
  if (error) throw new Error(`match_chunks: ${error.message}`);

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

// ---------------------------------------------------------------------------
// runRagQuery — public entrypoint for chat server action
// ---------------------------------------------------------------------------
export type ChatSource = {
  filename: string | null;
  similarity: number;
  contentExcerpt: string;
};

export type ChatRewriteInfo = {
  original: string;
  rewritten: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type ChatResponse =
  | {
      kind: 'answer';
      answer: string;
      rewrite: ChatRewriteInfo | null;
      sources: ChatSource[];
      threshold: number;
      embedTokens: number;
      chatInputTokens: number;
      chatOutputTokens: number;
      totalCostUsd: number;
    }
  | {
      kind: 'fallback';
      answer: string;
      reason: string;
      topSimilarity: number | null;
      rewrite: ChatRewriteInfo | null;
      sources: ChatSource[];
      threshold: number;
      embedTokens: number;
      totalCostUsd: number;
    };

const EXCERPT_CHARS = 240;

function toSource(c: RetrievedChunk): ChatSource {
  return {
    filename: c.filename,
    similarity: c.similarity,
    contentExcerpt:
      c.content.length > EXCERPT_CHARS
        ? c.content.slice(0, EXCERPT_CHARS).trimEnd() + '…'
        : c.content,
  };
}

export async function runRagQuery({
  question,
  threshold,
  enableRewrite = V0_RAG_DEFAULTS.ENABLE_REWRITE_BY_DEFAULT,
}: {
  question: string;
  threshold: number;
  enableRewrite?: boolean;
}): Promise<ChatResponse> {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('threshold must be in [0, 1]');
  }
  const original = question.trim();
  if (original.length === 0) throw new Error('question is empty');
  if (original.length > 1000) throw new Error('question too long (max 1000 chars)');

  // 1. Optional rewrite — fixes typos, expands underspecified queries.
  let rewriteInfo: ChatRewriteInfo | null = null;
  let queryForEmbed = original;
  if (enableRewrite) {
    const r = await rewriteQuery(original);
    rewriteInfo = {
      original,
      rewritten: r.rewritten,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: r.costUsd,
    };
    queryForEmbed = r.rewritten;
  }

  // 2. Embed the (possibly rewritten) query.
  const { vectors, tokens: embedTokens, costUsd: embedCost } = await embedTexts([queryForEmbed]);
  const queryVector = vectors[0];

  // 3. Retrieve top-K.
  const chunks = await retrieveChunks(queryVector, V0_RAG_DEFAULTS.TOP_K);
  const allSources = chunks.map(toSource);
  const topSim = chunks[0]?.similarity ?? null;

  // 4. Threshold filter.
  const relevant = chunks.filter((c) => c.similarity >= threshold);
  const rewriteCost = rewriteInfo?.costUsd ?? 0;
  if (relevant.length === 0) {
    return {
      kind: 'fallback',
      answer: FALLBACK_MESSAGE,
      reason: `Geen chunk haalde de drempel ${threshold.toFixed(2)} (top: ${topSim?.toFixed(3) ?? 'n.v.t.'}).`,
      topSimilarity: topSim,
      rewrite: rewriteInfo,
      sources: allSources,
      threshold,
      embedTokens,
      totalCostUsd: embedCost + rewriteCost,
    };
  }

  // 5. Format context (cap at MAX_CONTEXT_CHARS).
  let context = '';
  let used = 0;
  for (const c of relevant) {
    const block = `[chunk ${used + 1}, similarity=${c.similarity.toFixed(3)}]\n${c.content}\n\n`;
    if (context.length + block.length > V0_RAG_DEFAULTS.MAX_CONTEXT_CHARS) break;
    context += block;
    used++;
  }
  // Use the ORIGINAL question in the answer prompt — model should answer the
  // user's actual question, not the rewritten search-query form. The rewrite
  // is purely an embedding-time tactic.
  const userPrompt = `CONTEXT:\n${context.trim()}\n\nVRAAG: ${original}`;

  // 6. LLM call.
  const chat = await chatComplete({ system: SYSTEM_PROMPT, user: userPrompt });

  return {
    kind: 'answer',
    answer: chat.text.trim(),
    rewrite: rewriteInfo,
    sources: relevant.slice(0, used).map(toSource),
    threshold,
    embedTokens,
    chatInputTokens: chat.inputTokens,
    chatOutputTokens: chat.outputTokens,
    totalCostUsd: embedCost + chat.costUsd + rewriteCost,
  };
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

export async function listDocs(): Promise<DocSummary[]> {
  const sb = supabase();
  const { data: docs, error } = await sb
    .from('documents')
    .select('id, filename, status, created_at')
    .eq('organization_id', DEV_ORG_ID)
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
