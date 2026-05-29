// Publiek client-error ingest-endpoint — vangt browser-crashes uit de widget
// (iframe) en het klantendashboard die anders 100% onzichtbaar verdwijnen.
//
// Dit is de ENIGE nieuwe publieke surface; daarom defense-in-depth, en het
// antwoordt ALTIJD 204 — de hele handler zit in een try/catch zodat geen enkele
// malformed input (kapotte Cookie, body, JSON) ooit een 500 lekt. Volgorde:
// rate-limit → byte-gecapte streaming body-read → JSON-guard → TRUST → server
// bepaalt surface/code/severity/org → captureError (PII-redactie + cap zitten daar).
//
// TRUST (review round 1): NIET op de spoofbare Origin/Referer vertrouwen. Een
// widget-report is vertrouwd als het het origin-locked embed-token meestuurt (in
// de BODY — sendBeacon kan geen custom headers zetten); een dashboard-report als
// het V0-auth-cookie klopt. Alleen vertrouwde reports → severity 'error' + echte
// org-attributie; al het andere → 'info' + organization_id = null.

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
  orgSlug?: unknown;
  embedToken?: unknown;
};

function str(v: unknown, cap: number): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, cap) : undefined;
}

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

// Throw-safe: een kapotte Cookie of ontbrekend secret mag dit publieke endpoint
// nooit laten crashen — bij elke fout → niet-geauthenticeerd.
function isCookieAuthed(req: Request): boolean {
  try {
    const cookie = req.headers
      .get('cookie')
      ?.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE.name}=([^;]+)`))?.[1];
    return verifyAuthCookieValue(cookie ? decodeURIComponent(cookie) : undefined);
  } catch {
    return false;
  }
}

// Streaming body-read met een harde BYTE-cap: breekt af zodra MAX_BODY bytes
// overschreden wordt, zodat een body zonder (of met liegende) Content-Length op
// een unauth endpoint nooit ongelimiteerd gebufferd wordt. null = te groot.
async function readCappedBody(req: Request, max: number): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > max) {
          try {
            await reader.cancel();
          } catch {
            /* noop */
          }
          return null;
        }
        chunks.push(value);
      }
    }
  } catch {
    return null;
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // 1. Rate-limit FIRST — over de limiet → 204 (nooit 429: geen state-lek/retry-storm).
    const rl = await getClientErrorRateLimiter().check(getClientIp(req));
    if (!rl.allowed) return noContent();

    // 2. Goedkope Content-Length pre-reject + byte-gecapte streaming read.
    const cl = Number(req.headers.get('content-length'));
    if (Number.isFinite(cl) && cl > MAX_BODY) return noContent();
    const raw = await readCappedBody(req, MAX_BODY);
    if (raw === null || raw.length === 0) return noContent();

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
  } catch {
    // Onverwachte fout (malformed cookie/header/etc.) — contract blijft 204.
    return noContent();
  }
}
