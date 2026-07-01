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

export const runtime = 'nodejs';

const NAME_MAX = 200;
const SUBJECT_MAX = 300;
const MESSAGE_MAX = 4000;
// Telefoon: cijfers, spaties, +, haakjes, schuine streep, punt, koppelteken; 5-20 tekens.
const PHONE_RE = /^[\d+\s()/.-]{5,20}$/;
// Bewust een losse vorm-check (geen volledige RFC) — de mens leest het terug.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Body = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  preferredContact?: unknown;
  subject?: unknown;
  message?: unknown;
  consentGiven?: unknown;
  // Honeypot — een echte bezoeker laat dit leeg; een bot vult het. Gevuld → stil 200.
  company_url?: unknown;
};

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

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

  // 5. Body parsen.
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // 6. Honeypot — gevuld → bot. Stil 200 zonder rij (geen signaal naar de bot).
  if ((str(body.company_url) ?? '').trim().length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 7. Validatie (hard; de DB-CHECKs zijn de backstop).
  const name = (str(body.name) ?? '').trim();
  if (name.length < 1 || name.length > NAME_MAX) return new NextResponse(null, { status: 400 });

  if (body.consentGiven !== true) return new NextResponse(null, { status: 400 });

  const preferred = str(body.preferredContact);
  if (preferred !== 'call' && preferred !== 'email') return new NextResponse(null, { status: 400 });

  let email: string | null = (str(body.email) ?? '').trim() || null;
  let phone: string | null = (str(body.phone) ?? '').trim() || null;

  if (preferred === 'call') {
    if (!phone || !PHONE_RE.test(phone)) return new NextResponse(null, { status: 400 });
  } else {
    if (!email || !EMAIL_RE.test(email)) return new NextResponse(null, { status: 400 });
  }
  // Een meegegeven niet-voorkeursveld dat ongeldig is → wegfilteren i.p.v. de hele
  // submit te weigeren (de DB-CHECK eist alleen dat ÉÉN van beide gevuld is).
  if (phone && !PHONE_RE.test(phone)) phone = null;
  if (email && !EMAIL_RE.test(email)) email = null;

  const subjectRaw = str(body.subject);
  const messageRaw = str(body.message);
  const subject = subjectRaw ? subjectRaw.trim().slice(0, SUBJECT_MAX) || null : null;
  const message = messageRaw ? messageRaw.trim().slice(0, MESSAGE_MAX) || null : null;

  // 8. Insert via service-role. org+chatbot server-bepaald; consent hard true.
  try {
    const { error: insErr } = await svc.from('contact_requests').insert({
      organization_id: organizationId,
      chatbot_id: chatbot.id,
      name,
      email,
      phone,
      preferred_contact: preferred,
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
