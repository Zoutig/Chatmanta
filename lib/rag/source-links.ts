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
//     staan (bv. de PDF-handleidingen), maar alleen op hetzelfde domein;
//   - URL-vergelijking op het gedecodeerde pad, zodat `%28C2%29` en `(C2)` of
//     `%20` en een spatie als dezelfde URL tellen;
//   - de uitgaande link is altijd canoniek gecodeerd (geen spaties/haakjes), zodat
//     de lichte renderers en MD_LINK_RE hem betrouwbaar herkennen;
//   - kale URL's in het antwoord worden óók afgehandeld: toegestaan → klikbare
//     link, niet toegestaan → weg (de oorspronkelijke klacht achter regel 9 was
//     juist een kale URL onder elk antwoord).
// V0 raakt dit niet: alleen run-rag-query in 'on-request'-modus roept het aan.
// ---------------------------------------------------------------------------

function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/** Vergelijkingssleutel: normalizeUrl + gedecodeerd pad. null = geen geldige http(s)-URL. */
export function linkMatchKey(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  let path = safeDecode(u.pathname);
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return `${u.protocol}//${u.host.toLowerCase()}${path}${safeDecode(u.search)}`;
}

/** Canonieke, renderer-veilige vorm: volledig gecodeerd, haakjes als %28/%29. */
export function canonicalLinkUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  return u.href.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20');
}

export function buildLinkAllowlist(urls: Array<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const u of urls) {
    if (!u) continue;
    const k = linkMatchKey(u);
    if (k) set.add(k);
  }
  return set;
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

// Links in gecrawlde markdown: Firecrawl codeert spaties/haakjes (%20/%28), dus
// een URL zonder witruimte of `)` volstaat. Eén niveau haakjes tolereren we wel.
const CONTENT_LINK_RE = /\]\(\s*(https?:\/\/(?:[^\s()]|\([^\s()]*\))+)/g;

/**
 * URL's van markdown-links in `text` die op hetzelfde domein staan als
 * `sourceUrl` (www. genegeerd). Links naar andere domeinen tellen nooit mee:
 * de bot mag alleen naar de eigen site van de klant verwijzen.
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
      if (bareHost(u.host) !== host) continue;
      // Geen open redirect via de eigen site (…/redirect?url=https://elders).
      let query = u.search;
      try {
        query = decodeURIComponent(query);
      } catch {
        // half-gecodeerde query → ongecodeerd toetsen
      }
      if (/https?:|\/\//i.test(query)) continue;
      out.push(url);
    } catch {
      // ongeldige URL → overslaan
    }
  }
  return out;
}

/**
 * Loop alle markdown-links `[label](url)` in `text` af en vervang ze door
 * `fn(label, url)`. Bewust een scanner i.p.v. een regex: de URL loopt tot de
 * haakjes weer in balans zijn, zodat ongecodeerde haakjes ("…(C2)_Manual.pdf")
 * en zelfs spaties overleven. Begrensd tot één regel; lineair.
 */
function rewriteMarkdownLinks(text: string, fn: (label: string, url: string) => string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const j = text.indexOf('](', i);
    if (j < 0) break;
    const lb = text.lastIndexOf('[', j);
    const nl = text.lastIndexOf('\n', j);
    if (lb < i || lb < nl || lb + 1 === j || text.slice(lb + 1, j).includes(']')) {
      out += text.slice(i, j + 2);
      i = j + 2;
      continue;
    }
    let k = j + 2;
    let depth = 1;
    while (k < text.length && text[k] !== '\n') {
      if (text[k] === '(') depth++;
      else if (text[k] === ')' && --depth === 0) break;
      k++;
    }
    if (depth !== 0) {
      out += text.slice(i, j + 2);
      i = j + 2;
      continue;
    }
    out += text.slice(i, lb) + fn(text.slice(lb + 1, j), text.slice(j + 2, k));
    i = k + 1;
  }
  return out + text.slice(i);
}

const TITLE_SUFFIX_RE = /\s+(?:"[^"]*"|'[^']*')\s*$/;
// Canonieke link (na stap 1): geen spaties of haakjes in de URL.
const CANON_LINK_RE = /\[[^\]\n]+\]\([^)\s]+\)/g;
const BARE_URL_RE = /https?:\/\/[^\s<>"'\]]+/g;

function bareUrlLabel(u: URL): string {
  const last = u.pathname.split('/').filter(Boolean).pop();
  if (last) {
    const decoded = safeDecode(last);
    if (decoded.trim()) return decoded;
  }
  return u.host.replace(/^www\./, '');
}

function sanitizeBareUrls(segment: string, allowed: Set<string>, onRemove: () => void): string {
  return segment.replace(BARE_URL_RE, (match) => {
    // Afsluitende leestekens/haakjes horen bij de zin, niet bij de URL.
    const trail = match.match(/[.,;:!?)]+$/)?.[0] ?? '';
    const url = trail ? match.slice(0, -trail.length) : match;
    const key = linkMatchKey(url);
    const canon = canonicalLinkUrl(url);
    if (key && canon && allowed.has(key)) {
      return `[${bareUrlLabel(new URL(canon))}](${canon})${trail}`;
    }
    onRemove();
    return trail;
  });
}

/**
 * Linkknoppen-sanitizer. (1) Elke markdown-link: toegestaan → canonieke
 * `[label](url)`, anders alleen het label. (2) Kale URL's buiten links:
 * toegestaan → markdown-link met de bestandsnaam als label, anders verwijderd.
 * Lege allowlist → geen enkele link of URL overleeft.
 */
export function sanitizeLinksOnRequest(text: string, allowed: Set<string>): string {
  if (!text.includes('http') && !text.includes('](')) return text;
  const step1 = rewriteMarkdownLinks(text, (label, inner) => {
    const url = inner.replace(TITLE_SUFFIX_RE, '').trim();
    const key = linkMatchKey(url);
    const canon = canonicalLinkUrl(url);
    if (key && canon && allowed.has(key)) return `[${label}](${canon})`;
    return label;
  });
  // Stap 2 alleen op de tekst tússen de (nu canonieke) links.
  let removed = false;
  const onRemove = () => {
    removed = true;
  };
  let out = '';
  let last = 0;
  for (const m of step1.matchAll(CANON_LINK_RE)) {
    out += sanitizeBareUrls(step1.slice(last, m.index), allowed, onRemove) + m[0];
    last = (m.index ?? 0) + m[0].length;
  }
  out += sanitizeBareUrls(step1.slice(last), allowed, onRemove);
  if (!removed) return out;
  // Een weggehaalde URL kan dubbele spaties of een spatie vóór een leesteken achterlaten.
  return out
    .replace(/(\S)[ \t]{2,}/g, '$1 ')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]+$/gm, '');
}
