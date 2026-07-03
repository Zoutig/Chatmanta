// V1 publiek client-error ingest-endpoint — vangt browser-crashes uit de V1-widget
// (iframe) en het V1-dashboard die anders onzichtbaar verdwijnen.
//
// Antwoordt ALTIJD 204 — de volledige handler zit in een try/catch.
// Volgorde: rate-limit → byte-gecapte body → JSON-guard → TRUST → captureError.
//
// TRUST-model V1 (ponytail: bewuste keuze, zie comment hieronder):
//   * Widget: geldig embed-token (lib/v1/widget/embed-token) voor de meegegeven slug
//     → vertrouwde bron; org-uuid via DB-lookup op de gesigneerde slug.
//   * Dashboard: UNTRUSTED → severity 'info', organization_id null.
//     Reden: V1 dashboard-sessies draaien op Supabase JWT-cookies; die server-side
//     verifiëren in een publieke route-handler vereist een volledige session-client
//     (createServerClient + cookie-parsing), wat buiten de scope van dit fire-and-
//     forget endpoint valt. Dashboard-fouten zijn low-volume interne fouten — 'info'
//     volstaat totdat een V1-sessie-check hier zinvol is. Upgrade: voeg een
//     `Authorization: Bearer <supabase-JWT>` pad toe + verifyEmbedToken-analoog.
//   * Alles buiten bovenstaande → UNTRUSTED (severity 'info', org null).

import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { captureError } from '@/lib/v1/observability/error-capture';
import { getClientIp, getClientErrorRateLimiter } from '@/lib/v0/server/rate-limit';
import { verifyEmbedToken } from '@/lib/v1/widget/embed-token';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
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

// Streaming body-read met harde byte-cap — identiek aan V0-variant.
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
          try { await reader.cancel(); } catch { /* noop */ }
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
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(buf);
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // 1. Rate-limit — over de limiet → 204 (geen 429: geen retry-storm/state-lek).
    const rl = await getClientErrorRateLimiter().check(getClientIp(req));
    if (!rl.allowed) return noContent();

    // 2. Content-Length pre-reject + byte-gecapte streaming read.
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

    // 4. Server bepaalt surface.
    const surface: ErrorSurface = body.surface === 'dashboard' ? 'dashboard' : 'widget';
    const digest = str(body.digest, 100);
    const baseMessage = str(body.message, 1000) ?? 'client error';
    const message = digest ? `${baseMessage} [digest:${digest}]` : baseMessage;
    const stack = str(body.stack, 4000);
    const url = str(body.url, 500);
    const ua = str(body.userAgent, 400);
    const userAgentHash = ua ? createHash('sha256').update(ua).digest('hex').slice(0, 12) : undefined;

    // 5. TRUST: widget → embed-token + DB-slug-lookup; dashboard → UNTRUSTED (zie header).
    // ponytail: dashboard-pad is bewust UNTRUSTED totdat V1-sessie-check hier zinvol is.
    const tokenSlug = str(body.orgSlug, 64) ?? '';
    const token = str(body.embedToken, 4000) ?? '';
    let organizationId: string | null = null;
    let trusted = false;

    if (token && tokenSlug && verifyEmbedToken(token, tokenSlug)) {
      // Widget-pad: slug uit het gesigneerde token → org-uuid via DB (V1 heeft geen KNOWN_ORGS).
      const svc = getV1ServiceRoleClient();
      const { data } = await svc
        .from('organizations')
        .select('id')
        .eq('slug', tokenSlug)
        .is('deleted_at', null)
        .maybeSingle();
      if (data) {
        trusted = true;
        organizationId = data.id as string;
      }
    }
    // Dashboard-pad: UNTRUSTED — trusted blijft false, organizationId blijft null.

    // 6. Capture (PII-redactie + cardinaliteits-cap in captureError).
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
    return noContent();
  }
}
