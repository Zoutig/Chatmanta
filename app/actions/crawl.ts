'use server';

// V0 Website Crawler — server actions voor het Klantendashboard.
//
// start  : URL valideren (SSRF, SA-2) → website-bron upserten → Firecrawl
//          startCrawl (BETAALDE call) → processing_jobs(pending). De cron-route
//          pollt en ingest later.
// delete : website-bron hard verwijderen (CASCADE ruimt pages + document_chunks).
// refresh: huidige crawler-state lezen (voor client-polling tijdens een crawl).
//
// Auth: V0-model (geen per-user identiteit). Mutaties zijn rate-limited via
// checkMutationLimit — defense-in-depth tegen iemand met de v0-auth cookie die
// in een loop dure crawls triggert.

import { revalidatePath } from 'next/cache';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getSystemJobClient } from '@/lib/supabase/admin';
import { checkMutationLimit } from '@/lib/v0/server/rate-limit';
import { validateCrawlUrl } from '@/lib/v0/crawler/validateCrawlUrl';
import { startCrawl } from '@/lib/v0/crawler/firecrawl';
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

/**
 * Start (of herstart) de crawl van de website-bron van de actieve org.
 * Eén website-bron per org in V0: bestaat er al een, dan hergebruiken we 'm
 * (de ingest vervangt de pagina's idempotent).
 */
export async function startWebsiteCrawlAction(rawUrl: string): Promise<ActionResult> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    const url = normalizeUrl(rawUrl);
    const check = await validateCrawlUrl(url);
    if (!check.allowed) fail('CRAWL_FAILED', check.reason);

    const activeOrg = await getActiveOrgFromCookies();
    const sb = await getSystemJobClient({ reason: 'crawl_website' });
    const name = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return url;
      }
    })();

    // Bestaande website-bron hergebruiken, anders aanmaken.
    const { data: existing } = await sb
      .from('knowledge_sources')
      .select('id')
      .eq('organization_id', activeOrg.id)
      .eq('type', 'website')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let sourceId: string;
    if (existing?.id) {
      sourceId = existing.id as string;
      const { error } = await sb
        .from('knowledge_sources')
        .update({ root_url: url, name, status: 'crawling', updated_at: new Date().toISOString() })
        .eq('id', sourceId)
        .eq('organization_id', activeOrg.id);
      if (error) throw new Error(`knowledge_sources update: ${error.message}`);
    } else {
      const { data: created, error } = await sb
        .from('knowledge_sources')
        .insert({
          organization_id: activeOrg.id,
          type: 'website',
          name,
          root_url: url,
          status: 'crawling',
        })
        .select('id')
        .single();
      if (error) throw new Error(`knowledge_sources insert: ${error.message}`);
      sourceId = created.id as string;
    }

    // Firecrawl async starten — dit is de betaalde call.
    let crawlId: string;
    try {
      ({ crawlId } = await startCrawl(url));
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
