export type UrlGroup = { key: string; label: string; urls: string[] };

/** Leesbaar pad-label voor één URL: host weglaten, "/" → "Hoofdpagina". */
export function pathLabel(url: string): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname).replace(/\/+$/, '');
    return path === '' ? 'Hoofdpagina' : path;
  } catch {
    return url;
  }
}

/**
 * Splitst voor weergave: alleen pad-segmenten met ≥2 pagina's worden een groep;
 * losse pagina's (eigen segment) komen samen in `loose`. Voorkomt dat een platte
 * site — waar elke pagina een eigen segment heeft — in tientallen 1-item-groepjes
 * uiteenvalt en de lijst onleesbaar maakt.
 */
export function groupPagesForDisplay(urls: string[]): { groups: UrlGroup[]; loose: string[] } {
  const all = groupByPath(urls);
  const groups = all.filter((g) => g.urls.length > 1);
  const loose = all.filter((g) => g.urls.length === 1).flatMap((g) => g.urls);
  return { groups, loose };
}

/** Groepeert URLs op eerste pad-segment; root-pagina's komen in "Hoofdpagina's". */
export function groupByPath(urls: string[]): UrlGroup[] {
  const map = new Map<string, string[]>();
  for (const u of urls) {
    let seg = '';
    try {
      const path = new URL(u).pathname.replace(/^\/+/, '');
      seg = path.split('/')[0] ?? '';
    } catch { seg = ''; }
    const key = seg === '' ? '_root' : seg;
    (map.get(key) ?? map.set(key, []).get(key)!).push(u);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a === '_root' ? -1 : b === '_root' ? 1 : a.localeCompare(b)))
    .map(([key, groupUrls]) => ({
      key,
      label: key === '_root' ? "Hoofdpagina's" : `/${key}`,
      urls: groupUrls,
    }));
}
