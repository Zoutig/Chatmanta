// Schrijft de V1 Supabase Auth-mailtemplates (uitnodiging, wachtwoord-reset,
// e-mail wijzigen) in de ChatManta-huisstijl naar supabase/auth-email-templates-v1/.
// Die HTML plak je in Supabase → V1-prod → Authentication → Email Templates
// (er is geen management-token voor de auth-config-API).
//
//   npm run email:templates                      # alleen de Auth-templates
//   npm run email:templates -- --preview=<map>   # + voorbeeldversies van alle app-mails
//
// Links volgen de vastgelegde keuze (docs/AGENT_LANDMIJNEN.md, Supabase-auth):
// invite op {{ .SiteURL }}, recovery en email_change hardcoded op www.chatmanta.nl,
// altijd via /v1/auth/confirm?token_hash=…&type=… (nooit {{ .ConfirmationURL }}).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  emailButton,
  emailHeading,
  emailLayout,
  emailParagraph,
  emailSignoff,
} from '@/lib/notifications/email-layout';
import { buildContactRequestOperatorEmail } from '@/lib/notifications/contact-request-email';
import { buildFeedbackReplyEmail, buildOperatorEmail, buildSubmitterEmail } from '@/lib/notifications/feedback-email';
import { buildLeadConfirmationEmail, buildLeadNotificationEmail } from '@/lib/site/kennismaking';
import type { FeedbackItem } from '@/lib/controlroom/types';

const CONFIRM = 'https://www.chatmanta.nl/v1/auth/confirm?token_hash={{ .TokenHash }}';
const SIGNOFF = emailSignoff(['Groet,', 'Team ChatManta']);
const IGNORE = (what: string) =>
  emailParagraph(`Heb je dit niet aangevraagd? Dan kun je deze mail negeren; ${what}`, { muted: true });

const AUTH_TEMPLATES: { file: string; subject: string; html: string }[] = [
  {
    file: 'invite.html',
    subject: 'Je bent uitgenodigd voor ChatManta',
    html: emailLayout({
      title: 'Je bent uitgenodigd voor ChatManta',
      preheader: 'Activeer je account en stel je wachtwoord in.',
      footerNote: 'Je ontvangt deze mail omdat iemand je heeft uitgenodigd voor een ChatManta-account.',
      body: [
        emailHeading('Welkom bij ChatManta'),
        emailParagraph(
          'Je bent uitgenodigd voor het ChatManta-dashboard. Daar beheer je de chatbot op je website: wat hij weet, hoe hij eruitziet en welke vragen bezoekers stellen.',
        ),
        emailParagraph('Klik op de knop om je account te activeren en een wachtwoord in te stellen.'),
        emailButton('{{ .SiteURL }}/v1/auth/confirm?token_hash={{ .TokenHash }}&type=invite', 'Account activeren'),
        IGNORE('er wordt dan geen account voor je aangemaakt.'),
        SIGNOFF,
      ].join('\n'),
    }),
  },
  {
    file: 'recovery.html',
    subject: 'Stel een nieuw wachtwoord in voor ChatManta',
    html: emailLayout({
      title: 'Stel een nieuw wachtwoord in',
      preheader: 'Gebruik de knop om een nieuw wachtwoord in te stellen.',
      footerNote: 'Je ontvangt deze mail omdat er een nieuw wachtwoord is aangevraagd voor je ChatManta-account.',
      body: [
        emailHeading('Nieuw wachtwoord instellen'),
        emailParagraph('We kregen een verzoek om het wachtwoord van je ChatManta-account opnieuw in te stellen.'),
        emailButton(`${CONFIRM}&type=recovery`, 'Nieuw wachtwoord instellen'),
        IGNORE('je huidige wachtwoord blijft gewoon werken.'),
        SIGNOFF,
      ].join('\n'),
    }),
  },
  {
    file: 'email-change.html',
    subject: 'Bevestig je nieuwe e-mailadres voor ChatManta',
    html: emailLayout({
      title: 'Bevestig je nieuwe e-mailadres',
      preheader: 'Bevestig de wijziging van je e-mailadres.',
      footerNote: 'Je ontvangt deze mail omdat het e-mailadres van een ChatManta-account is gewijzigd.',
      body: [
        emailHeading('Bevestig je nieuwe e-mailadres'),
        emailParagraph(
          'Je wilt het e-mailadres van je ChatManta-account wijzigen van <strong>{{ .Email }}</strong> naar <strong>{{ .NewEmail }}</strong>.',
        ),
        emailButton(`${CONFIRM}&type=email_change`, 'Wijziging bevestigen'),
        IGNORE('je e-mailadres blijft dan ongewijzigd.'),
        SIGNOFF,
      ].join('\n'),
    }),
  },
];

