'use client';

import { useState, useTransition } from 'react';
import { Check, Save } from 'lucide-react';
import { saveChatbotSettingsAction } from '../../actions';
import type {
  AnswerLength,
  ChatbotSettings,
  Language,
  SourceStrictness,
  ToneOfVoice,
} from '@/lib/v0/klantendashboard/types';

const TONE_OPTIONS: { value: ToneOfVoice; label: string; help: string }[] = [
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

export function SettingsForm({ initial }: { initial: ChatbotSettings }) {
  const [s, setS] = useState<ChatbotSettings>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof ChatbotSettings>(key: K, value: ChatbotSettings[K]) {
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
        setS(res.chatbot);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      {/* Basis */}
      <Section
        title="Basis"
        help="De naam, het welkomstbericht en de algemene info die je chatbot gebruikt."
      >
        <Field label="Chatbotnaam" hint="De naam zoals je bezoekers hem zien in de widget.">
          <input
            className="klant-input"
            value={s.chatbotName}
            onChange={(e) => update('chatbotName', e.target.value)}
          />
        </Field>
        <Field label="Bedrijfsnaam">
          <input
            className="klant-input"
            value={s.companyName}
            onChange={(e) => update('companyName', e.target.value)}
          />
        </Field>
        <Field label="Korte bedrijfsomschrijving" hint="Eén of twee zinnen — gebruikt in de system-prompt zodat de bot context heeft.">
          <textarea
            className="klant-textarea"
            value={s.companyDescription}
            onChange={(e) => update('companyDescription', e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="Welkomstbericht" hint="Het eerste bericht dat je bezoekers zien als ze de chat openen.">
          <textarea
            className="klant-textarea"
            value={s.welcomeMessage}
            onChange={(e) => update('welcomeMessage', e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="Startsuggesties" hint="Voorbeeldvragen die de bezoeker direct kan klikken.">
          <textarea
            className="klant-textarea"
            value={s.starterQuestions.join('\n')}
            onChange={(e) =>
              update(
                'starterQuestions',
                e.target.value.split('\n').filter((x) => x.trim().length > 0),
              )
            }
            placeholder="Eén vraag per regel"
            rows={3}
          />
        </Field>
      </Section>

      {/* Taal */}
      <Section title="Taal" help="In welke taal beantwoordt je chatbot vragen?">
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
        <Toggle
          label="Automatisch taal herkennen"
          help="Detecteer de taal van de bezoeker en antwoord in die taal."
          value={s.autoDetectLanguage}
          onChange={(v) => update('autoDetectLanguage', v)}
        />
        <Field label="Extra talen" hint="Welke andere talen mag de chatbot ook gebruiken?">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(['nl', 'en', 'de', 'fr', 'es'] as Language[])
              .filter((l) => l !== s.primaryLanguage)
              .map((l) => {
                const active = s.extraLanguages.includes(l);
                return (
                  <button
                    type="button"
                    key={l}
                    onClick={() =>
                      update(
                        'extraLanguages',
                        active
                          ? s.extraLanguages.filter((x) => x !== l)
                          : [...s.extraLanguages, l],
                      )
                    }
                    className="klant-btn"
                    data-variant={active ? 'primary' : 'ghost'}
                    style={{ fontSize: 12, padding: '5px 10px' }}
                  >
                    {LANG_LABEL[l]}
                  </button>
                );
              })}
          </div>
        </Field>
      </Section>

      {/* Tone of voice */}
      <Section
        title="Tone of voice"
        help="Bepaal hoe je chatbot klinkt — vriendelijk, zakelijk, of iets daartussen."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 8,
          }}
        >
          {TONE_OPTIONS.map((opt) => {
            const active = s.toneOfVoice === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => update('toneOfVoice', opt.value)}
                style={{
                  padding: 12,
                  textAlign: 'left',
                  borderRadius: 'var(--klant-r-md)',
                  border: '1px solid ' + (active ? 'var(--klant-accent)' : 'var(--klant-border)'),
                  background: active ? 'var(--klant-accent-soft)' : 'var(--klant-surface)',
                  color: 'var(--klant-fg)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  position: 'relative',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</span>
                <span style={{ fontSize: 12, color: 'var(--klant-fg-muted)', lineHeight: 1.5 }}>
                  {opt.help}
                </span>
                {active && (
                  <Check
                    size={14}
                    strokeWidth={2.2}
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      color: 'var(--klant-accent)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <Field
          label="Extra instructies voor je chatbot"
          hint="Bijvoorbeeld: 'Verwijs bij twijfel altijd naar onze contactpagina.'"
        >
          <textarea
            className="klant-textarea"
            value={s.extraInstructions}
            onChange={(e) => update('extraInstructions', e.target.value)}
            rows={3}
          />
        </Field>
      </Section>

      {/* Antwoordgedrag */}
      <Section title="Antwoordgedrag" help="Bepaal hoe ver je chatbot mag gaan in zijn antwoorden.">
        <Field label="Antwoordlengte">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['short', 'normal', 'long'] as AnswerLength[]).map((v) => {
              const labels = { short: 'Kort', normal: 'Normaal', long: 'Uitgebreid' };
              return (
                <button
                  type="button"
                  key={v}
                  onClick={() => update('answerLength', v)}
                  className="klant-btn"
                  data-variant={s.answerLength === v ? 'primary' : 'ghost'}
                  style={{ flex: 1 }}
                >
                  {labels[v]}
                </button>
              );
            })}
          </div>
        </Field>
        <Toggle
          label="Mag chatbot prijzen noemen?"
          help="Bij 'nee' verwijst de bot voor prijzen door naar je contactpagina."
          value={s.mayMentionPrices}
          onChange={(v) => update('mayMentionPrices', v)}
        />
        <Toggle
          label="Mag chatbot contactgegevens tonen?"
          help="E-mail, telefoon en contactpagina-URL mag worden gedeeld."
          value={s.mayShareContact}
          onChange={(v) => update('mayShareContact', v)}
        />
        <Field
          label="Hoe strikt mag de chatbot van zijn bronnen afwijken?"
          hint="'Strikt' = alleen wat letterlijk in je bronnen staat. 'Flexibel' = mag combineren en interpreteren."
        >
          <div style={{ display: 'flex', gap: 6 }}>
            {(['strict', 'normal', 'flexible'] as SourceStrictness[]).map((v) => {
              const labels = { strict: 'Strikt', normal: 'Normaal', flexible: 'Flexibel' };
              return (
                <button
                  type="button"
                  key={v}
                  onClick={() => update('sourceStrictness', v)}
                  className="klant-btn"
                  data-variant={s.sourceStrictness === v ? 'primary' : 'ghost'}
                  style={{ flex: 1 }}
                >
                  {labels[v]}
                </button>
              );
            })}
          </div>
        </Field>
        <Toggle
          label="Bij twijfel: eerlijk zeggen dat hij het niet weet"
          help="Aanbevolen aan. Voorkomt dat de chatbot iets verzint dat niet in je bronnen staat."
          value={s.honestAboutUnknown}
          onChange={(v) => update('honestAboutUnknown', v)}
        />
      </Section>

      {/* Fallback & contact */}
      <Section title="Fallback &amp; contact" help="Wat doet je chatbot als hij het antwoord niet weet?">
        <Field label="Fallbackbericht" hint="Wordt getoond als de chatbot geen antwoord kon vinden.">
          <textarea
            className="klant-textarea"
            value={s.fallbackMessage}
            onChange={(e) => update('fallbackMessage', e.target.value)}
            rows={3}
          />
        </Field>
        <Field label="Contact e-mailadres">
          <input
            type="email"
            className="klant-input"
            value={s.contactEmail}
            onChange={(e) => update('contactEmail', e.target.value)}
          />
        </Field>
        <Field label="Telefoonnummer">
          <input
            className="klant-input"
            value={s.contactPhone}
            onChange={(e) => update('contactPhone', e.target.value)}
          />
        </Field>
        <Field label="Contactpagina URL">
          <input
            type="url"
            className="klant-input"
            value={s.contactPageUrl}
            onChange={(e) => update('contactPageUrl', e.target.value)}
          />
        </Field>
      </Section>

      {/* Save bar — sticky */}
      <div
        style={{
          position: 'sticky',
          bottom: 16,
          marginTop: 8,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          alignItems: 'center',
          padding: '12px 16px',
          background: 'var(--klant-bg-elev)',
          border: '1px solid var(--klant-border-strong)',
          borderRadius: 'var(--klant-r-md)',
          boxShadow: '0 8px 24px -10px rgba(0,0,0,0.35)',
        }}
      >
        {error && (
          <span style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</span>
        )}
        {saved && (
          <span
            style={{
              fontSize: 13,
              color: 'var(--klant-success)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Check size={14} /> Opgeslagen
          </span>
        )}
        <button
          type="submit"
          className="klant-btn"
          data-variant="primary"
          disabled={pending}
        >
          <Save size={14} strokeWidth={1.8} /> {pending ? 'Bezig…' : 'Instellingen opslaan'}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <section className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h3 className="klant-section-title">{title}</h3>
        <p className="klant-section-help">{help}</p>
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        cursor: 'pointer',
        padding: '4px 0',
      }}
    >
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
      <div>
        <div style={{ fontSize: 14, color: 'var(--klant-fg)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--klant-fg-muted)', marginTop: 2 }}>{help}</div>
      </div>
    </label>
  );
}
