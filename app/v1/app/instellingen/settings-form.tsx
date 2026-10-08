'use client';

// V1 Chatbot-instellingen (spec 7.5, golf 3): vier panelen Basis · Toon ·
// Antwoorden · Contact, elk eerst als leesweergave met "Wijzigen".
//  - lees: V1ChatbotSettings (uit settings-config.ts)
//  - write: saveChatbotSettingsAction met per paneel een DISJOINTE patch; de server
//    merget die over de huidige settings, dus panelen overschrijven elkaar niet.
//    Widget-velden (accentColor, position, ...) horen bij de Widget-pagina en staan
//    in geen enkele patch.
//  - AI-voorstellen: generateStarterQuestionsV1Action / generateFallbackMessageV1Action
//    / extractContactInfoV1Action (generate-actions.ts)
// GK-toggle (answerGeneralKnowledge) wordt bewust niet getoond: de V1-engine
// vergrendelt 'm op false.

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { saveChatbotSettingsAction } from './actions';
import {
  generateStarterQuestionsV1Action,
  generateFallbackMessageV1Action,
  extractContactInfoV1Action,
} from './generate-actions';
import type { V1ChatbotSettings } from './settings-config';
import type { ActionResult } from '@/lib/errors/action';
import type { AnswerLength, Language, SourceStrictness, ToneOfVoice } from '@/lib/v0/klantendashboard/types';
import { Button } from '@/app/v1/_ui/button';
import { ChoiceTiles, Field, Segmented, Switch } from '@/app/v1/_ui/controls';
import { EditablePanel, useEditable, type SaveResult } from '@/app/v1/_ui/editable';
import { EmptyValue, Row, Rows } from '@/app/v1/_ui/panel';

const TONE_OPTIONS: { value: ToneOfVoice; label: string; help: string }[] = [
  { value: 'personal', label: 'Persoonlijk', help: 'Warm en informeel, af en toe een emoji.' },
  { value: 'friendly', label: 'Vriendelijk', help: 'Warm en toegankelijk, zonder emoji.' },
  { value: 'professional', label: 'Zakelijk', help: 'Formeel, spreekt bezoekers aan met u.' },
  { value: 'concise', label: 'Kort en direct', help: 'Snel ter zake, zonder omhaal.' },
  { value: 'enthusiastic', label: 'Enthousiast', help: 'Levendig en positief.' },
  { value: 'informal', label: 'Informeel', help: 'Ontspannen, in de je-vorm.' },
];

const LANGUAGES: Language[] = ['nl', 'en', 'de', 'fr', 'es'];
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

const STRICTNESS_OPTIONS: { value: SourceStrictness; label: string; help: string }[] = [
  { value: 'strict', label: 'Strikt', help: 'alleen wat letterlijk in je bronnen staat' },
  { value: 'normal', label: 'Normaal', help: 'combineert informatie uit je bronnen' },
  { value: 'flexible', label: 'Flexibel', help: 'mag je bronnen ruimer interpreteren' },
];

const SECTIONS = [
  { id: 'basis', label: 'Basis' },
  { id: 'toon', label: 'Toon' },
  { id: 'antwoorden', label: 'Antwoorden' },
  { id: 'contact', label: 'Contact' },
] as const;

/** "Warm en toegankelijk." → "warm en toegankelijk" (voor achter een ·). */
function asClause(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1).replace(/\.$/, '');
}

type Persist = (patch: Partial<V1ChatbotSettings>) => Promise<SaveResult>;

