// Pure bouwers voor de feedback-e-mails (operator-notificatie + indiener-bevestiging).
// Geen IO/secrets → los unit-testbaar. Het daadwerkelijke verzenden (gated op
// RESEND_API_KEY) gebeurt in lib/notifications/email.ts, georkestreerd door
// lib/notifications/feedback-notify.ts.

import type { FeedbackItem } from '@/lib/controlroom/types';
import {
  emailButton,
  emailDetails,
  emailHeading,
  emailLayout,
  emailParagraph,
  emailQuote,
  emailSignoff,
  esc,
} from '@/lib/notifications/email-layout';
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_URGENCY_LABELS,
} from '@/lib/controlroom/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidFeedbackEmail(email: string | null | undefined): email is string {
  return !!email && EMAIL_RE.test(email);
}

/** Absolute URL naar de operator-detailpagina. Base uit NEXT_PUBLIC_APP_URL
 *  (fallback = productie-domein). */
export function feedbackAdminUrl(id: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.chatmanta.nl').replace(/\/+$/, '');
  return `${base}/v0/admindashboard/feedback/${id}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export type BuiltEmail = { subject: string; html: string; text: string };

/** Interne notificatie naar de operator (Niels). Geen PII-redactie: dit gaat naar
 *  het eigen team en de indiener-gegevens zijn juist nodig voor triage. */
export function buildOperatorEmail(item: FeedbackItem, opts: { orgName: string; adminUrl: string }): BuiltEmail {
  const typeLabel = FEEDBACK_TYPE_LABELS[item.type];
  const subject = `[ChatManta] Nieuwe melding · ${typeLabel} · ${opts.orgName}`;
  const rows: [string, string][] = [
    ['Org', opts.orgName],
    ['Type', typeLabel],
    ['Urgentie', FEEDBACK_URGENCY_LABELS[item.urgency]],
    ['Status', FEEDBACK_STATUS_LABELS[item.status]],
    ['Ingediend door', item.submitterName || 'niet opgegeven'],
    ['E-mail', item.submitterEmail || 'niet opgegeven'],
    ['Chat-ID', item.chatId || 'geen'],
  ];
  const text = [
    `Nieuwe melding in ChatManta (${opts.orgName})`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Beschrijving:',
    item.description,
    item.question ? `\nGestelde vraag: ${item.question}` : '',
    '',
    `Bekijk en behandel: ${opts.adminUrl}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
  const html = emailLayout({
    title: subject,
    preheader: `${typeLabel} · ${FEEDBACK_URGENCY_LABELS[item.urgency]} · ${truncate(item.description, 80)}`,
    body: [
      emailHeading(`Nieuwe melding · ${opts.orgName}`),
      emailDetails(rows),
      emailQuote('Beschrijving', item.description),
      item.question ? emailQuote('Gestelde vraag', item.question) : '',
      emailButton(opts.adminUrl, 'Melding behandelen'),
    ].join('\n'),
  });
  return { subject, html, text };
}

/** Operator-reactie naar de indiener (Niels antwoordt vanuit een melding).
 *  Bevat UITSLUITEND de zelf-getypte reactietekst — nooit interne notities of
 *  de event-historie. Voettekst legt uit waarom de ontvanger deze mail krijgt
 *  (AVG-transparantie). `replyText` is operator-input, wordt geëscaped. */
export function buildFeedbackReplyEmail(
  item: FeedbackItem,
  replyText: string,
  opts: { orgName: string },
): BuiltEmail {
  const subject = `Reactie op je feedback · ${opts.orgName}`;
  const greeting = item.submitterName ? `Hoi ${item.submitterName},` : 'Hoi,';
  const footer = `Je ontvangt deze e-mail omdat je feedback hebt ingediend bij ${opts.orgName} via ChatManta.`;
  const text = [
    greeting,
    '',
    replyText.trim(),
    '',
    'Met vriendelijke groet,',
    'Team ChatManta',
    '',
    footer,
  ].join('\n');
  const html = emailLayout({
    title: subject,
    preheader: truncate(replyText.trim(), 100),
    footerNote: footer,
    body: [
      emailParagraph(esc(greeting)),
      `<div style="margin:0 0 16px;font-size:15px;line-height:1.6;white-space:pre-wrap;word-break:break-word">${esc(replyText.trim())}</div>`,
      emailSignoff(['Met vriendelijke groet,', 'Team ChatManta']),
    ].join('\n'),
  });
  return { subject, html, text };
}

/** Optionele bevestiging naar de indiener (alleen bij geldig e-mailadres). */
export function buildSubmitterEmail(item: FeedbackItem): BuiltEmail {
  const subject = 'We hebben je feedback ontvangen · ChatManta';
  const greeting = item.submitterName ? `Hoi ${item.submitterName},` : 'Hoi,';
  const summary = truncate(item.description, 300);
  const text = [
    greeting,
    '',
    'Bedankt voor je melding. We hebben hem ontvangen en Niels bekijkt hem zo snel mogelijk.',
    '',
    'Samenvatting van je melding:',
    summary,
    '',
    'Je hoeft verder niets te doen. We nemen contact met je op zodra we je melding hebben bekeken.',
    '',
    'Met vriendelijke groet,',
    'Team ChatManta',
  ].join('\n');
  const html = emailLayout({
    title: subject,
    preheader: 'Bedankt voor je melding. We bekijken hem zo snel mogelijk.',
    body: [
      emailParagraph(esc(greeting)),
      emailParagraph('Bedankt voor je melding. We hebben hem ontvangen en <strong>Niels</strong> bekijkt hem zo snel mogelijk.'),
      emailQuote('Samenvatting van je melding', summary),
      emailParagraph('Je hoeft verder niets te doen. We nemen contact met je op zodra we je melding hebben bekeken.', { muted: true }),
      emailSignoff(['Met vriendelijke groet,', 'Team ChatManta']),
    ].join('\n'),
  });
  return { subject, html, text };
}
