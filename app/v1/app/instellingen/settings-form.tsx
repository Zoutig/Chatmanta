'use client';

// V1 Instellingen — getrimd settings-formulier. Alléén antwoord-beïnvloedende
// velden (geen widget-only velden, geen GK-toggle — die zou in V1 dood zijn). Bewust
// inline styles: /v1 laadt klant.css niet. Save → server-action → engine leest de
// settings live (askV1 → buildChatbotOverrides).

import { useState, useTransition } from 'react';
import { saveChatbotSettingsAction } from './actions';
import type { V1ChatbotSettings } from './settings-config';
import type {
  AnswerLength,
  Language,
  SourceStrictness,
  ToneOfVoice,
  WidgetPosition,
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 8,
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 6,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
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
    startTransition(async () => {
      const res = await saveChatbotSettingsAction(s);
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
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      <Section title="Basis">
        <Field label="Chatbotnaam" hint="De naam zoals je bezoekers hem zien.">
          <input
            style={inputStyle}
            value={s.chatbotName}
            onChange={(e) => update('chatbotName', e.target.value)}
          />
        </Field>
        <Field label="Korte bedrijfsomschrijving" hint="Eén of twee zinnen — geeft de bot context in de system-prompt.">
          <textarea
            style={inputStyle}
            rows={2}
            value={s.companyDescription}
            onChange={(e) => update('companyDescription', e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Taal">
        <Field label="Hoofdtaal">
          <select
            style={inputStyle}
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
            style={inputStyle}
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
            style={inputStyle}
            rows={3}
            value={s.extraInstructions}
            onChange={(e) => update('extraInstructions', e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Antwoordgedrag">
        <Field label="Antwoordlengte">
          <select
            style={inputStyle}
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
            style={inputStyle}
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
            style={inputStyle}
            rows={3}
            value={s.fallbackMessage}
            onChange={(e) => update('fallbackMessage', e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Widget">
        <Field label="Accentkleur" hint="Kleur van de chat-knop, header en verstuurknop.">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(s.accentColor) ? s.accentColor : '#2563eb'}
              onChange={(e) => update('accentColor', e.target.value)}
              style={{ width: 44, height: 36, padding: 0, border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' }}
              aria-label="Accentkleur"
            />
            <input
              style={{ ...inputStyle, width: 120 }}
              value={s.accentColor}
              onChange={(e) => update('accentColor', e.target.value)}
            />
          </div>
        </Field>
        <Field label="Positie" hint="Hoek waar de chat-knop op de site verschijnt.">
          <select
            style={inputStyle}
            value={s.position}
            onChange={(e) => update('position', e.target.value as WidgetPosition)}
          >
            <option value="bottom-right">Rechtsonder</option>
            <option value="bottom-left">Linksonder</option>
          </select>
        </Field>
        <Field label="Titel in de header" hint="Leeg laten → de chatbotnaam wordt gebruikt.">
          <input
            style={inputStyle}
            value={s.headerTitle}
            onChange={(e) => update('headerTitle', e.target.value)}
          />
        </Field>
        <Field label="Welkomstbericht" hint="Het eerste bericht dat de bezoeker ziet in het chatvenster.">
          <input
            style={inputStyle}
            value={s.welcomeMessage}
            onChange={(e) => update('welcomeMessage', e.target.value)}
          />
        </Field>
        <Field label="Tekst bij de knop" hint="Optioneel tooltip-bubbeltje naast de chat-knop. Leeg = geen tooltip.">
          <input
            style={inputStyle}
            value={s.launcherText}
            onChange={(e) => update('launcherText', e.target.value)}
          />
        </Field>
      </Section>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          type="submit"
          disabled={pending || !dirty}
          style={{ padding: '8px 16px', fontSize: 14, cursor: pending || !dirty ? 'default' : 'pointer' }}
        >
          {pending ? 'Bezig…' : 'Instellingen opslaan'}
        </button>
        {saved && <span style={{ fontSize: 13, color: '#0a0' }}>Opgeslagen</span>}
        {error && <span role="alert" style={{ fontSize: 13, color: '#b00020' }}>{error}</span>}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 12, color: '#777' }}>{hint}</span>}
    </label>
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
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color: '#777' }}>{help}</span>
      </span>
    </label>
  );
}
