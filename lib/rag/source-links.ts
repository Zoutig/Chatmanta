// Bron-links — anti-hallucinatie-laag voor markdown-links in bot-antwoorden.
//
// De answer-LLM krijgt (bij bot.sourceLinksEnabled) de echte website-URLs mee en
// de instructie alleen daarnaar te linken. Modellen gehoorzamen dat niet 100%:
// ze verzinnen soms een plausibel pad (bv. /diensten/corporate → 404). Deze
// module is de MECHANISCHE garantie: elke markdown-link `[label](url)` waarvan de
// URL niet in de aangeleverde set zit — of geen http(s) is — wordt teruggestreken
// naar platte tekst (`label` blijft, de link verdwijnt). Zo bereikt nooit een
// verzonnen of onveilige URL de gebruiker, ongeacht wat het model produceerde.
//
// Pure string-functies, geen IO — triviaal te unit-testen en herbruikbaar in
// zowel het streaming- als het eval-pad van rag.ts.

/**
 * Normaliseer een URL voor vergelijking. Gelijke pagina's die het model net even
 * anders typt (trailing slash, hoofdletter-host, lege fragment) moeten matchen.
 * Behoudt query-string (kan betekenisvol zijn). Niet-parsebare of niet-http(s)
 * input → null (telt als "niet toegestaan").
 */
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  // Pathname zonder enkele trailing slash (behalve root "/").
  let path = u.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  // Host lowercased (URL doet dit al), fragment weg, query behouden.
  return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
}

/**
 * Bouw de set genormaliseerde, toegestane URLs uit de bron-URLs die aan het
 * model gegeven zijn. Lege/ongeldige urls vallen weg.
 */
export function buildAllowedUrlSet(urls: Array<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const u of urls) {
    if (!u) continue;
    const n = normalizeUrl(u);
    if (n) set.add(n);
  }
  return set;
}

// [label](url) of [label](url "titel") / [label](url 'titel') — label = niet-`]`,
// url = niet-spatie/niet-`)`, met optionele markdown-title (double- óf single-
// quoted) die we negeren. Bekende beperking: een URL die zélf een `)` bevat
// (bv. `/wiki/Foo_(bar)`) wordt op de eerste `)` afgekapt. Crawled marketing-URLs
// zijn in de praktijk paren-vrij; het ergste geval is een cosmetische losse `)`
// of een gemiste match — nooit een security-issue (niet-http(s) wordt geweigerd,
// en de renderers weigeren niet-http(s) nogmaals). Lineaire quantifiers → geen
// catastrophic backtracking (ReDoS-vrij).
const MD_LINK_RE = /\[([^\]]+)\]\(\s*([^)\s]+?)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

/**
 * Strijk elke markdown-link waarvan de (genormaliseerde) URL niet in `allowedUrls`
 * zit terug naar zijn label-tekst. Toegestane http(s)-links worden hergeschreven
 * naar de canonieke `[label](url)`-vorm (een eventuele markdown-title valt weg),
 * zodat de lichte renderers ze betrouwbaar als link herkennen. Geen links of lege
 * allowlist → de links verdwijnen (kale label-tekst), de gewenste anti-
 * hallucinatie-uitkomst wanneer de feature actief is.
 */
export function sanitizeSourceLinks(text: string, allowedUrls: Set<string>): string {
  if (!text.includes('](')) return text; // snelle uitweg — geen link-syntax
  return text.replace(MD_LINK_RE, (_full, label: string, url: string) => {
    const n = normalizeUrl(url);
    if (n && allowedUrls.has(n)) return `[${label}](${url})`;
    return label;
  });
}

/**
 * Reduceer elke markdown-link `[label](url)` tot zijn kale `label`. Bedoeld om de
 * bron-link-URLs uit een antwoord te halen vóór hard-fact-/claim-verificatie:
 * die URLs komen uit `website_pages.url` (metadata, NIET uit chunk-content), dus
 * de hard-fact-verifier zou ze anders als "ongegronde URL-feiten" markeren en het
 * hele antwoord ten onrechte naar het weiger-template trekken. De links zijn al
 * door `sanitizeSourceLinks` gegarandeerd echt; ze hoeven niet als feit
 * geverifieerd te worden. Proza-feiten (prijzen/datums/getallen) blijven in de
 * label-tekst behouden en worden dus nog steeds geverifieerd.
 */
export function stripMarkdownLinks(text: string): string {
  if (!text.includes('](')) return text;
  return text.replace(MD_LINK_RE, (_full, label: string) => label);
}

