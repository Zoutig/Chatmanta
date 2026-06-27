// lib/v0/crawler/normalizeHost.ts
// Eén bron van waarheid voor het domein waarop website-bronnen gededupliceerd
// worden. Lowercase host zonder leidende 'www.'. Ongeldige URL → null.
// Spiegelt de SQL-backfill in migratie 0037 (scheme + www. strippen).
export function normalizeHost(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.hostname.toLowerCase().replace(/^www\./, '');
}
