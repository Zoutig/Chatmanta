// V1 crawler — welke pagina's heeft de KLANT zelf uitgezet?
//
// ingestCrawlResults doet per URL delete-then-insert. Zonder snapshot zou een re-crawl
// een door de klant uitgezette pagina (included=false) stil terugzetten naar de
// DB-default true. Maar niet elke included=false-rij is een klantkeuze: een mislukte of
// lege pagina (status 'failed'/'excluded', insertNonCrawledPage) krijgt óók
// included=false. Die meetellen betekende dat een geslaagde retry van een eerder
// mislukte pagina als 'uitgezet' werd ingeladen (chunks in de DB, maar de match-RPC
// filtert ze weg). Alleen rijen die wél geslaagd waren en uit staan, zijn een keuze.
//
// PUUR (getest).

export type SnapshotRow = {
  metadata: unknown;
  status: string | null;
  included: boolean | null;
};

const NOT_A_CHOICE = new Set(['failed', 'excluded']);

export function customerDisabledUrls(rows: SnapshotRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.included !== false) continue;
    if (r.status && NOT_A_CHOICE.has(r.status)) continue;
    const url = ((r.metadata ?? {}) as Record<string, unknown>).source_url;
    if (typeof url === 'string' && url.length > 0) out.add(url);
  }
  return out;
}
