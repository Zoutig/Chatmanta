'use client';

// V1 klant-feedbackformulier (V1-ontwerplaag). Zelfde velden, validatie en
// action als de V0-fork: submitFeedbackV1Action met FormData. Urgentie zit als
// verborgen input in het formulier; de bijlage gaat als bestand mee.

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, Paperclip } from 'lucide-react';
import { submitFeedbackV1Action } from './actions';
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABELS,
  type FeedbackType,
  type FeedbackUrgency,
} from '@/lib/controlroom/types';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_MB,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
} from '@/lib/controlroom/feedback-validate';
import { Button, buttonClass } from '@/app/v1/_ui/button';
import { Field, Segmented } from '@/app/v1/_ui/controls';

const URGENCY_OPTIONS: { value: FeedbackUrgency; label: string; help: string }[] = [
  { value: 'low', label: 'Laag', help: 'Geen haast, wanneer het uitkomt.' },
  { value: 'normal', label: 'Normaal', help: 'Graag binnen een paar dagen.' },
  { value: 'high', label: 'Hoog', help: 'De chatbot werkt niet of geeft ernstig onjuiste info.' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function FeedbackForm({
  initialName = '',
  initialEmail = '',
}: {
  initialName?: string;
  initialEmail?: string;
} = {}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<FeedbackType | ''>('');
  const [urgency, setUrgency] = useState<FeedbackUrgency | ''>('');
  const [description, setDescription] = useState('');
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [privacy, setPrivacy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const emailOk = EMAIL_RE.test(email.trim());
  const canSubmit =
    type !== '' &&
    urgency !== '' &&
    description.trim().length >= DESCRIPTION_MIN &&
    name.trim().length > 0 &&
    emailOk &&
    privacy;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFileError(null);
    if (!f) {
      setFileName(null);
      return;
    }
    if (f.size > ATTACHMENT_MAX_BYTES) {
      setFileError(`De bijlage is groter dan ${ATTACHMENT_MAX_MB} MB. Verklein hem of mail hem naar ons.`);
      e.target.value = '';
      setFileName(null);
      return;
    }
    setFileName(f.name);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !formRef.current) return;
    setError(null);
    const fd = new FormData(formRef.current);
    startTransition(async () => {
      try {
        const res = await submitFeedbackV1Action(fd);
        if (res.ok) {
          setDone(true);
        } else {
          setError(res.error);
        }
      } catch {
        setError('Versturen is niet gelukt. Probeer het zonder bijlage, of met een kleiner bestand.');
      }
    });
  }

  function reset() {
    formRef.current?.reset();
    setType('');
    setUrgency('');
    setDescription('');
    setName('');
    setEmail('');
    setPrivacy(false);
    setFileName(null);
    setFileError(null);
    setError(null);
    setDone(false);
  }

  if (done) {
    return (
      <div className="v1-fb-done" role="status">
        <div className="v1-fb-done-head">
          <span className="v1-fb-done-icon" aria-hidden="true">
            <Check size={18} strokeWidth={2.2} />
          </span>
          <div>
            <p className="v1-fb-done-title">Bedankt voor je melding</p>
            <p className="v1-fb-done-text">Niels bekijkt hem zo snel mogelijk en neemt daarna contact met je op.</p>
          </div>
        </div>
        <div className="v1-fb-done-actions">
          <Link href="/voorbeeld" className={buttonClass({ variant: 'primary', size: 'sm' })}>
            Terug naar het overzicht
          </Link>
          <Button variant="ghost" size="sm" onClick={reset}>
            Nog een melding
          </Button>
        </div>
      </div>
    );
  }

  const urgencyHelp =
    URGENCY_OPTIONS.find((o) => o.value === urgency)?.help ?? 'Hoe snel moet dit worden opgepakt?';

  return (
    <form ref={formRef} onSubmit={onSubmit} className="v1-form v1-fb-form">
      <Field label="Wat wil je melden?">
        {(id) => (
          <select
            id={id}
            name="type"
            className="v1-input v1-input--medium"
            value={type}
            onChange={(e) => setType(e.target.value as FeedbackType)}
            required
          >
            <option value="" disabled>
              Kies een type
            </option>
            {FEEDBACK_TYPES.map((t) => (
              <option key={t} value={t}>
                {FEEDBACK_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="v1-field">
        <span className="v1-label">Hoe urgent is dit?</span>
        <Segmented<FeedbackUrgency | ''>
          label="Hoe urgent is dit?"
          value={urgency}
          options={URGENCY_OPTIONS}
          onChange={setUrgency}
        />
        <input type="hidden" name="urgency" value={urgency} />
        <p className="v1-hint">{urgencyHelp}</p>
      </div>

      <Field
        label="Beschrijving"
        hint={`Wat deed je, wat zag je, wat had je verwacht? Minimaal ${DESCRIPTION_MIN} tekens (${description.trim().length}/${DESCRIPTION_MAX}).`}
      >
        {(id) => (
          <textarea
            id={id}
            name="description"
            className="v1-input"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
            placeholder="Wat is er gebeurd?"
            required
          />
        )}
      </Field>

      <div className="v1-edit-grid">
        <Field label="Naam">
          {(id) => (
            <input
              id={id}
              name="name"
              className="v1-input"
              placeholder="Jouw naam"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
        </Field>
        <Field label="E-mailadres" hint="Voor een reactie op je melding.">
          {(id) => (
            <input
              id={id}
              name="email"
              type="email"
              className="v1-input"
              placeholder="jouw@bedrijf.nl"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
        </Field>
      </div>

      <div className="v1-edit-grid">
        <Field label="Chat-ID (optioneel)" hint="Staat bij het gesprek onder Gesprekken.">
          {(id) => <input id={id} name="chatId" className="v1-input" placeholder="Bijv. chat_abc123" />}
        </Field>
        <Field label="Gestelde vraag (optioneel)" hint="De vraag zoals de bezoeker hem typte.">
          {(id) => (
            <input
              id={id}
              name="question"
              className="v1-input"
              placeholder="Bijv. Wat zijn jullie openingstijden?"
            />
          )}
        </Field>
      </div>

      <div className="v1-field">
        <span className="v1-label">Screenshot of bijlage (optioneel)</span>
        <div className="v1-fb-file">
          <label className={`${buttonClass({ variant: 'secondary', size: 'sm' })} v1-fb-file-btn`}>
            <Paperclip size={16} strokeWidth={1.8} aria-hidden="true" />
            {fileName ? 'Ander bestand kiezen' : 'Bestand kiezen'}
            <input
              type="file"
              name="attachment"
              accept={ATTACHMENT_ACCEPT}
              onChange={onFileChange}
              className="v1-sr-only"
            />
          </label>
          {fileName ? <span className="v1-fb-file-name">{fileName}</span> : null}
        </div>
        {fileError ? (
          <p className="v1-alert v1-alert--error" role="alert">
            {fileError}
          </p>
        ) : (
          <p className="v1-hint">JPG, PNG, GIF, WEBP of PDF, tot {ATTACHMENT_MAX_MB} MB.</p>
        )}
      </div>

      <label className="v1-fb-check">
        <input
          type="checkbox"
          name="privacy"
          checked={privacy}
          onChange={(e) => setPrivacy(e.target.checked)}
          required
        />
        <span>
          Ik ga akkoord met de{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            privacyverklaring
          </a>{' '}
          van ChatManta.
        </span>
      </label>

      {error ? (
        <p className="v1-alert v1-alert--error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="v1-fb-submit">
        <Button type="submit" loading={pending} disabled={!canSubmit}>
          Feedback versturen
        </Button>
      </div>
    </form>
  );
}
