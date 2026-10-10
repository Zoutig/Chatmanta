// POST /api/site/kennismaking — kennismakingsformulier van de marketingsite.
// Publiek (proxy laat /api/site/* door). Alle logica zit in
// lib/site/kennismaking-handler.ts; hier alleen de echte deps:
//   - per-IP rate-limit: eigen Upstash-bucket (lib/site/kennismaking-rate-limit.ts),
//     sleutel = gehasht IP (hashIp, AVG: nooit plain IP in Redis)
//   - Resend via lib/notifications/email.ts (RESEND_FROM verplicht, geverifieerd
//     domein chatmanta.com — zonder afzender fail-closed i.p.v. stille 403)
//   - fouten naar Sentry, door de PII-redactor
// Geen DB-opslag (spec §7).

import { NextResponse } from 'next/server';

import { sendEmail } from '@/lib/notifications/email';
import { hashIp } from '@/lib/observability/hash-ip';
import { redactPii } from '@/lib/observability/redact';
import { captureServerError } from '@/lib/observability/sentry';
import { getClientIp } from '@/lib/v0/server/rate-limit';
import { MAX_BODY_BYTES, SITE_LEADS_DEFAULT_TO, isValidEmail } from '@/lib/site/kennismaking';
import { handleKennismaking } from '@/lib/site/kennismaking-handler';
import { getKennismakingRateLimiter } from '@/lib/site/kennismaking-rate-limit';
import { ROUTES, SITE_URL } from '@/lib/site/navigation';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<NextResponse> {
  const leadsEnv = process.env.SITE_LEADS_TO?.trim();
  // Te grote body niet eerst helemaal inlezen (de handler checkt de echte grootte nog eens).
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
  }
  const bodyText = await req.text().catch(() => '');

  const result = await handleKennismaking(
    {
      ipKey: `lead:${hashIp(getClientIp(req)) ?? 'unknown'}`,
      host: req.headers.get('host'),
      origin: req.headers.get('origin') ?? req.headers.get('referer'),
      bodyText,
    },
    {
      limiter: getKennismakingRateLimiter(),
      send: (msg) => sendEmail(msg),
      reportError: (code, detail) => {
        // Honeypot-hits: alleen een logregel (bots zouden Sentry anders volspammen).
        if (code === 'SITE_LEAD_HONEYPOT') {
          console.warn(`[site/kennismaking] ${code}`);
          return;
        }
        const safe = redactPii(detail ?? '').slice(0, 300);
        console.error(`[site/kennismaking] ${code}${safe ? `: ${safe}` : ''}`);
        captureServerError(new Error(`${code}${safe ? `: ${safe}` : ''}`), { route: '/api/site/kennismaking', code });
      },
      leadsTo: leadsEnv && isValidEmail(leadsEnv) ? leadsEnv : SITE_LEADS_DEFAULT_TO,
      fromConfigured: Boolean(process.env.RESEND_FROM?.trim()),
      demoUrl: `${SITE_URL}${ROUTES.demo}`,
    },
  );

  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store', ...result.headers },
  });
}
