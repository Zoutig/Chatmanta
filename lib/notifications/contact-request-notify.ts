import 'server-only';

// E-mailnotificatie bij een nieuw contactverzoek. Volledig fail-safe spiegel van
// feedback-notify: de verzendpoging is gated op RESEND_API_KEY (no-op zonder key)
// en faalt stil. notifyNewContactRequest gooit NOOIT; de caller (de submit-route,
// via after()) hoeft 'm alleen te awaiten en mag een fout negeren. Het verzoek is
// op dat moment al opgeslagen — de DB is bron-van-waarheid, de mail best-effort.
//
// ADRES-KETEN (eerste niet-lege wint):
//   1. getContactRequestsSettings(slug).notificationEmail  — per-org override
//   2. getAccountOverrides(slug).email                     — account-mailadres
//   3. process.env.CONTACT_REQUEST_NOTIFY_EMAIL            — globale fallback
//   4. geen adres → captureError('CONTACT_NOTIFY_NO_ADDRESS') LUID, NOOIT silent.
// Anders dan feedback-notify is er GEEN harde default-ontvanger: een verzoek voor
// org A mag nooit stil naar een generiek adres lekken.

import type { ContactRequest } from '@/lib/v0/klantendashboard/types';
import type { OrgSlug } from '@/lib/v0/server/active-org';
import {
  getAccountOverrides,
  getContactRequestsSettings,
} from '@/lib/v0/klantendashboard/server/settings';
import { captureError } from '@/lib/v0/server/error-capture';
import { sendEmail, type SendEmailResult } from './email';
import {
  buildContactRequestOperatorEmail,
  contactRequestsDashboardUrl,
  isValidContactEmail,
} from './contact-request-email';

function logResult(kind: string, r: SendEmailResult): void {
  if (r.ok) console.log(`[contact-notify] ${kind} verzonden (id=${r.id ?? 'n/a'})`);
  else if (r.skipped) console.log(`[contact-notify] ${kind} overgeslagen (${r.reason})`);
  else console.error(`[contact-notify] ${kind} mislukt: ${r.error}`);
}

/** Resolve het meldingsadres via de 3-traps keten. Geen geldig adres → null
 *  (de caller logt dat luid). Throwt nooit: een mislukte settings-read mag de
 *  fail-safe niet doorbreken. */
async function resolveNotifyAddress(orgSlug: OrgSlug): Promise<string | null> {
  try {
    const settings = await getContactRequestsSettings(orgSlug);
    if (isValidContactEmail(settings.notificationEmail)) return settings.notificationEmail;
  } catch (e) {
    console.error('[contact-notify] settings-read faalde', (e as Error).message);
  }
  try {
    const account = await getAccountOverrides(orgSlug);
    if (isValidContactEmail(account.email)) return account.email;
  } catch (e) {
    console.error('[contact-notify] account-read faalde', (e as Error).message);
  }
  const envAddr = process.env.CONTACT_REQUEST_NOTIFY_EMAIL;
  if (isValidContactEmail(envAddr)) return envAddr;
  return null;
}

/** Notificeer de ondernemer over een nieuw contactverzoek. Fail-safe: gooit nooit
 *  en blokkeert de submit nooit. */
export async function notifyNewContactRequest(
  req: ContactRequest,
  orgName: string,
  orgSlug: OrgSlug,
): Promise<void> {
  try {
    const to = await resolveNotifyAddress(orgSlug);
    if (!to) {
      // LUID loggen (geen silent skip): zonder ontvanger ziet de ondernemer het
      // verzoek alleen in het dashboard. Geen PII in de logregel (alleen org-slug
      // + verzoek-id). Het verzoek zelf staat al opgeslagen.
      captureError({
        surface: 'api',
        severity: 'error',
        code: 'CONTACT_NOTIFY_NO_ADDRESS',
        message: `Geen meldingsadres voor contactverzoek (org=${orgSlug})`,
        organizationId: null,
        context: { route: '/api/v0/contact-request', requestId: req.id },
      });
      return;
    }

    const op = buildContactRequestOperatorEmail(req, {
      orgName,
      dashboardUrl: contactRequestsDashboardUrl(),
    });
    const r = await sendEmail({
      to,
      subject: op.subject,
      html: op.html,
      text: op.text,
      // Reply-To = bezoeker-e-mail indien geldig, zodat de ondernemer direct kan
      // terugmailen (alleen relevant bij voorkeur "mailen").
      replyTo: isValidContactEmail(req.email) ? req.email : undefined,
    });
    logResult('operator-notificatie', r);
  } catch (e) {
    console.error('[contact-notify] onverwachte fout', (e as Error).message);
  }
}
