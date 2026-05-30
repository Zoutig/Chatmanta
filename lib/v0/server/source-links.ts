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

// [label](url) of [label](url "titel") — label = niet-`]`, url = niet-spatie/
// niet-`)`, met optionele markdown-title die we negeren. Bekende beperking: een
// URL die zélf een `)` bevat (bv. `/wiki/Foo_(bar)`) wordt op de eerste `)`
// afgekapt. Crawled marketing-URLs zijn in de praktijk paren-vrij; het ergste
// geval is een cosmetische losse `)` of een gemiste match — nooit een security-
// issue (niet-http(s) wordt geweigerd, en de renderers weigeren niet-http(s)
// nogmaals). Lineaire quantifiers → geen catastrophic backtracking (ReDoS-vrij).
const MD_LINK_RE = /\[([^\]]+)\]\(\s*([^)\s]+?)(?:\s+"[^"]*")?\s*\)/g;

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
