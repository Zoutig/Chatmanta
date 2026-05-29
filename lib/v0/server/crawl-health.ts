// V0 Website Crawler — operator crawl-health overzicht (cross-org, read-only).
//
// Aggregeert de laatste crawl-jobs over ALLE orgs heen met hun terminale
// diagnostiek (crawl_events) + huidige pagina-tellingen, zodat een operator in
// één blik ziet welke crawls faalden en waarom — zonder per job in een <details>
// te hoeven graven. Service-role via getSystemJobClient (SA-5): bewuste,
// RLS-bypassende cross-org admin-read. Schrijft niets.
//
// ⚠️ V0-disclaimer: leest álle orgs zonder membership-check — hetzelfde
// V0-sandbox-model als de rest van /commandcenter, achter de wachtwoordgate
// (proxy.ts). Niet geschikt zodra V1 echte tenants heeft.

import 'server-only';

import { getSystemJobClient } from '@/lib/supabase/admin';
import { ALL_ORG_SLUGS, KNOWN_ORGS } from '@/lib/v0/server/active-org';

/** Hoeveel recente crawl-jobs we tonen + waarover de rollup rekent. */
const RECENT_LIMIT = 60;
/** Max events per job in de drill-in (nieuwste eerst). */
const MAX_EVENTS_PER_JOB = 12;

export type CrawlHealthCategory =
  | 'success'
  | 'running'
  | 'rate-limited'
  | 'timeout'
  | 'firecrawl-failed'
  | 'start-failed'
  | 'no-crawl-id'
  | 'exception'
  | 'failed';

export const CATEGORY_LABEL: Record<CrawlHealthCategory, string> = {
  success: 'Geslaagd',
  running: 'Bezig',
  'rate-limited': 'Vertraagd (rate-limit)',
  timeout: 'Time-out',
  'firecrawl-failed': 'Firecrawl mislukt',
  'start-failed': 'Starten mislukt',
  'no-crawl-id': 'Geen crawl-ID',
  exception: 'Onverwachte fout',
  failed: 'Mislukt',
};

/** Aanbevolen actie per eindcategorie — voedt de "wat nu?"-kolom in het admin-overzicht. */
export const RECOMMENDED_FIX: Record<CrawlHealthCategory, string> = {
  success: 'Geen actie nodig.',
  running: 'Crawl loopt nog — verwerk de openstaande jobs of wacht op de volgende poll.',
  'rate-limited': 'Firecrawl rate-limit. Wacht even en verwerk opnieuw; meestal lost het zich vanzelf op.',
  timeout: 'Crawl te groot/traag. Probeer opnieuw met minder pagina’s of splits de site.',
  'firecrawl-failed': 'Firecrawl gaf een fout. Check of de site bereikbaar is (geen login/robots-block) en probeer opnieuw.',
  'start-failed': 'Crawl kon niet starten — controleer de URL (publiek, geldig schema) en probeer opnieuw.',
  'no-crawl-id': 'Firecrawl gaf geen job-ID terug. Probeer de crawl opnieuw te starten.',
  exception: 'Onverwachte fout in de verwerker. Bekijk de events; probeer opnieuw of meld het.',
  failed: 'Crawl mislukt zonder specifieke reden. Bekijk de events en probeer opnieuw.',
};

/** Leesbare labels voor de per-poll beslissingen in de drill-in-tabel. */
export const DECISION_LABEL: Record<string, string> = {
  'start-failed': 'Starten mislukt',
  'no-crawl-id': 'Geen crawl-ID',
  pending: 'Bezig',
  'rate-limited': 'Vertraagd (rate-limit)',
  timeout: 'Time-out',
  'firecrawl-failed': 'Firecrawl mislukt',
  ingested: 'Verwerkt',
  exception: 'Onverwachte fout',
};

/**
 * Eindstatus van een crawl → één categorie. Gebruikt de job-status plus de
 * terminale (= nieuwste) event-decision. Pure functie zodat de UI 'm 1-op-1
 * kan tonen en de eval er later op kan asserten.
 */
