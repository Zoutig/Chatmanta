// V1 Website Crawler — cron-route (externe pinger).
//
// Verwerkt openstaande crawl-jobs cross-org via de V1 service-role. Beschermd door
// Bearer CRON_SECRET (geen cliënt-input-ID → de isolatie rust op de per-job org+
// chatbot-stempeling in processCrawlJobs, niet op deze endpoint-auth). Bedoeld voor
// een externe pinger (zoals V0); staat NIET in vercel.json (Hobby-cron-slot bespaard).
// De client-tick (tickCrawlIngestAction) blijft het primaire in-sessie-pad; deze route
// vangt crawls af die de gebruiker z'n tab overleven.

import { NextResponse } from 'next/server';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { processCrawlJobs, type OpenJob, JOBS_PER_TICK } from '@/lib/v1/crawler/processJobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = getV1ServiceRoleClient();
  const { data: jobs, error } = await sb
    .from('processing_jobs')
    .select('id, organization_id, chatbot_id, target_id, external_job_id, attempts, created_at')
    .eq('job_type', 'crawl_website')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(JOBS_PER_TICK);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const outcomes = jobs && jobs.length > 0 ? await processCrawlJobs(sb, jobs as OpenJob[]) : [];
  return NextResponse.json({ processed: outcomes.length, outcomes });
}
