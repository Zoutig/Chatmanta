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
import type { BotConfig } from './bots';

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

async function preProcessInput(
  original: string,
  bot: BotConfig,
): Promise<PreProcessResult> {
  const result = await chatComplete({
    model: bot.chatModel,
    system: bot.preProcessSystem,
    user: original,
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

type BaseChatResponse = {
  /** Bot version that produced this response. */
  botVersion: string;
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
  enableRewrite,
  bot,
}: {
  question: string;
  threshold: number;
  enableRewrite: boolean;
  bot: BotConfig;
}): Promise<ChatResponse> {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('threshold must be in [0, 1]');
  }
  const original = question.trim();
  if (original.length === 0) throw new Error('question is empty');
  if (original.length > 1000) throw new Error('question too long (max 1000 chars)');

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
      botVersion: bot.version,
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
  const chat = await chatComplete({
    model: bot.chatModel,
    system: bot.systemPrompt,
    user: userPrompt,
    temperature: bot.chatTemperature,
  });

  return {
    botVersion: bot.version,
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
