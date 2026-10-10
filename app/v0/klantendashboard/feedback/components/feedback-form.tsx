'use client';

import { useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, Paperclip } from 'lucide-react';
import { submitFeedbackAction } from '../../actions';
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

const URGENCY_OPTIONS: { value: FeedbackUrgency; label: string; help: string }[] = [
  { value: 'low', label: 'Laag', help: 'Geen haast, wanneer het uitkomt' },
  { value: 'normal', label: 'Normaal', help: 'Graag binnen een paar dagen' },
  { value: 'high', label: 'Hoog', help: 'De chatbot werkt niet of geeft ernstig onjuiste info' },
];

// Kleur per urgentie (item 7): laag = neutraal, normaal = info, hoog = danger.
const URGENCY_TONE: Record<FeedbackUrgency, { bg: string; border: string; fg: string; dot: string }> = {
  low: { bg: 'var(--klant-surface-muted)', border: 'var(--klant-border-strong)', fg: 'var(--klant-ink)', dot: 'var(--klant-muted)' },
  normal: { bg: 'var(--klant-info-soft)', border: 'var(--klant-info)', fg: 'var(--klant-info)', dot: 'var(--klant-info)' },
  high: { bg: 'var(--klant-danger-soft)', border: 'var(--klant-danger)', fg: 'var(--klant-danger)', dot: 'var(--klant-danger)' },
};

