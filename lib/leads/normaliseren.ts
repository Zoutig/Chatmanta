// Normalisatie van lead-sleutels. Domein en telefoon zijn de dubbelchecks
// (partiële unieke indexen in migr 0032), dus deze functies MOETEN stabiel zijn.

function parseUrl(input: string): URL | null {
  const s = input.trim();
  if (!s) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

/** "https://www.Jansen-Bouw.nl/x?y" → "jansen-bouw.nl". Null bij geen geldige host. */
export function normaliseerDomein(input: string | null | undefined): string | null {
  if (!input) return null;
  const url = parseUrl(input);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return host;
}

/** Website-link om te openen: zonder query (utm e.d.) en hash, host en pad blijven. */
export function schoneWebsiteUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const url = parseUrl(input);
  if (!url || !normaliseerDomein(url.hostname)) return null;
  return `${url.protocol}//${url.host}${url.pathname}`;
}

/** Naar E.164. NL: 10 cijfers met voorloop-0 → +31…; buitenlands met + blijft. */
export function normaliseerTelefoon(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  const plus = s.startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (!plus && digits.startsWith('00')) {
    digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? normaliseerTelefoon(`+${digits}`) : null;
  }
  if (plus) {
    if (digits.startsWith('31')) {
      const rest = digits.slice(2).replace(/^0/, '');
      return rest.length === 9 ? `+31${rest}` : null;
    }
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10 && digits.startsWith('0')) return `+31${digits.slice(1)}`;
  return null;
}

/** "+31612345678" → "06 12 34 56 78"; vaste lijn "+31261234567" → "026 123 4567". */
export function toonTelefoon(e164: string | null | undefined): string {
  if (!e164) return '';
  if (!e164.startsWith('+31') || e164.length !== 12) return e164;
  const nat = `0${e164.slice(3)}`;
  if (nat.startsWith('06')) return `06 ${nat.slice(2).replace(/(\d{2})(?=\d)/g, '$1 ')}`;
  return `${nat.slice(0, 3)} ${nat.slice(3, 6)} ${nat.slice(6)}`;
}

export function telLink(e164: string): string {
  return `tel:${e164}`;
}

const AFBEELDING = /\.(png|jpe?g|gif|svg|webp)$/i;

export function isGeldigEmail(input: string | null | undefined): boolean {
  if (!input) return false;
  const s = input.trim();
  if (AFBEELDING.test(s)) return false;
  return /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(s);
}
