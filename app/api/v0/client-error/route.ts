// Publiek client-error ingest-endpoint — vangt browser-crashes uit de widget
// (iframe) en het klantendashboard die anders 100% onzichtbaar verdwijnen.
//
// Dit is de ENIGE nieuwe publieke surface; daarom defense-in-depth, en het
// antwoordt ALTIJD 204 (geen state-lek, geen retry-storm, sendBeacon negeert de
// body toch). Volgorde: rate-limit → body-cap → JSON-guard → TRUST bepalen →
// server bepaalt surface/code/severity/org → captureError (PII-redactie +
// cardinaliteits-cap zitten in error-capture).
//
// TRUST (review round 1): NIET op de spoofbare Origin/Referer vertrouwen. Een
// widget-report is vertrouwd als het het origin-locked embed-token meestuurt
// (in de BODY — sendBeacon kan geen custom headers zetten); een dashboard-report
// als het V0-auth-cookie klopt. Alleen vertrouwde reports → severity 'error' en
// een echte org-attributie; al het andere → 'info' + organization_id = null
// (geen spoofbare org persisteren, houdt de default Issues-view schoon).

import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { captureError } from '@/lib/v0/server/error-capture';
import { getActiveOrgId, resolveOrgIdFromSlug } from '@/lib/v0/server/active-org';
import { getClientErrorRateLimiter, getClientIp } from '@/lib/v0/server/rate-limit';
import { verifyEmbedToken } from '@/lib/v0/server/embed-token';
import { AUTH_COOKIE, verifyAuthCookieValue } from '@/lib/v0/auth-cookie';
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
  /** Widget-trust: origin-locked embed-token + bijbehorende org-slug (in de body
   *  omdat sendBeacon geen headers kan zetten). */
  orgSlug?: unknown;
  embedToken?: unknown;
};

function str(v: unknown, cap: number): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, cap) : undefined;
}

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

function isCookieAuthed(req: Request): boolean {
  const cookie = req.headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE.name}=([^;]+)`))?.[1];
  return verifyAuthCookieValue(cookie ? decodeURIComponent(cookie) : undefined);
}

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Rate-limit FIRST — over de limiet → 204 (nooit 429: geen state-lek/retry-storm).
  const rl = await getClientErrorRateLimiter().check(getClientIp(req));
  if (!rl.allowed) return noContent();

  // 2a. Goedkope Content-Length pre-reject vóór buffering.
  const cl = Number(req.headers.get('content-length'));
  if (Number.isFinite(cl) && cl > MAX_BODY) return noContent();

  // 2b. Body-cap (na buffering; vangt liegende/ontbrekende Content-Length).
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

  // 4. Server bepaalt surface (alleen widget|dashboard), code; nooit client-velden
  //    voor fingerprint/attributie vertrouwen.
  const surface: ErrorSurface = body.surface === 'dashboard' ? 'dashboard' : 'widget';
  const digest = str(body.digest, 100);
  const baseMessage = str(body.message, 1000) ?? 'client error';
  const message = digest ? `${baseMessage} [digest:${digest}]` : baseMessage;
  const stack = str(body.stack, 4000);
  const url = str(body.url, 500);
  const ua = str(body.userAgent, 400);
  const userAgentHash = ua ? createHash('sha256').update(ua).digest('hex').slice(0, 12) : undefined;

  // 5. TRUST + org server-side. Widget: geldig embed-token voor de meegegeven
  //    slug. Dashboard: V0-auth-cookie. Anders untrusted → org null + severity info.
  const tokenSlug = str(body.orgSlug, 64) ?? '';
  const token = str(body.embedToken, 4000) ?? '';
  let organizationId: string | null = null;
  let trusted = false;
  if (token && tokenSlug && verifyEmbedToken(token, tokenSlug)) {
    trusted = true;
    organizationId = resolveOrgIdFromSlug(tokenSlug); // gevalideerd tegen KNOWN_ORGS
  } else if (isCookieAuthed(req)) {
    trusted = true;
    organizationId = getActiveOrgId(req); // dashboard: cookie-org (vertrouwde sessie)
  }

  // 6. Capture (PII-redactie + cardinaliteits-cap server-side in captureError).
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

  // 7. Altijd 204 — geen body, geen reflectie.
  return noContent();
}
