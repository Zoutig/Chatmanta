'use client';

// Kennismakingsformulier (client-blad). Validatie = dezelfde pure functies als de
// server (lib/site/kennismaking.ts), zodat inline-feedback en API nooit uiteenlopen.
// Content-first: het formulier is volledige SSR-HTML; JS voegt alleen inline-
// validatie, de laadstaat en het succes-/foutpaneel toe.

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { Button, LinkButton } from '@/components/site/ui/button';
import { Icon } from '@/components/site/ui/icon';
import { ROUTES } from '@/lib/site/navigation';
import {
  HONEYPOT_FIELD,
  KENNISMAKING_FIELDS,
  LIMITS,
  PAKKET_OPTIONS,
  SITE_LEADS_DEFAULT_TO,
  fallbackMailto,
  validateField,
  type FieldErrors,
  type KennismakingField,
  type KennismakingInput,
  type KennismakingResponse,
  type PakketKeuze,
} from '@/lib/site/kennismaking';

type Status = 'idle' | 'submitting' | 'error';

export function KennismakingForm({ defaultPakket, bron }: { defaultPakket: PakketKeuze; bron: string | null }) {
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const reduce = useReducedMotion();

  const [values, setValues] = useState<KennismakingInput>({
    naam: '',
    bedrijf: '',
    website: '',
    email: '',
    telefoon: '',
    pakket: defaultPakket,
    bericht: '',
    toestemming: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<KennismakingField, boolean>>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [success, setSuccess] = useState<{ naam: string; email: string; confirmationSent: boolean } | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (success) successHeadingRef.current?.focus();
  }, [success]);
  useEffect(() => {
    if (status === 'error') errorRef.current?.focus();
  }, [status]);

  function set<K extends keyof KennismakingInput>(field: K, value: KennismakingInput[K]) {
    const next = { ...values, [field]: value };
    setValues(next);
    // Live hervalideren zodra een veld al een fout toont (of na een checkbox-klik).
    if (errors[field] || (field === 'toestemming' && touched.toestemming)) {
      setErrors((e) => ({ ...e, [field]: validateField(field, next) }));
    }
  }

  function blur(field: KennismakingField) {
    setTouched((t) => ({ ...t, [field]: true }));
    // Een leeg verplicht veld pas na een submitpoging als fout tonen, niet bij wegtabben.
    const raw = values[field as keyof KennismakingInput];
    if (typeof raw === 'string' && raw.trim() === '' && !errors[field]) return;
    setErrors((e) => ({ ...e, [field]: validateField(field, values) }));
  }

  function focusField(field: KennismakingField) {
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
    el?.focus();
  }

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (status === 'submitting') return;

    const all: FieldErrors = {};
    for (const f of KENNISMAKING_FIELDS) {
      const e = validateField(f, values);
      if (e) all[f] = e;
    }
    setErrors(all);
    setTouched(Object.fromEntries(KENNISMAKING_FIELDS.map((f) => [f, true])));
    const first = KENNISMAKING_FIELDS.find((f) => all[f]);
    if (first) {
      focusField(first);
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/site/kennismaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          bron,
          [HONEYPOT_FIELD]: honeypotRef.current?.value ?? '',
        }),
      });
      const data = (await res.json().catch(() => null)) as KennismakingResponse | null;
      if (data?.ok) {
        setSuccess({ naam: values.naam.trim(), email: values.email.trim(), confirmationSent: data.confirmationSent });
        return;
      }
      if (data && !data.ok && data.error === 'validation') {
        setErrors(data.fields);
        setStatus('idle');
        const f = KENNISMAKING_FIELDS.find((k) => data.fields[k]);
        if (f) focusField(f);
        return;
      }
      setStatus('error');
    } catch {
      setStatus('error');
    }
  }

  if (success) {
    return (
      <div className="kn-success" role="status">
        <motion.span
          className="kn-success-mark"
          aria-hidden="true"
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        >
          <Icon name="check" size={26} />
        </motion.span>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1], delay: 0.08 }}
        >
          <h2 ref={successHeadingRef} tabIndex={-1} className="kn-success-title">
            Bedankt, {success.naam}!
          </h2>
          <p className="kn-success-text">
            {success.confirmationSent ? (
              <>
                Je ontvangt een bevestiging op <strong>{success.email}</strong>.{' '}
              </>
            ) : null}
            We nemen binnen 1 werkdag contact op.
          </p>
          <p className="kn-success-demo">
            Alvast kijken?{' '}
            <LinkButton href={ROUTES.demo} variant="link" arrow>
              Open de live demo
            </LinkButton>
          </p>
        </motion.div>
      </div>
    );
  }

  const busy = status === 'submitting';
  const err = (f: KennismakingField) => (touched[f] || errors[f] ? errors[f] : undefined);
  const describe = (f: KennismakingField, hint?: boolean) =>
    [hint ? id(`${f}-hint`) : null, err(f) ? id(`${f}-err`) : null].filter(Boolean).join(' ') || undefined;

  return (
    <form ref={formRef} className="kn-form" noValidate onSubmit={onSubmit} aria-busy={busy}>
      {status === 'error' ? (
        <div ref={errorRef} className="kn-alert" role="alert" tabIndex={-1}>
          <Icon name="warn" size={18} />
          <p>
            Er ging iets mis bij het versturen. Je gegevens staan er nog. Probeer het opnieuw of mail ons direct:{' '}
            <a href={fallbackMailto()}>{SITE_LEADS_DEFAULT_TO}</a>
          </p>
        </div>
      ) : null}

      <div className="kn-row">
        <TextField
          id={id('naam')}
          field="naam"
          label="Naam"
          autoComplete="name"
          value={values.naam}
          maxLength={LIMITS.naam}
          error={err('naam')}
          describedBy={describe('naam')}
          onChange={(v) => set('naam', v)}
          onBlur={() => blur('naam')}
          required
        />
        <TextField
          id={id('bedrijf')}
          field="bedrijf"
          label="Bedrijfsnaam"
          autoComplete="organization"
          value={values.bedrijf}
          maxLength={LIMITS.bedrijf}
          error={err('bedrijf')}
          describedBy={describe('bedrijf')}
          onChange={(v) => set('bedrijf', v)}
          onBlur={() => blur('bedrijf')}
          required
        />
      </div>

      <div className="kn-row">
        <TextField
          id={id('website')}
          field="website"
          label="Website"
          placeholder="bedrijf.nl"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          value={values.website}
          maxLength={LIMITS.website}
          error={err('website')}
          describedBy={describe('website')}
          onChange={(v) => set('website', v)}
          onBlur={() => blur('website')}
          required
        />
        <TextField
          id={id('email')}
          field="email"
          label="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={values.email}
          maxLength={LIMITS.email}
          error={err('email')}
          describedBy={describe('email')}
          onChange={(v) => set('email', v)}
          onBlur={() => blur('email')}
          required
        />
      </div>

      <TextField
        id={id('telefoon')}
        field="telefoon"
        label="Telefoon"
        optional
        hint="Alleen als je liever gebeld wordt"
        hintId={id('telefoon-hint')}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={values.telefoon}
        maxLength={LIMITS.telefoon}
        error={err('telefoon')}
        describedBy={describe('telefoon', true)}
        onChange={(v) => set('telefoon', v)}
        onBlur={() => blur('telefoon')}
      />

      <fieldset className="kn-field kn-pakket">
        <legend className="kn-label">Pakket</legend>
        <div className="kn-seg">
          {PAKKET_OPTIONS.map((o, i) => (
            <label key={o.value} className="kn-seg-opt">
              <input
                type="radio"
                name="pakket"
                value={o.value}
                checked={values.pakket === o.value}
                onChange={() => set('pakket', o.value)}
                data-field={i === 0 ? 'pakket' : undefined}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={`kn-field${err('bericht') ? ' is-invalid' : ''}`}>
        <label className="kn-label" htmlFor={id('bericht')}>
          Bericht <span className="kn-opt">(optioneel)</span>
        </label>
        <textarea
          id={id('bericht')}
          data-field="bericht"
          className="kn-input kn-textarea"
          name="bericht"
          rows={4}
          maxLength={LIMITS.bericht}
          value={values.bericht}
          aria-invalid={err('bericht') ? true : undefined}
          aria-describedby={describe('bericht')}
          onChange={(e) => set('bericht', e.target.value)}
          onBlur={() => blur('bericht')}
        />
        {err('bericht') ? <FieldError id={id('bericht-err')}>{err('bericht')}</FieldError> : null}
      </div>

      {/* Honeypot: onzichtbaar voor mensen en hulpsoftware; bots vullen het. */}
      <div className="kn-hp" aria-hidden="true">
        <label htmlFor={id('hp')}>Laat dit veld leeg</label>
        <input ref={honeypotRef} id={id('hp')} type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className={`kn-consent${err('toestemming') ? ' is-invalid' : ''}`}>
        <label className="kn-check" htmlFor={id('toestemming')}>
          <input
            id={id('toestemming')}
            data-field="toestemming"
            type="checkbox"
            name="toestemming"
            checked={values.toestemming}
            aria-invalid={err('toestemming') ? true : undefined}
            aria-describedby={describe('toestemming')}
            onChange={(e) => {
              setTouched((t) => ({ ...t, toestemming: true }));
              set('toestemming', e.target.checked);
            }}
          />
          <span className="kn-box" aria-hidden="true">
            <Icon name="check" size={14} />
          </span>
          <span className="kn-check-text">
            Ik ga akkoord met de verwerking van mijn gegevens volgens de{' '}
            <a href={ROUTES.privacy} target="_blank" rel="noopener">
              privacyverklaring
            </a>
            .
          </span>
        </label>
        {err('toestemming') ? <FieldError id={id('toestemming-err')}>{err('toestemming')}</FieldError> : null}
      </div>

      <div className="kn-actions">
        <Button type="submit" variant="primary" arrow={!busy} disabled={busy} className="kn-submit">
          {busy ? <span className="kn-spin" aria-hidden="true" /> : null}
          Plan mijn kennismaking
        </Button>
        <span className="sr-only" aria-live="polite">
          {busy ? 'Bezig met versturen…' : ''}
        </span>
      </div>
    </form>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="kn-error">
      <Icon name="info" size={14} />
      <span>{children}</span>
    </p>
  );
}

function TextField({
  id,
  field,
  label,
  optional,
  hint,
  hintId,
  error,
  describedBy,
  value,
  onChange,
  onBlur,
  type = 'text',
  ...rest
}: {
  id: string;
  field: KennismakingField;
  label: string;
  optional?: boolean;
  hint?: string;
  hintId?: string;
  error?: string;
  describedBy?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: 'text' | 'email' | 'tel';
  placeholder?: string;
  inputMode?: 'text' | 'url' | 'email' | 'tel';
  autoComplete?: string;
  autoCapitalize?: string;
  spellCheck?: boolean;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <div className={`kn-field${error ? ' is-invalid' : ''}`}>
      <label className="kn-label" htmlFor={id}>
        {label}
        {optional ? <span className="kn-opt"> (optioneel)</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="kn-hint">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        data-field={field}
        className="kn-input"
        name={field}
        type={type}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={rest.required || undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        {...rest}
        required={undefined}
      />
      {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : null}
    </div>
  );
}
