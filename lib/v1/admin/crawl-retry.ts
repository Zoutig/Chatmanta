// V1 admin — welke pagina's doet 'Opnieuw proberen' bij een crawl?
//
// Vroeger: opnieuw ontdekken via de root-URL en de eerste 50 gevonden URL's scrapen.
// Dat negeerde de paginakeuze van de klant (andere content in de kennisbank, extra
// Firecrawl-tegoed). Nu alleen pagina's die de klant zelf al in deze bron heeft:
//   1. 'failed'  — er zijn mislukte pagina's (documents.status='failed') → alleen die;
//   2. 'refresh' — geen mislukte, wel pagina's → die opnieuw ophalen (max. cap);
//   3. 'none'    — de bron heeft nog geen enkele pagina (eerste crawl mislukte in z'n
//                  geheel). De selectie van die crawl is niet bewaard (processing_jobs
//                  en crawl_events slaan alleen het aantal op), dus niet raden: de klant
//                  kiest opnieuw in zijn Kennisbank.
// De ingest is aanvullend per URL (ingestCrawlResults), dus pagina's buiten deze ronde
// blijven staan en een door de klant uitgezette pagina blijft uit.
//
// PUUR (getest).

export type SourcePage = { url: string | null; status: string };

export type RetryPlan =
  | { mode: 'failed' | 'refresh'; urls: string[]; total: number }
  | { mode: 'none'; urls: []; total: 0 };

export function planCrawlRetry(pages: SourcePage[], cap: number): RetryPlan {
  const uniq = (xs: string[]) => Array.from(new Set(xs));
  const withUrl = pages.filter((p): p is { url: string; status: string } => typeof p.url === 'string' && p.url.length > 0);
  const failed = uniq(withUrl.filter((p) => p.status === 'failed').map((p) => p.url));
  if (failed.length > 0) return { mode: 'failed', urls: failed.slice(0, cap), total: failed.length };
  const all = uniq(withUrl.map((p) => p.url));
  if (all.length > 0) return { mode: 'refresh', urls: all.slice(0, cap), total: all.length };
  return { mode: 'none', urls: [], total: 0 };
}
