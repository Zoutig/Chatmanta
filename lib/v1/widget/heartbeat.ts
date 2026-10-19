// Wanneer telt een widget-heartbeat (POST /api/v1/widget/ping) als "gezien op een
// klantsite"? Pure helpers, gedeeld door de embed-iframe (client) en de ping-route
// (server), zodat beide dezelfde regel hanteren. Bewust zonder 'server-only'.
//
// LET OP: de host komt van de client (?h= uit de loader, of document.referrer) en is
// dus te spoofen. Een heartbeat is een SIGNAAL ("de widget is ergens ingesloten
// geladen"), nooit bewijs van een installatie op een bepaald domein.

/** Hostname zonder poort, lowercase, zonder leidende "www.". Leeg/ongeldig → null. */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  let h = raw.trim().toLowerCase();
  if (!h || h === 'onbekend') return null;
  // Accepteer ook een volledige URL (Referer) i.p.v. een kale hostname.
  if (h.includes('://')) {
    try {
      h = new URL(h).hostname;
    } catch {
      return null;
    }
  }
  h = h.replace(/:\d+$/, '').replace(/^www\./, '');
  return h || null;
}

/** True als de host onze eigen ChatManta-app is (incl. www↔apex-variant). */
export function isOwnHost(host: string | null | undefined, appHost: string | null | undefined): boolean {
  const h = normalizeHost(host);
  const a = normalizeHost(appHost);
  return h !== null && a !== null && h === a;
}

/**
 * Server-kant: telt deze ping? Alleen met een host die níet onze eigen app is.
 * Geen host = de embed-URL is direct geopend (of de loader gaf niets mee) → niet tellen.
 */
export function shouldCountHeartbeat(host: string | null | undefined, appHost: string | null | undefined): boolean {
  if (normalizeHost(host) === null) return false;
  return !isOwnHost(host, appHost);
}

/**
 * Client-kant (in de iframe): de host om mee te sturen, of null als we niet echt
 * ingesloten zijn. `framed` = window.parent !== window. Host uit ?h= (de loader),
 * anders uit document.referrer (de ouderpagina). Eigen app-host → null.
 */
export function embeddedHost(opts: {
  framed: boolean;
  search: string;
  referrer: string;
  appHost: string;
}): string | null {
  if (!opts.framed) return null;
  const fromQuery = new URLSearchParams(opts.search).get('h');
  const candidate = normalizeHost(fromQuery) !== null ? fromQuery : opts.referrer;
  const n = normalizeHost(candidate);
  if (n === null || isOwnHost(n, opts.appHost)) return null;
  // Stuur de kale hostname (zelfde vorm als de loader via ?h= meegeeft).
  if (candidate && candidate.includes('://')) {
    try {
      return new URL(candidate).hostname;
    } catch {
      return null;
    }
  }
  return candidate ? candidate.trim() : null;
}
