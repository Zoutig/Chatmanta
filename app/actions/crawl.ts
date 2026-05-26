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
import { mapSite, startBatchScrape, MAX_CRAWL_PAGES } from '@/lib/v0/crawler/firecrawl';
import { getWebsiteState, type WebsiteState } from '@/lib/v0/server/crawler';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';
import { processCrawlJobs, type OpenJob, JOBS_PER_TICK } from '@/lib/v0/crawler/processJobs';

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

    const found = await mapSite(url, MAX_CRAWL_PAGES);
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
    try {
      ({ crawlId } = await startBatchScrape(safe));
    } catch (err) {
      await sb.from('knowledge_sources').update({ status: 'failed' }).eq('id', sourceId);
      fail('CRAWL_FAILED', err instanceof Error ? err.message : 'Crawl kon niet starten.');
    }

    const { error: jobErr } = await sb.from('processing_jobs').insert({
      organization_id: activeOrg.id,
      job_type: 'crawl_website',
      target_type: 'knowledge_source',
      target_id: sourceId,
      status: 'pending',
      external_job_id: crawlId,
      started_at: new Date().toISOString(),
    });
    if (jobErr) throw new Error(`processing_jobs insert: ${jobErr.message}`);

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

/** Leest de huidige crawler-state — voor client-polling tijdens een lopende crawl. */
export async function refreshWebsiteState(): Promise<WebsiteState> {
  const activeOrg = await getActiveOrgFromCookies();
  return getWebsiteState(activeOrg.id);
}

/**
 * Client-gedreven "tick": verwerkt openstaande crawl-jobs van de actieve org en
 * geeft de verse state terug. Vervangt de Vercel-cron als motor (Hobby-vriendelijk).
 * Bewust niet rate-limited — het is een lichte poll, geen mutatie-trigger.
 */
export async function tickCrawlIngestAction(): Promise<WebsiteState> {
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
  if (jobs && jobs.length > 0) {
    await processCrawlJobs(sb, jobs as OpenJob[]);
  }
  return getWebsiteState(activeOrg.id);
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

/** Hergebruikt of maakt de (enige) website-bron van de org; zet status op 'crawling'. */
async function upsertWebsiteSource(
  sb: Awaited<ReturnType<typeof getSystemJobClient>>,
  orgId: string,
  rootUrl: string,
  name: string,
): Promise<string> {
  const { data: existing } = await sb
    .from('knowledge_sources')
    .select('id')
    .eq('organization_id', orgId)
    .eq('type', 'website')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await sb
      .from('knowledge_sources')
      .update({ root_url: rootUrl, name, status: 'crawling', updated_at: new Date().toISOString() })
      .eq('id', existing.id as string)
      .eq('organization_id', orgId);
    if (error) throw new Error(`knowledge_sources update: ${error.message}`);
    return existing.id as string;
  }
  const { data: created, error } = await sb
    .from('knowledge_sources')
    .insert({ organization_id: orgId, type: 'website', name, root_url: rootUrl, status: 'crawling' })
    .select('id')
    .single();
  if (error) throw new Error(`knowledge_sources insert: ${error.message}`);
  return created.id as string;
}
