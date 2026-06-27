// V1 Website Crawler — ingest-pijplijn (PAGES-AS-DOCUMENTS).
//
// Een gecrawlde pagina wordt een `documents`-rij (source='website', met source_url/
// source_title in metadata + knowledge_source_id) met parent/child-chunks via de
// neutrale ingestDocument — dezelfde RAG-behandeling als een geüpload document.
// Mislukte/lege pagina's krijgen een chunk-loze documents-rij (status failed/excluded,
// included=false) zodat het dashboard ze toont + kan retry'en. Service-role via de
// MEEGEGEVEN client (SA-5 DI). Idempotent per knowledge_source (delete-then-insert).

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ingestDocument, purgeAnswerCache } from '@/lib/rag/ingest';
import type { CrawledPage } from './firecrawl';

type Sb = SupabaseClient;

export type IngestCrawlResult = {
  pagesCrawled: number;
  pagesFailed: number;
  pagesExcluded: number;
  chunks: number;
  embedTokens: number;
  costUsd: number;
  /** Pagina's die binnenkwamen maar bij ingest faalden. Per-pagina geïsoleerd. */
  ingestErrors: string[];
};

function pageStatus(page: CrawledPage): 'crawled' | 'failed' | 'excluded' {
  if (page.error || (page.statusCode != null && page.statusCode >= 400)) return 'failed';
  if (page.markdown.trim().length === 0) return 'excluded';
  return 'crawled';
}

function pageError(page: CrawledPage): string | null {
  if (pageStatus(page) !== 'failed') return null;
  return page.error ?? (page.statusCode != null ? `HTTP ${page.statusCode}` : 'Pagina kon niet worden opgehaald');
}

/** Chunk-loze documents-rij voor een mislukte/lege pagina (zodat het dashboard ze
 *  toont + retry mogelijk is). included=false → de match-RPC filtert hem sowieso weg. */
async function insertNonCrawledPage(
  sb: Sb,
  organizationId: string,
  chatbotId: string,
  knowledgeSourceId: string,
  page: CrawledPage,
  status: 'failed' | 'excluded',
): Promise<void> {
  const { error } = await sb.from('documents').insert({
    organization_id: organizationId,
    chatbot_id: chatbotId,
    knowledge_source_id: knowledgeSourceId,
    filename: page.title || page.url || '(onbekend)',
    source: 'website',
    status,
    included: false,
    metadata: { source_url: page.url, source_title: page.title, error: pageError(page) },
  });
  if (error) throw new Error(error.message);
}

/** Ingest één gecrawlde pagina als documents-rij + parent/child-chunks. */
async function ingestOnePage(
  sb: Sb,
  organizationId: string,
  chatbotId: string,
  knowledgeSourceId: string,
  page: CrawledPage,
): Promise<{ chunks: number; embedTokens: number; costUsd: number }> {
  const res = await ingestDocument(sb, {
    organizationId,
    chatbotId,
    knowledgeSourceId,
    filename: page.title || page.url || '(onbekend)',
    text: page.markdown,
    source: 'website',
    metadata: { source_url: page.url, source_title: page.title },
  });
  return { chunks: res.chunks, embedTokens: res.embedTokens, costUsd: res.costUsd };
}

/**
 * Idempotente ingest van een afgeronde crawl. Verwijdert eerst alle bestaande
 * website-documents van deze bron (CASCADE ruimt parent_chunks + document_chunks),
 * herbouwt dan de pagina's. Twee keer draaien → geen duplicaten. Job-/bron-status
 * zet de orchestrator, niet hier. Eén answer-cache-purge ná de batch.
 */
export async function ingestCrawlResults(
  sb: Sb,
  knowledgeSourceId: string,
  organizationId: string,
  chatbotId: string,
  pages: CrawledPage[],
): Promise<IngestCrawlResult> {
  const { error: delErr } = await sb
    .from('documents')
    .delete()
    .eq('organization_id', organizationId)
    .eq('chatbot_id', chatbotId)
    .eq('knowledge_source_id', knowledgeSourceId);
  if (delErr) throw new Error(`documents cleanup: ${delErr.message}`);

  const result: IngestCrawlResult = {
    pagesCrawled: 0,
    pagesFailed: 0,
    pagesExcluded: 0,
    chunks: 0,
    embedTokens: 0,
    costUsd: 0,
    ingestErrors: [],
  };

  for (const page of pages) {
    const status = pageStatus(page);
    try {
      if (status !== 'crawled') {
        await insertNonCrawledPage(sb, organizationId, chatbotId, knowledgeSourceId, page, status);
        if (status === 'failed') result.pagesFailed++;
        else result.pagesExcluded++;
        continue;
      }
      const { chunks, embedTokens, costUsd } = await ingestOnePage(
        sb, organizationId, chatbotId, knowledgeSourceId, page,
      );
      result.pagesCrawled++;
      result.chunks += chunks;
      result.embedTokens += embedTokens;
      result.costUsd += costUsd;
    } catch (err) {
      // Per-pagina geïsoleerd: één mislukte pagina breekt de crawl niet af.
      // ingestDocument zet z'n eigen documents-rij al op 'failed' bij een embed-fout;
      // een insert-fout op een niet-gecrawlde pagina laat geen rij achter — beide → failed.
      const msg = err instanceof Error ? err.message : 'onbekende fout';
      result.pagesFailed++;
      result.ingestErrors.push(`${page.url}: ${msg}`);
    }
  }

  // KB gewijzigd (oude pagina's vervangen door nieuwe) → answer-cache invalideren.
  // Eén keer per crawl (niet per pagina) — daarom op caller-niveau, niet in ingestDocument.
  await purgeAnswerCache(sb, organizationId, chatbotId);

  return result;
}

/**
 * Ingest één losse pagina (retry / single import). Vervangt de bestaande website-
 * document met dezelfde source_url binnen de bron (idempotent), laat de rest intact.
 */
export async function ingestSinglePage(
  sb: Sb,
  knowledgeSourceId: string,
  organizationId: string,
  chatbotId: string,
  page: CrawledPage,
): Promise<{ status: 'crawled' | 'failed' | 'excluded'; error: string | null }> {
  // Oude rij(en) met deze URL binnen de bron weg (CASCADE → chunks). Een gefaalde
  // delete NIET negeren: daarna inserten zou een duplicaat opleveren.
  const { error: delErr } = await sb
    .from('documents')
    .delete()
    .eq('organization_id', organizationId)
    .eq('chatbot_id', chatbotId)
    .eq('knowledge_source_id', knowledgeSourceId)
    .eq('metadata->>source_url', page.url);
  if (delErr) {
    return { status: 'failed', error: `oude pagina verwijderen faalde: ${delErr.message}` };
  }

  await purgeAnswerCache(sb, organizationId, chatbotId);

  const status = pageStatus(page);
  try {
    if (status !== 'crawled') {
      await insertNonCrawledPage(sb, organizationId, chatbotId, knowledgeSourceId, page, status);
      return { status, error: pageError(page) };
    }
    await ingestOnePage(sb, organizationId, chatbotId, knowledgeSourceId, page);
    return { status: 'crawled', error: null };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : 'onbekende fout' };
  }
}
