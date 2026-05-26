export type UrlGroup = { key: string; label: string; urls: string[] };

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