export function V1SettingsForm({ initial }: { initial: V1ChatbotSettings }) {
  const [s, setS] = useState<V1ChatbotSettings>(initial);

  const persist: Persist = async (patch) => {
    const res = await saveChatbotSettingsAction(patch);
    if (!res.ok) return { ok: false, error: res.error };
    setS(res.settings);
    return { ok: true };
  };

  return (
    <div className="v1-subnav-layout">
      <SectionNav />
      <div className="v1-stack">
        <BasisPanel s={s} persist={persist} />
        <ToonPanel s={s} persist={persist} />
        <AntwoordenPanel s={s} persist={persist} />
        <ContactPanel s={s} persist={persist} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sectienavigatie: markeert het paneel dat in beeld is.
// ---------------------------------------------------------------------------

function SectionNav() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        setActive(top.target.id);
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    els.forEach((el) => obs.observe(el));
    // Het laatste paneel haalt de meetzone bovenin nooit als de pagina eindigt:
    // onderaan gescrold = laatste sectie actief.
    const onScroll = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) setActive(SECTIONS[SECTIONS.length - 1].id);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      obs.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <nav aria-label="Secties" className="v1-subnav">
      {SECTIONS.map((sec) => (
        <a
          key={sec.id}
          href={`#${sec.id}`}
          className="v1-subnav-link"
          aria-current={active === sec.id ? 'true' : undefined}
          onClick={(e) => {
            const el = document.getElementById(sec.id);
            if (!el) return;
            e.preventDefault();
            setActive(sec.id);
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          {sec.label}
        </a>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Basis
// ---------------------------------------------------------------------------

function BasisPanel({ s, persist }: { s: V1ChatbotSettings; persist: Persist }) {
  const edit = useEditable({
    current: () => ({
      chatbotName: s.chatbotName,
      companyDescription: s.companyDescription,
      starterText: s.starterQuestions.join('\n'),
      showStarterQuestions: s.showStarterQuestions !== false,
      primaryLanguage: s.primaryLanguage,
      autoDetectLanguage: s.autoDetectLanguage,
    }),
    save: ({ starterText, ...rest }) =>
      persist({
        ...rest,
        starterQuestions: starterText
          .split('\n')
          .map((q) => q.trim())
          .filter((q) => q.length > 0),
      }),
  });
  const d = edit.draft;

  return (
    <EditablePanel
      id="basis"
      title="Basis"
      edit={edit}
      view={
        <Rows>
          <Row label="Naam">{s.chatbotName || <EmptyValue />}</Row>
          <Row label="Over je bedrijf">{s.companyDescription || <EmptyValue />}</Row>
          <Row label="Voorbeeldvragen">
            {s.starterQuestions.length > 0 ? (
              <>
                <div className="v1-chips">
                  {s.starterQuestions.map((q) => (
                    <span key={q} className="v1-chip">
                      {q}
                    </span>
                  ))}
                </div>
                {s.showStarterQuestions === false ? (
                  <div className="v1-row-sub">Niet zichtbaar in de widget.</div>
                ) : null}
              </>
            ) : (
              <EmptyValue>Geen</EmptyValue>
            )}
          </Row>
          <Row label="Taal">
            {LANG_LABEL[s.primaryLanguage]}
            {s.autoDetectLanguage ? <span className="v1-row-sub"> · past zich aan de bezoeker aan</span> : null}
          </Row>
        </Rows>
      }
    >
      <Field label="Naam" hint="Zo heet je chatbot in de widget.">
        {(id) => (
          <input
            id={id}
            className="v1-input v1-input--narrow"
            value={d.chatbotName}
            onChange={(e) => edit.set('chatbotName', e.target.value)}
          />
        )}
      </Field>
      <Field label="Over je bedrijf" hint="Een of twee zinnen, zodat je chatbot weet wie jullie zijn.">
        {(id) => (
          <textarea
            id={id}
            rows={3}
            className="v1-input"
            value={d.companyDescription}
            onChange={(e) => edit.set('companyDescription', e.target.value)}
          />
        )}
      </Field>
      <Field label="Voorbeeldvragen" hint="Een vraag per regel. Bezoekers zien ze als knoppen in een leeg gesprek.">
        {(id) => (
          <>
            <textarea
              id={id}
              rows={3}
              className="v1-input"
              value={d.starterText}
              onChange={(e) => edit.set('starterText', e.target.value)}
            />
            <SuggestButton
              label="Stel vragen voor"
              action={generateStarterQuestionsV1Action}
              onResult={(r) => edit.set('starterText', r.questions.join('\n'))}
            />
          </>
        )}
      </Field>
      <Switch
        label="Voorbeeldvragen tonen in de widget"
        checked={d.showStarterQuestions}
        onChange={(v) => edit.set('showStarterQuestions', v)}
      />
      <Field label="Taal">
        {(id) => (
          <select
            id={id}
            className="v1-input"
            style={{ maxWidth: 220 }}
            value={d.primaryLanguage}
            onChange={(e) => edit.set('primaryLanguage', e.target.value as Language)}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Switch
        label="Antwoorden in de taal van de bezoeker"
        checked={d.autoDetectLanguage}
        onChange={(v) => edit.set('autoDetectLanguage', v)}
      />
    </EditablePanel>
  );
}

// ---------------------------------------------------------------------------
// Toon
// ---------------------------------------------------------------------------

function ToonPanel({ s, persist }: { s: V1ChatbotSettings; persist: Persist }) {
  const edit = useEditable({
    current: () => ({ toneOfVoice: s.toneOfVoice, extraInstructions: s.extraInstructions }),
    save: (draft) => persist(draft),
  });
  const tone = TONE_OPTIONS.find((t) => t.value === s.toneOfVoice);

  return (
    <EditablePanel
      id="toon"
      title="Toon"
      edit={edit}
      view={
        <Rows>
          <Row label="Toon">
            {tone ? (
              <>
                {tone.label}
                <span className="v1-row-sub"> · {asClause(tone.help)}</span>
              </>
            ) : (
              <EmptyValue />
            )}
          </Row>
          <Row label="Extra instructies">{s.extraInstructions || <EmptyValue>Geen</EmptyValue>}</Row>
        </Rows>
      }
    >
      <ChoiceTiles
        label="Toon"
        value={edit.draft.toneOfVoice}
        options={TONE_OPTIONS}
        onChange={(v) => edit.set('toneOfVoice', v)}
      />
      <Field label="Extra instructies (optioneel)">
        {(id) => (
          <textarea
            id={id}
            rows={3}
            className="v1-input"
            placeholder="Bijvoorbeeld: verwijs bij twijfel naar onze contactpagina."
            value={edit.draft.extraInstructions}
            onChange={(e) => edit.set('extraInstructions', e.target.value)}
          />
        )}
      </Field>
    </EditablePanel>
  );
}

// ---------------------------------------------------------------------------
// Antwoorden
// ---------------------------------------------------------------------------

function AntwoordenPanel({ s, persist }: { s: V1ChatbotSettings; persist: Persist }) {
  const edit = useEditable({
    current: () => ({
      answerLength: s.answerLength,
      sourceStrictness: s.sourceStrictness,
      mayMentionPrices: s.mayMentionPrices,
      fallbackMessage: s.fallbackMessage,
      honestAboutUnknown: s.honestAboutUnknown,
      unknownAnswerMessage: s.unknownAnswerMessage,
    }),
    save: (draft) => persist(draft),
  });
  const d = edit.draft;
  const strictness = STRICTNESS_OPTIONS.find((o) => o.value === s.sourceStrictness);

  return (
    <EditablePanel
      id="antwoorden"
      title="Antwoorden"
      edit={edit}
      view={
        <Rows>
          <Row label="Lengte">{LENGTH_OPTIONS.find((o) => o.value === s.answerLength)?.label}</Row>
          <Row label="Bij de bronnen blijven">
            {strictness?.label}
            {strictness ? <span className="v1-row-sub"> · {strictness.help}</span> : null}
          </Row>
          <Row label="Prijzen noemen">{s.mayMentionPrices ? 'Ja' : 'Nee, verwijst naar contact'}</Row>
          <Row label="Geen antwoord gevonden">{s.fallbackMessage || <EmptyValue />}</Row>
          <Row label="Bij twijfel">
            {s.honestAboutUnknown ? (
              s.unknownAnswerMessage || 'Zegt eerlijk dat hij het niet zeker weet'
            ) : (
              <EmptyValue>Uit</EmptyValue>
            )}
          </Row>
        </Rows>
      }
    >
      <div className="v1-field">
        <span className="v1-label">Lengte</span>
        <Segmented
          label="Lengte"
          value={d.answerLength}
          options={LENGTH_OPTIONS}
          onChange={(v) => edit.set('answerLength', v)}
        />
      </div>
      <div className="v1-field">
        <span className="v1-label">Bij de bronnen blijven</span>
        <Segmented
          label="Bij de bronnen blijven"
          value={d.sourceStrictness}
          options={STRICTNESS_OPTIONS}
          onChange={(v) => edit.set('sourceStrictness', v)}
        />
        <p className="v1-hint">
          Strikt: alleen wat letterlijk in je bronnen staat. Flexibel: mag je bronnen ruimer interpreteren.
        </p>
      </div>
      <Switch
        label="Prijzen noemen"
        description="Uit: je chatbot verwijst voor prijzen naar je contactgegevens."
        checked={d.mayMentionPrices}
        onChange={(v) => edit.set('mayMentionPrices', v)}
      />
      <Field label="Als er niets in je bronnen staat" hint="Dit bericht krijgt een bezoeker als je chatbot geen antwoord vindt.">
        {(id) => (
          <>
            <textarea
              id={id}
              rows={3}
              className="v1-input"
              value={d.fallbackMessage}
              onChange={(e) => edit.set('fallbackMessage', e.target.value)}
            />
            <SuggestButton
              label="Stel een tekst voor"
              action={generateFallbackMessageV1Action}
              onResult={(r) => edit.set('fallbackMessage', r.message)}
            />
          </>
        )}
      </Field>
      <details className="v1-details">
        <summary>Geavanceerd</summary>
        <div className="v1-details-body">
          <Switch
            label="Eerlijk zeggen bij twijfel"
            description="Aanbevolen. Je chatbot geeft dan geen antwoord dat niet in je bronnen staat."
            checked={d.honestAboutUnknown}
            onChange={(v) => edit.set('honestAboutUnknown', v)}
          />
          {d.honestAboutUnknown ? (
            <Field label="Wat hij dan zegt (optioneel)" hint="Leeg laten geeft een standaardformulering.">
              {(id) => (
                <textarea
                  id={id}
                  rows={2}
                  className="v1-input"
                  placeholder="Dat weet ik niet zeker. Neem gerust contact met ons op, dan helpen we je verder."
                  value={d.unknownAnswerMessage}
                  onChange={(e) => edit.set('unknownAnswerMessage', e.target.value)}
                />
              )}
            </Field>
          ) : null}
        </div>
      </details>
    </EditablePanel>
  );
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

function ContactPanel({ s, persist }: { s: V1ChatbotSettings; persist: Persist }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const edit = useEditable({
    current: () => ({
      mayShareContact: s.mayShareContact,
      contactEmail: s.contactEmail,
      contactPhone: s.contactPhone,
      contactPageUrl: s.contactPageUrl,
      contactRequestsEnabled: s.contactRequestsEnabled,
      notificationEmail: s.notificationEmail ?? '',
    }),
    save: ({ notificationEmail, ...rest }) =>
      persist({ ...rest, notificationEmail: notificationEmail.trim() }),
  });
  const d = edit.draft;

  return (
    <>
      <EditablePanel
        id="contact"
        title="Contact"
        edit={edit}
        view={
          <Rows>
            <Row label="Contactgegevens delen">{s.mayShareContact ? 'Ja' : 'Nee'}</Row>
            <Row label="E-mail">{s.contactEmail || <EmptyValue />}</Row>
            <Row label="Telefoon">{s.contactPhone || <EmptyValue />}</Row>
            <Row label="Contactpagina">{s.contactPageUrl || <EmptyValue />}</Row>
            <Row label="Contactverzoeken">
              {s.contactRequestsEnabled ? (
                <>
                  Aan
                  <span className="v1-row-sub">
                    {' '}
                    · meldingen naar {s.notificationEmail || 'je account-e-mailadres'}
                  </span>
                </>
              ) : (
                <EmptyValue>Uit</EmptyValue>
              )}
            </Row>
          </Rows>
        }
      >
        <Switch
          label="Contactgegevens delen"
          description="Je chatbot mag je e-mail, telefoon en contactpagina noemen."
          checked={d.mayShareContact}
          onChange={(v) => edit.set('mayShareContact', v)}
        />
        <div className="v1-edit-grid">
          <Field label="E-mail">
            {(id) => (
              <input
                id={id}
                type="email"
                className="v1-input"
                value={d.contactEmail}
                onChange={(e) => edit.set('contactEmail', e.target.value)}
              />
            )}
          </Field>
          <Field label="Telefoon">
            {(id) => (
              <input
                id={id}
                type="tel"
                className="v1-input"
                value={d.contactPhone}
                onChange={(e) => edit.set('contactPhone', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Contactpagina">
          {(id) => (
            <input
              id={id}
              type="url"
              className="v1-input v1-input--medium"
              placeholder="https://"
              value={d.contactPageUrl}
              onChange={(e) => edit.set('contactPageUrl', e.target.value)}
            />
          )}
        </Field>
        <SuggestButton
          label="Haal op van je website"
          action={extractContactInfoV1Action}
          onResult={(r) => {
            if (r.contactEmail) edit.set('contactEmail', r.contactEmail);
            if (r.contactPhone) edit.set('contactPhone', r.contactPhone);
            if (r.contactPageUrl) edit.set('contactPageUrl', r.contactPageUrl);
          }}
        />
        <Switch
          label="Contactverzoeken aannemen"
          description="Wil een bezoeker contact, dan biedt je chatbot een kort formulier aan."
          checked={d.contactRequestsEnabled}
          onChange={(v) => {
            // Aanzetten = persoonsgegevens verzamelen → eerst bevestigen.
            if (v && !s.contactRequestsEnabled) setConfirmOpen(true);
            else edit.set('contactRequestsEnabled', v);
          }}
        />
        {d.contactRequestsEnabled ? (
          <Field label="Meldingen sturen naar" hint="Leeg laten stuurt ze naar je account-e-mailadres.">
            {(id) => (
              <input
                id={id}
                type="email"
                className="v1-input v1-input--narrow"
                placeholder="info@jouwbedrijf.nl"
                value={d.notificationEmail}
                onChange={(e) => edit.set('notificationEmail', e.target.value)}
              />
            )}
          </Field>
        ) : null}
      </EditablePanel>

      {confirmOpen ? (
        <ConfirmContactRequests
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            edit.set('contactRequestsEnabled', true);
          }}
        />
      ) : null}
    </>
  );
}

function ConfirmContactRequests({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="v1-dialog-backdrop" onClick={onCancel}>
      <div
        className="v1-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cr-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cr-dialog-title" className="v1-dialog-title">
          Contactverzoeken aanzetten?
        </h2>
        <p className="v1-dialog-body">
          Wil een bezoeker contact met een mens, dan biedt je chatbot na zijn antwoord een kort formulier
          aan: naam, contactgegevens en een korte toelichting.
        </p>
        <p className="v1-dialog-body">
          Je verzamelt dan persoonsgegevens. Ze staan onder Contactverzoeken en worden na 90 dagen
          automatisch verwijderd. Verwerk ze volgens de AVG.
        </p>
        <div className="v1-dialog-actions">
          <Button variant="ghost" onClick={onCancel} autoFocus>
            Annuleren
          </Button>
          <Button onClick={onConfirm}>Aanzetten</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Knop die een AI-voorstel ophaalt en in de draft zet (nog niet opgeslagen).
// ---------------------------------------------------------------------------

function SuggestButton<T extends Record<string, unknown>>({
  label,
  action,
  onResult,
}: {
  label: string;
  action: () => Promise<ActionResult<T>>;
  onResult: (data: T) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Button
        variant="ghost"
        size="sm"
        loading={busy}
        onClick={async () => {
          setErr(null);
          setBusy(true);
          try {
            const res = await action();
            if (res.ok) onResult(res);
            else setErr(res.error);
          } catch {
            setErr('Dat lukte niet. Probeer het opnieuw.');
          } finally {
            setBusy(false);
          }
        }}
        style={{ paddingLeft: 10 }}
      >
        {busy ? null : <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />}
        {label}
      </Button>
      {err ? (
        <span role="alert" style={{ fontSize: 12, color: 'var(--v1-danger)' }}>
          {err}
        </span>
      ) : null}
    </div>
  );
}