export function categorizeCrawl(jobStatus: string, terminalDecision: string | null): CrawlHealthCategory {
  if (jobStatus === 'completed') return 'success';
  if (jobStatus === 'pending' || jobStatus === 'processing') {
    return terminalDecision === 'rate-limited' ? 'rate-limited' : 'running';
  }
  // jobStatus === 'failed'
  switch (terminalDecision) {
    case 'timeout':
      return 'timeout';
    case 'firecrawl-failed':
      return 'firecrawl-failed';
    case 'start-failed':
      return 'start-failed';
    case 'no-crawl-id':
      return 'no-crawl-id';
    case 'exception':
      return 'exception';
    default:
      return 'failed';
  }
}

export type CrawlHealthEvent = {
  eventType: string;
  decision: string | null;
  firecrawlStatus: string | null;
  completed: number | null;
  total: number | null;
  dataCount: number | null;
  hasNext: boolean | null;
  creditsUsed: number | null;
  message: string | null;
  createdAt: string;
};

export type CrawlHealthRow = {
  jobId: string;
  orgId: string;
  orgName: string;
  host: string | null;
  rootUrl: string | null;
  jobStatus: 'pending' | 'processing' | 'completed' | 'failed';
  category: CrawlHealthCategory;
  completed: number;
  total: number;
  /** Huidige pagina-staat van de bron (laatste crawl). */
  pagesOk: number;
  pagesFailed: number;
  pagesExcluded: number;
  durationMs: number | null;
  /** Poll-/retry-pogingen op deze job (processing_jobs.attempts). */
  attempts: number;
  /** Firecrawl-credits voor deze job (max gerapporteerd over de polls; null = onbekend). */
  creditsUsed: number | null;
  createdAt: string;
  errorMessage: string | null;
  events: CrawlHealthEvent[];
};

export type CrawlHealthRollupItem = { category: CrawlHealthCategory; label: string; count: number };

export type CrawlHealth = {
  totalCrawls: number;
  /** Crawls die een eindstatus bereikten (niet 'running'/'rate-limited'). */
  terminalCrawls: number;
  /** Aandeel geslaagd over de terminale crawls; null als er nog geen zijn. */
  successRate: number | null;
  rollup: CrawlHealthRollupItem[];
  recent: CrawlHealthRow[];
};

/** UUID → leesbare org-naam via de bekende V0-sandbox-orgs; fallback = korte id. */
function orgName(orgId: string): string {
  for (const slug of ALL_ORG_SLUGS) {
    if (KNOWN_ORGS[slug].id === orgId) return KNOWN_ORGS[slug].name;
  }
  return orgId.slice(0, 8);
}

/**
 * Laatste crawl-jobs over alle orgs met terminale diagnostiek + pagina-tellingen.
 * Bulk-queries (jobs / sources / events / pages), in JS geassembleerd — geen N+1.
 */
