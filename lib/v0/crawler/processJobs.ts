// V0 Website Crawler — gedeelde job-verwerker.
//
// Pollt openstaande crawl-jobs bij Firecrawl en ingest afgeronde crawls.
// Aangeroepen door (a) de client-tick server action tijdens een lopende crawl
// en (b) de cron-route (optioneel, voor een externe pinger). Service-role via
// de meegegeven client (SA-5).

import 'server-only';

import type { getSystemJobClient } from '@/lib/supabase/admin';
import { getCrawlStatus } from '@/lib/v0/crawler/firecrawl';
import { ingestCrawlResults } from '@/lib/v0/crawler/processCrawl';

type Sb = Awaited<ReturnType<typeof getSystemJobClient>>;

/** Na zoveel polls zonder afronding geven we op (≈1u bij 1 poll/min; sneller bij 4s-tick). */
export const MAX_ATTEMPTS = 200;

export type OpenJob = {
  id: string;
  organization_id: string;
  target_id: string;
  external_job_id: string | null;
  attempts: number;
};

export type JobOutcome = { jobId: string; outcome: string };

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
        await failJob(sb, jobId, sourceId, 'Geen Firecrawl crawl-ID op de job.');
        summary.push({ jobId, outcome: 'failed:no-crawl-id' });
        continue;
      }

      const status = await getCrawlStatus(crawlId);

      if (status.status === 'scraping') {
        if (attempts + 1 >= MAX_ATTEMPTS) {
          await failJob(sb, jobId, sourceId, 'Crawl duurde te lang (timeout na max polls).');
          summary.push({ jobId, outcome: 'failed:timeout' });
        } else {
          await sb
            .from('processing_jobs')
            .update({ status: 'processing', attempts: attempts + 1, updated_at: now() })
            .eq('id', jobId);
          summary.push({ jobId, outcome: 'pending' });
        }
        continue;
      }

      if (status.status === 'failed') {
        await failJob(sb, jobId, sourceId, 'Firecrawl meldde een mislukte crawl.');
        summary.push({ jobId, outcome: 'failed:firecrawl' });
        continue;
      }

      const result = await ingestCrawlResults(sourceId, orgId, status.pages);
      await sb
        .from('processing_jobs')
        .update({ status: 'completed', attempts: attempts + 1, finished_at: now(), updated_at: now(), error_message: null })
        .eq('id', jobId);
      await sb.from('knowledge_sources').update({ status: 'ready', updated_at: now() }).eq('id', sourceId);
      summary.push({ jobId, outcome: `completed:${result.pagesCrawled}p/${result.chunks}c` });
    } catch (err) {
      await failJob(sb, jobId, sourceId, err instanceof Error ? err.message : 'onbekende fout');
      summary.push({ jobId, outcome: 'failed:exception' });
    }
  }

  return summary;
}

async function failJob(sb: Sb, jobId: string, sourceId: string, message: string): Promise<void> {
  const now = new Date().toISOString();
  await sb
    .from('processing_jobs')
    .update({ status: 'failed', error_message: message, finished_at: now, updated_at: now })
    .eq('id', jobId);
  await sb.from('knowledge_sources').update({ status: 'failed', updated_at: now }).eq('id', sourceId);
}
