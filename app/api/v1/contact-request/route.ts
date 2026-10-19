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
// De stappen zelf staan in lib/v1/widget/contact-request-handler.ts (dependency
// injection, unit-getest). Hier alleen de echte deps.
//
// Notificatiemail: best-effort via after() → notifyNewV1ContactRequest (fail-safe,
//   gated op RESEND_API_KEY). Adres uit settings.notificationEmail, anders het
//   account-e-mailadres (org-owner), anders env; geen adres → geen mail + Sentry-melding.
//   De submit blokkeert nooit op de mail — de bezoeker-lead gaat voor.

import { after, NextResponse } from 'next/server';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { getClientIp, getMutationRateLimiter, getOrgRateLimiter } from '@/lib/v0/server/rate-limit';
import { verifyEmbedToken } from '@/lib/v1/widget/embed-token';
import { sameOrigin } from '@/lib/v1/widget/origin-lock';
import { getOrgChatbot } from '@/app/v1/app/rag-config';
import { getChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import { handleV1ContactRequest } from '@/lib/v1/widget/contact-request-handler';
import { notifyNewV1ContactRequest } from '@/lib/notifications/v1-contact-request-notify';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // Lazy: pas na rate-limit + token-check een client maken (zelfde volgorde als vroeger).
  let client: ReturnType<typeof getV1ServiceRoleClient> | null = null;
  const svc = () => (client ??= getV1ServiceRoleClient());

  const result = await handleV1ContactRequest(req, {
    ipLimiter: getMutationRateLimiter(),
    orgLimiter: getOrgRateLimiter(),
    clientIp: getClientIp,
    sameOrigin,
    verifyToken: verifyEmbedToken,
    findOrg: async (slug) => {
      const { data: org } = await svc()
        .from('organizations')
        .select('id, name')
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle();
      return org ? { id: org.id as string, name: (org.name as string | null) ?? null } : null;
    },
    getChatbot: (orgId) => getOrgChatbot(svc(), orgId),
    getSettings: (chatbotId) => getChatbotSettings(svc(), chatbotId),
    insert: async (row) => {
      const { error } = await svc().from('contact_requests').insert(row);
      return { error: error ? { code: (error as { code?: string }).code, message: error.message } : null };
    },
    scheduleNotify: (args) => after(() => notifyNewV1ContactRequest(svc(), args)),
    logError: (msg, detail) => console.error(msg, detail ?? ''),
  });

  return result.json
    ? NextResponse.json(result.json, { status: result.status, headers: result.headers })
    : new NextResponse(null, { status: result.status, headers: result.headers });
}
