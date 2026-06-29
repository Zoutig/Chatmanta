'use server';

// V1 admin — crawl-job retry (cross-org). Port van V0's adminRerunCrawlAction naar het
// V1-model (org+chatbot-gestempeld; GEEN website_pages → her-ontdek via root_url).
//
// Cross-org via getJorionAdminClient() (service-role NÁ requireJorionAdmin). BETAALDE
// Firecrawl-call (mapSite + startBatchScrape) — bewust admin-getriggerd, draai 'm NIET
// in een smoke.

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { mapSite, startBatchScrape, MAX_CRAWL_PAGES, MAX_DISCOVER_PAGES } from '@/lib/v1/crawler/firecrawl';
import { validateCrawlUrl } from '@/lib/v1/crawler/validateCrawlUrl';
import { recordCrawlEvent } from '@/lib/v1/crawler/crawlEvents';

/** Alleen publieke, SSRF-veilige http(s)-URLs (parallel gevalideerd). */
async function filterPublicUrls(urls: string[]): Promise<string[]> {
  const checks = await Promise.all(urls.map(async (u) => ((await validateCrawlUrl(u)).allowed ? u : null)));
  return checks.filter((u): u is string => u !== null);
}

/** Herstart een crawl-job: her-ontdek via de root-URL van de bron → batch-scrape →
 *  nieuwe processing_job (pending). Ingest gebeurt daarna via de cron/tick-pinger. */
export async function adminRetryCrawlAction(jobId: string): Promise<ActionResult> {
  let admin: SupabaseClient;
  try {
    admin = await getJorionAdminClient(); // gate't intern via requireJorionAdmin
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message, code: e.code } satisfies ActionFail;
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }
  return actionTry(async () => {
    const { data: job } = await admin
      .from('processing_jobs')
      .select('organization_id, chatbot_id, target_id')
      .eq('id', jobId)
      .eq('job_type', 'crawl_website')
      .maybeSingle();
    if (!job) fail('NOT_FOUND', 'Job niet gevonden.');
    const orgId = job.organization_id as string;
    const chatbotId = job.chatbot_id as string;
    const sourceId = job.target_id as string;

    const { data: src } = await admin
      .from('knowledge_sources')
      .select('root_url, normalized_host')
      .eq('id', sourceId)
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!src) fail('NOT_FOUND', 'Bron niet gevonden of verwijderd.');
    const root =
      (src.root_url as string | null) ??
      (src.normalized_host ? `https://${src.normalized_host as string}` : null);
    if (!root) fail('CRAWL_FAILED', 'Geen root-URL om opnieuw te crawlen.');

    const rootCheck = await validateCrawlUrl(root);
    if (!rootCheck.allowed) fail('CRAWL_FAILED', rootCheck.reason);

    const discovered = await mapSite(root, MAX_DISCOVER_PAGES);
    const safe = (await filterPublicUrls([root, ...discovered])).slice(0, MAX_CRAWL_PAGES);
    if (safe.length === 0) fail('CRAWL_FAILED', 'Geen geldige pagina’s om te crawlen.');

    const now = new Date().toISOString();
    await admin
      .from('knowledge_sources')
      .update({ status: 'crawling', updated_at: now })
      .eq('id', sourceId)
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId);

    let crawlId: string;
    let invalidURLs: string[] = [];
    try {
      ({ crawlId, invalidURLs } = await startBatchScrape(safe));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Crawl kon niet starten.';
      await admin
        .from('knowledge_sources')
        .update({ status: 'failed' })
        .eq('id', sourceId)
        .eq('organization_id', orgId)
        .eq('chatbot_id', chatbotId);
      await recordCrawlEvent(admin, {
        organizationId: orgId, chatbotId, eventType: 'fail', knowledgeSourceId: sourceId,
        decision: 'start-failed', message: msg, payload: { requestedUrls: safe.length, rerun: true },
      });
      fail('CRAWL_FAILED', msg);
    }

    const { data: newJob, error: jobErr } = await admin
      .from('processing_jobs')
      .insert({
        organization_id: orgId,
        chatbot_id: chatbotId,
        job_type: 'crawl_website',
        target_type: 'knowledge_source',
        target_id: sourceId,
        status: 'pending',
        external_job_id: crawlId,
        started_at: now,
      })
      .select('id')
      .single();
    if (jobErr) throw new Error(`processing_jobs insert: ${jobErr.message}`);

    await recordCrawlEvent(admin, {
      organizationId: orgId, chatbotId, eventType: 'start', processingJobId: newJob.id as string,
      knowledgeSourceId: sourceId, externalJobId: crawlId,
      message: `Opnieuw gestart via admin voor ${safe.length} pagina's${invalidURLs.length ? `, ${invalidURLs.length} geweigerd door Firecrawl` : ''}.`,
      payload: { requestedUrls: safe.length, rerun: true },
    });

    revalidatePath('/v1/admin/jobs');
    return {};
  });
}