const outDir = join(process.cwd(), 'supabase', 'auth-email-templates-v1');
mkdirSync(outDir, { recursive: true });
for (const t of AUTH_TEMPLATES) {
  writeFileSync(join(outDir, t.file), `${t.html}\n`);
  console.log(`✓ ${t.file}  (onderwerp: ${t.subject})`);
}

const previewArg = process.argv.find((a) => a.startsWith('--preview='));
if (previewArg) {
  const dir = previewArg.slice('--preview='.length);
  mkdirSync(dir, { recursive: true });
  const fb = {
    id: 'voorbeeld',
    type: 'bug',
    urgency: 'high',
    status: 'nieuw',
    description: 'De widget opent niet op mijn telefoon. Op de laptop werkt alles prima.',
    submitterName: 'Anna de Vries',
    submitterEmail: 'anna@voorbeeld.nl',
    chatId: null,
    question: 'Wat zijn jullie openingstijden?',
  } as unknown as FeedbackItem;
  const lead = {
    naam: 'Anna de Vries',
    bedrijf: 'Bakkerij De Korenaar',
    website: 'https://www.voorbeeld.nl',
    email: 'anna@voorbeeld.nl',
    telefoon: '06 12345678',
    pakket: 'onbekend',
    bron: null,
    bericht: 'We krijgen veel dezelfde vragen over bestellen en levertijden.',
  } as unknown as Parameters<typeof buildLeadNotificationEmail>[0];
  const previews: Record<string, string> = {
    'kennismaking-notificatie': buildLeadNotificationEmail(lead).html,
    'kennismaking-bevestiging': buildLeadConfirmationEmail(lead, {
      replyTo: 'info@chatmanta.com',
      demoUrl: 'https://www.chatmanta.nl/voorbeeld',
    }).html,
    'feedback-operator': buildOperatorEmail(fb, { orgName: 'Bakkerij De Korenaar', adminUrl: 'https://www.chatmanta.nl' }).html,
    'feedback-bevestiging': buildSubmitterEmail(fb).html,
    'feedback-reactie': buildFeedbackReplyEmail(fb, 'Dank je! We hebben het opgelost, probeer het gerust opnieuw.', {
      orgName: 'Bakkerij De Korenaar',
    }).html,
    'contactverzoek': buildContactRequestOperatorEmail(
      {
        name: 'Jan Jansen',
        email: 'jan@voorbeeld.nl',
        phone: '06 87654321',
        preferredContact: 'call',
        subject: 'Bruidstaart bestellen',
        toelichting: 'Ik wil graag een bruidstaart voor 80 personen bestellen in juni.',
      },
      { orgName: 'Bakkerij De Korenaar', dashboardUrl: 'https://www.chatmanta.nl' },
    ).html,
    ...Object.fromEntries(AUTH_TEMPLATES.map((t) => [`auth-${t.file.replace('.html', '')}`, t.html])),
  };
  for (const [name, html] of Object.entries(previews)) writeFileSync(join(dir, `${name}.html`), html);
  console.log(`✓ ${Object.keys(previews).length} voorbeelden in ${dir}`);
}
