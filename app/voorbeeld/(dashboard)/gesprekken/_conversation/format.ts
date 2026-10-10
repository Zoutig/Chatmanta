// Datum/tijd voor de gesprekken-schermen. Vaste tijdzone: de server rendert op
// Vercel in UTC, de klant leest Nederlandse tijd.

const TZ = 'Europe/Amsterdam';

/** "7 okt, 14:02" */
export function formatShort(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('nl-NL', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "7 oktober 2026 om 14:02" */
export function formatLong(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('nl-NL', {
    timeZone: TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Link naar het Q&A-venster in de Kennisbank met de vraag al ingevuld. */
export function qaHref(question: string): string {
  return `/voorbeeld/kennisbank?tab=qa&prefillQuestion=${encodeURIComponent(question)}`;
}
