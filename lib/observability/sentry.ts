import 'server-only';

// Server-side Sentry-wiring (M-E §1). @sentry/node (NIET @sentry/nextjs) → geen
// withSentryConfig/next.config-wrapping, geen client-bundle. Browser-SDK +
// source-map-upload = follow-up.
//
// Geen SENTRY_DSN → init is een no-op: Sentry stuurt niets (veilig zonder DSN).
// beforeSend scrubt PII met dezelfde redactor als de DB error-sink (AVG).

import * as Sentry from '@sentry/node';
import { redactPii } from '@/lib/observability/redact';

let _inited = false;

/** Scrub PII uit message + elke exception-value vóór verzending (AVG). */
function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.message) event.message = redactPii(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = redactPii(ex.value);
  }
  return event;
}

/** Init Sentry één keer per runtime. No-op zonder SENTRY_DSN. */
export function initSentry(): void {
  if (_inited) return;
  _inited = true;
  if (!process.env.SENTRY_DSN) return; // no-op → veilig zonder DSN
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0,
    environment: process.env.VERCEL_ENV ?? 'development',
    beforeSend,
  });
}

/** Dunne capture-helper voor onRequestError + ad-hoc server-fouten.
 *  No-op zonder DSN (Sentry.captureException doet niets als init geen DSN kreeg). */
export function captureServerError(err: unknown, ctx?: Record<string, unknown>): void {
  Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
}
