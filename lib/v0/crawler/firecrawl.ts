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
//
// ⚠️ Cache-discipline: Firecrawl cachet scrape-resultaten standaard ~2 dagen en
// map-resultaten met een eigen TTL. Voor een "crawl mijn site nu"-feature is dat
// fout — een klant die z'n site aanpast en herklaadt, kreeg dagenoude content.
// Daarom: scrape-paden forceren verse content (maxAge=0), en discovery leest de
// sitemap óók rechtstreeks uit (verse fetch) zodat we niet afhankelijk zijn van
// Firecrawl's map-cache.

import Firecrawl, { type Document as FirecrawlDocument, type MapOptions } from '@mendable/firecrawl-js';
import { logFirecrawlCredits } from './credit-log';

/** Harde bovengrens per crawl (= aantal pagina's dat we daadwerkelijk scrapen).
 *  Voorkomt explosieve Firecrawl-kosten (blueprint sectie 14). */
export const MAX_CRAWL_PAGES = 50;

/** Bovengrens voor *ontdekken* (map). Map scrapet niets — het kost ~1 credit
 *  ongeacht hoeveel URLs terugkomen — dus we tonen de klant ruim de hele sitemap.
 *  Bewust losgekoppeld van MAX_CRAWL_PAGES: de scrape-cap blijft 50, de keuzelijst niet. */
export const MAX_DISCOVER_PAGES = 500;

/** maxAge (ms) voor scrape-calls. 0 = nooit cache accepteren, altijd vers ophalen.
 *  Bewust 0: de kennisbank moet de live site weerspiegelen, niet een dagenoude
 *  Firecrawl-cache. Eén knop om later freshness vs. cost/snelheid te ruilen. */
const SCRAPE_MAX_AGE_MS = 0;

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
  /** Rauwe Firecrawl-status-string vóór onze mapping (bv. 'cancelled') — voor diagnostiek. */
  rawStatus: string;
  total: number;
  completed: number;
  /** Paginatie-cursor aanwezig? Zo ja, dan zit niet alle data in déze respons. */
  hasNext: boolean;
  /** Door Firecrawl gerapporteerd credit-verbruik, of null als onbekend. */
  creditsUsed: number | null;
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

export type FirecrawlAccountUsage = {
  remainingCredits: number;
  planCredits: number | null;
  /** Verbruik in de huidige kalendermaand (uit het historiek-endpoint), of null. */
  usedThisPeriod: number | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
};

/** Reject na `ms` i.p.v. eeuwig hangen op een trage API-call. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('firecrawl-timeout')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Live credit-verbruik van het Firecrawl-account (read-only — het uitlezen kost
 * géén credits). Bron-van-waarheid voor het overview-creditcijfer.
 *
 * "Verbruikt deze maand" komt uit het historiek-endpoint (per kalendermaand een
 * `creditsUsed`), NIET uit `plan − remaining`: dat laatste klopt niet zodra er
 * top-up/coupon-credits zijn — remaining kan dan plan overschrijden (bij dit account
 * is remaining 1104 op een plan van 1000). Faalt safe (null) als de key ontbreekt of
 * de API traag/onbereikbaar is, zodat de afgeleide schatting kan invallen.
 */
