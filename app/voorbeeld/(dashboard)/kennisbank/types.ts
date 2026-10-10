// V1 Kennisbank — gedeelde types (GEEN server-only → ook importeerbaar door de
// client-componenten). In het voorbeeld levert lib/voorbeeld/fixtures/kennisbank.ts de data.

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
