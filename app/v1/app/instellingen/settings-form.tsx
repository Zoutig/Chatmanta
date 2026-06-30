'use client';

// V1 Instellingen — getrimd settings-formulier. Alléén antwoord-beïnvloedende
// velden (geen widget-only velden, geen GK-toggle — die zou in V1 dood zijn). Styling
// via het V0-klantendashboard-designsysteem (klant.css-classes, geladen door de
// /v1/app-shell). Save → server-action → engine leest de settings live
// (askV1 → buildChatbotOverrides). Alleen markup/className is herstyled.

import { useState, useTransition } from 'react';
import { saveChatbotSettingsAction } from './actions';
import type { V1ChatbotSettings } from './settings-config';
import type {
  AnswerLength,
  Language,
  SourceStrictness,
  ToneOfVoice,
} from '@/lib/v0/klantendashboard/types';

const TONE_OPTIONS: { value: ToneOfVoice; label: string; help: string }[] = [
  { value: 'personal', label: 'Persoonlijk', help: 'Warm en informeel, alsof je met de klant appt. Aanbevolen.' },
  { value: 'professional', label: 'Professioneel', help: 'Zakelijk, formeel, gebruikt "u"-vorm.' },
  { value: 'friendly', label: 'Vriendelijk', help: 'Warm en toegankelijk, lichte je-vorm.' },
  { value: 'concise', label: 'Kort en direct', help: 'Geen omslachtige zinnen, snel ter zake.' },
  { value: 'enthusiastic', label: 'Enthousiast', help: 'Levendig, positief, met flair.' },
  { value: 'informal', label: 'Informeel', help: 'Volledig je-vorm, ontspannen toon.' },
];

const LANG_LABEL: Record<Language, string> = {
  nl: 'Nederlands',
  en: 'Engels',
  de: 'Duits',
  fr: 'Frans',
  es: 'Spaans',
};

