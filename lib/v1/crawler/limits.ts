// V1 Website Crawler — pure crawl-limieten, client-veilig.
//
// Los van firecrawl.ts zodat client-componenten (page-selection) deze constanten kunnen
// importeren zonder de server-only Firecrawl-/rate-limit-laag mee te trekken.

/** Harde bovengrens per crawl (= aantal pagina's dat we daadwerkelijk scrapen).
 *  Voorkomt explosieve Firecrawl-kosten (blueprint sectie 14). */
export const MAX_CRAWL_PAGES = 50;

/** Bovengrens voor *ontdekken* (map). Map scrapet niets — het kost ~1 credit
 *  ongeacht hoeveel URLs terugkomen — dus we tonen de klant ruim de hele sitemap.
 *  Bewust losgekoppeld van MAX_CRAWL_PAGES: de scrape-cap blijft 50, de keuzelijst niet. */
export const MAX_DISCOVER_PAGES = 500;
