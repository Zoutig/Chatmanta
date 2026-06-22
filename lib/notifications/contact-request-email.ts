// Pure bouwer voor de "nieuw contactverzoek"-operator-mail. Geen IO/secrets →
// los unit-testbaar. Het daadwerkelijke verzenden (gated op RESEND_API_KEY)
// gebeurt in lib/notifications/email.ts, georkestreerd door
// lib/notifications/contact-request-notify.ts. Spiegel van feedback-email.ts.

import type { ContactRequest, PreferredContact } from '@/lib/v0/klantendashboard/types';

const PREFERRED_LABELS: Record<PreferredContact, string> = {
  call: 'Bellen',
  email: 'Mailen',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reply-To-validatie: hergebruikt dezelfde regel als feedback-email; bewust een
 *  eigen kopie zodat deze builder PII-vrij en zonder feedback-types blijft. */
export function isValidContactEmail(email: string | null | undefined): email is string {
  return !!email && EMAIL_RE.test(email);
}

/** Absolute URL naar de klantendashboard-tab. Base uit NEXT_PUBLIC_APP_URL
 *  (fallback = productie-domein). Het klantendashboard resolvet de actieve org
 *  uit de cookie, dus een per-id deep-link bestaat (nog) niet — we linken naar
 *  de lijst-tab. */
export function contactRequestsDashboardUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.chatmanta.nl').replace(/\/+$/, '');
  return `${base}/klantendashboard/contactverzoeken`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type BuiltEmail = { subject: string; html: string; text: string };

/** Interne notificatie naar de ondernemer/operator over een nieuw contactverzoek.
 *  Geen PII-redactie: dit gaat naar de eigenaar van de org en de bezoeker-gegevens
 *  zijn juist nodig om contact op te nemen. `req` is service-role-geleverd; de
 *  vrije-tekst-velden worden ge-escaped tegen HTML-injectie in de mailclient. */
export function buildContactRequestOperatorEmail(
  req: ContactRequest,
  opts: { orgName: string; dashboardUrl: string },
): BuiltEmail {
  const preferredLabel = PREFERRED_LABELS[req.preferredContact];
  const subject = `[ChatManta] Nieuw contactverzoek · ${req.name} · ${opts.orgName}`;
  const rows: [string, string][] = [
    ['Org', opts.orgName],
    ['Naam', req.name],
    ['Voorkeur', preferredLabel],
    ['E-mail', req.email || 'niet opgegeven'],
    ['Telefoon', req.phone || 'niet opgegeven'],
    ['Onderwerp', req.subject || 'geen'],
  ];
  const text = [
    `Nieuw contactverzoek via ChatManta (${opts.orgName})`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    req.toelichting ? 'Toelichting:' : '',
    req.toelichting ?? '',
    '',
    `Bekijk en behandel: ${opts.dashboardUrl}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px">
      <h2 style="margin:0 0 12px;font-size:17px">Nieuw contactverzoek · ${esc(opts.orgName)}</h2>
      <table style="border-collapse:collapse;font-size:13px;margin-bottom:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
      </table>
      ${
        req.toelichting
          ? `<div style="font-weight:600;margin-bottom:4px">Toelichting</div><div style="white-space:pre-wrap;background:#f6f6f6;border-radius:8px;padding:10px 12px;margin-bottom:16px">${esc(req.toelichting)}</div>`
          : ''
      }
      <a href="${esc(opts.dashboardUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px">Contactverzoek bekijken →</a>
    </div>`.trim();
  return { subject, html, text };
}
