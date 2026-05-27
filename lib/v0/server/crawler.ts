// V0 Website Crawler — server data-laag voor het Klantendashboard.
//
// Leest alle website-bronnen van een org (lijst) met de laatste crawl-job +
// diagnostiek-events + pagina's per bron. Service-role via getSystemJobClient
// (V0 heeft geen auth-sessie; reads moeten RLS bypassen). Mapt de DB-statussen
// naar de bestaande WebsitePage-UI-shape zodat de Website-tab niets nieuws
// hoeft te leren.

import 'server-only';

import { getSystemJobClient } from '@/lib/supabase/admin';
import type { WebsitePage, WebsitePageStatus } from '@/lib/v0/klantendashboard/types';

export type CrawlJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SourceStatus = 'pending' | 'crawling' | 'ready' | 'failed';

/** Eén crawl-event in beknopte vorm voor de dashboard-diagnostiek. */
export type CrawlEventLite = {
  eventType: string;
  firecrawlStatus: string | null;
  completed: number | null;
  total: number | null;
  dataCount: number | null;
  hasNext: boolean | null;
  decision: string | null;
  message: string | null;
  createdAt: string;
};

export type WebsiteSource = {
  source: { id: string; rootUrl: string | null; host: string | null; status: SourceStatus };
  job: {
    status: CrawlJobStatus;
    error: string | null;
    completed: number;
    total: number;
    events: CrawlEventLite[];
  } | null;
  pages: WebsitePage[];
};

export function toUiPageStatus(db: string, included: boolean): WebsitePageStatus {
  if (db === 'failed') return 'error';
  if (!included || db === 'excluded') return 'disabled';
  return 'active';
}

/** Alle website-bronnen van een org met laatste job + diagnostiek-events + pagina's.
 *  Bulk-queries (sources / laatste job per source / events van die jobs / pagina's),
 *  in JS geassembleerd — geen N+1. */
export async function getWebsiteSources(organizationId: string): Promise<WebsiteSource[]> {
  const sb = await getSystemJobClient({ reason: 'list_website_sources' });

  const { data: sources } = await sb
    .from('knowledge_sources')
    .select('id, root_url, normalized_host, status')
    .eq('organization_id', organizationId)
    .eq('type', 'website')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (!sources || sources.length === 0) return [];

  const sourceIds = sources.map((s) => s.id as string);

  const [{ data: jobRows }, { data: pageRows }] = await Promise.all([
    sb.from('processing_jobs')
      .select('id, target_id, status, error_message, created_at')
      .eq('organization_id', organizationId)
      .eq('job_type', 'crawl_website')
      .in('target_id', sourceIds)
      .order('created_at', { ascending: false }),
    sb.from('website_pages')
      .select('id, knowledge_source_id, url, title, status, last_crawled_at, included, error_message')
      .eq('organization_id', organizationId)
      .in('knowledge_source_id', sourceIds)
      .is('deleted_at', null)
      .order('url', { ascending: true }),
  ]);

  // Laatste job per source (rows zijn al desc op created_at).
  const latestJob = new Map<string, { id: string; status: string; error: string | null }>();
  for (const j of jobRows ?? []) {
    const tid = j.target_id as string;
    if (!latestJob.has(tid)) latestJob.set(tid, { id: j.id as string, status: j.status as string, error: (j.error_message as string | null) ?? null });
  }

  // Events van die laatste jobs (max 10 per job, nieuwste eerst).
  const latestJobIds = [...latestJob.values()].map((j) => j.id);
  const eventsByJob = new Map<string, CrawlEventLite[]>();
  if (latestJobIds.length > 0) {
    const { data: eventRows } = await sb
      .from('crawl_events')
      .select('processing_job_id, event_type, firecrawl_status, completed, total, data_count, has_next, decision, message, created_at')
      .in('processing_job_id', latestJobIds)
      .order('created_at', { ascending: false });
    for (const e of eventRows ?? []) {
      const jid = e.processing_job_id as string;
      const list = eventsByJob.get(jid) ?? [];
      if (list.length < 10) {
        list.push({
          eventType: e.event_type as string,
          firecrawlStatus: (e.firecrawl_status as string | null) ?? null,
          completed: (e.completed as number | null) ?? null,
          total: (e.total as number | null) ?? null,
          dataCount: (e.data_count as number | null) ?? null,
          hasNext: (e.has_next as boolean | null) ?? null,
          decision: (e.decision as string | null) ?? null,
          message: (e.message as string | null) ?? null,
          createdAt: (e.created_at as string | null) ?? '',
        });
      }
      eventsByJob.set(jid, list);
    }
  }

  // Pagina's per source.
  const pagesBySource = new Map<string, WebsitePage[]>();
  for (const p of pageRows ?? []) {
    const sid = p.knowledge_source_id as string;
    const list = pagesBySource.get(sid) ?? [];
    list.push({
      id: p.id as string,
      title: (p.title as string | null) ?? (p.url as string),
      url: p.url as string,
      status: toUiPageStatus(p.status as string, (p.included as boolean) ?? true),
      lastProcessedAt: (p.last_crawled_at as string | null) ?? '',
      included: (p.included as boolean) ?? true,
      errorMessage: (p.error_message as string | null) ?? null,
    });
    pagesBySource.set(sid, list);
  }

  return sources.map((s) => {
    const lj = latestJob.get(s.id as string);
    const events = lj ? (eventsByJob.get(lj.id) ?? []) : [];
    const counted = events.find((e) => e.total != null);
    return {
      source: {
        id: s.id as string,
        rootUrl: (s.root_url as string | null) ?? null,
        host: (s.normalized_host as string | null) ?? null,
        status: s.status as SourceStatus,
      },
      job: lj
        ? { status: lj.status as CrawlJobStatus, error: lj.error, completed: counted?.completed ?? 0, total: counted?.total ?? 0, events }
        : null,
      pages: pagesBySource.get(s.id as string) ?? [],
    };
  });
}
