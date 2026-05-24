// V0 Website Crawler — dunne wrapper om de Firecrawl v2 SDK (@mendable/firecrawl-js).
//
// Doel: isoleer de SDK-specifieke shapes achter een kleine, stabiele interface die
// processCrawl.ts consumeert, en dwing de kosten-rem (hardcap 50 pagina's) in code af
// — niet alleen in de UI. De API-key komt server-only uit FIRECRAWL_API_KEY.

import Firecrawl from '@mendable/firecrawl-js';

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

/**
 * Start een crawl (async). Geeft het Firecrawl crawl-ID terug; de daadwerkelijke
 * verwerking pollt de cron-route later via getCrawlStatus.
 */
export async function startCrawl(url: string, maxPages: number = MAX_CRAWL_PAGES): Promise<{ crawlId: string }> {
  const limit = Math.min(Math.max(1, Math.floor(maxPages)), MAX_CRAWL_PAGES);
  const res = await getClient().startCrawl(url, {
    limit,
    scrapeOptions: { formats: ['markdown'] },
  });
  if (!res?.id) {
    throw new Error('Firecrawl startCrawl gaf geen crawl-ID terug.');
  }
  return { crawlId: res.id };
}

/**
 * Pollt de status van een lopende crawl en normaliseert de documenten naar CrawledPage[].
 * Mapt de SDK-status 'cancelled' op 'failed' zodat de caller maar 3 toestanden kent.
 */
export async function getCrawlStatus(crawlId: string): Promise<CrawlStatus> {
  const job = await getClient().getCrawlStatus(crawlId);
  const status: CrawlStatus['status'] =
    job.status === 'completed' ? 'completed' : job.status === 'scraping' ? 'scraping' : 'failed';

  const pages: CrawledPage[] = (job.data ?? []).map((doc) => {
    const meta = doc.metadata ?? {};
    return {
      url: meta.sourceURL ?? meta.url ?? '',
      title: meta.title ?? null,
      markdown: doc.markdown ?? '',
      statusCode: typeof meta.statusCode === 'number' ? meta.statusCode : null,
      error: typeof meta.error === 'string' ? meta.error : null,
    };
  });

  return { status, total: job.total ?? 0, completed: job.completed ?? 0, pages };
}
