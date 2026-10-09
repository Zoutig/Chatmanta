'use client';

// Contactformulier van de V1-widget. Verplaatst uit v1-widget.tsx en in de
// Diepzee-stijl gezet; state, validatie, honeypot en payload zijn ongewijzigd.
// De submit (token, refresh-op-401, route) zit bij de aanroeper.

import { useState } from 'react';

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
}: {
  onCancel: () => void;
  onSubmit: (payload: ContactPayload) => Promise<boolean>;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
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
      subject: null,
      message: message.trim() || null,
      company_url: honeypot,
    });
    setSending(false);
    if (ok) onDone();
    else setError('Versturen lukte niet. Probeer het zo nog eens.');
  };

  return (
    <form
      className="cmw-contact"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="cmw-contact-title">Persoonlijk contact</p>

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
        Naam
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="name" />
      </label>

      <div className="cmw-choice" role="radiogroup" aria-label="Hoe wil je contact?">
        <label>
          <input type="radio" name="cmw-prefer" checked={preferred === 'email'} onChange={() => setPreferred('email')} />
          E-mail
        </label>
        <label>
          <input type="radio" name="cmw-prefer" checked={preferred === 'call'} onChange={() => setPreferred('call')} />
          Telefoon
        </label>
      </div>

      {preferred === 'email' ? (
        <label className="cmw-field">
          E-mailadres
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} autoComplete="email" />
        </label>
      ) : (
        <label className="cmw-field">
          Telefoonnummer
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} autoComplete="tel" />
        </label>
      )}

      <label className="cmw-field">
        Bericht (optioneel)
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} />
      </label>

      <label className="cmw-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Ik geef toestemming om mijn gegevens te gebruiken om contact met mij op te nemen.</span>
      </label>

      {error ? (
        <p className="cmw-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="cmw-form-actions">
        <button type="button" className="cmw-btn-ghost" onClick={onCancel}>
          Annuleren
        </button>
        <button type="submit" className="cmw-btn-primary" disabled={!valid || sending}>
          {sending ? 'Versturen…' : 'Versturen'}
        </button>
      </div>
    </form>
  );
}
