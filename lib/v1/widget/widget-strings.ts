// Vaste teksten van de V1-widget in NL en EN (2026-10-14). De antwoorden volgen al de
// taal van de bezoeker (autoDetectLanguage); zonder dit bleef de widget eromheen
// Nederlands ("Typ je vraag…") voor een Engelse bezoeker.
//
// Bewust alleen nl/en: Engels is de lingua franca voor elke niet-Nederlandstalige
// bezoeker. Teksten die de klant zelf invult (welkomstbericht, startvragen, titel)
// vallen hierbuiten.

export type WidgetLang = 'nl' | 'en';

/**
 * Hoe de embed-pagina de taal kiest:
 *   'auto' — volg de browser van de bezoeker (chatbot spiegelt de taal);
 *   'nl' / 'en' — vast (chatbot antwoordt altijd in die taal).
 */
export type WidgetUiLanguage = 'auto' | WidgetLang;

/** Afgeleid uit de chatbot-instellingen. Vaste taal buiten nl/en → nl-teksten. */
export function widgetUiLanguage(settings: { autoDetectLanguage: boolean; primaryLanguage: string }): WidgetUiLanguage {
  if (settings.autoDetectLanguage) return 'auto';
  return settings.primaryLanguage === 'en' ? 'en' : 'nl';
}

/** Browsertalen (navigator.languages) → nl als de eerste taal Nederlands is, anders en. */
export function resolveWidgetLang(ui: WidgetUiLanguage, browserLanguages: readonly string[] | undefined): WidgetLang {
  if (ui !== 'auto') return ui;
  const first = browserLanguages?.find((l) => typeof l === 'string' && l.trim().length > 0);
  if (!first) return 'nl';
  return first.toLowerCase().startsWith('nl') ? 'nl' : 'en';
}

export type WidgetStrings = {
  inputPlaceholder: string;
  inputLabel: string;
  send: string;
  openChat: string;
  closeChat: string;
  typing: string;
  retry: string;
  poweredBy: string;
  unavailable: string;
  failed: string;
  dropped: string;
  contactCta: string;
  contactThanks: string;
  contactTitle: string;
  contactName: string;
  contactHow: string;
  contactEmail: string;
  contactPhone: string;
  contactEmailAddress: string;
  contactPhoneNumber: string;
  contactMessage: string;
  contactSubject: string;
  /** Bevat de placeholder {org}; vul in via contactConsentText (AVG: aan wie, waarvoor, hoe lang). */
  contactConsent: string;
  /** Vervangt {org} als de widget geen bedrijfsnaam kent. */
  contactConsentOrgFallback: string;
  contactCancel: string;
  contactSend: string;
  contactSending: string;
  contactFailed: string;
};

export const WIDGET_STRINGS: Record<WidgetLang, WidgetStrings> = {
  nl: {
    inputPlaceholder: 'Typ je vraag…',
    inputLabel: 'Je vraag',
    send: 'Versturen',
    openChat: 'Chat openen',
    closeChat: 'Chat sluiten',
    typing: 'Aan het typen',
    retry: 'Opnieuw proberen',
    poweredBy: 'Mogelijk gemaakt door ChatManta',
    unavailable: 'Deze chat is even niet beschikbaar.',
    failed: 'Er ging iets mis. Probeer het zo nog eens.',
    dropped: 'De verbinding viel weg.',
    contactCta: 'Liever persoonlijk contact?',
    contactThanks: 'Bedankt! We nemen zo snel mogelijk contact met je op.',
    contactTitle: 'Persoonlijk contact',
    contactName: 'Naam',
    contactHow: 'Hoe wil je contact?',
    contactEmail: 'E-mail',
    contactPhone: 'Telefoon',
    contactEmailAddress: 'E-mailadres',
    contactPhoneNumber: 'Telefoonnummer',
    contactMessage: 'Bericht (optioneel)',
    contactSubject: 'Onderwerp (optioneel)',
    // Bewust GEEN bewaartermijn: de V1-retentie-pinger draait nog niet (V1_LAUNCH_TODO
    // #7c) en de notificatiemail valt buiten ChatManta's beheer. Pas terugzetten als
    // dat allebei waar is.
    contactConsent:
      'Ik geef {org} toestemming mijn naam, contactgegevens, onderwerp en bericht te gebruiken om contact met mij op te nemen over mijn vraag.',
    contactConsentOrgFallback: 'het bedrijf achter deze website',
    contactCancel: 'Annuleren',
    contactSend: 'Versturen',
    contactSending: 'Versturen…',
    contactFailed: 'Versturen lukte niet. Probeer het zo nog eens.',
  },
  en: {
    inputPlaceholder: 'Type your question…',
    inputLabel: 'Your question',
    send: 'Send',
    openChat: 'Open chat',
    closeChat: 'Close chat',
    typing: 'Typing',
    retry: 'Try again',
    poweredBy: 'Powered by ChatManta',
    unavailable: 'This chat is temporarily unavailable.',
    failed: 'Something went wrong. Please try again in a moment.',
    dropped: 'The connection was lost.',
    contactCta: 'Prefer personal contact?',
    contactThanks: 'Thank you! We will get back to you as soon as possible.',
    contactTitle: 'Personal contact',
    contactName: 'Name',
    contactHow: 'How would you like to be contacted?',
    contactEmail: 'Email',
    contactPhone: 'Phone',
    contactEmailAddress: 'Email address',
    contactPhoneNumber: 'Phone number',
    contactMessage: 'Message (optional)',
    contactSubject: 'Subject (optional)',
    contactConsent:
      'I allow {org} to use my name, contact details, subject and message to get in touch with me about my question.',
    contactConsentOrgFallback: 'the company behind this website',
    contactCancel: 'Cancel',
    contactSend: 'Send',
    contactSending: 'Sending…',
    contactFailed: 'Sending failed. Please try again in a moment.',
  },
};

/** Max. lengte van de bedrijfsnaam in de toestemmingstekst (layout-vangnet). */
export const CONSENT_ORG_MAX = 120;

/**
 * Toestemmingstekst van het contactformulier met de bedrijfsnaam ingevuld: de
 * bezoeker ziet aan wie de gegevens gaan (de klant = verwerkingsverantwoordelijke),
 * welke gegevens en waarvoor. Geen naam → neutrale omschrijving.
 * Wordt als React-tekst gerenderd (geen HTML), dus de naam hoeft niet ge-escaped.
 * Vervanging via een functie: een `$&`/`$1` in de naam mag geen vervangpatroon zijn.
 */
export function contactConsentText(t: WidgetStrings, orgName: string | null | undefined): string {
  const name = (orgName ?? '').replace(/\s+/g, ' ').trim().slice(0, CONSENT_ORG_MAX).trim();
  return t.contactConsent.replace('{org}', () => name || t.contactConsentOrgFallback);
}

/** Max. lengte van het onderwerp — gelijk aan SUBJECT_MAX in contact-validate. */
export const CONTACT_SUBJECT_MAX = 300;

/**
 * Voorgevuld onderwerp voor het contactformulier: de laatste vraag die de bezoeker
 * in dit gesprek stelde (zodat de ondernemer weet waar het over gaat). De bezoeker
 * ziet het veld en kan het aanpassen of leegmaken. Geen vraag → ''.
 */
export function lastVisitorQuestion(messages: readonly { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const q = m.content.replace(/\s+/g, ' ').trim();
    if (q) return q.slice(0, CONTACT_SUBJECT_MAX).trim();
  }
  return '';
}