// ---------------------------------------------------------------------------
// Linkknoppen-modus (sourceLinksMode 'on-request', V1 per klant, 2026-10-14).
//
// Strenger én robuuster dan de V0-bronlinks hierboven:
//   - de allowlist bevat naast de Bron-URL's ook de links die ÓP die pagina's
//     staan (bv. de PDF-handleidingen), maar alleen op hetzelfde domein en nooit
//     een (pad- of query-)redirect naar elders;
//   - URL-vergelijking op het gedecodeerde pad, zodat `%28C2%29` en `(C2)` of
//     `%20` en een spatie als dezelfde URL tellen;
//   - de uitgaande link is altijd de canonieke URL uit de allowlist (niet de
//     spelling van het model), zonder spaties/haakjes;
//   - kale URL's worden óók afgehandeld: toegestaan → klikbare link, anders weg
//     (de klacht achter regel 9 was juist een kale URL onder elk antwoord);
//   - een slotcontrole met exact de link-regex van de widget-renderer: wat de
//     renderer als link zou zien en niet in de allowlist staat, wordt platte tekst.
// V0 raakt dit niet: alleen run-rag-query in 'on-request'-modus roept het aan.
// ---------------------------------------------------------------------------

function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/** Volledig decoderen (begrensd), voor redirect-detectie in pad en query. */
function deepDecode(s: string): string {
  let cur = s;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(cur);
    } catch {
      break;
    }
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

/** Vergelijkingssleutel: protocol + host + gedecodeerd pad + query. null = geen http(s)-URL. */
export function linkMatchKey(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  let path = safeDecode(u.pathname);
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return `${u.protocol}//${u.host.toLowerCase()}${path}${safeDecode(u.search)}`;
}

/** Canonieke, renderer-veilige vorm: volledig gecodeerd, haakjes als %28/%29, geen fragment. */
export function canonicalLinkUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  u.hash = '';
  return u.href.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20');
}

/** Allowlist: vergelijkingssleutel → canonieke URL (die we uitsturen). */
export type LinkAllowlist = Map<string, string>;

export function buildLinkAllowlist(urls: Array<string | null | undefined>): LinkAllowlist {
  const map: LinkAllowlist = new Map();
  for (const u of urls) {
    if (!u) continue;
    const k = linkMatchKey(u);
    const c = canonicalLinkUrl(u);
    if (k && c && !map.has(k)) map.set(k, c);
  }
  return map;
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/** Bevat het pad of de query een doorverwijzing naar een andere URL? */
function looksLikeRedirect(u: URL): boolean {
  const path = deepDecode(u.pathname).slice(1); // het eerste '/' is altijd legitiem
  const query = deepDecode(u.search);
  return /https?:|\/\//i.test(path) || /https?:|\/\//i.test(query);
}

// Links in gecrawlde markdown: Firecrawl codeert spaties/haakjes (%20/%28), dus
// een URL zonder witruimte of `)` volstaat. Eén niveau haakjes tolereren we wel.
const CONTENT_LINK_RE = /\]\(\s*(https?:\/\/(?:[^\s()]|\([^\s()]*\))+)/g;

/**
 * URL's van markdown-links in `text` die op hetzelfde domein staan als
 * `sourceUrl` (www. genegeerd). Links naar andere domeinen en redirects via de
 * eigen site tellen nooit mee: de bot mag alleen naar de site van de klant zelf.
 */
export function extractSameHostLinks(text: string, sourceUrl: string): string[] {
  let host: string;
  try {
    host = bareHost(new URL(sourceUrl).host);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const m of text.matchAll(CONTENT_LINK_RE)) {
    const url = m[1];
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      if (u.username || u.password) continue;
      if (bareHost(u.host) !== host) continue;
      if (looksLikeRedirect(u)) continue;
      out.push(url);
    } catch {
      // ongeldige URL → overslaan
    }
  }
  return out;
}

const TITLE_SUFFIX_RE = /\s+(?:"[^"]*"|'[^']*')\s*$/;
const SCHEME_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
// Kale URL: één niveau gebalanceerde haakjes toegestaan, verder stopt hij bij
// witruimte, haakjes, blokhaken en aanhalingstekens.
const BARE_URL_RE = /https?:\/\/[^\s<>"'()[\]]+(?:\([^\s<>"'()[\]]*\)[^\s<>"'()[\]]*)*/g;
// Exact de link-regex van lib/widget/render-markdown-lite.tsx (INLINE_RE / LONE_LINK_RE).
const RENDERER_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
// Placeholders: ASCII-controletekens, komen in modeluitvoer niet voor.
const PH_OPEN = '\u0002';
const PH_CLOSE = '\u0003';
const REMOVED = '\u0001';
const PH_RE = /\u0002(\d+)\u0003/g;

