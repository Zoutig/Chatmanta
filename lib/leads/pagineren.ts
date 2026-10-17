/** Paginagrootte voor volledige leesrondes. PostgREST kapt een antwoord af op max_rows (vaak 1000). */
export const LEES_PAGINA = 1000;

/**
 * Leest alle rijen in blokken van LEES_PAGINA via `haal(van, tot)` (inclusief, zoals `.range()`),
 * tot een blok kleiner dan LEES_PAGINA terugkomt. `haal` gooit zelf bij een fout.
 * Geef de query een stabiele `.order()` mee, anders kunnen rijen tussen blokken verschuiven.
 */
export async function leesAllePaginas<T>(haal: (van: number, tot: number) => Promise<T[]>): Promise<T[]> {
  const alles: T[] = [];
  for (let van = 0; ; van += LEES_PAGINA) {
    const blok = await haal(van, van + LEES_PAGINA - 1);
    alles.push(...blok);
    if (blok.length < LEES_PAGINA) return alles;
  }
}

/** Eén waarde uit een queryparameter: bij ?q=a&q=b de eerste, nooit een array. */
export function eerste(v: string | string[] | undefined): string | undefined {
  const w = Array.isArray(v) ? v[0] : v;
  return typeof w === 'string' ? w : undefined;
}

/** Een gevraagde pagina begrensd op 1..aantal pagina's (minstens 1 pagina, ook als er niets is). */
export function begrensPagina(gevraagd: number, totaal: number, grootte: number): number {
  const paginas = Math.max(1, Math.ceil(totaal / grootte));
  if (!Number.isFinite(gevraagd)) return 1;
  return Math.min(paginas, Math.max(1, Math.floor(gevraagd)));
}

/** Alle queryparameters als losse strings (eerste waarde per sleutel). */
export function enkel(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, eerste(v)]));
}
