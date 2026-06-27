// V1 Website Crawler — server data-laag voor het Kennisbank-dashboard.
//
// Leest alle website-bronnen van een org+chatbot (lijst) met de laatste crawl-job +
// diagnostiek-events + pagina's per bron. PAGES-AS-DOCUMENTS: een "pagina" is een
// documents-rij met source='website' (url/title/error in metadata). Client wordt
// GEÏNJECTEERD (session-client onder RLS voor reads; service-role in de tick) en
// elke query filtert org+chatbot expliciet (defense-in-depth).

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type WebsitePageStatus = 'active' | 'disabled' | 'error' | 'processing';

export type WebsitePage = {
  id: string;
  title: string;
  url: string;
  status: WebsitePageStatus;
  lastProcessedAt: string;
  included: boolean;
  errorMessage: string | null;
};

export type CrawlJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SourceStatus = 'pending' | 'crawling' | 'ready' | 'failed';

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
  job: { status: CrawlJobStatus; error: string | null; completed: number; total: number; events: CrawlEventLite[] } | null;
  pages: WebsitePage[];
};

export function toUiPageStatus(db: string, included: boolean): WebsitePageStatus {
  if (db === 'failed') return 'error';
  if (!included || db === 'excluded') return 'disabled';
  return 'active';
}

/**
 * Alle website-bronnen van een org+chatbot met laatste job + events + pagina's.
 * Bulk-queries, in JS geassembleerd (geen N+1). Pagina's komen uit `documents`
 * (source='website'); url/title/error uit metadata.
 */
export async function getWebsiteSources(
  client: SupabaseClient,
  organizationId: string,
  chatbotId: string,
): Promise<WebsiteSource[]> {
  const { data: sources } = await client
    .from('knowledge_sources')
    .select('id, root_url, normalized_host, status')
    .eq('organization_id', organizationId)
    .eq('chatbot_id', chatbotId)
    .eq('type', 'website')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (!sources || sources.length === 0) return [];

  const sourceIds = sources.map((s) => s.id as string);

  const [{ data: jobRows }, { data: pageRows }] = await Promise.all([
    client
      .from('processing_jobs')
      .select('id, target_id, status, error_message, created_at')
      .eq('organization_id', organizationId)
      .eq('chatbot_id', chatbotId)
      .eq('job_type', 'crawl_website')
      .in('target_id', sourceIds)
      .order('created_at', { ascending: false }),
    client
      .from('documents')
      .select('id, knowledge_source_id, status, included, created_at, metadata')
      .eq('organization_id', organizationId)
      .eq('chatbot_id', chatbotId)
      .eq('source', 'website')
      .in('knowledge_source_id', sourceIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ]);

  // Laatste job per source (rows zijn al desc op created_at).
  const latestJob = new Map<string, { id: string; status: string; error: string | null }>();
  for (const j of jobRows ?? []) {
    const tid = j.target_id as string;
    if (!latestJob.has(tid)) {
      latestJob.set(tid, { id: j.id as string, status: j.status as string, error: (j.error_message as string | null) ?? null });
    }
  }

  // Events van die laatste jobs (max 10 per job, nieuwste eerst).
  const latestJobIds = [...latestJob.values()].map((j) => j.id);
  const eventsByJob = new Map<string, CrawlEventLite[]>();
  if (latestJobIds.length > 0) {
    const { data: eventRows } = await client
      .from('crawl_events')
      .select('processing_job_id, event_type, firecrawl_status, completed, total, data_count, has_next, decision, message, created_at')
      .eq('organization_id', organizationId)
      .eq('chatbot_id', chatbotId)
      .in('processing_job_id', latestJobIds)
      .order('created_at', { ascending: false });
    for (const e of eventRows ?? []) {
      const jid = e.processing_job_id as string;
      if (!eventsByJob.has(jid)) eventsByJob.set(jid, []);
      const list = eventsByJob.get(jid)!;
      if (list.length >= 10) continue;
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
  }

  // Pagina's per source (uit documents, metadata → url/title/error).
  const pagesBySource = new Map<string, WebsitePage[]>();
  for (const d of pageRows ?? []) {
    const sid = d.knowledge_source_id as string;
    const meta = (d.metadata ?? {}) as Record<string, unknown>;
    const url = (meta.source_url as string | undefined) ?? '';
    const list = pagesBySource.get(sid) ?? [];
    list.push({
      id: d.id as string,
      title: (meta.source_title as string | undefined) || url || '(onbekend)',
      url,
      status: toUiPageStatus(d.status as string, (d.included as boolean) ?? true),
      lastProcessedAt: (d.created_at as string | null) ?? '',
      included: (d.included as boolean) ?? true,
      errorMessage: (meta.error as string | null) ?? null,
    });
    pagesBySource.set(sid, list);
  }

  return sources.map((s) => {
    const lj = latestJob.get(s.id as string);
    const events = lj ? eventsByJob.get(lj.id) ?? [] : [];
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
