// V0 widget visitor-cookie helpers.
//
// /api/v0/chat groepeert opvolgende widget-turns van dezelfde bezoeker in één
// v0_threads-rij. Voor die grouping hebben we een client-side identifier nodig
// die persistent is over requests heen — een anonieme cookie met een UUID v4.
//
// Geen PII. Geen koppeling aan persoon. Server-only (HttpOnly=true): browser-
// JS hoeft hem niet te lezen, hij gaat automatisch mee bij elke widget-fetch.

import 'server-only';

const COOKIE_NAME = 'v0_widget_visitor';
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 dagen

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Leest de v0_widget_visitor cookie uit een Request. Bij ontbrekend of
 * ongeldig (geen valide UUID v4) → null; de caller genereert dan een nieuwe.
 */
export function readVisitorId(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;
  // Naïeve cookie-parse: voldoende voor één bekende cookie-naam. Geen escape-
  // handling want UUID's bevatten geen vreemde chars.
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.split('=');
    if (!rawName) continue;
    if (rawName.trim() !== COOKIE_NAME) continue;
    const value = rest.join('=').trim();
    if (UUID_V4_RE.test(value)) return value;
    return null; // gemanipuleerd of legacy format → behandel als afwezig
  }
  return null;
}

/**
 * Genereer een nieuwe anonieme visitor-id. Gebruikt Web-Crypto's randomUUID
 * — beschikbaar in Node 18+ en de Vercel Edge runtime.
 */
export function newVisitorId(): string {
  return crypto.randomUUID();
}

/**
 * Bouw de Set-Cookie header-value voor de visitor-cookie. Secure-flag alleen
 * in productie zodat lokale dev (http://localhost) niet stuk gaat.
 */
export function serializeVisitorCookie(visitorId: string): string {
  const parts = [
    `${COOKIE_NAME}=${visitorId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}
