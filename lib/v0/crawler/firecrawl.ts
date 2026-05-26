// V0 Website Crawler — dunne wrapper om de Firecrawl v4.25 SDK (@mendable/firecrawl-js).
//
// Doel: isoleer de SDK-specifieke shapes achter een kleine, stabiele interface die
// processJobs.ts consumeert, en dwing de kosten-rem (hardcap 50 pagina's) in code af
// — niet alleen in de UI. De API-key komt server-only uit FIRECRAWL_API_KEY.
//
// v4.25: Firecrawl default export = FirecrawlClient (v2). Gebruikte methodes:
//   map()             → MapData { links: SearchResultWeb[] }
//   scrape()          → Document
//   startBatchScrape() → BatchScrapeResponse { id }
//   getBatchScrapeStatus() → BatchScrapeJob { status, total, completed, data }

import Firecrawl, { type Document as FirecrawlDocument, type MapOptions } from '@mendable/firecrawl-js';

/** Harde bovengrens per crawl. Voorkomt explosieve Firecrawl-kosten (blueprint sectie 14). */
export const MAX_CRAWL_PAGES = 50;

/** Eén genormaliseerde gecrawlde pagina, klaar voor de ingest-pijplijn. */
export type CrawledPage = {
  url: string;
  title: string | null;
  markdown: string;
  statusCode: number | null;
  error: string | null;
};

export type CrawlStatus = {
  /** 'scraping' = nog bezig; 'completed' = klaar; 'failed' = mislukt (incl. cancelled). */
  status: 'scraping' | 'completed' | 'failed';
  total: number;
  completed: number;
  pages: CrawledPage[];
};

let client: Firecrawl | null = null;

/** Lazy singleton — de key wordt pas bij eerste gebruik gelezen (niet bij import/build). */
function getClient(): Firecrawl {
  if (client) return client;
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY ontbreekt in de omgeving.');
  }
  client = new Firecrawl(apiKey);
  return client;
}

/** Normaliseert één Firecrawl Document naar onze CrawledPage-shape. */
function toCrawledPage(doc: FirecrawlDocument): CrawledPage {
  const meta = doc.metadata ?? {};
  return {
    url: (meta.sourceURL as string) ?? (meta.url as string) ?? '',
    title: meta.title ?? null,
    markdown: doc.markdown ?? '',
    statusCode: typeof meta.statusCode === 'number' ? meta.statusCode : null,
    error: typeof meta.error === 'string' ? meta.error : null,
  };
}

/** Haalt de sitemap/pagina-lijst van een site op (geen scrape — alleen URLs). */
export async function mapSite(url: string, limit: number = MAX_CRAWL_PAGES): Promise<string[]> {
  const opts: MapOptions = { sitemap: 'include', limit };
  const res = await getClient().map(url, opts);
  const urls = (res.links ?? []).map((l) => l.url).filter((u): u is string => typeof u === 'string');
  return Array.from(new Set(urls)).slice(0, limit);
}

/** Synchrone scrape van één pagina (C1: losse import). */
export async function scrapeOne(url: string): Promise<CrawledPage> {
  const doc = await getClient().scrape(url, { formats: ['markdown'] });
  return toCrawledPage(doc);
}

/** Start een async batch-scrape van een expliciete URL-set. Geeft het batch-ID terug. */
export async function startBatchScrape(urls: string[]): Promise<{ crawlId: string }> {
  const capped = urls.slice(0, MAX_CRAWL_PAGES);
  const res = await getClient().startBatchScrape(capped, { options: { formats: ['markdown'] } });
  if (!res?.id) throw new Error('Firecrawl startBatchScrape gaf geen job-ID terug.');
  return { crawlId: res.id };
}

/** Pollt een batch-scrape-job en normaliseert naar CrawlStatus. */
export async function getCrawlJobStatus(jobId: string): Promise<CrawlStatus> {
  const job = await getClient().getBatchScrapeStatus(jobId);
  const status: CrawlStatus['status'] =
    job.status === 'completed' ? 'completed' : job.status === 'scraping' ? 'scraping' : 'failed';
  const pages = (job.data ?? []).map((d) => toCrawledPage(d));
  return { status, total: job.total ?? 0, completed: job.completed ?? 0, pages };
}