export async function getFirecrawlAccountUsage(
  timeoutMs = 5000,
): Promise<FirecrawlAccountUsage | null> {
  try {
    const client = getClient();
    const [usage, historical] = await Promise.all([
      withTimeout(client.getCreditUsage(), timeoutMs),
      withTimeout(client.getCreditUsageHistorical(), timeoutMs).catch(() => null),
    ]);

    // Huidige kalendermaand-periode → creditsUsed = verbruikt deze maand.
    let usedThisPeriod: number | null = null;
    const periods = historical?.periods ?? [];
    if (periods.length > 0) {
      const now = Date.now();
      const current =
        periods.find((p) => {
          const s = p.startDate ? new Date(p.startDate).getTime() : null;
          const e = p.endDate ? new Date(p.endDate).getTime() : null;
          return s != null && e != null && now >= s && now < e;
        }) ?? periods[periods.length - 1];
      if (current && typeof current.creditsUsed === 'number') {
        usedThisPeriod = Math.max(0, current.creditsUsed);
      }
    }

    return {
      remainingCredits: usage.remainingCredits,
      planCredits: usage.planCredits ?? null,
      usedThisPeriod,
      billingPeriodStart: usage.billingPeriodStart ?? null,
      billingPeriodEnd: usage.billingPeriodEnd ?? null,
    };
  } catch {
    return null;
  }
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

/**
 * Haalt de pagina-lijst van een site op (geen scrape — alleen URLs).
 *
 * Combineert twee bronnen en dedupliceert:
 *  1. Firecrawl `map()` — vangt link-discovery + sites zónder sitemap.
 *  2. De sitemap.xml die we zélf vers ophalen — vangt het geval waarin Firecrawl's
 *     map-cache verouderd is (de bug die ons b: sitemap had 31 URLs, map gaf er 1).
 *
 * Faalt map én levert de sitemap niets op, dan pas gooien we de map-fout door.
 */
export async function mapSite(url: string, limit: number = MAX_DISCOVER_PAGES): Promise<string[]> {
  const opts: MapOptions = { sitemap: 'include', limit };
  const [mapResult, sitemapUrls] = await Promise.all([
    getClient()
      .map(url, opts)
      .then((res) => ({
        ok: true as const,
        urls: (res.links ?? []).map((l) => l.url).filter((u): u is string => typeof u === 'string'),
      }))
      .catch((err: unknown) => ({ ok: false as const, err })),
    readSitemapUrls(url, limit),
  ]);

  const mapUrls = mapResult.ok ? mapResult.urls : [];
  // De map()-call kost ~1 credit (ongeacht aantal URLs). Sitemap-fetches loggen
  // apart in readSitemapUrls. Fail-safe — breekt de discovery nooit.
  if (mapResult.ok) await logFirecrawlCredits('map', 1);
  const merged = Array.from(new Set([...mapUrls, ...sitemapUrls]));
  if (merged.length === 0 && !mapResult.ok) throw mapResult.err;
  return merged.slice(0, limit);
}

/** Synchrone scrape van één pagina (C1: losse import). maxAge=0 → altijd vers. */
export async function scrapeOne(url: string): Promise<CrawledPage> {
  const doc = await getClient().scrape(url, { formats: ['markdown'], maxAge: SCRAPE_MAX_AGE_MS });
  await logFirecrawlCredits('scrape', 1);
  return toCrawledPage(doc);
}

/** Start een async batch-scrape van een expliciete URL-set. Geeft het batch-ID +
 *  de door Firecrawl geweigerde URLs terug (diagnostiek bij start). */
export async function startBatchScrape(urls: string[]): Promise<{ crawlId: string; invalidURLs: string[] }> {
  const capped = urls.slice(0, MAX_CRAWL_PAGES);
  const res = await getClient().startBatchScrape(capped, {
    options: { formats: ['markdown'], maxAge: SCRAPE_MAX_AGE_MS },
  });
  if (!res?.id) throw new Error('Firecrawl startBatchScrape gaf geen job-ID terug.');
  return { crawlId: res.id, invalidURLs: res.invalidURLs ?? [] };
}

/**
 * Pollt een batch-scrape-job en normaliseert naar CrawlStatus.
 *
 * ⚠️ Request-zuinigheid: `getBatchScrapeStatus` doet standaard `autoPaginate:true`
 * en haalt dán álle tot-nu-toe-pagina's op via een GET per data-pagina. Bij een
 * 4s-poll-tick tikt dat hard door Firecrawl's per-minuut request-limiet heen
 * (gemeten: 429 "Rate limit exceeded, consumed 502 req/min" → job faalde terwijl
 * de scrape zélf al klaar was). Daarom: pollen met `autoPaginate:false` (één GET,
 * alleen status/total/completed), en de volledige pagina-data pas paginerend
 * ophalen op het enige moment dat we ze nodig hebben — als de job 'completed' is.
 *
 * `rawStatus`/`hasNext`/`creditsUsed` worden meegegeven voor diagnostiek
 * (crawl_events). `hasNext` = paginatie-cursor aanwezig in déze respons.
 */
export async function getCrawlJobStatus(jobId: string): Promise<CrawlStatus> {
  const head = await getClient().getBatchScrapeStatus(jobId, { autoPaginate: false });
  const status: CrawlStatus['status'] =
    head.status === 'completed' ? 'completed' : head.status === 'scraping' ? 'scraping' : 'failed';
  const total = head.total ?? 0;
  const completed = head.completed ?? 0;
  const creditsUsed = typeof head.creditsUsed === 'number' ? head.creditsUsed : null;

  if (status !== 'completed') {
    return { status, rawStatus: head.status, total, completed, hasNext: head.next != null, creditsUsed, pages: [] };
  }

  // Klaar → nu pas de volledige set ophalen (mét pagination).
  const full = await getClient().getBatchScrapeStatus(jobId);
  const pages = (full.data ?? []).map((d) => toCrawledPage(d));
  return {
    status,
    rawStatus: head.status,
    total: full.total ?? total,
    completed: full.completed ?? completed,
    hasNext: full.next != null,
    creditsUsed: typeof full.creditsUsed === 'number' ? full.creditsUsed : creditsUsed,
    pages,
  };
}

// ─── sitemap-read (verse fallback naast Firecrawl's map-cache) ─────────────────

const MAX_CHILD_SITEMAPS = 20;

/**
 * <loc>-waarden uit een sitemap-XML trekken. De fetch loopt via Firecrawl-scrape
 * (op hún infra, niet de onze) met maxAge=0 → vers én géén eigen SSRF-oppervlak,
 * net als scrapeOne/startBatchScrape. Faalt stil → lege lijst.
 */
async function fetchSitemapLocs(sitemapUrl: string): Promise<string[]> {
  try {
    const doc = await getClient().scrape(sitemapUrl, {
      formats: ['rawHtml'],
      maxAge: SCRAPE_MAX_AGE_MS,
      onlyMainContent: false,
    });
    const xml = (doc as { rawHtml?: string }).rawHtml ?? '';
    // Elke sitemap-fetch is een Firecrawl-scrape (~1 credit). Fail-safe.
    await logFirecrawlCredits('sitemap', 1);
    return Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1]);
  } catch {
    return []; // geen sitemap / niet-bereikbaar / niet-XML → gewoon geen bron
  }
}

