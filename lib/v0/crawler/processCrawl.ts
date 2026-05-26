// V0 Website Crawler — ingest-pijplijn: gecrawlde pagina's → website_pages →
// chunks → embeddings → document_chunks.
//
// Service-role-toegang via getSystemJobClient (SA-5-wrapper, geen auth-sessie
// nodig — past bij de cron/background-context van V0). Hergebruikt chunkText +
// embedTexts uit rag.ts zodat website-content exact dezelfde RAG-behandeling
// krijgt als geüploade documenten.

import 'server-only';

import { createHash } from 'node:crypto';
import { getSystemJobClient } from '@/lib/supabase/admin';
import { chunkText, embedTexts } from '@/lib/v0/server/rag';
import type { CrawledPage } from './firecrawl';

export type IngestCrawlResult = {
  pagesCrawled: number;
  pagesFailed: number;
  pagesExcluded: number;
  chunks: number;
  embedTokens: number;
  costUsd: number;
};

/** Bepaalt de website_pages-status van één gecrawlde pagina. */
function pageStatus(page: CrawledPage): 'crawled' | 'failed' | 'excluded' {
  if (page.error || (page.statusCode != null && page.statusCode >= 400)) return 'failed';
  if (page.markdown.trim().length === 0) return 'excluded';
  return 'crawled';
}

/**
 * Idempotente ingest van een afgeronde crawl. Verwijdert eerst de bestaande
 * website_pages van deze bron (CASCADE ruimt de oude document_chunks), en
 * herbouwt dan pagina's + chunks. Twee keer draaien levert dus geen duplicaten.
 *
 * Job- en bron-status worden door de cron-orchestrator gezet, niet hier.
 */
export async function ingestCrawlResults(
  knowledgeSourceId: string,
  organizationId: string,
  pages: CrawledPage[],
): Promise<IngestCrawlResult> {
  const sb = await getSystemJobClient({ reason: 'crawl_website' });

  // Idempotency: oude pagina's + (via CASCADE) hun chunks weg.
  const { error: delErr } = await sb
    .from('website_pages')
    .delete()
    .eq('knowledge_source_id', knowledgeSourceId);
  if (delErr) throw new Error(`website_pages cleanup: ${delErr.message}`);

  const result: IngestCrawlResult = {
    pagesCrawled: 0,
    pagesFailed: 0,
    pagesExcluded: 0,
    chunks: 0,
    embedTokens: 0,
    costUsd: 0,
  };
  const now = new Date().toISOString();

  for (const page of pages) {
    const status = pageStatus(page);
    const contentHash =
      status === 'crawled'
        ? createHash('sha256').update(page.markdown).digest('hex')
        : null;

    const errorMessage =
      status === 'failed'
        ? page.error ?? (page.statusCode != null ? `HTTP ${page.statusCode}` : 'Pagina kon niet worden opgehaald')
        : null;

    const { data: inserted, error: pageErr } = await sb
      .from('website_pages')
      .insert({
        knowledge_source_id: knowledgeSourceId,
        organization_id: organizationId,
        url: page.url || '(onbekend)',
        title: page.title,
        content_text: status === 'crawled' ? page.markdown : null,
        content_hash: contentHash,
        status,
        error_message: errorMessage,
        last_crawled_at: now,
      })
      .select('id')
      .single();
    if (pageErr) throw new Error(`website_pages insert (${page.url}): ${pageErr.message}`);

    if (status === 'failed') result.pagesFailed++;
    if (status === 'excluded') result.pagesExcluded++;
    if (status !== 'crawled') continue;

    result.pagesCrawled++;
    const pageId = inserted.id as string;

    const chunks = chunkText(page.markdown);
    if (chunks.length === 0) continue;

    const embed = await embedTexts(chunks);
    result.embedTokens += embed.tokens;
    result.costUsd += embed.costUsd;

    const rows = chunks.map((content, i) => ({
      organization_id: organizationId,
      website_page_id: pageId,
      content,
      embedding: embed.vectors[i],
      metadata: { chunk_index: i, url: page.url },
    }));
    const { error: chunkErr } = await sb.from('document_chunks').insert(rows);
    if (chunkErr) throw new Error(`document_chunks insert (${page.url}): ${chunkErr.message}`);
    result.chunks += chunks.length;
  }

  // Usage-logging: crawl-event (pagina's) + embedding-event (tokens).
  await sb.from('usage_logs').insert([
    {
      organization_id: organizationId,
      event_type: 'website_crawled',
      metadata: {
        knowledge_source_id: knowledgeSourceId,
        pages_crawled: result.pagesCrawled,
        pages_failed: result.pagesFailed,
        pages_excluded: result.pagesExcluded,
      },
    },
    {
      organization_id: organizationId,
      event_type: 'embedding',
      tokens_input: result.embedTokens,
      metadata: { source: 'website_crawl', cost_usd: result.costUsd },
    },
  ]);

  return result;
}

/**
 * Ingest één losse pagina (C1 / retry). Vervangt een bestaande rij met dezelfde
 * URL binnen de bron (idempotent), houdt de rest van de pagina's intact.
 */
export async function ingestSinglePage(
  knowledgeSourceId: string,
  organizationId: string,
  page: CrawledPage,
): Promise<{ status: 'crawled' | 'failed' | 'excluded'; pageId: string }> {
  const sb = await getSystemJobClient({ reason: 'crawl_website' });

  await sb
    .from('website_pages')
    .delete()
    .eq('knowledge_source_id', knowledgeSourceId)
    .eq('url', page.url);

  const status = pageStatus(page);
  const errorMessage =
    status === 'failed'
      ? page.error ?? (page.statusCode != null ? `HTTP ${page.statusCode}` : 'Pagina kon niet worden opgehaald')
      : null;
  const contentHash =
    status === 'crawled' ? createHash('sha256').update(page.markdown).digest('hex') : null;

  const { data: inserted, error: pageErr } = await sb
    .from('website_pages')
    .insert({
      knowledge_source_id: knowledgeSourceId,
      organization_id: organizationId,
      url: page.url || '(onbekend)',
      title: page.title,
      content_text: status === 'crawled' ? page.markdown : null,
      content_hash: contentHash,
      status,
      error_message: errorMessage,
      last_crawled_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (pageErr) throw new Error(`website_pages insert (${page.url}): ${pageErr.message}`);
  const pageId = inserted.id as string;

  if (status === 'crawled') {
    const chunks = chunkText(page.markdown);
    if (chunks.length > 0) {
      const embed = await embedTexts(chunks);
      const rows = chunks.map((content, i) => ({
        organization_id: organizationId,
        website_page_id: pageId,
        content,
        embedding: embed.vectors[i],
        metadata: { chunk_index: i, url: page.url },
      }));
      const { error: chunkErr } = await sb.from('document_chunks').insert(rows);
      if (chunkErr) throw new Error(`document_chunks insert (${page.url}): ${chunkErr.message}`);
    }
  }
  return { status, pageId };
}
