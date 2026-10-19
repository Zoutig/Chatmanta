// Foutteksten voor /v1/login?error=… (audit 2026-10, laag-lijst).
// Alleen vaste teksten: nooit de ruwe ?error=-waarde tonen, anders kan iemand een
// eigen (phishing)tekst op ons echte domein laten verschijnen.

// De confirm-route (app/v1/auth/confirm) redirect bij een mislukte invite-link hierheen.
const ERROR_MESSAGES: Record<string, string> = {
  missing_token: 'De activatielink is ongeldig of incompleet. Vraag een nieuwe uitnodiging aan.',
  verify_failed: 'De activatielink is verlopen of al gebruikt. Vraag een nieuwe uitnodiging aan.',
};

export const GENERIC_LOGIN_ERROR =
  'Inloggen via de link is niet gelukt. Probeer het opnieuw of vraag een nieuwe uitnodiging aan.';

/** Bekende code → vaste tekst; onbekende code → generieke vaste tekst; geen code → undefined. */
export function loginErrorMessage(code: unknown): string | undefined {
  if (code === undefined || code === null || code === '') return undefined;
  if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code)) {
    return ERROR_MESSAGES[code];
  }
  return GENERIC_LOGIN_ERROR;
}
