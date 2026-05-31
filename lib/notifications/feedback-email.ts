// Pure bouwers voor de feedback-e-mails (operator-notificatie + indiener-bevestiging).
// Geen IO/secrets → los unit-testbaar. Het daadwerkelijke verzenden (gated op
// RESEND_API_KEY) gebeurt in lib/notifications/email.ts, georkestreerd door
// lib/notifications/feedback-notify.ts.

import type { FeedbackItem } from '@/lib/controlroom/types';
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
  return `${base}/admindashboard/feedback/${id}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    ['Ingediend door', item.submitterName || '—'],
    ['E-mail', item.submitterEmail || '—'],
    ['Chat-ID', item.chatId || '—'],
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
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px">
      <h2 style="margin:0 0 12px;font-size:17px">Nieuwe melding · ${esc(opts.orgName)}</h2>
      <table style="border-collapse:collapse;font-size:13px;margin-bottom:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
      </table>
      <div style="font-weight:600;margin-bottom:4px">Beschrijving</div>
      <div style="white-space:pre-wrap;background:#f6f6f6;border-radius:8px;padding:10px 12px;margin-bottom:${item.question ? '10px' : '16px'}">${esc(item.description)}</div>
      ${item.question ? `<div style="font-weight:600;margin-bottom:4px">Gestelde vraag</div><div style="background:#f6f6f6;border-radius:8px;padding:10px 12px;margin-bottom:16px">${esc(item.question)}</div>` : ''}
      <a href="${esc(opts.adminUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px">Melding behandelen →</a>
    </div>`.trim();
  return { subject, html, text };
}

/** Optionele bevestiging naar de indiener (alleen bij geldig e-mailadres). */
export function buildSubmitterEmail(item: FeedbackItem): BuiltEmail {
  const subject = 'We hebben je feedback ontvangen — ChatManta';
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
    'Je hoeft niets te doen — we nemen contact met je op zodra we je melding hebben bekeken.',
    '',
    'Met vriendelijke groet,',
    'Team ChatManta',
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px">
      <p>${esc(greeting)}</p>
      <p>Bedankt voor je melding. We hebben hem ontvangen en <strong>Niels</strong> bekijkt hem zo snel mogelijk.</p>
      <div style="font-weight:600;margin:14px 0 4px">Samenvatting van je melding</div>
      <div style="white-space:pre-wrap;background:#f6f6f6;border-radius:8px;padding:10px 12px">${esc(summary)}</div>
      <p style="color:#666;margin-top:14px">Je hoeft niets te doen — we nemen contact met je op zodra we je melding hebben bekeken.</p>
      <p style="margin-top:16px">Met vriendelijke groet,<br/>Team ChatManta</p>
    </div>`.trim();
  return { subject, html, text };
}
