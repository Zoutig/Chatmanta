// V0 Website Crawler — cron-poller.
//
// Draait elke minuut (Vercel Cron, zie vercel.json). Pollt openstaande
// crawl-jobs bij Firecrawl en ingest afgeronde crawls. Crawl-duur staat zo
// volledig los van de request-lifetime van de server action die de crawl startte.
//
// Auth: Vercel zet bij cron-invocaties `Authorization: Bearer <CRON_SECRET>`.
// Zonder geldige secret → 401. Service-role via getSystemJobClient (SA-5).

import { NextResponse, type NextRequest } from 'next/server';
import { getSystemJobClient } from '@/lib/supabase/admin';
import { getCrawlStatus } from '@/lib/v0/crawler/firecrawl';
import { ingestCrawlResults } from '@/lib/v0/crawler/processCrawl';

export const runtime = 'nodejs';
// Cron-jobs mogen niet uit cache komen.
export const dynamic = 'force-dynamic';

/** Na zoveel polls zonder afronding geven we op (≈1u bij 1 poll/min). */
const MAX_ATTEMPTS = 60;
/** Hoeveel jobs per tick — houdt één invocatie binnen de functietimeout. */
const JOBS_PER_TICK = 5;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = await getSystemJobClient({ reason: 'process_crawls_cron' });

  const { data: jobs, error } = await sb
    .from('processing_jobs')
    .select('id, organization_id, target_id, external_job_id, attempts')
    .eq('job_type', 'crawl_website')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(JOBS_PER_TICK);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = () => new Date().toISOString();
  const summary: Array<{ jobId: string; outcome: string }> = [];

  for (const job of jobs ?? []) {
    const jobId = job.id as string;
    const sourceId = job.target_id as string;
    const orgId = job.organization_id as string;
    const crawlId = job.external_job_id as string | null;
    const attempts = (job.attempts as number) ?? 0;

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

      // completed → ingest
      const result = await ingestCrawlResults(sourceId, orgId, status.pages);
      await sb
        .from('processing_jobs')
        .update({
          status: 'completed',
          attempts: attempts + 1,
          finished_at: now(),
          updated_at: now(),
          error_message: null,
        })
        .eq('id', jobId);
      await sb
        .from('knowledge_sources')
        .update({ status: 'ready', updated_at: now() })
        .eq('id', sourceId);
      summary.push({ jobId, outcome: `completed:${result.pagesCrawled}p/${result.chunks}c` });
    } catch (err) {
      await failJob(sb, jobId, sourceId, err instanceof Error ? err.message : 'onbekende fout');
      summary.push({ jobId, outcome: 'failed:exception' });
    }
  }

  return NextResponse.json({ processed: summary.length, jobs: summary });
}

async function failJob(
  sb: Awaited<ReturnType<typeof getSystemJobClient>>,
  jobId: string,
  sourceId: string,
  message: string,
): Promise<void> {
  const now = new Date().toISOString();
  await sb
    .from('processing_jobs')
    .update({ status: 'failed', error_message: message, finished_at: now, updated_at: now })
    .eq('id', jobId);
  await sb.from('knowledge_sources').update({ status: 'failed', updated_at: now }).eq('id', sourceId);
}
