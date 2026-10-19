// V1 Website Crawler — ingest-pijplijn (PAGES-AS-DOCUMENTS).
//
// Een gecrawlde pagina wordt een `documents`-rij (source='website', met source_url/
// source_title in metadata + knowledge_source_id) met parent/child-chunks via de
// neutrale ingestDocument — dezelfde RAG-behandeling als een geüpload document.
// Mislukte/lege pagina's krijgen een chunk-loze documents-rij (status failed/excluded,
// included=false) zodat het dashboard ze toont + kan retry'en. Service-role via de
// MEEGEGEVEN client (SA-5 DI). AANVULLEND per knowledge_source: een crawl vervangt
// alleen de pagina's die hij opnieuw ophaalt (per source_url delete-then-insert); de
// overige pagina's van de bron blijven staan. Idempotent per URL.

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { ingestDocument, purgeAnswerCache } from '@/lib/rag/ingest';
import type { CrawledPage } from './firecrawl';
import { cleanCrawledMarkdown, cleanCrawlPages } from '@/lib/rag/clean-crawl';
import { customerDisabledUrls, type SnapshotRow } from './disabled-snapshot';

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
  included: boolean,
): Promise<{ chunks: number; embedTokens: number; costUsd: number }> {
  const res = await ingestDocument(sb, {
    organizationId,
    chatbotId,
    knowledgeSourceId,
    included,
    filename: page.title || page.url || '(onbekend)',
    text: page.markdown,
    source: 'website',
    metadata: { source_url: page.url, source_title: page.title },
  });
  return { chunks: res.chunks, embedTokens: res.embedTokens, costUsd: res.costUsd };
}

/**
 * Aanvullende, idempotente ingest van een afgeronde crawl. Verwijdert alleen de
 * bestaande website-documents van deze bron met een URL uit déze crawl (CASCADE ruimt
 * parent_chunks + document_chunks) en herbouwt die; pagina's uit eerdere crawls blijven
 * staan. Zo kan een klant in rondes van max. 50 pagina's z'n site opbouwen. Twee keer
 * draaien → geen duplicaten. Job-/bron-status zet de orchestrator, niet hier. Eén
 * answer-cache-purge ná de batch.
 */
export async function ingestCrawlResults(
  sb: Sb,
  knowledgeSourceId: string,
  organizationId: string,
  chatbotId: string,
  pages: CrawledPage[],
): Promise<IngestCrawlResult> {
  const incomingUrls = Array.from(new Set(pages.map((p) => p.url).filter((u) => u.length > 0)));

  // Snapshot welke pagina's de klant had uitgezet (included=false), zodat de
  // delete-then-insert re-crawl die keuze niet stil terugdraait naar de DB-default true.
  // Mislukte/lege rijen (status failed/excluded) zijn GEEN klantkeuze: die tellen niet
  // mee, anders landt een geslaagde retry als 'uitgezet' (customerDisabledUrls).
  const { data: prevDisabled, error: prevErr } = await sb
    .from('documents')
    .select('metadata, status, included')
    .eq('organization_id', organizationId)
    .eq('chatbot_id', chatbotId)
    .eq('knowledge_source_id', knowledgeSourceId)
    .eq('source', 'website')
    .eq('included', false)
    .in('metadata->>source_url', incomingUrls);
  // Fail closed: een gefaalde snapshot zou disabledUrls leeg laten → re-crawl zou een
  // door de klant uitgezette pagina stil terug aanzetten. Liever de crawl falen.
  if (prevErr) throw new Error(`disabled-snapshot: ${prevErr.message}`);
  const disabledUrls = customerDisabledUrls((prevDisabled ?? []) as SnapshotRow[]);

  // Alleen de opnieuw opgehaalde URLs vervangen — de rest van de bron blijft staan.
  const { error: delErr } = await sb
    .from('documents')
    .delete()
    .eq('organization_id', organizationId)
    .eq('chatbot_id', chatbotId)
    .eq('knowledge_source_id', knowledgeSourceId)
    .in('metadata->>source_url', incomingUrls);
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

  // Launch-onderzoek 2026-10-07: gecrawlde markdown is voor ~60% ruis (site-brede
  // boilerplate, data-URI's, homoglyfen, verminkte prijzen) → eerst opschonen.
  const cleanPages = cleanCrawlPages(pages);
  for (const page of cleanPages) {
    const status = pageStatus(page);
    try {
      if (status !== 'crawled') {
        await insertNonCrawledPage(sb, organizationId, chatbotId, knowledgeSourceId, page, status);
        if (status === 'failed') result.pagesFailed++;
        else result.pagesExcluded++;
        continue;
      }
      const { chunks, embedTokens, costUsd } = await ingestOnePage(
        sb, organizationId, chatbotId, knowledgeSourceId, page, !disabledUrls.has(page.url),
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
  page = { ...page, markdown: page.markdown ? cleanCrawledMarkdown(page.markdown) : page.markdown };
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

  const status = pageStatus(page);
  let result: { status: 'crawled' | 'failed' | 'excluded'; error: string | null };
  try {
    if (status !== 'crawled') {
      await insertNonCrawledPage(sb, organizationId, chatbotId, knowledgeSourceId, page, status);
      result = { status, error: pageError(page) };
    } else {
      // retry: een eerder mislukte/uitgezette pagina die nu slaagt → weer included.
      await ingestOnePage(sb, organizationId, chatbotId, knowledgeSourceId, page, true);
      result = { status: 'crawled', error: null };
    }
  } catch (err) {
    result = { status: 'failed', error: err instanceof Error ? err.message : 'onbekende fout' };
  }
  // Cache pas NA de (her)insert invalideren: de KB is gewijzigd (oude rij weg) ongeacht
  // de ingest-uitkomst, en deze volgorde voorkomt dat een lezer in het gat een lege bron ziet.
  await purgeAnswerCache(sb, organizationId, chatbotId);
  return result;
}