export function V1SettingsForm({ initial }: { initial: V1ChatbotSettings }) {
  const [s, setS] = useState<V1ChatbotSettings>(initial);
  const [baseline, setBaseline] = useState<V1ChatbotSettings>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof V1ChatbotSettings>(key: K, value: V1ChatbotSettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function save() {
    setSaved(false);
    setError(null);
    // Widget-uiterlijk-velden (accentColor/position/headerTitle/launcherText/
    // welcomeMessage) leven nu op de Widget-pagina en worden hier niet bewerkt —
    // dus ook NIET meesturen: anders zou een stale waarde uit deze (mogelijk eerder
    // geladen) pagina een wijziging op de Widget-pagina overschrijven (data-loss).
    const answerPatch: Partial<V1ChatbotSettings> = {
      chatbotName: s.chatbotName,
      companyDescription: s.companyDescription,
      primaryLanguage: s.primaryLanguage,
      toneOfVoice: s.toneOfVoice,
      extraInstructions: s.extraInstructions,
      answerLength: s.answerLength,
      sourceStrictness: s.sourceStrictness,
      mayMentionPrices: s.mayMentionPrices,
      mayShareContact: s.mayShareContact,
      honestAboutUnknown: s.honestAboutUnknown,
      fallbackMessage: s.fallbackMessage,
    };
    startTransition(async () => {
      const res = await saveChatbotSettingsAction(answerPatch);
      if (res.ok) {
        setS(res.settings);
        setBaseline(res.settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res.error);
      }
    });
  }

  const dirty = JSON.stringify(s) !== JSON.stringify(baseline);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <Section title="Basis">
        <Field label="Chatbotnaam" hint="De naam zoals je bezoekers hem zien.">
          <input
            className="klant-input"
            value={s.chatbotName}
            onChange={(e) => update('chatbotName', e.target.value)}
          />
        </Field>
        <Field label="Korte bedrijfsomschrijving" hint="Eén of twee zinnen — geeft de bot context in de system-prompt.">
          <textarea
            className="klant-textarea"
            rows={2}
            value={s.companyDescription}
            onChange={(e) => update('companyDescription', e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Taal">
        <Field label="Hoofdtaal">
          <select
            className="klant-select"
            value={s.primaryLanguage}
            onChange={(e) => update('primaryLanguage', e.target.value as Language)}
          >
            {(['nl', 'en', 'de', 'fr', 'es'] as Language[]).map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Tone of voice">
        <Field label="Toon">
          <select
            className="klant-select"
            value={s.toneOfVoice}
            onChange={(e) => update('toneOfVoice', e.target.value as ToneOfVoice)}
          >
            {TONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.help}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Extra instructies" hint="Bijv. 'Verwijs bij twijfel altijd naar onze contactpagina.'">
          <textarea
            className="klant-textarea"
            rows={3}
            value={s.extraInstructions}
            onChange={(e) => update('extraInstructions', e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Antwoordgedrag">
        <Field label="Antwoordlengte">
          <select
            className="klant-select"
            value={s.answerLength}
            onChange={(e) => update('answerLength', e.target.value as AnswerLength)}
          >
            <option value="short">Kort</option>
            <option value="normal">Normaal</option>
            <option value="long">Uitgebreid</option>
          </select>
        </Field>
        <Field label="Hoe strikt mag de chatbot van zijn bronnen afwijken?" hint="'Strikt' = alleen wat letterlijk in je bronnen staat. 'Flexibel' = mag combineren.">
          <select
            className="klant-select"
            value={s.sourceStrictness}
            onChange={(e) => update('sourceStrictness', e.target.value as SourceStrictness)}
          >
            <option value="strict">Strikt</option>
            <option value="normal">Normaal</option>
            <option value="flexible">Flexibel</option>
          </select>
        </Field>
        <Toggle
          label="Mag de chatbot prijzen noemen?"
          help="Bij 'nee' verwijst de bot voor prijzen door."
          value={s.mayMentionPrices}
          onChange={(v) => update('mayMentionPrices', v)}
        />
        <Toggle
          label="Mag de chatbot contactgegevens tonen?"
          help="E-mail, telefoon en contactpagina-URL mag worden gedeeld."
          value={s.mayShareContact}
          onChange={(v) => update('mayShareContact', v)}
        />
        <Toggle
          label="Bij twijfel: eerlijk zeggen dat hij het niet weet"
          help="Aanbevolen aan. Voorkomt dat de chatbot iets verzint dat niet in je bronnen staat."
          value={s.honestAboutUnknown}
          onChange={(v) => update('honestAboutUnknown', v)}
        />
      </Section>

      <Section title="Fallback">
        <Field label="Fallbackbericht" hint="Wordt getoond als de chatbot geen antwoord kon vinden.">
          <textarea
            className="klant-textarea"
            rows={3}
            value={s.fallbackMessage}
            onChange={(e) => update('fallbackMessage', e.target.value)}
          />
        </Field>
      </Section>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          type="submit"
          className="klant-btn"
          data-variant="primary"
          disabled={pending || !dirty}
        >
          {pending ? 'Bezig…' : 'Instellingen opslaan'}
        </button>
        {saved && <span style={{ fontSize: 13, color: 'var(--klant-success)' }}>Opgeslagen</span>}
        {error && <span role="alert" style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</span>}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 className="klant-section-title" style={{ margin: 0 }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="klant-label">{label}</label>
      {children}
      {hint && <div className="klant-hint">{hint}</div>}
    </div>
  );
}

function Toggle({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: '4px 0' }}>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          flexShrink: 0,
          marginTop: 2,
          width: 34,
          height: 20,
          borderRadius: 999,
          border: 'none',
          background: value ? 'var(--klant-accent)' : 'var(--klant-border-strong)',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 120ms ease',
        }}
        aria-pressed={value}
        aria-label={label}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: '#fff',
            transition: 'left 120ms ease',
          }}
        />
      </button>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--klant-fg)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--klant-fg-muted)' }}>{help}</span>
      </span>
    </label>
  );
}