/**
 * Eén ronde markdown-links: de URL loopt tot de haakjes weer in balans zijn, zodat
 * ongecodeerde haakjes ("…(C2)_Manual.pdf") en spaties overleven. Alleen een
 * `(…)` die met een scheme begint telt als link; "[optioneel](zie onder)" blijft
 * gewone tekst. Begrensd tot één regel; lineair.
 */
function rewriteMarkdownLinks(text: string, fn: (label: string, url: string) => string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const j = text.indexOf('](', i);
    if (j < 0) break;
    const lb = text.lastIndexOf('[', j);
    const nl = text.lastIndexOf('\n', j);
    let k = j + 2;
    let depth = 1;
    while (k < text.length && text[k] !== '\n') {
      if (text[k] === '(') depth++;
      else if (text[k] === ')' && --depth === 0) break;
      k++;
    }
    const inner = depth === 0 ? text.slice(j + 2, k).replace(TITLE_SUFFIX_RE, '').trim() : '';
    if (lb < i || lb < nl || lb + 1 === j || depth !== 0 || !SCHEME_RE.test(inner)) {
      out += text.slice(i, j + 2);
      i = j + 2;
      continue;
    }
    out += text.slice(i, lb) + fn(text.slice(lb + 1, j), inner);
    i = k + 1;
  }
  return out + text.slice(i);
}

function bareUrlLabel(canon: string): string {
  const u = new URL(canon);
  const last = u.pathname.split('/').filter(Boolean).pop();
  if (last) {
    const decoded = safeDecode(last);
    if (decoded.trim()) return decoded;
  }
  return u.host.replace(/^www\./, '');
}

/**
 * Linkknoppen-sanitizer.
 *   1. Markdown-links (herhaald tot stabiel, tegen geneste constructies):
 *      toegestaan → placeholder voor `[label](canonieke-allowlist-URL)`, anders label.
 *   2. Kale URL's: toegestaan → placeholder-link met de bestandsnaam als label,
 *      anders verwijderd (alleen rond de verwijderplek wordt witruimte opgeschoond).
 *      (Daarvóór: renderer-links die stap 1 niet als link zag → label.)
 *   3. Placeholders terugzetten.
 *   4. Slotcontrole met de renderer-regex: elke resterende "link" buiten de
 *      allowlist → label. Lege allowlist → geen enkele link of URL overleeft.
 */
export function sanitizeLinksOnRequest(text: string, allowed: LinkAllowlist): string {
  if (!/https?:|\]\(/i.test(text)) return text;
  const links: string[] = [];
  const keep = (label: string, canon: string) => {
    links.push(`[${label}](${canon})`);
    return `${PH_OPEN}${links.length - 1}${PH_CLOSE}`;
  };
  const lookup = (url: string): string | undefined => {
    const key = linkMatchKey(url);
    return key ? allowed.get(key) : undefined;
  };

  // 1.
  let cur = text;
  for (let round = 0; round < 5; round++) {
    const next = rewriteMarkdownLinks(cur, (label, url) => {
      const canon = lookup(url);
      return canon ? keep(label, canon) : label;
    });
    if (next === cur) break;
    cur = next;
  }

  // 1b. Wat de renderer nog als link zou lezen (bv. ongebalanceerde haakjes) en
  //     niet is toegestaan → label, vóór de kale-URL-stap er half in knipt.
  cur = rendererLinkPass(cur, lookup);

  // 2.
  let removed = false;
  cur = cur.replace(BARE_URL_RE, (match) => {
    const trail = match.match(/[.,;:!?]+$/)?.[0] ?? '';
    const url = trail ? match.slice(0, -trail.length) : match;
    const canon = lookup(url);
    if (canon) return keep(bareUrlLabel(canon), canon) + trail;
    removed = true;
    return REMOVED + trail;
  });
  if (removed) {
    cur = cur
      .replace(/(^|\n)[ \t]*\u0001+[ \t]*/g, '$1')
      .replace(/[ \t]*\u0001+(?=[.,;:!?\n]|$)/g, '')
      .replace(/[ \t]*\u0001+[ \t]*/g, ' ');
  }

  // 3.
  cur = cur.replace(PH_RE, (_m, n: string) => links[Number(n)] ?? '');

  // 4.
  return rendererLinkPass(cur, lookup);
}

/** Elke renderer-link met een scheme die niet exact een allowlist-URL is → label. */
function rendererLinkPass(text: string, lookup: (url: string) => string | undefined): string {
  let cur = text;
  for (let round = 0; round < 5; round++) {
    const next = cur.replace(RENDERER_LINK_RE, (full, label: string, url: string) => {
      if (!SCHEME_RE.test(url)) return full; // "[0](1)": geen link, renderer maakt er ook geen van
      return lookup(url) === url ? full : label;
    });
    if (next === cur) break;
    cur = next;
  }
  return cur;
}
