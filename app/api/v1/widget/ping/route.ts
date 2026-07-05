// Heartbeat-ping uit een geladen V1-embed-iframe. Schrijft widget_last_seen_at
// (+ display-only origin) op de chatbot, zodat Live-status in het klantdashboard
// en widgetStatus in de admin échte installatie tonen i.p.v. "domein ingevuld".
// Port van app/api/v0/widget/ping/route.ts naar het V1-auth-model.
//
// Auth: identiek aan /api/v1/chat — per-IP rate-limit → embed-token (HMAC,
// fail-closed) + origin-lock. Geen demo-cookie-pad in V1. Geen LLM, één update.
// Antwoordt 204; de write is best-effort telemetrie (faalt nooit hard).
import { NextResponse } from 'next/server';
import { verifyEmbedToken } from '@/lib/v1/widget/embed-token';
import { sameOrigin } from '@/lib/v1/widget/origin-lock';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { getClientIp, getRateLimiter } from '@/lib/v0/server/rate-limit';
import { getOrgChatbot } from '@/app/v1/app/rag-config';

export const runtime = 'nodejs';

// Strikte hostname-validatie voor de display-only widget_last_seen_origin
// (zelfde regel als V0's ping-route).
function cleanHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const h = raw.trim().slice(0, 255);
  return /^[a-zA-Z0-9.\-:_]+$/.test(h) ? h : null;
}

export async function POST(req: Request) {
  const rl = await getRateLimiter().check(getClientIp(req));
  if (!rl.allowed) return new NextResponse(null, { status: 429 });

  const slug = new URL(req.url).searchParams.get('org');
  const token = req.headers.get('x-chatmanta-embed');
  if (!slug || !sameOrigin(req) || !verifyEmbedToken(token, slug)) {
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
    // Org+chatbot uit de GESIGNEERDE slug (token-claim), nooit uit vrije input.
    const svc = getV1ServiceRoleClient();
    const { data: org } = await svc
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle();
    if (!org) return new NextResponse(null, { status: 401 });

    const chatbot = await getOrgChatbot(svc, org.id as string);
    if (chatbot) {
      // Ook een gepauzeerde widget mag pingen: "gezien" en "actief" zijn
      // onafhankelijke signalen (paused + gezien → admin-status 'detected').
      await svc
        .from('chatbots')
        .update({
          widget_last_seen_at: new Date().toISOString(),
          ...(host ? { widget_last_seen_origin: host } : {}),
        })
        .eq('organization_id', org.id as string)
        .eq('id', chatbot.id);
    }
  } catch {
    // best-effort telemetrie; faal de ping niet hard
  }

  return new NextResponse(null, { status: 204 });
}
