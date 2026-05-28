'use server';

// V0 Website Crawler — server actions voor het Klantendashboard.
//
// discover: URL valideren (SSRF, SA-2) → mapSite() → publieke URLs teruggeven.
//           Geen scrape, niets opgeslagen — de klant selecteert daarna.
// start   : geselecteerde URLs valideren → website-bron upserten → Firecrawl
//           startBatchScrape (BETAALDE call) → processing_jobs(pending).
//           Client-tick pollt en ingest via tickCrawlIngestAction.
// delete  : website-bron hard verwijderen (CASCADE ruimt pages + document_chunks).
// refresh : huidige crawler-state lezen (voor client-polling tijdens een crawl).
//
// Auth: V0-model (geen per-user identiteit). Mutaties zijn rate-limited via
// checkMutationLimit — defense-in-depth tegen iemand met de v0-auth cookie die
// in een loop dure crawls triggert.

import { revalidatePath } from 'next/cache';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getSystemJobClient } from '@/lib/supabase/admin';
import { checkMutationLimit } from '@/lib/v0/server/rate-limit';
import { validateCrawlUrl } from '@/lib/v0/crawler/validateCrawlUrl';
import { mapSite, startBatchScrape, scrapeOne, MAX_CRAWL_PAGES, MAX_DISCOVER_PAGES } from '@/lib/v0/crawler/firecrawl';
import { ingestSinglePage } from '@/lib/v0/crawler/processCrawl';
import { getWebsiteSources, type WebsiteSource } from '@/lib/v0/server/crawler';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';
import { processCrawlJobs, type OpenJob, JOBS_PER_TICK } from '@/lib/v0/crawler/processJobs';
import { recordCrawlEvent } from '@/lib/v0/crawler/crawlEvents';
import { normalizeHost } from '@/lib/v0/crawler/normalizeHost';

const KENNISBANK_PATH = '/klantendashboard/kennisbank';

/** Zorgt dat een kale invoer ("jouwsite.nl") een geldig http(s)-schema krijgt. */
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export type DiscoverResult = { rootUrl: string; urls: string[] };

/** Ontdek de pagina's van een site (geen scrape, niet opgeslagen). */
export async function discoverPagesAction(rawUrl: string): Promise<ActionResult<DiscoverResult>> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    const url = normalizeUrl(rawUrl);
    const check = await validateCrawlUrl(url);
    if (!check.allowed) fail('CRAWL_FAILED', check.reason);

    const found = await mapSite(url, MAX_DISCOVER_PAGES);
    // SSRF (SA-2): élke teruggegeven URL opnieuw toetsen — een site kan naar interne hosts linken.
    const validated = await filterPublicUrls([url, ...found]);
    return { rootUrl: url, urls: Array.from(new Set(validated)) };
  });
}

