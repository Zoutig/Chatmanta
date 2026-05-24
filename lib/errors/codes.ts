// Canonieke lijst error-codes voor de hele ChatManta-app.
//
// Eén code = één gebruikersbeleving. De UI mapt code → vriendelijke tekst via
// lib/errors/user-messages.ts. Voeg pas een nieuwe code toe als hij echt een
// ander bericht of een andere actie rechtvaardigt — anders hergebruik.

export const APP_ERROR_CODES = [
  'RATE_LIMIT',          // 429 — te veel requests in venster
  'LLM_TIMEOUT',         // OpenAI stream gaf geen output binnen budget
  'LLM_UNAVAILABLE',     // OpenAI-fout (5xx, quota, network)
  'EMBED_FAILED',        // text-embedding-3-small fout (chat- en ingest-pad)
  'INPUT_INVALID',       // vraag leeg, te lang, body niet parsebaar, threshold buiten range
  'INJECTION_BLOCKED',   // prompt-injection-pattern gedetecteerd in 'block' mode
  'INGEST_TOO_LARGE',    // upload > 200 KB
  'INGEST_TYPE',         // verkeerde extensie
  'INGEST_READ_FAILED',  // file.text() of parser faalt
  'CRAWL_FAILED',        // website-crawl: ongeldige/geblokkeerde URL of Firecrawl-fout (reden in message)
  'AUTH_REQUIRED',       // V0-cookie ontbreekt/ongeldig, of wachtwoord fout
  'AUTH_FORBIDDEN',      // org-mismatch / role-check faalt (V1 hook)
  'NOT_FOUND',           // thread / doc / org bestaat niet
  'INTERNAL',            // alles wat we niet expliciet kennen
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export function isAppErrorCode(x: unknown): x is AppErrorCode {
  return typeof x === 'string' && (APP_ERROR_CODES as readonly string[]).includes(x);
}
