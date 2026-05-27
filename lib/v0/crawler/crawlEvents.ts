// V0 Website Crawler — diagnostiek-logger (append-only crawl_events).
//
// Doel: maak een crawl die "0 pagina's" oplevert of mislukt verklaarbaar door per
// poll/beslissing de rauwe Firecrawl-status + onze beslissing vast te leggen.
// Service-role via de meegegeven client (SA-5). Best-effort: een schrijffout mag
// NOOIT een crawl/ingest laten falen — daarom alles in try/catch.

import 'server-only';

import type { getSystemJobClient } from '@/lib/supabase/admin';
import type { CrawledPage } from './firecrawl';

type Sb = Awaited<ReturnType<typeof getSystemJobClient>>;

export type CrawlEventType = 'start' | 'poll' | 'ingest' | 'complete' | 'fail';

/** Eén crawl-event-veld-set. organization_id + event_type verplicht; rest optioneel. */
export type CrawlEventInput = {
  organizationId: string;
  eventType: CrawlEventType;
  processingJobId?: string | null;
  knowledgeSourceId?: string | null;
  externalJobId?: string | null;
  firecrawlStatus?: string | null;
  completed?: number | null;
  total?: number | null;
  dataCount?: number | null;
  hasNext?: boolean | null;
  creditsUsed?: number | null;
  decision?: string | null;
  message?: string | null;
  payload?: Record<string, unknown>;
};

/** Hoeveel pagina's we maximaal in de getrimde payload-snapshot bewaren. */
const MAX_PAYLOAD_PAGES = 60;

/**
 * Bouwt een GETRIMDE per-pagina snapshot voor de payload: alleen url, statusCode,
 * error en de lengte van de markdown — NOOIT de volledige content (kan groot zijn
 * en hoort niet in een audit-log). Gecapt op MAX_PAYLOAD_PAGES.
 */
export function buildPagesPayload(pages: CrawledPage[]): {
  pageCount: number;
  pages: Array<{ url: string; statusCode: number | null; error: string | null; markdownLength: number }>;
} {
  return {
    pageCount: pages.length,
    pages: pages.slice(0, MAX_PAYLOAD_PAGES).map((p) => ({
      url: p.url,
      statusCode: p.statusCode,
      error: p.error,
      markdownLength: p.markdown.length,
    })),
  };
}

/**
 * Schrijft één crawl-event. Best-effort: faalt de insert, dan loggen we naar de
 * console en gaan verder — diagnostiek mag de crawl nooit breken.
 */
export async function recordCrawlEvent(sb: Sb, ev: CrawlEventInput): Promise<void> {
  try {
    const { error } = await sb.from('crawl_events').insert({
      organization_id: ev.organizationId,
      event_type: ev.eventType,
      processing_job_id: ev.processingJobId ?? null,
      knowledge_source_id: ev.knowledgeSourceId ?? null,
      external_job_id: ev.externalJobId ?? null,
      firecrawl_status: ev.firecrawlStatus ?? null,
      completed: ev.completed ?? null,
      total: ev.total ?? null,
      data_count: ev.dataCount ?? null,
      has_next: ev.hasNext ?? null,
      credits_used: ev.creditsUsed ?? null,
      decision: ev.decision ?? null,
      message: ev.message ?? null,
      payload: ev.payload ?? {},
    });
    if (error) {
      console.warn(`[crawl_events] insert faalde (genegeerd): ${error.message}`);
    }
  } catch (err) {
    console.warn(`[crawl_events] insert wierp (genegeerd):`, err);
  }
}
