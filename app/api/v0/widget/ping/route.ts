// Heartbeat-ping uit een geladen embed-iframe. Schrijft lastSeenAt + installOrigin
// zodat de klantendashboard Live-status echte installatie kan tonen.
//
// Auth: identiek aan de chat-route (rate-limit → embed-token + origin-lock).
// Geen LLM, één jsonb-upsert. Antwoordt 204.
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifyAuthCookieValue } from '@/lib/v0/auth-cookie';
import { verifyEmbedToken } from '@/lib/v0/server/embed-token';
import { getActiveOrgId, resolveOrgSlugFromId } from '@/lib/v0/server/active-org';
import { saveWidgetSettings } from '@/lib/v0/klantendashboard/server/settings';
import { getClientIp, getRateLimiter } from '@/lib/v0/server/rate-limit';

export const runtime = 'nodejs';

function authorized(req: Request, orgSlug: string): boolean {
  const cookie = req.headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE.name}=([^;]+)`))?.[1];
  if (verifyAuthCookieValue(cookie ? decodeURIComponent(cookie) : undefined)) return true;

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

// Strikte hostname-validatie voor de display-only installOrigin.
function cleanHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const h = raw.trim().slice(0, 255);
  return /^[a-zA-Z0-9.\-:_]+$/.test(h) ? h : null;
}

export async function POST(req: Request) {
  const rl = await getRateLimiter().check(getClientIp(req));
  if (!rl.allowed) return new NextResponse(null, { status: 429 });

  const orgSlug = resolveOrgSlugFromId(getActiveOrgId(req));
  if (!orgSlug || !authorized(req, orgSlug)) {
    return new NextResponse(null, { status: 401 });
  }

  let host: string | null = null;
  try {
    const body = (await req.json()) as { host?: unknown };
    host = cleanHost(body.host);
  } catch {
    // body optioneel — host blijft null
  }

  try {
    await saveWidgetSettings(orgSlug, {
      isInstalled: true,
      lastSeenAt: new Date().toISOString(),
      ...(host ? { installOrigin: host } : {}),
    });
  } catch {
    // best-effort telemetrie; faal de ping niet hard
  }

  return new NextResponse(null, { status: 204 });
}
