// V1 contactverzoek submit-endpoint — bezoeker → klant lead-capture (port van
// /api/v0/contact-request op de V1-tabel + V1 token-auth).
//
// Dit is de EERSTE V1 publieke route die ECHTE bezoeker-PII opslaat (naam/e-mail/
// telefoon in contact_requests, migr 0011). Vangrails:
//   - auth = puur embed-token (HMAC, fail-closed) + strenge origin-lock, zoals chat;
//   - org+chatbot UITSLUITEND uit de gesigneerde slug in het token (nooit body/?org=);
//   - per-org feature-flag (settings.contactRequestsEnabled) MOET aan staan → anders 403;
//   - consent_given MOET true (de DB-CHECK borgt het ook) → anders 400;
//   - eigen rate-limit-buckets: per-IP (mutation-limiter) + per-org (org-limiter, vangt
//     token-misbruik dat over IP's roteert);
//   - writes via service-role (contact_requests is SELECT-only onder RLS);
//   - geen ruwe PII in logs (alleen DB-code/message).
//
// ponytail: geen notificatie-mail hier (V0 deed notifyNewContactRequest via after()).
//   Buiten deze taak-scope: het dashboard leest de rij; mail/notify is een aparte laag.

import { NextResponse } from 'next/server';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { getClientIp, getMutationRateLimiter, getOrgRateLimiter } from '@/lib/v0/server/rate-limit';
import { verifyEmbedToken } from '@/lib/v1/widget/embed-token';
import { sameOrigin } from '@/lib/v1/widget/origin-lock';
import { getOrgChatbot } from '@/app/v1/app/rag-config';
import { getChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import { validateContactBody } from '@/lib/v1/widget/contact-validate';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // 0. Eigen per-IP rate-limit-bucket.
  const rl = await getMutationRateLimiter().check(`v1-contact:${getClientIp(req)}`);
  if (!rl.allowed) {
    return new NextResponse(null, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  // 1. embed-token + strenge origin-lock (fail-closed).
  const slug = new URL(req.url).searchParams.get('org');
  const token = req.headers.get('x-chatmanta-embed');
  if (!slug || !sameOrigin(req) || !verifyEmbedToken(token, slug)) {
    return new NextResponse(null, { status: 401 });
  }

  const svc = getV1ServiceRoleClient();

  // 2. Org uit de gesigneerde slug (token), NOOIT uit de body.
  const { data: org } = await svc
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (!org) return new NextResponse(null, { status: 401 });
  const organizationId = org.id as string;

  // 3. Per-org rate-limit (eigen bucket) — vangt token-misbruik over IP's.
  const orgRl = await getOrgRateLimiter().check(`v1-contact-org:${organizationId}`);
  if (!orgRl.allowed) {
    return new NextResponse(null, { status: 429, headers: { 'Retry-After': String(orgRl.retryAfterSec) } });
  }

  let chatbot: { id: string; name: string; bot_version: string } | null = null;
  try {
    chatbot = await getOrgChatbot(svc, organizationId);
  } catch {
    chatbot = null;
  }
  if (!chatbot) return new NextResponse(null, { status: 404 });

  // 4. Feature-flag: contactverzoeken moeten AAN staan voor deze org. Fail-closed.
  //    De flag leeft in chatbots.settings (toegevoegd door de settings-agent); we
  //    lezen 'm defensief zodat dit ook vóór die wiring fail-closed werkt.
  let enabled = false;
  try {
    const settings = await getChatbotSettings(svc, chatbot.id);
    enabled = (settings as { contactRequestsEnabled?: unknown }).contactRequestsEnabled === true;
  } catch {
    enabled = false;
  }
  if (!enabled) return new NextResponse(null, { status: 403 });

  // 5. Body parsen — shape-validatie doet validateContactBody (unknown in).
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // 6+7. Honeypot + validatie — pure functie (gedrag bevroren, unit-getest).
  const v = validateContactBody(body);
  if (!v.ok) {
    return v.reason === 'honeypot'
      ? NextResponse.json({ ok: true }, { status: 200 })
      : new NextResponse(null, { status: 400 });
  }
  const { name, email, phone, preferredContact, subject, message } = v.value;

  // 8. Insert via service-role. org+chatbot server-bepaald; consent hard true.
  try {
    const { error: insErr } = await svc.from('contact_requests').insert({
      organization_id: organizationId,
      chatbot_id: chatbot.id,
      name,
      email,
      phone,
      preferred_contact: preferredContact,
      subject,
      message,
      consent_given: true,
      status: 'new',
    });
    if (insErr) {
      // Geen PII in de logregel — alleen DB-code/message.
      console.error('[v1/contact-request] insert faalde:', (insErr as { code?: string }).code ?? '', insErr.message);
      return new NextResponse(null, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[v1/contact-request] onverwachte fout:', err instanceof Error ? err.message : err);
    return new NextResponse(null, { status: 500 });
  }
}
