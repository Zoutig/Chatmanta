// Pure classificatie: wanneer is een V1-contactverzoek-notificatie "mislukt" en wat
// melden we daarvan aan Sentry? Los van v1-contact-request-notify.ts zodat het
// unit-testbaar is zonder Resend/Sentry.
//
// AVG: de uitkomst bevat ALLEEN een vaste code + een korte, vaste reden
// (bv. 'resend_403', 'timeout'). Nooit de ruwe Resend-foutdetail: die kan het
// ontvangers- of bezoekersadres bevatten ("invalid `to` field: …").

import type { SendEmailResult } from './email';

export type ContactNotifyFailure = {
  /** Vaste foutcode (Sentry-titel). */
  code: 'V1_CONTACT_NOTIFY_FAILED' | 'V1_CONTACT_NOTIFY_NO_ADDRESS' | 'V1_CONTACT_NOTIFY_SKIPPED';
  /** Korte, PII-vrije reden (Sentry-tag). */
  reason: string;
  level: 'error' | 'warning';
};

/** Alleen [a-z0-9_] en kort: een reden mag nooit vrije tekst doorlaten. */
function safeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'unknown';
}

/**
 * Classificeer de uitkomst van een notificatiepoging.
 *   - 'no_address'  → geen ontvanger gevonden (verzoek staat wel in het dashboard);
 *   - 'unexpected'  → onverwachte throw in de notify-laag;
 *   - SendEmailResult: ok → null; skipped → alleen in productie melden (lokaal/preview
 *     is "geen RESEND_API_KEY" normaal); fout → resend_<status> / timeout / send_error.
 */
export function classifyContactNotify(
  outcome: SendEmailResult | 'no_address' | 'unexpected',
  isProduction: boolean,
): ContactNotifyFailure | null {
  if (outcome === 'no_address') {
    return { code: 'V1_CONTACT_NOTIFY_NO_ADDRESS', reason: 'no_address', level: 'warning' };
  }
  if (outcome === 'unexpected') {
    return { code: 'V1_CONTACT_NOTIFY_FAILED', reason: 'unexpected', level: 'error' };
  }
  if (outcome.ok) return null;
  if (outcome.skipped) {
    return isProduction
      ? { code: 'V1_CONTACT_NOTIFY_SKIPPED', reason: `skipped_${safeToken(outcome.reason)}`, level: 'warning' }
      : null;
  }
  const status = /^resend (\d{3})\b/.exec(outcome.error)?.[1];
  if (status) return { code: 'V1_CONTACT_NOTIFY_FAILED', reason: `resend_${status}`, level: 'error' };
  if (/timeout|timed out|aborted/i.test(outcome.error)) {
    return { code: 'V1_CONTACT_NOTIFY_FAILED', reason: 'timeout', level: 'error' };
  }
  return { code: 'V1_CONTACT_NOTIFY_FAILED', reason: 'send_error', level: 'error' };
}
