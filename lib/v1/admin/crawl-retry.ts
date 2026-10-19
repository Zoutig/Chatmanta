// V1 admin — welke pagina's doet 'Opnieuw proberen' bij een crawl?
//
// Vroeger: opnieuw ontdekken via de root-URL en de eerste 50 gevonden URL's scrapen.
// Dat negeerde de paginakeuze van de klant (andere content in de kennisbank, extra
// Firecrawl-tegoed). Nu alleen pagina's die de klant zelf al in deze bron heeft:
//   1. 'failed'  — er zijn mislukte pagina's (documents.status='failed') → alleen die;
//   2. 'refresh' — geen mislukte, wel werkende pagina's die aan staan (status 'ready',
//                  included=true) → die opnieuw ophalen (max. cap). Lege pagina's en
//                  pagina's die de klant zelf uitzette blijven buiten beeld: die blijven
//                  toch uit, dus ophalen kost alleen tegoed;
//   3. 'none'    — niets om opnieuw te doen (bv. de eerste crawl mislukte in z'n geheel).
//                  De selectie van die crawl is niet bewaard (processing_jobs en
//                  crawl_events slaan alleen het aantal op), dus niet raden: de klant
//                  kiest opnieuw in zijn Kennisbank.
// De ingest is aanvullend per URL (ingestCrawlResults), dus pagina's buiten deze ronde
// blijven staan en een door de klant uitgezette pagina blijft uit. Een geslaagde retry
// van een mislukte pagina gaat weer aan (zie lib/v1/crawler/disabled-snapshot.ts).
//
// PUUR (getest).

export type SourcePage = { url: string | null; status: string; included?: boolean | null };

export type RetryPlan =
  | { mode: 'failed' | 'refresh'; urls: string[]; total: number }
  | { mode: 'none'; urls: []; total: 0 };

export function planCrawlRetry(pages: SourcePage[], cap: number): RetryPlan {
  const uniq = (xs: string[]) => Array.from(new Set(xs));
  const withUrl = pages.filter(
    (p): p is SourcePage & { url: string } => typeof p.url === 'string' && p.url.length > 0,
  );
  const failed = uniq(withUrl.filter((p) => p.status === 'failed').map((p) => p.url));
  if (failed.length > 0) return { mode: 'failed', urls: failed.slice(0, cap), total: failed.length };
  const live = uniq(withUrl.filter((p) => p.status === 'ready' && p.included !== false).map((p) => p.url));
  if (live.length > 0) return { mode: 'refresh', urls: live.slice(0, cap), total: live.length };
  return { mode: 'none', urls: [], total: 0 };
}
