/**
 * Klassen samenvoegen voor de site-ontwerplaag. Bewust GEEN `cn()` uit lib/utils:
 * tailwind-merge kent onze eigen klassen (btn-sm, sec-dark, …) niet en hoort niet
 * te raden welke "conflicteren".
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
