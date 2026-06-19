// V0 Website Crawler — ingest-pijplijn: gecrawlde pagina's → website_pages →
// chunks → embeddings → document_chunks.
//
// Service-role-toegang via getSystemJobClient (SA-5-wrapper, geen auth-sessie
// nodig — past bij de cron/background-context van V0). Hergebruikt chunkText +
// embedTexts uit rag.ts zodat website-content exact dezelfde RAG-behandeling
// krijgt als geüploade documenten.

import 'server-only';

import { createHash } from 'node:crypto';
// Type-only import: het echte ingest-pad krijgt zijn service-role client van de
// caller (DI). Zo trekt deze module `@/lib/supabase/admin` → `lib/auth` →
// `next/navigation` NIET runtime mee, en kan het golden-set eval-script
// (`scripts/v0-crawl-eval.ts`, draait onder --conditions=react-server) dit
// échte pad importeren zonder de tsx-runner te laten crashen.
import type { getSystemJobClient } from '@/lib/supabase/admin';
import { chunkText, embedTexts, purgeAnswerCache } from '@/lib/v0/server/rag';
import type { CrawledPage } from './firecrawl';

type Sb = Awaited<ReturnType<typeof getSystemJobClient>>;

export type IngestCrawlResult = {
  pagesCrawled: number;
  pagesFailed: number;
  pagesExcluded: number;
  chunks: number;
  embedTokens: number;
  costUsd: number;
  /** Pagina's die binnenkwamen maar bij embedding/chunk-opslag faalden. Per-pagina
   *  geïsoleerd: deze fouten markeren één pagina 'failed' en breken de crawl niet af. */
  ingestErrors: string[];
};

/** Markeert één al-ingevoegde pagina als mislukt zonder de crawl af te breken. */
async function markPageFailed(sb: Sb, pageId: string, message: string): Promise<void> {
  await sb.from('website_pages').update({ status: 'failed', error_message: message }).eq('id', pageId);
}

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
  sb: Sb,
  knowledgeSourceId: string,
  organizationId: string,
  pages: CrawledPage[],
): Promise<IngestCrawlResult> {
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
    ingestErrors: [],
  };
  const now = new Date().toISOString();

  for (const page of pages) {
    const status = pageStatus(page);

    // Per-pagina geïsoleerd: een fout op één pagina (DB-insert, embedding of
    // chunk-opslag) markeert ALLEEN die pagina als 'failed' en gaat door met de
    // rest. Voorheen gooide een enkele slechte pagina, waardoor de hele job
    // 'failed' werd terwijl eerder ingevoegde pagina's als 'crawled' bleven staan
    // (inconsistente, half-onbruikbare staat).
    try {
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
      if (pageErr) throw new Error(pageErr.message);

      if (status === 'failed') result.pagesFailed++;
      if (status === 'excluded') result.pagesExcluded++;
      if (status !== 'crawled') continue;

      const pageId = inserted.id as string;
      const chunks = chunkText(page.markdown);
      if (chunks.length === 0) {
        // Gecrawld maar geen chunkbare content — telt als gecrawld, geen embed nodig.
        result.pagesCrawled++;
        continue;
      }

      // Embedding — bij een fout markeren we DEZE pagina 'failed' en gaan door.
      let embed: Awaited<ReturnType<typeof embedTexts>>;
      try {
        embed = await embedTexts(chunks);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'onbekende fout';
        await markPageFailed(sb, pageId, `Embedding mislukt: ${msg}`);
        result.pagesFailed++;
        result.ingestErrors.push(`${page.url}: embedding — ${msg}`);
        continue;
      }
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
      if (chunkErr) {
        await markPageFailed(sb, pageId, `Chunk-opslag mislukt: ${chunkErr.message}`);
        result.pagesFailed++;
        result.ingestErrors.push(`${page.url}: chunk-opslag — ${chunkErr.message}`);
        continue;
      }
      result.pagesCrawled++;
      result.chunks += chunks.length;
    } catch (err) {
      // website_pages-insert zelf faalde → er is geen rij om te markeren. Tel als
      // mislukt en ga door; de crawl mag niet om één DB-hapering omvallen.
      const msg = err instanceof Error ? err.message : 'onbekende fout';
      result.pagesFailed++;
      result.ingestErrors.push(`${page.url}: opslag — ${msg}`);
    }
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

  // Kennisbank gewijzigd (crawl-ingest: oude pagina's vervangen door nieuwe) →
  // answer-cache van deze org invalideren. Eén keer per crawl, niet per pagina.
  await purgeAnswerCache(organizationId);

  return result;
}

/**
 * Ingest één losse pagina (C1 / retry). Vervangt een bestaande rij met dezelfde
 * URL binnen de bron (idempotent), houdt de rest van de pagina's intact.
 */
export async function ingestSinglePage(
  sb: Sb,
  knowledgeSourceId: string,
  organizationId: string,
  page: CrawledPage,
): Promise<{ status: 'crawled' | 'failed' | 'excluded'; pageId: string; error: string | null }> {
  await sb
    .from('website_pages')
    .delete()
    .eq('knowledge_source_id', knowledgeSourceId)
    .eq('url', page.url);

  // Oude pagina-rij weg + nieuwe ingest volgt → KB-content gewijzigd, dus de
  // answer-cache van deze org invalideren (dekt álle exit-paden hieronder).
  await purgeAnswerCache(organizationId);

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
      let embed: Awaited<ReturnType<typeof embedTexts>>;
      try {
        embed = await embedTexts(chunks);
      } catch (err) {
        const msg = `Embedding mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`;
        await markPageFailed(sb, pageId, msg);
        return { status: 'failed', pageId, error: msg };
      }
      const rows = chunks.map((content, i) => ({
        organization_id: organizationId,
        website_page_id: pageId,
        content,
        embedding: embed.vectors[i],
        metadata: { chunk_index: i, url: page.url },
      }));
      const { error: chunkErr } = await sb.from('document_chunks').insert(rows);
      if (chunkErr) {
        const msg = `Chunk-opslag mislukt: ${chunkErr.message}`;
        await markPageFailed(sb, pageId, msg);
        return { status: 'failed', pageId, error: msg };
      }
    }
  }
  return { status, pageId, error: errorMessage };
}
