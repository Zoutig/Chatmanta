// V0 Website Crawler — golden-set regressie-eval (goedkoop, on-demand, deterministisch).
//
// Crawlt een vaste set fixture-pagina's (public/crawl-eval/, wordt mee-gedeployd en
// is dus publiek crawlbaar op baseUrl) via het ECHTE ingest-pad
// (startBatchScrape + processCrawlJobs) in de dev-org, en toetst daarna
// deterministisch wat in website_pages + document_chunks belandde tegen de
// verwachtingen in eval-fixtures/crawl-eval.json. Géén LLM-judge → kosten = alleen
// een handvol Firecrawl-credits + wat embedding-tokens, en alleen wanneer jij 'm draait.
//
// Dekt o.a. de Laag 0-foutisolatie: een 404-pagina hoort 'failed' te worden terwijl
// de goede pagina's 'crawled' blijven en de job tóch 'completed' eindigt — niet afbreekt.
//
// De service-role client wordt DIRECT aangemaakt (zoals scripts/v0-crawl-debug.ts)
// i.p.v. via lib/supabase/admin: die trekt lib/auth → next/navigation mee en laat de
// react-server tsx-runner crashen op React.createContext. De ingest-functies krijgen
// deze client via dependency-injection (zie de DI-refactor in processCrawl.ts).
//
// Usage:
//   npm run v0:crawl-eval
//   CRAWL_EVAL_BASE_URL=https://<preview-deploy>/crawl-eval npm run v0:crawl-eval
//
// ⚠️ BILLABLE: dit doet echte Firecrawl-scrapes. Draai het bewust, niet in een loop.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { startBatchScrape, MAX_CRAWL_PAGES } from '../lib/v0/crawler/firecrawl';
import { processCrawlJobs, type OpenJob } from '../lib/v0/crawler/processJobs';
import { recordCrawlEvent } from '../lib/v0/crawler/crawlEvents';
import { normalizeHost } from '../lib/v0/crawler/normalizeHost';
import { KNOWN_ORGS, type OrgSlug } from '../lib/v0/server/active-org';

type PageStatus = 'crawled' | 'failed' | 'excluded';
/** 'not-ingested' = mag niet als doorzoekbare content belanden. Afwezig (Firecrawl
 *  laat een lege pagina wég i.p.v. 'm met lege markdown terug te geven) ÓF status
 *  'excluded' zijn allebei goed; alleen 'crawled' is fout. */
type ExpectStatus = PageStatus | 'not-ingested';
type PerPageExpect = { url: string; status: ExpectStatus; keyword?: string };
type EvalSpec = {
  baseUrl: string;
  evalOrgSlug: OrgSlug;
  pages: string[];
  expect: {
    jobStatus: string;
    minCrawled: number;
    minFailed: number;
    minChunks: number;
    perPage: PerPageExpect[];
  };
};

type PageRow = {
  id: string;
  url: string;
  status: string;
  error_message: string | null;
  content_text: string | null;
};

type Check = { label: string; pass: boolean; detail: string };

const POLL_MS = 4000;
const MAX_TICKS = 90; // ~6 min cap; een 5-pagina fixture is binnen seconden klaar.

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mk(label: string, pass: boolean, detail: string): Check {
  return { label, pass, detail };
}

/** Hergebruikt of maakt de website-bron voor de fixture-host in de eval-org. */
async function upsertSource(sb: SupabaseClient, orgId: string, rootUrl: string, host: string): Promise<string> {
  const now = new Date().toISOString();
  const name = `[crawl-eval] ${host}`;

  const { data: existing } = await sb
    .from('knowledge_sources')
    .select('id')
    .eq('organization_id', orgId)
    .eq('type', 'website')
    .eq('normalized_host', host)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await sb
      .from('knowledge_sources')
      .update({ root_url: rootUrl, name, status: 'crawling', updated_at: now })
      .eq('id', existing.id);
    return existing.id as string;
  }

  const { data: created, error } = await sb
    .from('knowledge_sources')
    .insert({ organization_id: orgId, type: 'website', name, root_url: rootUrl, normalized_host: host, status: 'crawling' })
    .select('id')
    .single();
  if (error || !created) throw new Error(`knowledge_sources insert: ${error?.message ?? 'geen rij'}`);
  return created.id as string;
}

