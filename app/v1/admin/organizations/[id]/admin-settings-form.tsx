'use client';

// WP5b — admin-variant van het klant-instellingenformulier. Bewust een dunne variant
// i.p.v. de klant-V1SettingsForm te hergebruiken: die is hardwired aan de session-
// gescopete saveChatbotSettingsAction + AI-generate-actions (die zouden de EIGEN org
// van de admin raken, niet de klant). Deze variant schrijft via adminSaveChatbotSettings-
// Action(orgId, patch) — org uit de route-param, Jorion-admin-gate. Geen AI-generate-
// knoppen (session-gescoped, zinloos voor cross-org support). Widget-uiterlijk zit in
// een aparte tab/patch. Klassen + veldset spiegelen de klant-instellingen.

import { useState, useTransition } from 'react';
import { Check, Save } from 'lucide-react';
import { adminSaveChatbotSettingsAction } from './actions';
import type { V1ChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import type { AnswerLength, Language, SourceStrictness, ToneOfVoice } from '@/lib/v0/klantendashboard/types';

const TONE_OPTIONS: { value: ToneOfVoice; label: string; help: string }[] = [
  { value: 'personal', label: 'Persoonlijk', help: 'Warm en informeel, met af en toe een emoji.' },
  { value: 'professional', label: 'Professioneel', help: 'Zakelijk, formeel, "u"-vorm.' },
  { value: 'friendly', label: 'Vriendelijk', help: 'Warm en toegankelijk, lichte je-vorm.' },
  { value: 'concise', label: 'Kort en direct', help: 'Snel ter zake.' },
  { value: 'enthusiastic', label: 'Enthousiast', help: 'Levendig en positief.' },
  { value: 'informal', label: 'Informeel', help: 'Volledig je-vorm, ontspannen.' },
];

const LANG_LABEL: Record<Language, string> = {
  nl: 'Nederlands',
  en: 'Engels',
  de: 'Duits',
  fr: 'Frans',
  es: 'Spaans',
};

export function AdminSettingsForm({ orgId, initial }: { orgId: string; initial: V1ChatbotSettings }) {
  const [s, setS] = useState<V1ChatbotSettings>(initial);
  const [baseline, setBaseline] = useState<V1ChatbotSettings>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(s) !== JSON.stringify(baseline);

  function update<K extends keyof V1ChatbotSettings>(key: K, value: V1ChatbotSettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function save() {
    setSaved(false);
    setError(null);
    // DISJOINT patch: alléén antwoord-beïnvloedende velden (geen widget-velden — die
    // leven in de Widget-tab, zelfde jsonb, eigen patch).
    const patch: Partial<V1ChatbotSettings> = {
      chatbotName: s.chatbotName,
      companyDescription: s.companyDescription,
      starterQuestions: s.starterQuestions,
      showStarterQuestions: s.showStarterQuestions,
      primaryLanguage: s.primaryLanguage,
      autoDetectLanguage: s.autoDetectLanguage,
      toneOfVoice: s.toneOfVoice,
      extraInstructions: s.extraInstructions,
      answerLength: s.answerLength,
      sourceStrictness: s.sourceStrictness,
      mayMentionPrices: s.mayMentionPrices,
      mayShareContact: s.mayShareContact,
      honestAboutUnknown: s.honestAboutUnknown,
      unknownAnswerMessage: s.unknownAnswerMessage,
      fallbackMessage: s.fallbackMessage,
      contactEmail: s.contactEmail,
      contactPhone: s.contactPhone,
      contactPageUrl: s.contactPageUrl,
    };
    startTransition(async () => {
      const res = await adminSaveChatbotSettingsAction(orgId, patch);
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <Section title="Basis" help="Naam, welkomstbericht en algemene info die de chatbot gebruikt.">
        <Field label="Chatbotnaam" hint="De naam zoals bezoekers hem zien in de widget.">
          <input className="klant-input" value={s.chatbotName} onChange={(e) => update('chatbotName', e.target.value)} />
        </Field>
        <Field label="Korte bedrijfsomschrijving" hint="Eén of twee zinnen — gebruikt in de system-prompt.">
          <textarea className="klant-textarea" rows={2} value={s.companyDescription} onChange={(e) => update('companyDescription', e.target.value)} />
        </Field>
        <Field label="Startsuggesties" hint="Voorbeeldvragen — één per regel.">
          <textarea
            className="klant-textarea"
            rows={3}
            placeholder="Eén vraag per regel"
            value={s.starterQuestions.join('\n')}
            onChange={(e) => update('starterQuestions', e.target.value.split('\n').filter((x) => x.trim().length > 0))}
          />
        </Field>
        <Toggle
          label="Startsuggesties tonen"
          help="Aan: de widget toont klikbare voorbeeldvragen bij een leeg gesprek."
          value={s.showStarterQuestions !== false}
          onChange={(v) => update('showStarterQuestions', v)}
        />
      </Section>

      <Section title="Taal" help="In welke taal beantwoordt de chatbot vragen?">
        <Field label="Hoofdtaal">
          <select className="klant-select" value={s.primaryLanguage} onChange={(e) => update('primaryLanguage', e.target.value as Language)}>
            {(['nl', 'en', 'de', 'fr', 'es'] as Language[]).map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
          </select>
        </Field>
        <Toggle
          label="Automatisch taal herkennen"
          help="Aan: antwoordt in de taal van de bezoeker. Uit: altijd de hoofdtaal."
          value={s.autoDetectLanguage}
          onChange={(v) => update('autoDetectLanguage', v)}
        />
      </Section>

      <Section title="Tone of voice" help="Hoe klinkt de chatbot?">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
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
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</span>
                <span style={{ fontSize: 12, color: 'var(--klant-fg-muted)', lineHeight: 1.5 }}>{opt.help}</span>
              </button>
            );
          })}
        </div>
        <Field label="Extra instructies" hint="Bijv. 'Verwijs bij twijfel altijd naar de contactpagina.'">
          <textarea className="klant-textarea" rows={3} value={s.extraInstructions} onChange={(e) => update('extraInstructions', e.target.value)} />
        </Field>
      </Section>

      <Section title="Antwoordgedrag" help="Hoe ver mag de chatbot gaan in zijn antwoorden?">
        <Field label="Antwoordlengte">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['short', 'normal', 'long'] as AnswerLength[]).map((v) => {
              const labels = { short: 'Kort', normal: 'Normaal', long: 'Uitgebreid' } as const;
              return (
                <button key={v} type="button" onClick={() => update('answerLength', v)} className="klant-btn" data-variant={s.answerLength === v ? 'primary' : 'ghost'} style={{ flex: 1 }}>
                  {labels[v]}
                </button>
              );
            })}
          </div>
        </Field>
        <Toggle label="Mag prijzen noemen?" help="Bij 'nee' verwijst de bot voor prijzen naar de contactpagina." value={s.mayMentionPrices} onChange={(v) => update('mayMentionPrices', v)} />
        <Toggle label="Mag contactgegevens tonen?" help="E-mail, telefoon en contactpagina-URL mag worden gedeeld." value={s.mayShareContact} onChange={(v) => update('mayShareContact', v)} />
        <Field label="Hoe strikt mag de chatbot van zijn bronnen afwijken?" hint="'Strikt' = alleen wat letterlijk in de bronnen staat.">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['strict', 'normal', 'flexible'] as SourceStrictness[]).map((v) => {
              const labels = { strict: 'Strikt', normal: 'Normaal', flexible: 'Flexibel' } as const;
              return (
                <button key={v} type="button" onClick={() => update('sourceStrictness', v)} className="klant-btn" data-variant={s.sourceStrictness === v ? 'primary' : 'ghost'} style={{ flex: 1 }}>
                  {labels[v]}
                </button>
              );
            })}
          </div>
        </Field>
        <Toggle label="Bij twijfel: eerlijk zeggen dat hij het niet weet" help="Aanbevolen aan. Voorkomt verzinsels." value={s.honestAboutUnknown} onChange={(v) => update('honestAboutUnknown', v)} />
        {s.honestAboutUnknown && (
          <Field label="Formulering bij twijfel" hint="Leeg = generieke 'ik weet het niet zeker'-formulering.">
            <textarea className="klant-textarea" rows={2} value={s.unknownAnswerMessage} onChange={(e) => update('unknownAnswerMessage', e.target.value)} />
          </Field>
        )}
      </Section>

      <Section title="Fallback & contact" help="Wat doet de chatbot als hij het antwoord niet weet?">
        <Field label="Fallbackbericht" hint="Getoond als de chatbot geen antwoord kon vinden.">
          <textarea className="klant-textarea" rows={3} value={s.fallbackMessage} onChange={(e) => update('fallbackMessage', e.target.value)} />
        </Field>
        <Field label="Contact e-mailadres">
          <input type="email" className="klant-input" value={s.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} />
        </Field>
        <Field label="Telefoonnummer">
          <input className="klant-input" value={s.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} />
        </Field>
        <Field label="Contactpagina URL">
          <input type="url" className="klant-input" value={s.contactPageUrl} onChange={(e) => update('contactPageUrl', e.target.value)} />
        </Field>
      </Section>

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
        {error && <span role="alert" style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</span>}
        {saved && (
          <span style={{ fontSize: 13, color: 'var(--klant-success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Check size={14} /> Opgeslagen
          </span>
        )}
        <button type="submit" className="klant-btn" data-variant="primary" disabled={pending || !dirty}>
          <Save size={14} strokeWidth={1.8} /> {pending ? 'Bezig…' : 'Instellingen opslaan'}
        </button>
      </div>
    </form>
  );
}

// ── kleine lokale primitieven (gespiegeld van de klant-instellingen) ──

function Section({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="klant-label">{label}</label>
      {children}
      {hint && <div className="klant-hint">{hint}</div>}
    </div>
  );
}

function Toggle({ label, help, value, onChange }: { label: string; help: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '4px 0' }}>
      <button
        type="button"
        onClick={() => onChange(!value)}
        aria-pressed={value}
        aria-label={label}
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
      >
        <span style={{ position: 'absolute', top: 2, left: value ? 16 : 2, width: 16, height: 16, borderRadius: 999, background: '#fff', transition: 'left 120ms ease' }} />
      </button>
      <div>
        <div style={{ fontSize: 14, color: 'var(--klant-fg)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--klant-fg-muted)', marginTop: 2 }}>{help}</div>
      </div>
    </label>
  );
}
