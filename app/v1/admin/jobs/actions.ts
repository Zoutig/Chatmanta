'use server';

// V1 admin — crawl-job retry (cross-org). Port van V0's adminRerunCrawlAction naar het
// V1-model (org+chatbot-gestempeld).
//
// Respecteert de paginakeuze van de klant: GEEN herontdekking via root_url meer, maar
// alleen pagina's die al in deze bron staan — eerst de mislukte, anders de bestaande
// selectie (zie lib/v1/admin/crawl-retry.ts). Een bron zonder enige pagina wordt
// geweigerd (de selectie van die eerste crawl is niet bewaard).
//
// Cross-org via getJorionAdminClient() (service-role NÁ requireJorionAdmin). BETAALDE
// Firecrawl-call (startBatchScrape) — bewust admin-getriggerd, draai 'm NIET in een
// smoke. Audit-regel 'crawl.admin_retry'.

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireJorionAdmin } from '@/lib/auth';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/v1/audit';
import { planCrawlRetry, type SourcePage } from '@/lib/v1/admin/crawl-retry';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { startBatchScrape, MAX_CRAWL_PAGES } from '@/lib/v1/crawler/firecrawl';
import { validateCrawlUrl } from '@/lib/v1/crawler/validateCrawlUrl';
import { recordCrawlEvent } from '@/lib/v1/crawler/crawlEvents';

/** Alleen publieke, SSRF-veilige http(s)-URLs (parallel gevalideerd). */
async function filterPublicUrls(urls: string[]): Promise<string[]> {
  const checks = await Promise.all(urls.map(async (u) => ((await validateCrawlUrl(u)).allowed ? u : null)));
  return checks.filter((u): u is string => u !== null);
}

/** Herstart een crawl-job voor de pagina's van de klant (mislukte eerst) → batch-scrape →
 *  nieuwe processing_job (pending). Ingest gebeurt daarna via de cron/tick-pinger. */
export async function adminRetryCrawlAction(
  jobId: string,
): Promise<ActionResult<{ mode: 'failed' | 'refresh'; pages: number; total: number }>> {
  let admin: SupabaseClient;
  let actorId: string;
  try {
    actorId = (await requireJorionAdmin()).id; // actor-id voor de audit
    admin = await getJorionAdminClient(); // gate't intern via requireJorionAdmin
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message, code: e.code } satisfies ActionFail;
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }
  return actionTry(async () => {
    const { data: job } = await admin
      .from('processing_jobs')
      .select('organization_id, chatbot_id, target_id, status')
      .eq('id', jobId)
      .eq('job_type', 'crawl_website')
      .maybeSingle();
    if (!job) fail('NOT_FOUND', 'Job niet gevonden.');
    // Her-check de status vóór de betaalde Firecrawl-call: alleen een mislukte of
    // klare job mag opnieuw — anders dubbel-crawl/dubbele credits (UI disabled dit
    // al, maar service-role-actions vertrouwen niet op de client).
    const jobStatus = job.status as string;
    if (jobStatus !== 'failed' && jobStatus !== 'completed') {
      fail('INPUT_INVALID', 'Deze job is nog bezig — opnieuw proberen kan pas als hij mislukt of klaar is.');
    }
    const orgId = job.organization_id as string;
    const chatbotId = job.chatbot_id as string;
    const sourceId = job.target_id as string;

    const { data: src } = await admin
      .from('knowledge_sources')
      .select('id')
      .eq('id', sourceId)
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!src) fail('NOT_FOUND', 'Bron niet gevonden of verwijderd.');

    // De pagina's die de klant al in deze bron heeft (pages-as-documents), org+chatbot-
    // gescoped. Mislukte pagina's eerst; anders de bestaande selectie verversen.
    const { data: docRows, error: docErr } = await admin
      .from('documents')
      .select('status, source_url:metadata->>source_url')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .eq('knowledge_source_id', sourceId)
      .eq('source', 'website')
      .is('deleted_at', null)
      .limit(2000);
    if (docErr) throw new Error(`documents lookup: ${docErr.message}`);
    const pages: SourcePage[] = ((docRows ?? []) as Array<{ status: string; source_url: string | null }>).map((d) => ({
      url: d.source_url,
      status: d.status,
    }));
    const plan = planCrawlRetry(pages, MAX_CRAWL_PAGES);
    if (plan.mode === 'none') {
      fail(
        'CRAWL_FAILED',
        'Deze bron heeft nog geen opgehaalde pagina’s en de paginakeuze van de klant is niet bewaard. Laat de klant in zijn Kennisbank opnieuw pagina’s kiezen en de crawl starten.',
      );
    }
    const safe = await filterPublicUrls(plan.urls);
    if (safe.length === 0) fail('CRAWL_FAILED', 'Geen geldige pagina’s om opnieuw op te halen.');

    // Eerst Firecrawl starten, pas daarna de bron op 'crawling' (zie startSelectedCrawlAction):
    // een mislukte start laat de bron op z'n huidige status i.p.v. hangend/rood.
    let crawlId: string;
    let invalidURLs: string[] = [];
    try {
      ({ crawlId, invalidURLs } = await startBatchScrape(safe));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Crawl kon niet starten.';
      await recordCrawlEvent(admin, {
        organizationId: orgId, chatbotId, eventType: 'fail', knowledgeSourceId: sourceId,
        decision: 'start-failed', message: msg, payload: { requestedUrls: safe.length, rerun: true, mode: plan.mode },
      });
      fail('CRAWL_FAILED', msg);
    }

    const now = new Date().toISOString();
    await admin
      .from('knowledge_sources')
      .update({ status: 'crawling', updated_at: now })
      .eq('id', sourceId)
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId);

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
      message: `Opnieuw gestart via admin voor ${safe.length} ${plan.mode === 'failed' ? 'mislukte ' : ''}pagina's${invalidURLs.length ? `, ${invalidURLs.length} geweigerd door Firecrawl` : ''}.`,
      payload: { requestedUrls: safe.length, rerun: true, mode: plan.mode, totalInSource: plan.total },
    });

    await writeAuditLog(admin, {
      organizationId: orgId,
      userId: actorId,
      action: 'crawl.admin_retry',
      targetType: 'knowledge_source',
      targetId: sourceId,
      metadata: { retried_job_id: jobId, new_job_id: newJob.id, mode: plan.mode, pages: safe.length, total: plan.total },
    });

    revalidatePath('/v1/admin/jobs');
    return { mode: plan.mode, pages: safe.length, total: plan.total };
  });
}