function buildReport(args: {
  baseUrl: string;
  orgName: string;
  finalStatus: string;
  counts: { crawled: number; failed: number; excluded: number; chunks: number };
  pages: PageRow[];
  checks: Check[];
  passed: number;
}): string {
  const { baseUrl, orgName, finalStatus, counts, pages, checks, passed } = args;
  const verdict = passed === checks.length ? '✅ GESLAAGD' : '❌ GEFAALD';
  const lines: string[] = [];
  lines.push(`# Crawler golden-set eval — ${verdict}`);
  lines.push('');
  lines.push(`- Tijd: ${new Date().toISOString()}`);
  lines.push(`- Eval-org: ${orgName}`);
  lines.push(`- baseUrl: ${baseUrl}`);
  lines.push(`- Job-status: \`${finalStatus}\``);
  lines.push(`- Resultaat: **${passed}/${checks.length}** checks geslaagd`);
  lines.push('');
  lines.push(`Pagina-tellingen: ${counts.crawled} crawled · ${counts.failed} failed · ${counts.excluded} excluded · ${counts.chunks} chunks`);
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  lines.push('| | Check | Detail |');
  lines.push('| --- | --- | --- |');
  for (const c of checks) lines.push(`| ${c.pass ? '✓' : '✗'} | ${c.label} | ${c.detail} |`);
  lines.push('');
  lines.push('## Pagina\'s');
  lines.push('');
  lines.push('| Status | URL | Detail |');
  lines.push('| --- | --- | --- |');
  for (const p of pages) {
    const detail = p.error_message ?? (p.content_text ? `${p.content_text.length} tekens content` : '—');
    lines.push(`| ${p.status} | ${p.url} | ${detail} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const specPath = join(process.cwd(), 'eval-fixtures', 'crawl-eval.json');
  const spec = JSON.parse(readFileSync(specPath, 'utf8')) as EvalSpec;

  const baseUrl = (process.env.CRAWL_EVAL_BASE_URL ?? spec.baseUrl).replace(/\/+$/, '');
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    console.error('Mist NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY in .env.local.');
    process.exit(1);
  }
  if (!process.env.FIRECRAWL_API_KEY) {
    console.error('Mist FIRECRAWL_API_KEY — de eval doet echte Firecrawl-scrapes.');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('Mist OPENAI_API_KEY — de ingest maakt embeddings.');
    process.exit(1);
  }

  const org = KNOWN_ORGS[spec.evalOrgSlug];
  if (!org) {
    console.error(`Onbekende evalOrgSlug "${spec.evalOrgSlug}".`);
    process.exit(1);
  }
  const orgId = org.id;
  const fullUrls = spec.pages
    .map((p) => `${baseUrl}/${p.replace(/^\/+/, '')}`)
    .slice(0, MAX_CRAWL_PAGES);

  const sb: SupabaseClient = createClient(supaUrl, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('--- V0 crawler golden-set eval ---');
  console.log(`org:     ${org.name} (${spec.evalOrgSlug})`);
  console.log(`baseUrl: ${baseUrl}`);
  console.log(`pagina's: ${fullUrls.length}\n`);

  // 1. Bron upserten (dedup op host).
  const host = normalizeHost(baseUrl) ?? 'crawl-eval';
  const sourceId = await upsertSource(sb, orgId, baseUrl, host);

  // 2. Echte Firecrawl batch-scrape starten (BILLABLE).
  console.log('Firecrawl batch-scrape starten…');
  const { crawlId, invalidURLs } = await startBatchScrape(fullUrls);
  if (invalidURLs.length) console.log(`  ⚠ ${invalidURLs.length} URL(s) geweigerd door Firecrawl.`);

  // 3. processing_jobs-rij + start-event (zodat de crawl ook in /commandcenter/crawl-health verschijnt).
  const { data: job, error: jobErr } = await sb
    .from('processing_jobs')
    .insert({
      organization_id: orgId,
      job_type: 'crawl_website',
      target_type: 'knowledge_source',
      target_id: sourceId,
      status: 'pending',
      external_job_id: crawlId,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (jobErr || !job) throw new Error(`processing_jobs insert: ${jobErr?.message ?? 'geen rij'}`);
  const jobId = job.id as string;
  await recordCrawlEvent(sb, {
    organizationId: orgId,
    eventType: 'start',
    processingJobId: jobId,
    knowledgeSourceId: sourceId,
    externalJobId: crawlId,
    message: `[crawl-eval] batch-scrape gestart voor ${fullUrls.length} fixture-pagina's.`,
  });

  // 4. Pollen via het ECHTE job-pad tot terminale staat.
  console.log('Pollen tot de crawl klaar is…');
  let finalStatus = 'pending';
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    const { data: row } = await sb
      .from('processing_jobs')
      .select('id, organization_id, target_id, external_job_id, attempts, status')
      .eq('id', jobId)
      .single();
    if (!row) throw new Error('processing_job verdween tijdens polling.');
    finalStatus = row.status as string;
    if (finalStatus === 'completed' || finalStatus === 'failed') break;

    const openJob: OpenJob = {
      id: row.id as string,
      organization_id: row.organization_id as string,
      target_id: row.target_id as string,
      external_job_id: (row.external_job_id as string | null) ?? null,
      attempts: (row.attempts as number | null) ?? 0,
    };
    await processCrawlJobs(sb, [openJob]);

    const { data: after } = await sb.from('processing_jobs').select('status').eq('id', jobId).single();
    finalStatus = (after?.status as string) ?? finalStatus;
    if (finalStatus === 'completed' || finalStatus === 'failed') break;
    await sleep(POLL_MS);
  }
  console.log(`  job-status: ${finalStatus}\n`);

  // 5. Resultaat uit de DB lezen.
  const { data: pageRows } = await sb
    .from('website_pages')
    .select('id, url, status, error_message, content_text')
    .eq('knowledge_source_id', sourceId)
    .is('deleted_at', null);
  const pages = (pageRows ?? []) as PageRow[];

  let chunks = 0;
  if (pages.length) {
    const { count } = await sb
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .in('website_page_id', pages.map((p) => p.id));
    chunks = count ?? 0;
  }

  const crawled = pages.filter((p) => p.status === 'crawled').length;
  const failed = pages.filter((p) => p.status === 'failed').length;
  const excluded = pages.filter((p) => p.status === 'excluded').length;
  const counts = { crawled, failed, excluded, chunks };

  // 6. Deterministische assertions.
  const e = spec.expect;
  const checks: Check[] = [
    mk('Job afgerond (niet afgebroken)', finalStatus === e.jobStatus, `verwacht ${e.jobStatus}, kreeg ${finalStatus}`),
    mk('Genoeg pagina\'s gecrawld', crawled >= e.minCrawled, `${crawled} crawled (>= ${e.minCrawled})`),
    mk('Foutpagina geïsoleerd', failed >= e.minFailed, `${failed} failed (>= ${e.minFailed})`),
    mk('Chunks aangemaakt', chunks >= e.minChunks, `${chunks} chunks (>= ${e.minChunks})`),
  ];

  for (const exp of e.perPage) {
    const match = pages.find((p) => p.url.endsWith(exp.url) || p.url.includes(exp.url));

    // Lege pagina: mag niet als doorzoekbare content belanden. Firecrawl laat 'm
    // meestal helemaal weg (afwezig) of we markeren 'm 'excluded' — beide goed.
    if (exp.status === 'not-ingested') {
      const ingested = match?.status === 'crawled';
      checks.push(
        mk(`${exp.url}: niet als content opgenomen`, !ingested, match ? `status ${match.status}` : 'afwezig (lege pagina weggelaten)'),
      );
      continue;
    }

    if (!match) {
      checks.push(mk(`${exp.url}: aanwezig`, false, 'niet in resultaten (Firecrawl liet de URL mogelijk weg)'));
      continue;
    }
    const errSuffix = match.error_message ? ` (${match.error_message})` : '';
    checks.push(mk(`${exp.url}: status ${exp.status}`, match.status === exp.status, `kreeg ${match.status}${errSuffix}`));
    if (exp.keyword) {
      const hay = (match.content_text ?? '').toLowerCase();
      checks.push(
        mk(`${exp.url}: bevat "${exp.keyword}"`, hay.includes(exp.keyword.toLowerCase()), hay.length ? 'gevonden in content' : 'geen content_text'),
      );
    }
  }

  // 7. Scorecard + rapport.
  for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.label} — ${c.detail}`);
  const passed = checks.filter((c) => c.pass).length;
  console.log(`\n${passed}/${checks.length} checks geslaagd`);
  console.log(`pagina's: ${crawled} crawled · ${failed} failed · ${excluded} excluded · ${chunks} chunks`);

  const reportDir = join(process.cwd(), 'eval-out');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, 'crawl-eval-report.md');
  writeFileSync(reportPath, buildReport({ baseUrl, orgName: org.name, finalStatus, counts, pages, checks, passed }), 'utf8');
  console.log(`\nRapport: ${reportPath}`);

  if (passed !== checks.length) process.exit(1);
}

main().catch((err) => {
  console.error('✗ crawl-eval fout:', err instanceof Error ? err.message : err);
  process.exit(1);
});