/** Start de batch-scrape van de door de klant geselecteerde URLs. */
export async function startSelectedCrawlAction(
  rootUrl: string,
  selectedUrls: string[],
  maxPages: number = MAX_CRAWL_PAGES,
): Promise<ActionResult> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    const root = normalizeUrl(rootUrl);
    const rootCheck = await validateCrawlUrl(root);
    if (!rootCheck.allowed) fail('CRAWL_FAILED', rootCheck.reason);

    const cap = Math.min(Math.max(1, Math.floor(maxPages)), MAX_CRAWL_PAGES);
    const safe = (await filterPublicUrls(selectedUrls)).slice(0, cap);
    if (safe.length === 0) fail('CRAWL_FAILED', 'Geen geldige pagina’s geselecteerd.');

    const activeOrg = await getActiveOrgFromCookies();
    const sb = await getSystemJobClient({ reason: 'crawl_website' });
    const name = hostnameOf(root);

    const sourceId = await upsertWebsiteSource(sb, activeOrg.id, root, name);

    let crawlId: string;
    let invalidURLs: string[] = [];
    try {
      ({ crawlId, invalidURLs } = await startBatchScrape(safe));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Crawl kon niet starten.';
      await sb.from('knowledge_sources').update({ status: 'failed' }).eq('id', sourceId);
      await recordCrawlEvent(sb, {
        organizationId: activeOrg.id, eventType: 'fail', knowledgeSourceId: sourceId,
        decision: 'start-failed', message: msg, payload: { requestedUrls: safe.length },
      });
      fail('CRAWL_FAILED', msg);
    }

    const { data: insertedJob, error: jobErr } = await sb
      .from('processing_jobs')
      .insert({
        organization_id: activeOrg.id,
        job_type: 'crawl_website',
        target_type: 'knowledge_source',
        target_id: sourceId,
        status: 'pending',
        external_job_id: crawlId,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (jobErr) throw new Error(`processing_jobs insert: ${jobErr.message}`);

    await recordCrawlEvent(sb, {
      organizationId: activeOrg.id, eventType: 'start',
      processingJobId: insertedJob.id as string, knowledgeSourceId: sourceId,
      externalJobId: crawlId,
      message: `Batch-scrape gestart voor ${safe.length} pagina's${invalidURLs.length ? `, ${invalidURLs.length} geweigerd door Firecrawl` : ''}.`,
      payload: { requestedUrls: safe.length, invalidURLs: invalidURLs.slice(0, 60) },
    });

    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}

/** Verwijdert de website-bron volledig (CASCADE → website_pages → document_chunks). */
export async function deleteWebsiteSourceAction(sourceId: string): Promise<ActionResult> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    const activeOrg = await getActiveOrgFromCookies();
    const sb = await getSystemJobClient({ reason: 'delete_source' });
    const now = new Date().toISOString();
    await sb.from('processing_jobs')
      .update({ status: 'failed', error_message: 'Bron verwijderd tijdens crawl.', finished_at: now, updated_at: now })
      .eq('organization_id', activeOrg.id)
      .eq('job_type', 'crawl_website')
      .eq('target_id', sourceId)
      .in('status', ['pending', 'processing']);
    const { error } = await sb
      .from('knowledge_sources')
      .delete()
      .eq('id', sourceId)
      .eq('organization_id', activeOrg.id);
    if (error) throw new Error(`knowledge_sources delete: ${error.message}`);

    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}

/** Leest alle website-bronnen — voor client-polling tijdens een lopende crawl. */
export async function refreshWebsiteSources(): Promise<WebsiteSource[]> {
  const activeOrg = await getActiveOrgFromCookies();
  return getWebsiteSources(activeOrg.id);
}

/**
 * Client-gedreven "tick": verwerkt openstaande crawl-jobs van de actieve org en
 * geeft de verse bronnenlijst terug. Vervangt de Vercel-cron als motor (Hobby-vriendelijk).
 * Bewust niet rate-limited — het is een lichte poll, geen mutatie-trigger.
 */
export async function tickCrawlIngestAction(): Promise<WebsiteSource[]> {
  const activeOrg = await getActiveOrgFromCookies();
  const sb = await getSystemJobClient({ reason: 'process_crawls_tick' });
  const { data: jobs, error: jobsError } = await sb
    .from('processing_jobs')
    .select('id, organization_id, target_id, external_job_id, attempts')
    .eq('organization_id', activeOrg.id)
    .eq('job_type', 'crawl_website')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(JOBS_PER_TICK);
  if (jobsError) throw jobsError;
  if (jobs && jobs.length > 0) await processCrawlJobs(sb, jobs as OpenJob[]);
  return getWebsiteSources(activeOrg.id);
}

/** A1: zet één pagina aan/uit. Goedkoop — alleen een vlag; RPC doet de rest. */
export async function setPageIncludedAction(pageId: string, included: boolean): Promise<ActionResult> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);
    const activeOrg = await getActiveOrgFromCookies();
    const sb = await getSystemJobClient({ reason: 'toggle_website_page' });
    const { error } = await sb
      .from('website_pages')
      .update({ included })
      .eq('id', pageId)
      .eq('organization_id', activeOrg.id);
    if (error) throw new Error(`website_pages toggle: ${error.message}`);
    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}

