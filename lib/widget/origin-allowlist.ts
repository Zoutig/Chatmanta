// Pure helpers voor de widget origin-allowlist. Gedeeld door de embed-pagina
// (server — dwingt af bij token-uitgifte) en het klantendashboard-formulier
// (client — normaliseert invoer). Bewust GÉÉN 'server-only' zodat beide kanten
// dezelfde normalisatie gebruiken en de lijst dus consistent matcht.
//
// Waarom hier en niet per chat-request: een fetch vanuit het embed-iframe heeft
// als Origin de ChatManta-host, niet het klantdomein. Het klantdomein is alleen
// betrouwbaar zichtbaar via de Referer van de iframe-navigatie (= de
// ouderpagina) bij het laden van /embed. Daar dwingen we de allowlist af.

/**
 * Normaliseer een host/URL/domein naar een bare hostname: lowercase, zonder
 * schema, pad, poort, query of fragment, met gestripte leading `www.`.
 * Voorbeeld: "https://www.Example.com:443/pad?x=1" → "example.com".
 * Lege/onbruikbare invoer → null.
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // schema eraf
  s = s.split(/[/?#]/)[0]; // pad/query/fragment eraf
  s = s.split(':')[0]; // poort eraf
  s = s.replace(/^www\./, ''); // lenient: example.com matcht www.example.com
  return s || null;
}

/**
 * Parse vrije tekstinvoer (één host per regel of komma-gescheiden) naar een
 * genormaliseerde, ontdubbelde lijst. Voor het dashboard-formulier.
 */
export function parseAllowedOrigins(input: string): string[] {
  const out = new Set<string>();
  for (const part of input.split(/[\n,]+/)) {
    const h = normalizeHost(part);
    if (h) out.add(h);
  }
  return [...out];
}

/**
 * Embed-toegang voor een ouderpagina-host gegeven de allowlist.
 *   - lege/ongezette lijst → 'open' (fail-open, backwards-compat)
 *   - host onbekend (geen Referer én geen ?h=) → 'open' (bekend V0-restrisico:
 *     een strikte referrer-policy mag een legitieme bezoeker niet blokkeren)
 *   - anders → 'allow' / 'block' op exact-match na normalisatie
 */
export function evaluateEmbedAccess(
  allowed: string[] | undefined,
  parentHostRaw: string | null,
): 'open' | 'allow' | 'block' {
  if (!allowed || allowed.length === 0) return 'open';
  const parent = normalizeHost(parentHostRaw);
  if (!parent) return 'open';
  const set = new Set(
    allowed.map((a) => normalizeHost(a)).filter((h): h is string => Boolean(h)),
  );
  return set.has(parent) ? 'allow' : 'block';
}
