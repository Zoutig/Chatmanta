// Publiek client-error ingest-endpoint — vangt browser-crashes uit de widget
// (iframe) en het klantendashboard die anders 100% onzichtbaar verdwijnen.
//
// Dit is de ENIGE nieuwe publieke surface; daarom defense-in-depth, en het
// antwoordt ALTIJD 204 (geen state-lek, geen retry-storm, sendBeacon negeert
// de body toch). Volgorde: rate-limit → body-cap → JSON-guard → server bepaalt
// surface/code/severity → org server-side → captureError (PII-redactie +
// cardinaliteits-cap zitten in error-capture). De widget draait in een iframe
// dat WIJ serveren (/embed), dus legitieme widget-reports zijn same-origin;
// alleen écht externe POSTs zijn niet-trusted → geaccepteerd maar gedowngraded
// naar 'info' (fail-open, beslissing #5) zodat ze niet de default-view vervuilen.

import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { captureError } from '@/lib/v0/server/error-capture';
import { getActiveOrgId } from '@/lib/v0/server/active-org';
import { getClientErrorRateLimiter, getClientIp } from '@/lib/v0/server/rate-limit';
import type { ErrorSurface } from '@/lib/observability/sink';

export const runtime = 'nodejs';

const MAX_BODY = 16_000;

type Body = {
  surface?: unknown;
  message?: unknown;
  stack?: unknown;
  url?: unknown;
  code?: unknown;
  digest?: unknown;
  userAgent?: unknown;
};

function str(v: unknown, cap: number): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, cap) : undefined;
}

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

// Same-origin = de widget-iframe (door ons geserveerd) of het dashboard zelf.
function isSameOrigin(req: Request): boolean {
  const host = req.headers.get('host');
  const originHdr = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !originHdr) return false;
  try {
    return new URL(originHdr).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Rate-limit FIRST — over de limiet → 204 (nooit 429: geen state-lek/retry-storm).
  const rl = await getClientErrorRateLimiter().check(getClientIp(req));
  if (!rl.allowed) return noContent();

  // 2. Body-cap vóór parse.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return noContent();
  }
  if (raw.length > MAX_BODY) return noContent();

  // 3. JSON-guard.
  let body: Body;
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    return noContent();
  }

  // 4. Server bepaalt surface (alleen widget|dashboard), code, severity — nooit
  //    client-velden voor fingerprint/attributie vertrouwen.
  const surface: ErrorSurface = body.surface === 'dashboard' ? 'dashboard' : 'widget';
  const digest = str(body.digest, 100);
  const baseMessage = str(body.message, 1000) ?? 'client error';
  const message = digest ? `${baseMessage} [digest:${digest}]` : baseMessage;
  const stack = str(body.stack, 4000);
  const url = str(body.url, 500);
  const ua = str(body.userAgent, 400);
  const userAgentHash = ua ? createHash('sha256').update(ua).digest('hex').slice(0, 12) : undefined;

  // 5. Org server-side: getActiveOrgId geeft altijd een geldige KNOWN_ORG-id
  //    (default dev-org) — geen willekeurige client-string mogelijk.
  const organizationId = getActiveOrgId(req);

  // 6. Origin: same-origin (widget-iframe + dashboard) → echte 'error'; al het
  //    andere wordt geaccepteerd maar gedowngraded naar 'info' + originSuspect.
  const trusted = isSameOrigin(req);

  // 7. Capture (PII-redactie + cardinaliteits-cap zitten in captureError).
  captureError({
    surface,
    severity: trusted ? 'error' : 'info',
    code: 'CLIENT_JS',
    message,
    organizationId,
    enforceCap: true,
    context: {
      stack,
      url,
      userAgentHash,
      route: surface === 'dashboard' ? 'dashboard-client' : 'widget-client',
      originSuspect: trusted ? undefined : true,
    },
  });

  // 8. Altijd 204 — geen body, geen reflectie.
  return noContent();
}
