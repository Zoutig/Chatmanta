// V0 Website Crawler — diagnose-script.
//
// Geeft inzicht in een (mislukte/lege) crawl: de processing_jobs-rij, de laatste
// crawl_events, en — als er een Firecrawl batch-ID + FIRECRAWL_API_KEY is — een
// LIVE getBatchScrapeStatus-call zodat je ziet wat Firecrawl écht teruggeeft
// (status, completed/total, ontvangen pagina's, paginatie-cursor, per-pagina fout).
//
// Usage:
//   npm run v0:crawl-debug -- <orgSlug>     (bv. acme-corp) → laatste job van die org
//   npm run v0:crawl-debug -- <jobId>       (UUID van processing_jobs)

// NB: we maken de service-role-client direct aan (net als v0-seed-orgs) i.p.v.
// via lib/supabase/admin — die trekt lib/auth → next/navigation mee, wat de
// react-server tsx-runner laat crashen op React.createContext.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getCrawlJobStatus } from '../lib/v0/crawler/firecrawl';
import { resolveOrgIdFromSlug, ALL_ORG_SLUGS } from '../lib/v0/server/active-org';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Sb = SupabaseClient;

async function dumpJob(sb: Sb, job: Record<string, unknown>): Promise<void> {
  const jobId = job.id as string;
  console.log('\n═══ processing_job ═══');
  console.log({
    id: jobId,
    status: job.status,
    external_job_id: job.external_job_id,
    attempts: job.attempts,
    error_message: job.error_message,
    started_at: job.started_at,
    finished_at: job.finished_at,
  });

  const { data: events } = await sb
    .from('crawl_events')
    .select('event_type, decision, firecrawl_status, completed, total, data_count, has_next, credits_used, message, created_at')
    .eq('processing_job_id', jobId)
    .order('created_at', { ascending: true });

  console.log(`\n═══ crawl_events (${events?.length ?? 0}) ═══`);
  for (const e of events ?? []) {
    console.log(
      `[${e.created_at}] ${e.event_type}/${e.decision ?? '—'} ` +
        `fc=${e.firecrawl_status ?? '—'} ${e.completed ?? '?'}/${e.total ?? '?'} ` +
        `recv=${e.data_count ?? '?'} next=${e.has_next ?? '?'} credits=${e.credits_used ?? '?'}` +
        (e.message ? `\n     → ${e.message}` : ''),
    );
  }

  // Live Firecrawl-status — de "inzicht in de Firecrawl-logs"-stap.
  const crawlId = job.external_job_id as string | null;
  if (!crawlId) {
    console.log('\n(geen external_job_id → geen live Firecrawl-call)');
    return;
  }
  if (!process.env.FIRECRAWL_API_KEY) {
    console.log('\n(FIRECRAWL_API_KEY ontbreekt → live Firecrawl-call overgeslagen)');
    return;
  }
  console.log(`\n═══ LIVE Firecrawl getBatchScrapeStatus(${crawlId}) ═══`);
  try {
    const s = await getCrawlJobStatus(crawlId);
    console.log({
      rawStatus: s.rawStatus,
      mappedStatus: s.status,
      completed: s.completed,
      total: s.total,
      pagesInResponse: s.pages.length,
      hasNext: s.hasNext,
      creditsUsed: s.creditsUsed,
    });
    if (s.hasNext) {
      console.log('⚠️  hasNext=true → Firecrawl pagineert; niet alle data zit in deze respons (waarschijnlijke root-cause).');
    }
    const sample = s.pages.slice(0, 20);
    if (sample.length) {
      console.log(`\n  pagina-sample (${sample.length}/${s.pages.length}):`);
      for (const p of sample) {
        console.log(`   - ${p.statusCode ?? '?'} ${p.url} ${p.error ? `ERR=${p.error}` : ''} (md=${p.markdown.length})`);
      }
    }
  } catch (err) {
    console.error('  live-call faalde:', err instanceof Error ? err.message : err);
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.log('Usage: npm run v0:crawl-debug -- <orgSlug|jobId>');
    console.log('Bekende org-slugs:', ALL_ORG_SLUGS.join(', '));
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Mist NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (UUID_RE.test(arg)) {
    // Eerst proberen als job-ID; valt anders terug op org-ID.
    const { data: job } = await sb.from('processing_jobs').select('*').eq('id', arg).maybeSingle();
    if (job) {
      await dumpJob(sb, job as Record<string, unknown>);
      return;
    }
    console.log(`Geen processing_job met id=${arg}; behandel als org-ID.`);
    await dumpLatestForOrg(sb, arg);
    return;
  }

  const orgId = resolveOrgIdFromSlug(arg);
  if (!orgId) {
    console.error(`Onbekende org-slug "${arg}". Bekend: ${ALL_ORG_SLUGS.join(', ')}`);
    process.exit(1);
  }
  await dumpLatestForOrg(sb, orgId);
}

async function dumpLatestForOrg(sb: Sb, orgId: string): Promise<void> {
  const { data: jobs } = await sb
    .from('processing_jobs')
    .select('*')
    .eq('organization_id', orgId)
    .eq('job_type', 'crawl_website')
    .order('created_at', { ascending: false })
    .limit(5);
  if (!jobs || jobs.length === 0) {
    console.log(`Geen crawl-jobs gevonden voor org ${orgId}.`);
    return;
  }
  console.log(`${jobs.length} recente crawl-job(s) voor org ${orgId}. Detail van de nieuwste:`);
  await dumpJob(sb, jobs[0] as Record<string, unknown>);
  if (jobs.length > 1) {
    console.log(`\n(${jobs.length - 1} oudere job(s): ${jobs.slice(1).map((j) => `${j.id} [${j.status}]`).join(', ')})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
