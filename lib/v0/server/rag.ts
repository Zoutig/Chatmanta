// V0 server-side RAG adapter voor de Next.js demo.
//
// De RAG-ENGINE (retrieve → answer → verify → regenerate, het ~1600-regel
// streaming-generator) woont sinds de kernel-graduatie in
// @/lib/rag/run-rag-query.ts als een NEUTRALE, client-geïnjecteerde functie
// (runRagQuery). Deze file is nu een DUNNE V0-ADAPTER eromheen: hij injecteert
// de V0 service-role-client + de V0-org-persona en houdt de bestaande publieke
// API (runRagQueryStreaming) byte-identiek voor de 5 callers (chat-route,
// klant-test-action, eval, org-isolation-script, hard-eval-script).
//
// Wat in deze file BLIJFT (V0-specifiek, leunt op de service-role-client):
//   - DEV_ORG_ID, V0_RAG_DEFAULTS, FALLBACK_MESSAGE (re-export uit de engine)
//   - chunkText + ingestText/deleteDoc/listDocs + purgeAnswerCache
//   - de embedTexts/EmbedResult re-export voor back-compat met crawler/faq/scripts
//
// 'server-only' import zorgt dat een per ongeluk import vanuit een client
// component een build error geeft (geen secrets in de browser).

import 'server-only';

import { getServiceRoleClient } from '@/lib/supabase/service-role';
import type { BotConfig } from './bots';
import { embedTexts, type EmbedResult } from '@/lib/rag/embeddings';
import { AppError } from '@/lib/errors/app-error';
import { getPersonaById } from './persona';
import {
  runRagQuery,
  FALLBACK_MESSAGE as RAG_FALLBACK_MESSAGE,
} from '@/lib/rag/run-rag-query';
import type {
  ChatHistoryTurn,
  StreamEvent,
  HydeModeRequest,
} from '@/lib/rag/run-rag-query';
import type { ManualQA } from '@/lib/rag/types';
import type { Length, Tone } from '@/lib/rag/style-types';
import type { ChatbotPromptOverrides } from '../klantendashboard/server/build-chatbot-overrides';

// ---------------------------------------------------------------------------
// Re-exports — alle types/values die andere modules historisch uit
// @/lib/v0/server/rag importeren blijven hier beschikbaar, zodat de 5 callers
// en alle overige importers byte-identiek blijven compileren. De canonieke home
// is nu @/lib/rag/run-rag-query (engine) resp. @/lib/rag/types (config/persona).
// ---------------------------------------------------------------------------
export {
  resolveHydeMode,
  isHydeModeRequest,
  parseV03Output,
} from '@/lib/rag/run-rag-query';
export type {
  ChatHistoryTurn,
  ChatSource,
  ChatResponse,
  ChatRewriteInfo,
  ClaimVerificationData,
  V03Extras,
  PhaseTimings,
  ParsedV03Output,
  RetrievedChunk,
  PipelinePhase,
  StreamEvent,
  HydeModeRequest,
  HydeModeResolved,
} from '@/lib/rag/run-rag-query';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';

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

// Re-export uit de engine zodat de publieke V0-API onveranderd blijft.
export const FALLBACK_MESSAGE = RAG_FALLBACK_MESSAGE;

// Sliding window voor de main answer-LLM call (zie engine). Re-export voor
// back-compat met eventuele importers van het V0-pad.
export const V0_CHAT_HISTORY_TURNS = 8;

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
// Embeddings — wonen in @/lib/rag/embeddings (neutrale RAG-laag). Hier
// re-geëxporteerd voor back-compat met de bestaande importers van dit pad
// (crawler/processCrawl, faq-snapshot, faq-klant, quiz-analysis, scripts).
// ---------------------------------------------------------------------------
export { embedTexts };
export type { EmbedResult };

