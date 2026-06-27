// V1 Website Crawler — diagnostiek-logger (append-only crawl_events).
//
// Spiegelt lib/v0/crawler/crawlEvents.ts; org+chatbot-gestempeld, service-role via
// de MEEGEGEVEN client (SA-5 DI — geen factory-import in deze module). Best-effort:
// een schrijffout mag NOOIT een crawl/ingest laten falen → alles in try/catch.

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrawledPage } from './firecrawl';

type Sb = SupabaseClient;

// 'ingest' wordt nooit geëmit (de ingest-uitkomst = eventType 'complete' + decision
// 'ingested'); de DB-CHECK staat 'ingest' wel toe (superset, V0 0036-parity).
export type CrawlEventType = 'start' | 'poll' | 'complete' | 'fail';

/** Beslissings-codes die de job-verwerker in crawl_events.decision schrijft. */
export type CrawlDecision =
  | 'start-failed'
  | 'no-crawl-id'
  | 'pending'
  | 'timeout'
  | 'firecrawl-failed'
  | 'rate-limited'
  | 'ingested'
  | 'finalize-retry'
  | 'finalize-failed'
  | 'exception';

/** Eén crawl-event-veld-set. organization_id + chatbot_id + event_type verplicht. */
export type CrawlEventInput = {
  organizationId: string;
  chatbotId: string;
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
  decision?: CrawlDecision | null;
  message?: string | null;
  payload?: Record<string, unknown>;
};

const MAX_PAYLOAD_PAGES = 60;

/** Getrimde per-pagina snapshot voor de payload: NOOIT de volledige content. */
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

/** Schrijft één crawl-event. Best-effort: faalt de insert → console-warn, ga door. */
export async function recordCrawlEvent(sb: Sb, ev: CrawlEventInput): Promise<void> {
  try {
    const { error } = await sb.from('crawl_events').insert({
      organization_id: ev.organizationId,
      chatbot_id: ev.chatbotId,
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
