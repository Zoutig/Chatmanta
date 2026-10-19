'use client';

// Contactformulier van de V1-widget. Verplaatst uit v1-widget.tsx en in de
// Diepzee-stijl gezet. De submit (token, refresh-op-401, route) zit bij de aanroeper.
//
// Onderwerp (2026-10-19): voorgevuld met de laatste vraag van de bezoeker
// (initialSubject), zichtbaar en aanpasbaar. Gaat mee in het bestaande `subject`-
// veld van het request (route + kolom + mail + kaart kenden het al; het formulier
// stuurde altijd null). Toestemmingstekst noemt welke gegevens en waarvoor; aan wie
// via orgName, maar de aanroepers geven die (nog) niet mee → neutrale omschrijving
// "het bedrijf achter deze website". organizations.name is een door de admin
// ingevuld veld en kan een intern label zijn; zie besluit voor Sebastiaan.

import { useState } from 'react';
import {
  CONTACT_SUBJECT_MAX,
  WIDGET_STRINGS,
  contactConsentText,
  type WidgetStrings,
} from '@/lib/v1/widget/widget-strings';

export type ContactPayload = {
  name: string;
  email: string | null;
  phone: string | null;
  preferredContact: 'call' | 'email';
  subject: string | null;
  message: string | null;
  company_url: string;
};

export function ContactForm({
  onCancel,
  onSubmit,
  onDone,
  strings: t = WIDGET_STRINGS.nl,
  orgName = null,
  initialSubject = '',
}: {
  onCancel: () => void;
  onSubmit: (payload: ContactPayload) => Promise<boolean>;
  onDone: () => void;
  strings?: WidgetStrings;
  /** Bedrijfsnaam voor de toestemmingstekst (aan wie gaan de gegevens). Leeg → neutrale tekst. */
  orgName?: string | null;
  /** Voorgevuld onderwerp (laatste bezoekersvraag); de bezoeker kan het aanpassen. */
  initialSubject?: string;
}) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState(initialSubject);
  const [preferred, setPreferred] = useState<'email' | 'call'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  // Honeypot: onzichtbaar voor mensen; bots vullen hem. Gaat 1:1 mee naar de route.
  const [honeypot, setHoneypot] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    name.trim().length > 0 &&
    consent &&
    (preferred === 'email' ? email.trim().length > 0 : phone.trim().length > 0);

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    const ok = await onSubmit({
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      preferredContact: preferred,
      subject: subject.trim() || null,
      message: message.trim() || null,
      company_url: honeypot,
    });
    setSending(false);
    if (ok) onDone();
    else setError(t.contactFailed);
  };

  return (
    <form
      className="cmw-contact"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="cmw-contact-title">{t.contactTitle}</p>

      {/* Honeypot: buiten beeld, niet focusbaar met het toetsenbord. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />

      <label className="cmw-field">
        {t.contactName}
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="name" />
      </label>

      <div className="cmw-choice" role="radiogroup" aria-label={t.contactHow}>
        <label>
          <input type="radio" name="cmw-prefer" checked={preferred === 'email'} onChange={() => setPreferred('email')} />
          {t.contactEmail}
        </label>
        <label>
          <input type="radio" name="cmw-prefer" checked={preferred === 'call'} onChange={() => setPreferred('call')} />
          {t.contactPhone}
        </label>
      </div>

      {preferred === 'email' ? (
        <label className="cmw-field">
          {t.contactEmailAddress}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} autoComplete="email" />
        </label>
      ) : (
        <label className="cmw-field">
          {t.contactPhoneNumber}
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} autoComplete="tel" />
        </label>
      )}

      <label className="cmw-field">
        {t.contactSubject}
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={CONTACT_SUBJECT_MAX} />
      </label>

      <label className="cmw-field">
        {t.contactMessage}
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} />
      </label>

      <label className="cmw-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{contactConsentText(t, orgName)}</span>
      </label>

      {error ? (
        <p className="cmw-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="cmw-form-actions">
        <button type="button" className="cmw-btn-ghost" onClick={onCancel}>
          {t.contactCancel}
        </button>
        <button type="submit" className="cmw-btn-primary" disabled={!valid || sending}>
          {sending ? t.contactSending : t.contactSend}
        </button>
      </div>
    </form>
  );
}
