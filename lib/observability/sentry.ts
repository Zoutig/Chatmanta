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
  // Backstop: gooi request-headers/cookies weg als de SDK ze ooit zelf vult — die
  // bevatten de Supabase auth-cookie + x-forwarded-for IP. captureServerError stuurt
  // ze al niet mee; dit dekt elk ander pad (AVG, defense-in-depth).
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
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
 *  No-op zonder DSN (Sentry.captureException doet niets als init geen DSN kreeg).
 *  Geef ALLEEN gesaneerde velden mee als ctx — nooit een ruwe request/headers. */
export function captureServerError(err: unknown, ctx?: Record<string, unknown>): void {
  Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
}

/** Flush pending events vóór een serverless-instance suspendt. @sentry/node flusht
 *  niet automatisch; zonder DSN is dit een no-op-safe await. */
export async function flushSentry(ms = 2000): Promise<void> {
  await Sentry.flush(ms);
}
