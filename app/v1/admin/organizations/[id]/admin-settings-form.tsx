'use client';

// WP5b — admin-variant van het klant-instellingenformulier. Bewust een dunne variant
// i.p.v. de klant-V1SettingsForm te hergebruiken: die is hardwired aan de session-
// gescopete saveChatbotSettingsAction + AI-generate-actions (die zouden de EIGEN org
// van de admin raken, niet de klant). Deze variant schrijft via adminSaveChatbotSettings-
// Action(orgId, patch) — org uit de route-param, Jorion-admin-gate. Geen AI-generate-
// knoppen (session-gescoped, zinloos voor cross-org support). Widget-uiterlijk zit in
// een aparte tab/patch. Veldset spiegelt de klant-instellingen; opmaak via de V1-laag.

import { useState, useTransition, type ReactNode } from 'react';
import { Check, Save } from 'lucide-react';
import { adminSaveChatbotSettingsAction } from './actions';
import type { V1ChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import type { AnswerLength, Language, SourceStrictness, ToneOfVoice } from '@/lib/v0/klantendashboard/types';
import { Button } from '@/app/v1/_ui/button';
import { ChoiceTiles, Field, Segmented, Switch } from '@/app/v1/_ui/controls';
import './org-forms.css';

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

const LENGTH_OPTIONS: { value: AnswerLength; label: string }[] = [
  { value: 'short', label: 'Kort' },
  { value: 'normal', label: 'Normaal' },
  { value: 'long', label: 'Uitgebreid' },
];

const STRICTNESS_OPTIONS: { value: SourceStrictness; label: string }[] = [
  { value: 'strict', label: 'Strikt' },
  { value: 'normal', label: 'Normaal' },
  { value: 'flexible', label: 'Flexibel' },
];

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
      className="v1-adm-of-stack"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Section title="Basis" help="Naam, startsuggesties en algemene info die de chatbot gebruikt.">
        <Field label="Chatbotnaam" hint="De naam zoals bezoekers hem zien in de widget.">
          {(id) => <input id={id} className="v1-input" value={s.chatbotName} onChange={(e) => update('chatbotName', e.target.value)} />}
        </Field>
        <Field label="Korte bedrijfsomschrijving" hint="Eén of twee zinnen. Wordt gebruikt in de system-prompt.">
          {(id) => (
            <textarea id={id} className="v1-input" rows={2} value={s.companyDescription} onChange={(e) => update('companyDescription', e.target.value)} />
          )}
        </Field>
        <Field label="Startsuggesties" hint="Voorbeeldvragen, één per regel.">
          {(id) => (
            <textarea
              id={id}
              className="v1-input"
              rows={3}
              placeholder="Eén vraag per regel"
              value={s.starterQuestions.join('\n')}
              onChange={(e) => update('starterQuestions', e.target.value.split('\n').filter((x) => x.trim().length > 0))}
            />
          )}
        </Field>
        <Switch
          label="Startsuggesties tonen"
          description="De widget toont klikbare voorbeeldvragen bij een leeg gesprek."
          checked={s.showStarterQuestions !== false}
          onChange={(v) => update('showStarterQuestions', v)}
        />
      </Section>

      <Section title="Taal" help="In welke taal beantwoordt de chatbot vragen?">
        <Field label="Hoofdtaal">
          {(id) => (
            <select
              id={id}
              className="v1-input v1-input--narrow"
              value={s.primaryLanguage}
              onChange={(e) => update('primaryLanguage', e.target.value as Language)}
            >
              {(['nl', 'en', 'de', 'fr', 'es'] as Language[]).map((l) => (
                <option key={l} value={l}>
                  {LANG_LABEL[l]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Switch
          label="Automatisch taal herkennen"
          description="Aan: antwoordt in de taal van de bezoeker. Uit: altijd de hoofdtaal."
          checked={s.autoDetectLanguage}
          onChange={(v) => update('autoDetectLanguage', v)}
        />
      </Section>

      <Section title="Toon" help="Hoe klinkt de chatbot?">
        <ChoiceTiles label="Toon" value={s.toneOfVoice} options={TONE_OPTIONS} onChange={(v) => update('toneOfVoice', v)} />
        <Field label="Extra instructies" hint="Bijvoorbeeld: verwijs bij twijfel altijd naar de contactpagina.">
          {(id) => (
            <textarea id={id} className="v1-input" rows={3} value={s.extraInstructions} onChange={(e) => update('extraInstructions', e.target.value)} />
          )}
        </Field>
      </Section>

      <Section title="Antwoordgedrag" help="Hoe ver mag de chatbot gaan in zijn antwoorden?">
        <div className="v1-field">
          <span className="v1-label">Antwoordlengte</span>
          <Segmented label="Antwoordlengte" value={s.answerLength} options={LENGTH_OPTIONS} onChange={(v) => update('answerLength', v)} />
        </div>
        <Switch
          label="Mag prijzen noemen"
          description="Uit: de bot verwijst voor prijzen naar de contactpagina."
          checked={s.mayMentionPrices}
          onChange={(v) => update('mayMentionPrices', v)}
        />
        <Switch
          label="Mag contactgegevens tonen"
          description="E-mail, telefoon en contactpagina mogen worden gedeeld."
          checked={s.mayShareContact}
          onChange={(v) => update('mayShareContact', v)}
        />
        <div className="v1-field">
          <span className="v1-label">Hoe strikt mag de chatbot van zijn bronnen afwijken?</span>
          <Segmented
            label="Bronstriktheid"
            value={s.sourceStrictness}
            options={STRICTNESS_OPTIONS}
            onChange={(v) => update('sourceStrictness', v)}
          />
          <p className="v1-hint">Strikt: alleen wat letterlijk in de bronnen staat.</p>
        </div>
        <Switch
          label="Bij twijfel eerlijk zeggen dat hij het niet weet"
          description="Aanbevolen. Voorkomt verzinsels."
          checked={s.honestAboutUnknown}
          onChange={(v) => update('honestAboutUnknown', v)}
        />
        {s.honestAboutUnknown && (
          <Field label="Formulering bij twijfel" hint="Leeg laten voor een algemene formulering.">
            {(id) => (
              <textarea
                id={id}
                className="v1-input"
                rows={2}
                value={s.unknownAnswerMessage}
                onChange={(e) => update('unknownAnswerMessage', e.target.value)}
              />
            )}
          </Field>
        )}
      </Section>

      <Section title="Terugval en contact" help="Wat doet de chatbot als hij het antwoord niet weet?">
        <Field label="Terugvalbericht" hint="Getoond als de chatbot geen antwoord kon vinden.">
          {(id) => (
            <textarea id={id} className="v1-input" rows={3} value={s.fallbackMessage} onChange={(e) => update('fallbackMessage', e.target.value)} />
          )}
        </Field>
        <div className="v1-edit-grid">
          <Field label="Contact e-mailadres">
            {(id) => (
              <input id={id} type="email" className="v1-input" value={s.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} />
            )}
          </Field>
          <Field label="Telefoonnummer">
            {(id) => <input id={id} className="v1-input" value={s.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} />}
          </Field>
          <Field label="Contactpagina URL">
            {(id) => (
              <input id={id} type="url" className="v1-input" value={s.contactPageUrl} onChange={(e) => update('contactPageUrl', e.target.value)} />
            )}
          </Field>
        </div>
      </Section>

      <div className="v1-adm-of-savebar">
        {error && (
          <p role="alert" className="v1-alert v1-alert--error">
            {error}
          </p>
        )}
        {saved && (
          <span className="v1-saved" role="status">
            <Check size={14} /> Opgeslagen
          </span>
        )}
        <Button type="submit" variant="primary" loading={pending} disabled={!dirty}>
          {pending ? null : <Save size={14} strokeWidth={1.8} />} Instellingen opslaan
        </Button>
      </div>
    </form>
  );
}

function Section({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <section className="v1-card v1-adm-of-card">
      <header className="v1-adm-of-card-head">
        <h2 className="v1-section-title">{title}</h2>
        <p className="v1-adm-of-card-help">{help}</p>
      </header>
      {children}
    </section>
  );
}
