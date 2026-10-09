// Pure helpers voor het Widget-scherm. Geen React, unit-testbaar.

const TZ = 'Europe/Amsterdam';

/**
 * Laatst gezien als "3 jul, 14:03". Vaste tijdzone: de server rendert op Vercel
 * in UTC, de browser in Amsterdam; zonder vaste zone verschilt de tekst tussen
 * server en client (hydration-fout #418).
 */
export function formatLastSeen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('nl-NL', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Velden van `next` die afwijken van `base` (voor een patch met alleen wijzigingen). */
export function changedFields<T extends Record<string, unknown>>(base: T, next: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (next[key] !== base[key]) out[key] = next[key];
  }
  return out;
}

/** `#abc` → `#aabbcc`; geldig `#rrggbb` → lowercase; anders null. */
export function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#?/, '#');
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const [, r, g, b] = v;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}
