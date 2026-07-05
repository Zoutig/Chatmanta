import 'server-only';

// V1-notificatiemail bij een nieuw contactverzoek. Fail-safe spiegel van
// lib/notifications/contact-request-notify.ts (V0): de verzendpoging is gated op
// RESEND_API_KEY (no-op zonder key, zie email.ts) en faalt stil. notifyNewV1ContactRequest
// gooit NOOIT; de caller (de submit-route, via after()) hoeft 'm alleen te awaiten en mag
// een fout negeren. Het verzoek is op dat moment al opgeslagen — de DB is bron-van-waarheid,
// de mail best-effort. De bezoeker-lead gaat altijd voor.
//
// ADRES-KETEN (eerste geldige wint) — spiegelt de UI-belofte in de Instellingen-pagina
// ("Laat leeg om het account-e-mailadres te gebruiken"):
//   1. settings.notificationEmail  — per-chatbot override (chatbots.settings jsonb)
//   2. org-owner-e-mailadres        — het "account-e-mailadres": organization_members
//                                     role='owner' -> users.email
//   3. process.env.CONTACT_REQUEST_NOTIFY_EMAIL — globale fallback (zoals V0)
//   4. geen adres -> geen mail, LUID loggen (nooit silent). Geen harde default-ontvanger:
//      een verzoek voor org A mag nooit stil naar een generiek adres lekken.
//
// Geen ruwe PII in logs: we loggen alleen org-id + het Resend-resultaat-id.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, type SendEmailResult } from './email';
import { buildContactRequestOperatorEmail, isValidContactEmail } from './contact-request-email';

/** De velden die de operator-mail toont. `message` = de V1-kolomnaam (V0 heet dit
 *  `toelichting`); we mappen bij het bouwen van de mail. */
export type V1ContactNotifyRequest = {
  name: string;
  email: string | null;
  phone: string | null;
  preferredContact: 'call' | 'email';
  subject: string | null;
  message: string | null;
};

/** Absolute URL naar de V1-contactverzoeken-tab (NIET de V0 /klantendashboard).
 *  Base uit NEXT_PUBLIC_APP_URL, fallback = productie-domein. */
function v1ContactRequestsUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.chatmanta.nl').replace(/\/+$/, '');
  return `${base}/v1/app/contactverzoeken`;
}

function logResult(r: SendEmailResult): void {
  if (r.ok) console.log(`[v1/contact-notify] verzonden (id=${r.id ?? 'n/a'})`);
  else if (r.skipped) console.log(`[v1/contact-notify] overgeslagen (${r.reason})`);
  else console.error(`[v1/contact-notify] mislukt: ${r.error}`);
}

/** Het "account-e-mailadres" = de owner van de org (organization_members role='owner'
 *  -> users.email). Service-role leest onder RLS-bypass. Throwt nooit — een mislukte
 *  read mag de fail-safe niet doorbreken. */
async function resolveOwnerEmail(svc: SupabaseClient, orgId: string): Promise<string | null> {
  try {
    const { data } = await svc
      .from('organization_members')
      .select('users(email)')
      .eq('organization_id', orgId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();
    const email = (data as { users?: { email?: string | null } | null } | null)?.users?.email;
    return isValidContactEmail(email) ? email : null;
  } catch (e) {
    console.error('[v1/contact-notify] owner-email-read faalde', (e as Error).message);
    return null;
  }
}

/** Resolve het meldingsadres via de keten. Geen geldig adres → null (de caller logt
 *  dat luid). Throwt nooit. */
async function resolveNotifyAddress(
  svc: SupabaseClient,
  orgId: string,
  settingsEmail: string,
): Promise<string | null> {
  if (isValidContactEmail(settingsEmail)) return settingsEmail;
  const owner = await resolveOwnerEmail(svc, orgId);
  if (owner) return owner;
  const envAddr = process.env.CONTACT_REQUEST_NOTIFY_EMAIL;
  return isValidContactEmail(envAddr) ? envAddr : null;
}

/** Notificeer de ondernemer over een nieuw V1-contactverzoek. Fail-safe: gooit nooit
 *  en blokkeert de submit nooit. */
export async function notifyNewV1ContactRequest(
  svc: SupabaseClient,
  args: {
    organizationId: string;
    orgName: string;
    /** settings.notificationEmail uit chatbots.settings ('' = niet ingesteld). */
    notificationEmail: string;
    request: V1ContactNotifyRequest;
  },
): Promise<void> {
  try {
    const to = await resolveNotifyAddress(svc, args.organizationId, args.notificationEmail);
    if (!to) {
      // LUID loggen (geen silent skip, geen PII): zonder ontvanger ziet de ondernemer
      // het verzoek alleen in het dashboard. Het verzoek zelf staat al opgeslagen.
      console.error(
        `[v1/contact-notify] geen meldingsadres (org=${args.organizationId}) — verzoek staat wel in het dashboard`,
      );
      return;
    }

    const { name, email, phone, preferredContact, subject, message } = args.request;
    const op = buildContactRequestOperatorEmail(
      { name, email, phone, preferredContact, subject, toelichting: message },
      { orgName: args.orgName, dashboardUrl: v1ContactRequestsUrl() },
    );
    const r = await sendEmail({
      to,
      subject: op.subject,
      html: op.html,
      text: op.text,
      // Reply-To = bezoeker-e-mail indien geldig, zodat de ondernemer direct kan
      // terugmailen (alleen relevant bij voorkeur "mailen").
      replyTo: isValidContactEmail(email) ? email : undefined,
    });
    logResult(r);
  } catch (e) {
    console.error('[v1/contact-notify] onverwachte fout', (e as Error).message);
  }
}
