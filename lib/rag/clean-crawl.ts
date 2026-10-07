// v0.13 (launch-onderzoek): opschonen van gecrawlde website-markdown vóór
// chunking. Gemeten op een echte gecrawlde MKB-site (holdout): ~57% van de
// tekens was site-brede boilerplate, 15% data-URI-afbeeldingen, duizenden
// Cyrillische homoglyfen ("rijbеwijs") en verminkte prijzen ("€5 **9,-**").
// Dat verpest embeddings, vult de top-K met duplicaten en laat de hard-fact-
// verifier prijzen als "ongegrond" zien. Pure functies — tsx-testbaar.

// Cyrillisch/Grieks → Latijn, alleen toegepast binnen woorden die óók Latijnse
// letters bevatten (echte Cyrillische tekst blijft staan).
const HOMOGLYPHS: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'һ': 'h', 'ӏ': 'l', 'к': 'k', 'м': 'm', 'н': 'h', 'т': 't', 'в': 'b',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S',
  'ο': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'ν': 'v', 'ρ': 'p', 'τ': 't', 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Χ': 'X', 'Ζ': 'Z',
};
const HOMO_CLASS = new RegExp(`[${Object.keys(HOMOGLYPHS).join('')}]`);

export function foldHomoglyphs(text: string): string {
  return text.replace(/[\p{L}]+/gu, (word) => {
    if (!HOMO_CLASS.test(word) || !/[A-Za-z]/.test(word)) return word;
    return [...word].map((ch) => HOMOGLYPHS[ch] ?? ch).join('');
  });
}

const RESIDUE_LINE_RES: RegExp[] = [
  /^\s*This field is for validation purposes.*$/gim,
  /^\s*\[?Call Now Button\]?(\([^)]*\))?\s*$/gim,
  /^\s*\d(?:[.,]\d)?\/5\s*-\s*\(\d+\s*(?:votes|stemmen)\)\s*$/gim,
  /^\s*(?:\|\s*)+\|?\s*$/gm, // lege tabelrijen
  /^\s*\|(?:\s*-+\s*\|)+\s*$(?=\n\s*$)/gm, // los tabel-scheidingsteken zonder rijen
];

export function cleanCrawledMarkdown(md: string): string {
  let s = md;
  // (a) data-URI- en lege afbeeldingen
  s = s.replace(/!\[[^\]]*\]\(data:[^)]*\)/g, '');
  s = s.replace(/!\[\]\([^)]*\)/g, '');
  // (b) homoglyfen
  s = foldHomoglyphs(s);
  // (c) emphasis midden in een getal: "€5 **9,-**" → "€59,-", "**1265**" blijft vet maar heel
  s = s.replace(/(€\s?\d+)\s*\*\*(\d[\d.,]*-?)\*\*/g, '$1$2');
  s = s.replace(/(\d)\*\*(\d)/g, '$1$2');
  // (d) formulier-/widgetresidu
  for (const re of RESIDUE_LINE_RES) s = s.replace(re, '');
  // (e) witruimte
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

function normBlock(b: string): string {
  return b
    .toLowerCase()
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitBlocks(md: string): string[] {
  return md.split(/\n\s*\n/);
}

/**
 * Site-brede boilerplate-dedup over alle pagina's van één crawl. Een blok
 * (alinea/kop-sectie) dat op ≥ max(3, 25%) van de pagina's voorkomt, blijft
 * alleen staan op zijn "thuispagina": de pagina waarvan URL/titel het meest
 * overlapt met de bloktekst (pakketten → /tarieven, reviews → /reviews), en
 * anders de eerste pagina waarop het voorkomt. Korte blokken (< 40 tekens,
 * bv. kopjes) blijven altijd staan.
 */
export function dedupeSiteBoilerplate<T extends { url: string; title?: string | null; markdown: string }>(
  pages: T[],
): T[] {
  if (pages.length < 4) return pages;
  const threshold = Math.max(3, Math.ceil(pages.length * 0.25));
  const blocksPerPage = pages.map((p) => splitBlocks(p.markdown));
  const freq = new Map<string, number>();
  const firstPage = new Map<string, number>();
  blocksPerPage.forEach((blocks, pi) => {
    const seen = new Set<string>();
    for (const b of blocks) {
      const k = normBlock(b);
      if (k.length < 40 || seen.has(k)) continue;
      seen.add(k);
      freq.set(k, (freq.get(k) ?? 0) + 1);
      if (!firstPage.has(k)) firstPage.set(k, pi);
    }
  });
  const home = new Map<string, number>();
  for (const [k, n] of freq) {
    if (n < threshold) continue;
    const words = new Set(k.split(/[^a-z0-9à-ÿ]+/).filter((w) => w.length >= 4));
    let best = firstPage.get(k)!;
    let bestScore = 0;
    pages.forEach((p, pi) => {
      if (!blocksPerPage[pi].some((b) => normBlock(b) === k)) return;
      const slug = `${p.url} ${p.title ?? ''}`.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter((w) => w.length >= 4);
      const score = slug.filter((w) => words.has(w)).length;
      if (score > bestScore) { bestScore = score; best = pi; }
    });
    home.set(k, best);
  }
  return pages.map((p, pi) => {
    const kept = blocksPerPage[pi].filter((b) => {
      const k = normBlock(b);
      const h = home.get(k);
      return h === undefined || h === pi;
    });
    return { ...p, markdown: kept.join('\n\n').trim() };
  });
}

/** Opschonen + site-brede dedup over een hele crawl. Pagina's met een fout of
 *  zonder inhoud gaan ongewijzigd door (de status-logica van de caller blijft
 *  leidend); alleen pagina's met markdown worden opgeschoond en gededupliceerd. */
export function cleanCrawlPages<T extends { url: string; title?: string | null; markdown: string; error?: string | null }>(
  pages: T[],
): T[] {
  const idx: number[] = [];
  const cleaned: T[] = [];
  pages.forEach((p, i) => {
    if (!p.error && p.markdown && p.markdown.trim().length > 0) {
      idx.push(i);
      cleaned.push({ ...p, markdown: cleanCrawledMarkdown(p.markdown) });
    }
  });
  const deduped = dedupeSiteBoilerplate(cleaned);
  const out = [...pages];
  idx.forEach((pi, k) => {
    out[pi] = deduped[k];
  });
  return out;
}