/**
 * Leest `${origin}/sitemap.xml` (vers via Firecrawl, omzeilt de map-cache) en
 * volgt één niveau sitemap-index. Geeft uitsluitend same-origin http(s)-URLs
 * terug — cross-origin child-sitemaps worden níét opgehaald en cross-origin
 * <loc>'s weggefilterd. Faalt stil → [].
 */
async function readSitemapUrls(siteUrl: string, limit: number): Promise<string[]> {
  let origin: string;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    return [];
  }
  const isSameOrigin = (u: string): boolean => {
    try {
      return new URL(u).origin === origin;
    } catch {
      return false;
    }
  };

  const rootLocs = await fetchSitemapLocs(`${origin}/sitemap.xml`);
  const isXml = (l: string) => /\.xml(\?|$)/i.test(l);

  // Sitemap-index? Volg alleen same-origin child-sitemaps (geen externe fetches).
  const childSitemaps = rootLocs.filter((l) => isXml(l) && isSameOrigin(l)).slice(0, MAX_CHILD_SITEMAPS);
  const directPages = rootLocs.filter((l) => !isXml(l));
  const childPages = childSitemaps.length
    ? (await Promise.all(childSitemaps.map(fetchSitemapLocs))).flat()
    : [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const loc of [...directPages, ...childPages]) {
    if (out.length >= limit) break;
    if (!isSameOrigin(loc) || seen.has(loc)) continue;
    seen.add(loc);
    out.push(loc);
  }
  return out;
}
