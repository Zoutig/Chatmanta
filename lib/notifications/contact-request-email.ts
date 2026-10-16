// Pure bouwer voor de "nieuw contactverzoek"-operator-mail. Geen IO/secrets →
// los unit-testbaar. Het daadwerkelijke verzenden (gated op RESEND_API_KEY)
// gebeurt in lib/notifications/email.ts, georkestreerd door
// lib/notifications/contact-request-notify.ts. Spiegel van feedback-email.ts.

import type { ContactRequest, PreferredContact } from '@/lib/v0/klantendashboard/types';
import { emailButton, emailDetails, emailHeading, emailLayout, emailQuote } from '@/lib/notifications/email-layout';

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
  return `${base}/v0/klantendashboard/contactverzoeken`;
}

export type BuiltEmail = { subject: string; html: string; text: string };

/** Interne notificatie naar de ondernemer/operator over een nieuw contactverzoek.
 *  Geen PII-redactie: dit gaat naar de eigenaar van de org en de bezoeker-gegevens
 *  zijn juist nodig om contact op te nemen. `req` is service-role-geleverd; de
 *  vrije-tekst-velden worden ge-escaped tegen HTML-injectie in de mailclient.
 *  Param = alléén de velden die de mail toont (Pick), zodat zowel de V0- als de
 *  V1-notify-laag 'm kan voeden zonder een volledige rij-shape na te maken. */
export function buildContactRequestOperatorEmail(
  req: Pick<ContactRequest, 'name' | 'email' | 'phone' | 'preferredContact' | 'subject' | 'toelichting'>,
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
  const html = emailLayout({
    title: subject,
    preheader: `${req.name} wil ${preferredLabel === 'Bellen' ? 'gebeld' : 'gemaild'} worden${req.subject ? ` · ${req.subject}` : ''}`,
    body: [
      emailHeading(`Nieuw contactverzoek · ${opts.orgName}`),
      emailDetails(rows),
      req.toelichting ? emailQuote('Toelichting', req.toelichting) : '',
      emailButton(opts.dashboardUrl, 'Contactverzoek bekijken'),
    ].join('\n'),
  });
  return { subject, html, text };
}
