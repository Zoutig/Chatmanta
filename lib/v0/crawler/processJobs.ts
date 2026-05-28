// V0 Website Crawler — gedeelde job-verwerker.
//
// Pollt openstaande crawl-jobs bij Firecrawl en ingest afgeronde crawls.
// Aangeroepen door (a) de client-tick server action tijdens een lopende crawl
// en (b) de cron-route (optioneel, voor een externe pinger). Service-role via
// de meegegeven client (SA-5).
//
// Diagnostiek: elke poll en terminal-beslissing schrijft een crawl_events-rij
// (best-effort) zodat een mislukte/lege crawl achteraf verklaarbaar is.

import 'server-only';

import type { getSystemJobClient } from '@/lib/supabase/admin';
import { getCrawlJobStatus } from '@/lib/v0/crawler/firecrawl';
import { ingestCrawlResults } from '@/lib/v0/crawler/processCrawl';
import { recordCrawlEvent, buildPagesPayload } from '@/lib/v0/crawler/crawlEvents';

type Sb = Awaited<ReturnType<typeof getSystemJobClient>>;

/** Na zoveel polls zonder afronding geven we op (≈1u bij 1 poll/min; sneller bij 4s-tick). */
export const MAX_ATTEMPTS = 200;

/** Hoeveel jobs per tick verwerkt worden — houdt één invocatie binnen de functietimeout. */
export const JOBS_PER_TICK = 5;

export type OpenJob = {
  id: string;
  organization_id: string;
  target_id: string;
  external_job_id: string | null;
  attempts: number;
};

export type JobOutcome = { jobId: string; outcome: string; completed: number; total: number };

