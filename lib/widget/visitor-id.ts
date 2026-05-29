// Cookie-onafhankelijke visitor-id voor de widget-client.
//
// Waarom niet de server-cookie (lib/v0/server/visitor.ts)? Op een externe site
// draait de widget in een third-party iframe. De `v0_widget_visitor`-cookie is
// `SameSite=Lax` en wordt daar door de browser geblokkeerd → de server zou elke
// beurt een nieuwe id genereren en gesprekken in losse 1-bericht-threads
// opsplitsen. Daarom houdt de client zélf een stabiele id bij (localStorage) en
// stuurt die expliciet mee als `x-chatmanta-visitor`-header.
//
// Degradatie: is localStorage geblokkeerd (bv. Safari ITP in een third-party
// iframe), dan valt hij terug op een module-scope id die binnen één page-load
// stabiel is — beurten binnen dezelfde sessie groeperen dan nog steeds.

const STORAGE_KEY = 'chatmanta:widget:visitor';

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// In-memory fallback wanneer localStorage niet beschikbaar is. Eén keer per
// page-load gezet zodat alle beurten in deze sessie dezelfde id sturen.
let memoryId: string | null = null;

function makeUuidV4(): string {
  // crypto.randomUUID is breed beschikbaar; val terug op een handmatige v4 voor
  // oudere browsers zodat de waarde nog steeds door UUID_V4_RE valideert.
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // genegeerd — val terug op de handmatige generator
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versie 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return (
    `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-` +
    `${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
  );
}

/**
 * Geef een stabiele, anonieme visitor-id terug — persistent over reloads via
 * localStorage, met in-memory fallback. Nooit throw; veilig vanaf de client.
 */
export function getOrCreateVisitorId(): string {
  try {
    if (typeof window !== 'undefined') {
      const existing = window.localStorage.getItem(STORAGE_KEY);
      if (existing && UUID_V4_RE.test(existing)) return existing;
      const fresh = makeUuidV4();
      window.localStorage.setItem(STORAGE_KEY, fresh);
      return fresh;
    }
  } catch {
    // localStorage geblokkeerd of vol — val terug op de module-scope id.
  }
  if (!memoryId) memoryId = makeUuidV4();
  return memoryId;
}