export async function getCrawlHealth(): Promise<CrawlHealth> {
  const sb = await getSystemJobClient({ reason: 'crawl_health_overview' });

  const { data: jobRows } = await sb
    .from('processing_jobs')
    .select('id, organization_id, target_id, status, error_message, external_job_id, attempts, started_at, finished_at, created_at')
    .eq('job_type', 'crawl_website')
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT);

  if (!jobRows || jobRows.length === 0) {
    return { totalCrawls: 0, terminalCrawls: 0, successRate: null, rollup: [], recent: [] };
  }

  const jobIds = jobRows.map((j) => j.id as string);
  const sourceIds = [...new Set(jobRows.map((j) => j.target_id as string))];

  const [{ data: sourceRows }, { data: eventRows }, { data: pageRows }] = await Promise.all([
    sb.from('knowledge_sources').select('id, root_url, normalized_host').in('id', sourceIds),
    sb
      .from('crawl_events')
      .select('processing_job_id, event_type, decision, firecrawl_status, completed, total, data_count, has_next, credits_used, message, created_at')
      .in('processing_job_id', jobIds)
      .order('created_at', { ascending: false }),
    sb
      .from('website_pages')
      .select('knowledge_source_id, status, included')
      .in('knowledge_source_id', sourceIds)
      .is('deleted_at', null),
  ]);

  const sourceById = new Map<string, { rootUrl: string | null; host: string | null }>();
  for (const s of sourceRows ?? []) {
    sourceById.set(s.id as string, {
      rootUrl: (s.root_url as string | null) ?? null,
      host: (s.normalized_host as string | null) ?? null,
    });
  }

  // Events per job (al desc op created_at), gecapt op MAX_EVENTS_PER_JOB.
  const eventsByJob = new Map<string, CrawlHealthEvent[]>();
  for (const e of eventRows ?? []) {
    const jid = e.processing_job_id as string;
    const list = eventsByJob.get(jid) ?? [];
    if (list.length >= MAX_EVENTS_PER_JOB) continue;
    list.push({
      eventType: e.event_type as string,
      decision: (e.decision as string | null) ?? null,
      firecrawlStatus: (e.firecrawl_status as string | null) ?? null,
      completed: (e.completed as number | null) ?? null,
      total: (e.total as number | null) ?? null,
      dataCount: (e.data_count as number | null) ?? null,
      hasNext: (e.has_next as boolean | null) ?? null,
      creditsUsed: (e.credits_used as number | null) ?? null,
      message: (e.message as string | null) ?? null,
      createdAt: (e.created_at as string | null) ?? '',
    });
    eventsByJob.set(jid, list);
  }

  // Huidige pagina-tellingen per bron (failed / excluded-of-uit / ok).
  const pageCounts = new Map<string, { ok: number; failed: number; excluded: number }>();
  for (const p of pageRows ?? []) {
    const sid = p.knowledge_source_id as string;
    const pc = pageCounts.get(sid) ?? { ok: 0, failed: 0, excluded: 0 };
    const st = p.status as string;
    if (st === 'failed') pc.failed++;
    else if (st === 'excluded' || p.included === false) pc.excluded++;
    else pc.ok++;
    pageCounts.set(sid, pc);
  }

  const recent: CrawlHealthRow[] = jobRows.map((j) => {
    const jid = j.id as string;
    const sid = j.target_id as string;
    const events = eventsByJob.get(jid) ?? [];
    const terminalDecision = events[0]?.decision ?? null;
    const counted = events.find((e) => e.total != null);
    const src = sourceById.get(sid);
    const pc = pageCounts.get(sid) ?? { ok: 0, failed: 0, excluded: 0 };
    const started = j.started_at as string | null;
    const finished = j.finished_at as string | null;
    const durationMs =
      started && finished ? new Date(finished).getTime() - new Date(started).getTime() : null;
    // creditsUsed is cumulatief per job over de polls → de hoogste niet-null waarde.
    const creditVals = events.map((e) => e.creditsUsed).filter((c): c is number => c != null);
    const creditsUsed = creditVals.length > 0 ? Math.max(...creditVals) : null;

    return {
      jobId: jid,
      orgId: j.organization_id as string,
      orgName: orgName(j.organization_id as string),
      host: src?.host ?? null,
      rootUrl: src?.rootUrl ?? null,
      jobStatus: j.status as CrawlHealthRow['jobStatus'],
      category: categorizeCrawl(j.status as string, terminalDecision),
      completed: counted?.completed ?? 0,
      total: counted?.total ?? 0,
      pagesOk: pc.ok,
      pagesFailed: pc.failed,
      pagesExcluded: pc.excluded,
      durationMs: durationMs != null && durationMs >= 0 ? durationMs : null,
      attempts: (j.attempts as number | null) ?? 0,
      creditsUsed,
      createdAt: (j.created_at as string | null) ?? '',
      errorMessage: (j.error_message as string | null) ?? null,
      events,
    };
  });

  // Rollup over de opgehaalde set.
  const catCounts = new Map<CrawlHealthCategory, number>();
  for (const r of recent) catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
  const rollup: CrawlHealthRollupItem[] = [...catCounts.entries()]
    .map(([category, count]) => ({ category, label: CATEGORY_LABEL[category], count }))
    .sort((a, b) => b.count - a.count);

  const terminal = recent.filter((r) => r.category !== 'running' && r.category !== 'rate-limited');
  const successRate =
    terminal.length > 0 ? terminal.filter((r) => r.category === 'success').length / terminal.length : null;

  return { totalCrawls: recent.length, terminalCrawls: terminal.length, successRate, rollup, recent };
}
