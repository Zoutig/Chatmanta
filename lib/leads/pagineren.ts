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