// ---------------------------------------------------------------------------
// runRagQueryStreaming — V0-adapter rondom de neutrale engine. Publieke API
// EXACT behouden voor de 5 callers: zelfde input-shape (`bot`/`organizationId`),
// zelfde StreamEvent-output. De adapter injecteert de V0 service-role-client en
// resolveert de V0-org-persona; V0 is single-bot per org → chatbotScoped=false
// en chatbotId=organizationId (sentinel; door de RPC genegeerd).
// ---------------------------------------------------------------------------
export async function* runRagQueryStreaming(input: {
  question: string;
  threshold: number;
  enableRewrite: boolean;
  bot: BotConfig;
  history?: ChatHistoryTurn[];
  tone?: Tone;
  length?: Length;
  /** v0.4 multi-org: scope retrieval+cache naar deze org. Verplicht (PR-1) — geen DEV_ORG-fallback. */
  organizationId: string;
  disableCache?: boolean;
  includeFullParentContent?: boolean;
  hydeModeOverride?: HydeModeRequest;
  enableGeneralKnowledge?: boolean;
  manualQAItems?: ManualQA[];
  chatbotOverrides?: ChatbotPromptOverrides;
}): AsyncGenerator<StreamEvent, void, void> {
  yield* runRagQuery(getServiceRoleClient(), {
    ...input,
    config: { ...input.bot, chatbotScoped: false },
    persona: getPersonaById(input.organizationId),
    // V0 is single-bot per org → chatbotScoped=false (zie config) → de RPC laat
    // p_chatbot_id weg. chatbotId is een verplichte engine-param; we vullen 'm
    // met de org-id als inerte sentinel.
    chatbotId: input.organizationId,
  });
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

export async function listDocs(organizationId: string): Promise<DocSummary[]> {
  const sb = getServiceRoleClient();
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
  organizationId,
  metadata,
}: {
  filename: string;
  text: string;
  organizationId: string;
  /** Extra provenance gemerged in documents.metadata (bv. {origin:'quiz',...}).
   *  source blijft 'v0_local' — geen nieuwe enum-waarde (CHECK-constraint). */
  metadata?: Record<string, unknown>;
}): Promise<IngestResult> {
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    throw new AppError('INGEST_READ_FAILED', { message: 'document is empty after trimming' });
  }

  const sb = getServiceRoleClient();

  const { data: doc, error: docErr } = await sb
    .from('documents')
    .insert({
      organization_id: organizationId,
      filename,
      source: 'v0_local',
      status: 'processing',
      metadata: { chars: text.length, chunk_count: chunks.length, ...(metadata ?? {}) },
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
    // Als embedTexts al een AppError gooide (dim mismatch), behouden we die.
    // Anders wrappen we OpenAI-fouten naar EMBED_FAILED zodat de UI weet hoe
    // ze de gebruiker moet aanspreken.
    if (err instanceof AppError) throw err;
    throw new AppError('EMBED_FAILED', {
      message: err instanceof Error ? err.message : 'embed call failed',
      cause: err,
    });
  }

  const rows = chunks.map((content, i) => ({
    organization_id: organizationId,
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

  // Kennisbank gewijzigd → answer-cache van deze org invalideren. De cache-key
  // bevat geen KB-revisie, dus een gecacht antwoord zou anders het oude document
  // blijven serveren. Niet-throwend (purgeAnswerCache vangt eigen fouten) zodat een
  // geslaagde ingest nooit op een purge-fout omvalt.
  await purgeAnswerCache(organizationId);

  return {
    docId,
    chunks: chunks.length,
    embedTokens: embedResult.tokens,
    costUsd: embedResult.costUsd,
  };
}

export async function deleteDoc(docId: string, organizationId: string): Promise<void> {
  // CASCADE op document_chunks.document_id ruimt chunks automatisch.
  // organizationId is verplicht: zonder org-scope kan een delete uit de
  // verkeerde org's data lopen (zie codex adversarial review 2026-05-13).
  const sb = getServiceRoleClient();
  const { error } = await sb
    .from('documents')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', docId);
  if (error) throw new Error(`deleteDoc: ${error.message}`);
  // Kennisbank-content verwijderd → answer-cache van deze org invalideren (zie ingestText).
  await purgeAnswerCache(organizationId);
}

/**
 * Wis de volledige answer-cache van één org (alle bot-versies, alle vragen).
 *
 * Nodig omdat de cache-key (org, bot_version, vraag-embedding) géén stijl-, taal-
 * of Q&A-state bevat: een instellings- of Q&A-wijziging propageert daarom niet
 * naar al-gecachte antwoorden tenzij we ze hier wegvegen. De cache is volledig
 * regenereerbaar uit de pipeline, dus org-breed wissen kost niets behalve een
 * tijdelijk lagere hit-rate.
 *
 * Niet-throwend: een cache-purge mag een geslaagde settings-save nooit terugdraaien.
 * organizationId is VERPLICHT (geen DEV_ORG_ID-default zoals lookup/write) — een
 * lege/ontbrekende org is een programmeerfout, geen stilzwijgend dev-pad.
 *
 * @returns aantal gewiste rijen, of null bij een DB-fout.
 */
export async function purgeAnswerCache(organizationId: string): Promise<number | null> {
  if (!organizationId) {
    throw new Error('purgeAnswerCache: organizationId is verplicht');
  }
  try {
    const sb = getServiceRoleClient();
    const { count, error } = await sb
      .from('answer_cache')
      .delete({ count: 'exact' })
      .eq('organization_id', organizationId);
    if (error) {
      console.warn(`[cache] purge failed org=${organizationId}:`, error.message);
      return null;
    }
    console.info(`[cache] purged ${count ?? 0} rows org=${organizationId}`);
    return count ?? 0;
  } catch (err) {
    console.warn(`[cache] purge failed org=${organizationId}:`, err);
    return null;
  }
}
