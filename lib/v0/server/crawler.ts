// V0 Website Crawler — server data-laag voor het Klantendashboard.
//
// Leest de echte crawler-state (knowledge_source + laatste crawl-job +
// website_pages) voor een org. Service-role via getSystemJobClient (V0 heeft
// geen auth-sessie; reads moeten RLS bypassen). Mapt de DB-statussen naar de
// bestaande WebsitePage-UI-shape zodat de Website-tab niets nieuws hoeft te leren.

import 'server-only';

import { getSystemJobClient } from '@/lib/supabase/admin';
import type { WebsitePage, WebsitePageStatus } from '@/lib/v0/klantendashboard/types';

export type CrawlJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SourceStatus = 'pending' | 'crawling' | 'ready' | 'failed';

export type WebsiteState = {
  source: { id: string; rootUrl: string | null; status: SourceStatus } | null;
  /** Laatste crawl-job voor deze bron, of null als er nog nooit gecrawld is. */
  job: { status: CrawlJobStatus; error: string | null; completed: number; total: number } | null;
  pages: WebsitePage[];
};

function toUiPageStatus(db: string, included: boolean): WebsitePageStatus {
  if (db === 'failed') return 'error';
  if (!included || db === 'excluded') return 'disabled';
  return 'active';
}

/** Haalt de (enige) website-bron van een org op met job-status + pagina's. */
export async function getWebsiteState(organizationId: string): Promise<WebsiteState> {
  const sb = await getSystemJobClient({ reason: 'list_website_sources' });

  const { data: source } = await sb
    .from('knowledge_sources')
    .select('id, root_url, status')
    .eq('organization_id', organizationId)
    .eq('type', 'website')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!source) return { source: null, job: null, pages: [] };

  const [{ data: job }, { data: pageRows }] = await Promise.all([
    sb
      .from('processing_jobs')
      .select('status, error_message')
      .eq('organization_id', organizationId)
      .eq('job_type', 'crawl_website')
      .eq('target_id', source.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('website_pages')
      .select('id, url, title, status, last_crawled_at, included, error_message')
      .eq('knowledge_source_id', source.id)
      .is('deleted_at', null)
      .order('url', { ascending: true }),
  ]);

  const pages: WebsitePage[] = (pageRows ?? []).map((p) => ({
    id: p.id as string,
    title: (p.title as string | null) ?? (p.url as string),
    url: p.url as string,
    status: toUiPageStatus(p.status as string, (p.included as boolean) ?? true),
    lastProcessedAt: (p.last_crawled_at as string | null) ?? '',
    included: (p.included as boolean) ?? true,
    errorMessage: (p.error_message as string | null) ?? null,
  }));

  return {
    source: {
      id: source.id as string,
      rootUrl: (source.root_url as string | null) ?? null,
      status: source.status as SourceStatus,
    },
    job: job
      ? { status: job.status as CrawlJobStatus, error: (job.error_message as string | null) ?? null, completed: 0, total: 0 }
      : null,
    pages,
  };
}
