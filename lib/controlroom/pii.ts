// Control Room — read-only PII-heuristiek (MD §14.5/§24).
//
// PURE functie, geen DB/IO. Markeert tekst als "mogelijk PII" puur voor
// signalering in de admin-UI — er wordt NIETS gewijzigd, geanonimiseerd of
// opgeslagen op basis hiervan. Bewust conservatief: liever een paar false
// positives dan een gemist e-mailadres/telefoonnummer in een gesprek.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/;
const IBAN = /\bNL\d{2}[A-Z]{4}\d{10}\b/i;
const BSN = /\b\d{9}\b/; // 9 losse cijfers — kan ook een ordernummer zijn (heuristiek)
const PHONE = /(?:\+31|0)\s?6(?:[\s-]?\d){8}\b/; // NL mobiel
const PHONE_GENERIC = /\b0\d{1,3}[\s-]?\d{6,8}\b/; // NL vast/mobiel grof

export function detectPossiblePii(text: string | null | undefined): boolean {
  if (!text) return false;
  return (
    EMAIL.test(text) ||
    IBAN.test(text) ||
    BSN.test(text) ||
    PHONE.test(text) ||
    PHONE_GENERIC.test(text)
  );
}
