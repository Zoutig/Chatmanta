// V0 Website Crawler — cron/pinger-entrypoint.
//
// Pollt openstaande crawl-jobs en ingest afgeronde crawls via processCrawlJobs.
// Sinds de client-tick (tickCrawlIngestAction) is deze route NIET meer vereist —
// hij blijft bestaan voor een optionele externe pinger (bv. cron-job.org).
// Auth: Bearer CRON_SECRET. Service-role via getSystemJobClient (SA-5).

import { NextResponse, type NextRequest } from 'next/server';
import { getSystemJobClient } from '@/lib/supabase/admin';
import { processCrawlJobs, type OpenJob, JOBS_PER_TICK } from '@/lib/v0/crawler/processJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = await processCrawlJobs(sb, (jobs ?? []) as OpenJob[]);
  return NextResponse.json({ processed: summary.length, jobs: summary });
}
