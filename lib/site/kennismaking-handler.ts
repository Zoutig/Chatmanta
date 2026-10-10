// Kern van POST /api/site/kennismaking, los van Next/Resend/Upstash via dependency
// injection → puur unit-testbaar (geen echte mails, geen Redis). De route
// (app/api/site/kennismaking/route.ts) levert de echte deps.
//
// Flow: origin-check → per-IP rate-limit → body (grootte + JSON) → honeypot
// (stil 200) → validatie → config-check (RESEND_FROM) → notificatie naar
// info@ (moet slagen) → bevestiging aan aanvrager (best-effort).
//
// GEEN database-opslag (spec §7): de notificatiemail ís de lead. Faalt die, dan
// krijgt de bezoeker een nette fout met info@chatmanta.com als alternatief.
// Geen PII in logs: alleen vaste codes + de (al PII-vrije) Resend-foutstatus,
// en ook die gaat door de redactor van de caller.

import {
  MAX_BODY_BYTES,
  buildLeadConfirmationEmail,
  buildLeadNotificationEmail,
  isHoneypotFilled,
  validateKennismaking,
  type KennismakingResponse,
} from './kennismaking';

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

export type KennismakingDeps = {
  /** Per-key limiter; key = gehasht IP. */
  limiter: { check(key: string): Promise<{ allowed: boolean; retryAfterSec: number }> };
  send: (msg: { to: string; subject: string; html: string; text: string; replyTo?: string }) => Promise<SendResult>;
  /** Fout melden (Sentry/log). Krijgt ALLEEN een vaste code + PII-vrije detail. */
  reportError: (code: string, detail?: string) => void;
  /** Ontvanger van de notificatie (SITE_LEADS_TO, default info@chatmanta.com). */
  leadsTo: string;
  /** RESEND_FROM gezet? Zonder geldige afzender stuurt Resend stil een 403. */
  fromConfigured: boolean;
  /** Absolute URL van de live demo (voor de bevestigingsmail). */
  demoUrl: string;
};

export type KennismakingRequest = {
  /** Rate-limit-sleutel (gehasht IP). */
  ipKey: string;
  host: string | null;
  /** Origin- of Referer-header. */
  origin: string | null;
  /** Ruwe body-tekst. */
  bodyText: string;
};

export type HandlerResult = {
  status: number;
  body: KennismakingResponse;
  headers?: Record<string, string>;
};

/** Origin/Referer-host moet exact gelijk zijn aan de app-host (geen relay vanaf andere sites). */
export function isSameOrigin(host: string | null, origin: string | null): boolean {
  if (!host || !origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function handleKennismaking(req: KennismakingRequest, deps: KennismakingDeps): Promise<HandlerResult> {
  if (!isSameOrigin(req.host, req.origin)) {
    return { status: 403, body: { ok: false, error: 'forbidden' } };
  }

  const rl = await deps.limiter.check(req.ipKey);
  if (!rl.allowed) {
    return {
      status: 429,
      body: { ok: false, error: 'rate_limit', retryAfterSec: rl.retryAfterSec },
      headers: { 'Retry-After': String(rl.retryAfterSec) },
    };
  }

  if (new TextEncoder().encode(req.bodyText).length > MAX_BODY_BYTES) {
    return { status: 413, body: { ok: false, error: 'bad_request' } };
  }
  let body: unknown;
  try {
    body = JSON.parse(req.bodyText);
  } catch {
    return { status: 400, body: { ok: false, error: 'bad_request' } };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, body: { ok: false, error: 'bad_request' } };
  }

  // Honeypot: bot → stil "gelukt", geen mail, geen hint.
  if (isHoneypotFilled(body as Record<string, unknown>)) {
    // PII-vrij signaal, zodat valse positieven (bv. browser-autofill) zichtbaar worden.
    deps.reportError('SITE_LEAD_HONEYPOT');
    return { status: 200, body: { ok: true, confirmationSent: true } };
  }

  const v = validateKennismaking(body);
  if (!v.ok) {
    return { status: 400, body: { ok: false, error: 'validation', fields: v.errors } };
  }

  if (!deps.fromConfigured) {
    deps.reportError('SITE_LEAD_NO_FROM', 'RESEND_FROM ontbreekt');
    return { status: 502, body: { ok: false, error: 'send_failed' } };
  }

  const note = buildLeadNotificationEmail(v.data);
  const r = await deps.send({ to: deps.leadsTo, ...note, replyTo: v.data.email });
  if (!r.ok) {
    deps.reportError('SITE_LEAD_NOTIFY_FAILED', r.skipped ? `skipped: ${r.reason}` : r.error);
    return { status: 502, body: { ok: false, error: 'send_failed' } };
  }

  const conf = buildLeadConfirmationEmail(v.data, { replyTo: deps.leadsTo, demoUrl: deps.demoUrl });
  const c = await deps.send({ to: v.data.email, ...conf, replyTo: deps.leadsTo });
  if (!c.ok) {
    // De lead is binnen (notificatie verstuurd); alleen de bevestiging mislukte.
    deps.reportError('SITE_LEAD_CONFIRM_FAILED', c.skipped ? `skipped: ${c.reason}` : c.error);
  }
  return { status: 200, body: { ok: true, confirmationSent: c.ok } };
}