// Spiegelt de server-side EMAIL_RE in lib/controlroom/feedback-validate.ts.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label className="klant-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <span className="klant-hint">{hint}</span>}
    </div>
  );
}

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
    setError(null);
    if (!f) {
      setFileName(null);
      return;
    }
    if (f.size > ATTACHMENT_MAX_BYTES) {
      setError(`De bijlage is groter dan ${ATTACHMENT_MAX_MB} MB. Verklein hem of mail hem naar ons.`);
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
        const res = await submitFeedbackAction(fd);
        if (res.ok) {
          setDone(true);
        } else {
          setError(res.error);
        }
      } catch {
        // Bv. een 413 (request-body te groot) of netwerkfout — de action zelf
        // draait dan nooit, dus zonder catch blijft het formulier stil hangen.
        setError('Versturen is niet gelukt. Probeer het zonder bijlage, of met een kleiner bestand.');
      }
    });
  }

  if (done) {
    return (
      <div className="klant-empty" style={{ textAlign: 'center' }}>
        <div className="klant-empty-icon"><Check size={22} strokeWidth={2} /></div>
        <h3 className="klant-empty-title">Bedankt voor je melding.</h3>
        <p className="klant-empty-sub" style={{ maxWidth: 440 }}>
          We hebben je feedback ontvangen. Niels bekijkt hem zo snel mogelijk en neemt
          contact met je op zodra hij je melding heeft bekeken.
        </p>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Link href="/klantendashboard" className="klant-btn" data-variant="primary">
            ← Terug naar het portaal
          </Link>
          <button
            type="button"
            className="klant-btn"
            onClick={() => {
              formRef.current?.reset();
              setType('');
              setUrgency('');
              setDescription('');
              setName('');
              setEmail('');
              setPrivacy(false);
              setFileName(null);
              setDone(false);
            }}
          >
            Nog een melding
          </button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Field label="Wat wil je melden?" htmlFor="fb-type">
        <select
          id="fb-type"
          name="type"
          className="klant-select"
          value={type}
          onChange={(e) => setType(e.target.value as FeedbackType)}
          required
        >
          <option value="" disabled>Selecteer een type…</option>
          {FEEDBACK_TYPES.map((t) => (
            <option key={t} value={t}>{FEEDBACK_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </Field>

      <Field label="Hoe urgent is dit?">
        <div role="radiogroup" aria-label="Urgentie" style={{ display: 'flex', gap: 8 }}>
          {URGENCY_OPTIONS.map((o) => {
            const active = urgency === o.value;
            const tone = URGENCY_TONE[o.value];
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setUrgency(o.value)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '10px 8px',
                  borderRadius: 'var(--klant-r-md)',
                  border: `1px solid ${active ? tone.border : 'var(--klant-border)'}`,
                  background: active ? tone.bg : 'var(--klant-surface)',
                  color: active ? tone.fg : 'var(--klant-fg-muted)',
                  fontSize: 13.5,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: active ? tone.dot : 'var(--klant-border-strong)',
                    flexShrink: 0,
                  }}
                />
                {o.label}
              </button>
            );
          })}
        </div>
        {/* Hidden field zodat urgency in de FormData-submit meegaat — de knoppen
            zetten alleen React-state (canSubmit dwingt de keuze sowieso af). */}
        <input type="hidden" name="urgency" value={urgency} />
        <span className="klant-hint" style={{ marginTop: 2 }}>
          {URGENCY_OPTIONS.find((o) => o.value === urgency)?.help ??
            'Kies hoe snel dit opgepakt moet worden.'}
        </span>
      </Field>

      <Field
        label="Beschrijving"
        htmlFor="fb-description"
        hint={`Wat deed je, wat zag je, wat had je verwacht? Minimaal ${DESCRIPTION_MIN} tekens. (${description.trim().length}/${DESCRIPTION_MAX})`}
      >
        <textarea
          id="fb-description"
          name="description"
          className="klant-textarea"
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
          placeholder="Beschrijf zo duidelijk mogelijk wat er is gebeurd."
          required
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label="Naam" htmlFor="fb-name">
          <input
            id="fb-name"
            name="name"
            className="klant-input"
            placeholder="Jouw naam"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field label="E-mailadres" hint="Voor een reactie op je melding." htmlFor="fb-email">
          <input
            id="fb-email"
            name="email"
            type="email"
            className="klant-input"
            placeholder="jouw@bedrijf.nl"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field
          label="Chat-ID (optioneel)"
          hint="Te vinden onder Gesprekken → open het gesprek → ID bovenaan."
          htmlFor="fb-chat"
        >
          <input id="fb-chat" name="chatId" className="klant-input" placeholder="Bijv. chat_abc123" />
        </Field>
        <Field
          label="Gestelde vraag (optioneel)"
          hint="De exacte vraag zoals de bezoeker hem typte."
          htmlFor="fb-question"
        >
          <input id="fb-question" name="question" className="klant-input" placeholder='Bijv. "Wat zijn jullie openingstijden?"' />
        </Field>
      </div>

      <Field label="Screenshot of bijlage (optioneel)" hint={`JPG, PNG, GIF, WEBP of PDF — max ${ATTACHMENT_MAX_MB} MB.`}>
        <label
          className="klant-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: 'fit-content' }}
        >
          <Paperclip size={15} strokeWidth={1.8} />
          {fileName ? 'Ander bestand kiezen' : 'Bestand kiezen'}
          <input
            type="file"
            name="attachment"
            accept={ATTACHMENT_ACCEPT}
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
        </label>
        {fileName && (
          <span style={{ fontSize: 12.5, color: 'var(--klant-muted)', marginTop: 4 }}>{fileName}</span>
        )}
      </Field>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'var(--klant-ink)' }}>
        <input
          type="checkbox"
          name="privacy"
          checked={privacy}
          onChange={(e) => setPrivacy(e.target.checked)}
          style={{ marginTop: 2 }}
          required
        />
        <span>
          Ik ga akkoord met de{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--klant-accent)' }}>
            privacyverklaring
          </a>{' '}
          van ChatManta.
        </span>
      </label>

      {error && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--klant-danger)',
            background: 'var(--klant-danger-soft)',
            border: '1px solid var(--klant-danger-border)',
            borderRadius: 'var(--klant-r-md)',
            padding: '8px 12px',
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          className="klant-btn"
          data-variant="primary"
          disabled={!canSubmit || pending}
        >
          {pending ? 'Bezig…' : 'Feedback versturen'}
        </button>
      </div>
    </form>
  );
}