/** Verwerkt een batch openstaande crawl-jobs. Muteert job- en bron-status. */
export async function processCrawlJobs(sb: Sb, jobs: OpenJob[]): Promise<JobOutcome[]> {
  const now = () => new Date().toISOString();
  const summary: JobOutcome[] = [];

  for (const job of jobs) {
    const { id: jobId, target_id: sourceId, organization_id: orgId } = job;
    const crawlId = job.external_job_id;
    const attempts = job.attempts ?? 0;

    try {
      if (!crawlId) {
        const msg = 'Geen Firecrawl crawl-ID op de job.';
        await failJob(sb, jobId, sourceId, msg);
        await recordCrawlEvent(sb, {
          organizationId: orgId, eventType: 'fail', processingJobId: jobId,
          knowledgeSourceId: sourceId, decision: 'no-crawl-id', message: msg,
        });
        summary.push({ jobId, outcome: 'failed:no-crawl-id', completed: 0, total: 0 });
        continue;
      }

      const status = await getCrawlJobStatus(crawlId);

      // Gedeelde diagnostiek-velden voor elk event van deze poll.
      const base = {
        organizationId: orgId,
        processingJobId: jobId,
        knowledgeSourceId: sourceId,
        externalJobId: crawlId,
        firecrawlStatus: status.rawStatus,
        completed: status.completed,
        total: status.total,
        dataCount: status.pages.length,
        hasNext: status.hasNext,
        creditsUsed: status.creditsUsed,
      };

      if (status.status === 'scraping') {
        if (attempts + 1 >= MAX_ATTEMPTS) {
          const msg = `Crawl duurde te lang (timeout na ${MAX_ATTEMPTS} polls; Firecrawl-status '${status.rawStatus}').`;
          await failJob(sb, jobId, sourceId, msg);
          await recordCrawlEvent(sb, { ...base, eventType: 'fail', decision: 'timeout', message: msg });
          summary.push({ jobId, outcome: 'failed:timeout', completed: status.completed, total: status.total });
        } else {
          await sb
            .from('processing_jobs')
            .update({ status: 'processing', attempts: attempts + 1, updated_at: now() })
            .eq('id', jobId);
          await recordCrawlEvent(sb, { ...base, eventType: 'poll', decision: 'pending' });
          summary.push({ jobId, outcome: 'pending', completed: status.completed, total: status.total });
        }
        continue;
      }

      if (status.status === 'failed') {
        const msg = `Firecrawl meldde status '${status.rawStatus}'.`;
        await failJob(sb, jobId, sourceId, msg);
        await recordCrawlEvent(sb, { ...base, eventType: 'fail', decision: 'firecrawl-failed', message: msg });
        summary.push({ jobId, outcome: 'failed:firecrawl', completed: status.completed, total: status.total });
        continue;
      }

      // completed → ingest. Het 'complete'-event bewaart de getrimde pagina-snapshot;
      // bij data_count 0 terwijl total>0/has_next true is dát het zichtbare signaal.
      const result = await ingestCrawlResults(sourceId, orgId, status.pages);
      await sb
        .from('processing_jobs')
        .update({ status: 'completed', attempts: attempts + 1, finished_at: now(), updated_at: now(), error_message: null })
        .eq('id', jobId);
      await sb.from('knowledge_sources').update({ status: 'ready', updated_at: now() }).eq('id', sourceId);
      const ingestMsg =
        `${result.pagesCrawled} gecrawld, ${result.pagesFailed} mislukt, ${result.pagesExcluded} leeg → ${result.chunks} chunks.` +
        (result.ingestErrors.length > 0 ? ` ${result.ingestErrors.length} pagina(s) faalden bij verwerking.` : '');
      await recordCrawlEvent(sb, {
        ...base, eventType: 'complete', decision: 'ingested', message: ingestMsg,
        payload: buildPagesPayload(status.pages),
      });
      summary.push({ jobId, outcome: `completed:${result.pagesCrawled}p/${result.chunks}c`, completed: status.completed, total: status.total });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'onbekende fout';
      // Een Firecrawl rate-limit (HTTP 429) is TIJDELIJK: de scrape draait door en
      // de data blijft opvraagbaar. Hem als permanente mislukking behandelen gooide
      // een al-voltooide crawl weg (33 pagina's klaar, job toch 'failed'). Dus: job
      // op 'processing' houden en volgende tick opnieuw pollen tot de limiet reset.
      if (isRateLimited(err) && attempts + 1 < MAX_ATTEMPTS) {
        await sb
          .from('processing_jobs')
          .update({ status: 'processing', attempts: attempts + 1, updated_at: now(), error_message: null })
          .eq('id', jobId);
        await recordCrawlEvent(sb, {
          organizationId: orgId, eventType: 'poll', processingJobId: jobId,
          knowledgeSourceId: sourceId, externalJobId: crawlId, decision: 'rate-limited', message: msg,
        });
        summary.push({ jobId, outcome: 'pending:rate-limited', completed: 0, total: 0 });
        continue;
      }
      await failJob(sb, jobId, sourceId, msg);
      await recordCrawlEvent(sb, {
        organizationId: orgId, eventType: 'fail', processingJobId: jobId,
        knowledgeSourceId: sourceId, externalJobId: crawlId, decision: 'exception', message: msg,
      });
      summary.push({ jobId, outcome: 'failed:exception', completed: 0, total: 0 });
    }
  }

  return summary;
}

/**
 * Herkent een Firecrawl rate-limit-fout (HTTP 429). De SDK gooit een SdkError met
 * `.status`/`.statusCode`; de boodschap bevat "Rate limit exceeded". We matchen op
 * beide zodat een toekomstige SDK-shape-wijziging ons niet stilletjes terugzet op
 * "hard falen". Alleen rate-limits → retry; andere fouten blijven fataal.
 */
function isRateLimited(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; statusCode?: number; message?: unknown };
  if (e.status === 429 || e.statusCode === 429) return true;
  return typeof e.message === 'string' && /rate.?limit/i.test(e.message);
}

async function failJob(sb: Sb, jobId: string, sourceId: string, message: string): Promise<void> {
  const now = new Date().toISOString();
  await sb
    .from('processing_jobs')
    .update({ status: 'failed', error_message: message, finished_at: now, updated_at: now })
    .eq('id', jobId);
  await sb.from('knowledge_sources').update({ status: 'failed', updated_at: now }).eq('id', sourceId);
}