/** A3: herprobeer één mislukte pagina (synchrone scrape + ingest). */
export async function retryPageAction(pageId: string): Promise<ActionResult> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);
    const activeOrg = await getActiveOrgFromCookies();
    const sb = await getSystemJobClient({ reason: 'retry_website_page' });
    const { data: row } = await sb
      .from('website_pages')
      .select('url, knowledge_source_id')
      .eq('id', pageId)
      .eq('organization_id', activeOrg.id)
      .maybeSingle();
    if (!row) fail('CRAWL_FAILED', 'Pagina niet gevonden.');
    const check = await validateCrawlUrl(row.url as string);
    if (!check.allowed) fail('CRAWL_FAILED', check.reason);
    const page = await scrapeOne(row.url as string);
    await ingestSinglePage(sb, row.knowledge_source_id as string, activeOrg.id, page);
    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}

/** C1: importeer één losse pagina (synchroon). Maakt de bron aan als die nog niet bestaat. */
export async function scrapeSinglePageAction(rawUrl: string): Promise<ActionResult> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);
    const url = normalizeUrl(rawUrl);
    const check = await validateCrawlUrl(url);
    if (!check.allowed) fail('CRAWL_FAILED', check.reason);
    const activeOrg = await getActiveOrgFromCookies();
    const sb = await getSystemJobClient({ reason: 'scrape_single_page' });
    const sourceId = await upsertWebsiteSource(sb, activeOrg.id, url, hostnameOf(url));
    const page = await scrapeOne(url);
    page.url = page.url || url;
    const { status, error } = await ingestSinglePage(sb, sourceId, activeOrg.id, page);
    if (status === 'failed') fail('CRAWL_FAILED', error ?? page.error ?? 'Pagina kon niet worden opgehaald.');
    await sb.from('knowledge_sources').update({ status: 'ready' }).eq('id', sourceId);
    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Houdt alleen publieke, SSRF-veilige http(s)-URLs over (parallel gevalideerd). */
async function filterPublicUrls(urls: string[]): Promise<string[]> {
  const checks = await Promise.all(
    urls.map(async (u) => ((await validateCrawlUrl(u)).allowed ? u : null)),
  );
  return checks.filter((u): u is string => u !== null);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Hergebruikt of maakt de website-bron van de org VOOR DIT DOMEIN; zet status 'crawling'.
 *  Match op normalized_host (uniek per org via index 0037). Race → 23505 → opnieuw lezen. */
async function upsertWebsiteSource(
  sb: Awaited<ReturnType<typeof getSystemJobClient>>,
  orgId: string,
  rootUrl: string,
  name: string,
): Promise<string> {
  const host = normalizeHost(rootUrl);
  const now = new Date().toISOString();

  const findExisting = async () => {
    const { data } = await sb
      .from('knowledge_sources')
      .select('id')
      .eq('organization_id', orgId)
      .eq('type', 'website')
      .eq('normalized_host', host)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    return data?.id as string | undefined;
  };

  const existingId = host ? await findExisting() : undefined;
  if (existingId) {
    const { error } = await sb
      .from('knowledge_sources')
      .update({ root_url: rootUrl, name, status: 'crawling', updated_at: now })
      .eq('id', existingId)
      .eq('organization_id', orgId);
    if (error) throw new Error(`knowledge_sources update: ${error.message}`);
    return existingId;
  }

  const { data: created, error } = await sb
    .from('knowledge_sources')
    .insert({ organization_id: orgId, type: 'website', name, root_url: rootUrl, normalized_host: host, status: 'crawling' })
    .select('id')
    .single();
  if (error) {
    // 23505 = unique_violation: een parallelle crawl van hetzelfde domein won de race.
    if ((error as { code?: string }).code === '23505' && host) {
      const raced = await findExisting();
      if (raced) {
        await sb.from('knowledge_sources')
          .update({ root_url: rootUrl, name, status: 'crawling', updated_at: now })
          .eq('id', raced).eq('organization_id', orgId);
        return raced;
      }
    }
    throw new Error(`knowledge_sources insert: ${error.message}`);
  }
  return created.id as string;
}
