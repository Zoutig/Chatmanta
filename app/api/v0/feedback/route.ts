// V0 widget feedback endpoint — POST 👍/👎 + optionele toelichting.
//
// Auth: relies on v0_auth cookie (page-gate). De widget pakt active org uit
// dezelfde cookie-context als de chat-route. Geen per-user identiteit in V0.
//
// Flow:
//   1. Body parsen + valideren (queryLogId, rating, optional comment)
//   2. Rate-limit per IP (zelfde bucket als chat — feedback is goedkoop maar
//      stoppt floods van een gerichte abuser)
//   3. Verifieer dat queryLogId hoort bij de actieve org (object-level access)
//   4. Insert v0_feedback; UNIQUE(query_log_id, rating)-conflict = idempotent
//      success voor de gebruiker.

import { NextResponse } from 'next/server';
import { AppError, toAppError, toWire } from '@/lib/errors/app-error';
import { newRequestId } from '@/lib/errors/request-id';
import { captureError } from '@/lib/v0/server/error-capture';
import { getActiveOrgId, resolveOrgSlugFromId } from '@/lib/v0/server/active-org';
import { getClientIp, getRateLimiter } from '@/lib/v0/server/rate-limit';
import { AUTH_COOKIE, verifyAuthCookieValue } from '@/lib/v0/auth-cookie';
import { verifyEmbedToken } from '@/lib/v0/server/embed-token';
import { getServiceRoleClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const COMMENT_MAX = 2000;

// Dual-auth, identiek aan de chat-route: geldig met óf het V0-demo-cookie
// (admin/test), óf een geldig embed-token + same-origin (publieke widget).
// Nodig sinds /api/v0/feedback uit de wachtwoord-gate is gehaald (proxy.ts)
// zodat 👍/👎 ook in een externe embed werkt i.p.v. stil te falen.
function isFeedbackAuthorized(req: Request): boolean {
  const cookie = req.headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE.name}=([^;]+)`))?.[1];
  if (verifyAuthCookieValue(cookie ? decodeURIComponent(cookie) : undefined)) {
    return true;
  }
  const orgSlug = resolveOrgSlugFromId(getActiveOrgId(req));
  if (!orgSlug) return false;
  const token = req.headers.get('x-chatmanta-embed');
  if (!verifyEmbedToken(token, orgSlug)) return false;
  const host = req.headers.get('host');
  const originHdr = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !originHdr) return false;
  try {
    return new URL(originHdr).host === host;
  } catch {
    return false;
  }
}

type Body = {
  queryLogId?: unknown;
  rating?: unknown;
  comment?: unknown;
};

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(req: Request) {
  const requestId = newRequestId();

  // Rate-limit (zelfde bucket als chat). Feedback heeft een veel lager
  // legitiem volume dan chat — als een IP dit bucket vol gooit zit er hoogst-
  // waarschijnlijk al een abuser achter.
  const ip = getClientIp(req);
  const rl = await getRateLimiter().check(ip);
  if (!rl.allowed) {
    const err = new AppError('RATE_LIMIT', { retryAfterSec: rl.retryAfterSec });
    return NextResponse.json(toWire(err, requestId), {
      status: err.status,
      headers: {
        'Retry-After': String(rl.retryAfterSec),
        'X-Request-Id': requestId,
      },
    });
  }

  if (!isFeedbackAuthorized(req)) {
    const err = new AppError('AUTH_REQUIRED');
    return NextResponse.json(toWire(err, requestId), {
      status: err.status, // 401
      headers: { 'X-Request-Id': requestId },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    const err = new AppError('INPUT_INVALID', { message: 'invalid JSON body' });
    return NextResponse.json(toWire(err, requestId), {
      status: err.status,
      headers: { 'X-Request-Id': requestId },
    });
  }

  const queryLogId = typeof body.queryLogId === 'string' ? body.queryLogId : '';
  const rating = body.rating;
  const rawComment = body.comment;

  if (!queryLogId || !isUuid(queryLogId)) {
    const err = new AppError('INPUT_INVALID', { message: 'queryLogId is required (uuid)' });
    return NextResponse.json(toWire(err, requestId), {
      status: err.status,
      headers: { 'X-Request-Id': requestId },
    });
  }
  if (rating !== 'up' && rating !== 'down') {
    const err = new AppError('INPUT_INVALID', { message: "rating must be 'up' or 'down'" });
    return NextResponse.json(toWire(err, requestId), {
      status: err.status,
      headers: { 'X-Request-Id': requestId },
    });
  }
  let comment: string | null = null;
  if (rawComment != null) {
    if (typeof rawComment !== 'string') {
      const err = new AppError('INPUT_INVALID', { message: 'comment must be string or null' });
      return NextResponse.json(toWire(err, requestId), {
        status: err.status,
        headers: { 'X-Request-Id': requestId },
      });
    }
    const trimmed = rawComment.trim();
    // Lege string = comment werd weggelaten. Hard cap op COMMENT_MAX i.p.v.
    // 400 — bezoeker hoeft niet bestraft te worden voor te veel typen, server
    // kapt 'm gewoon af. DB-check constraint vangt overflow alsnog op.
    comment = trimmed.length === 0 ? null : trimmed.slice(0, COMMENT_MAX);
  }

  const organizationId = getActiveOrgId(req);

  try {
    // Object-level access: verifieer dat de queryLogId bij déze org hoort.
    // Service-role bypasst RLS dus deze check is hier de enige isolatie tegen
    // cross-org feedback (= ook in V0 belangrijk: anders kan een widget op
    // org A feedback geven op een chat-row van org B).
    const { data: logRow, error: logErr } = await getServiceRoleClient()
      .from('query_log')
      .select('id, organization_id')
      .eq('id', queryLogId)
      .maybeSingle();

    if (logErr) {
      throw new AppError('INTERNAL', { message: `query_log lookup: ${logErr.message}` });
    }
    if (!logRow || logRow.organization_id !== organizationId) {
      const err = new AppError('NOT_FOUND', { message: 'queryLogId niet gevonden in deze org' });
      return NextResponse.json(toWire(err, requestId), {
        status: err.status,
        headers: { 'X-Request-Id': requestId },
      });
    }

    const { error: insErr } = await getServiceRoleClient().from('v0_feedback').insert({
      organization_id: organizationId,
      query_log_id: queryLogId,
      rating,
      comment,
    });

    if (insErr) {
      // UNIQUE-conflict = idempotent succes. Postgres code 23505 + supabase
      // wraps het in `code: '23505'` op de error-object. Voor andere fouten
      // (RLS-deny, FK-violation) gooien we INTERNAL.
      const pgCode = (insErr as { code?: string }).code;
      if (pgCode === '23505') {
        return NextResponse.json(
          { ok: true, idempotent: true },
          { status: 200, headers: { 'X-Request-Id': requestId } },
        );
      }
      throw new AppError('INTERNAL', { message: `feedback insert: ${insErr.message}` });
    }

    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'X-Request-Id': requestId } },
    );
  } catch (err) {
    const appErr = toAppError(err);
    console.error('[feedback]', requestId, appErr.code, appErr.message, appErr.cause ?? '');
    captureError({
      surface: 'api',
      code: appErr.code,
      message: appErr.message,
      error: appErr.cause ?? appErr,
      organizationId,
      context: { requestId, route: '/api/v0/feedback' },
    });
    return NextResponse.json(toWire(appErr, requestId), {
      status: appErr.status,
      headers: { 'X-Request-Id': requestId },
    });
  }
}
