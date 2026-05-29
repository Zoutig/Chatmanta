// Pure PII-redactie voor fout-context. lib/controlroom/pii.ts DETECTEERT alleen
// (boolean) — er is geen redactor. Dit is de ontbrekende maskeer-functie, met
// dezelfde patronen als pii.ts maar /g-globaal zodat ALLE matches vervangen
// worden. De cross-check-test (redact.test.ts) bewaakt drift t.o.v. pii.ts.
//
// Dit is de enige redactie-pad, gebruikt aan beide trust-boundaries: server-side
// captureError (server-input) én het publieke /api/v0/client-error endpoint
// (client-input — nooit client-redactie vertrouwen). AVG (beslissing #4).

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g;
const IBAN = /\bNL\d{2}[A-Z]{4}\d{10}\b/gi;
const PHONE_MOBILE = /(?:\+31|0)\s?6(?:[\s-]?\d){8}\b/g; // NL mobiel
const PHONE_GENERIC = /\b0\d{1,3}[\s-]?\d{6,8}\b/g; // NL vast/mobiel grof
const BSN = /\b\d{9}\b/g; // 9 losse cijfers (heuristiek)

/** Maskeer e-mail/IBAN/telefoon/BSN. Volgorde: specifieke patronen vóór de
 *  9-cijfer-BSN, zodat telefoon/IBAN-cijfers niet als BSN worden gemaskeerd. */
export function redactPii(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(EMAIL, '[email]')
    .replace(IBAN, '[iban]')
    .replace(PHONE_MOBILE, '[telefoon]')
    .replace(PHONE_GENERIC, '[telefoon]')
    .replace(BSN, '[bsn]');
}
