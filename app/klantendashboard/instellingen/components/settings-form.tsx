'use client';

import { useState, useTransition } from 'react';
import { Check, RotateCcw, Save, Sparkles } from 'lucide-react';
import { saveChatbotSettingsAction, saveContactRequestsSettingsAction } from '../../actions';
import type { ActionResult } from '@/lib/errors/action';
import type {
  AnswerLength,
  ChatbotSettings,
  ContactRequestsSettings,
  Language,
  SourceStrictness,
  ToneOfVoice,
} from '@/lib/v0/klantendashboard/types';

/** Save-action: standaard de cookie-gebonden klantendashboard-action; het admin-
 *  dashboard injecteert een variant die op de route-param-org schrijft. */
type SaveChatbotAction = (
  patch: Partial<ChatbotSettings>,
) => Promise<ActionResult<{ chatbot: ChatbotSettings }>>;

const TONE_OPTIONS: { value: ToneOfVoice; label: string; help: string }[] = [
  { value: 'personal', label: 'Persoonlijk', help: 'Warm en informeel, alsof je met de klant appt — met af en toe een emoji. Aanbevolen.' },
  { value: 'professional', label: 'Professioneel', help: 'Zakelijk, formeel, gebruikt "u"-vorm.' },
  { value: 'friendly', label: 'Vriendelijk', help: 'Warm en toegankelijk, lichte je-vorm, geen emoji.' },
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

export function SettingsForm({
  initial,
  action = saveChatbotSettingsAction,
  showReset = false,
  onGenerateStarters,
  onGenerateFallback,
  onAutofillContact,
}: {
  initial: ChatbotSettings;
  action?: SaveChatbotAction;
  showReset?: boolean;
  // AI-genereer-knoppen. Optioneel/injecteerbaar (zoals `action`): de klant-
  // pagina geeft de cookie-org-actions mee; contexten die ze niet meegeven
  // (bv. het admin-dashboard) tonen de knoppen simpelweg niet.
  onGenerateStarters?: () => Promise<ActionResult<{ questions: string[] }>>;
  onGenerateFallback?: () => Promise<ActionResult<{ message: string }>>;
  onAutofillContact?: () => Promise<
    ActionResult<{ contactEmail: string; contactPhone: string; contactPageUrl: string }>
  >;
}) {
  const [s, setS] = useState<ChatbotSettings>(initial);
  // baseline = laatst opgeslagen staat; "Terugzetten" herstelt hiernaartoe.
  const [baseline, setBaseline] = useState<ChatbotSettings>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Bevestiging vóór het AANzetten van algemene kennis (uitzetten = direct).
  const [gkConfirmOpen, setGkConfirmOpen] = useState(false);

  const dirty = JSON.stringify(s) !== JSON.stringify(baseline);

  function update<K extends keyof ChatbotSettings>(key: K, value: ChatbotSettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function reset() {
    setS(baseline);
    setSaved(false);
    setError(null);
  }

  function save() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await action(s);
      if (res.ok) {
        setS(res.chatbot);
        setBaseline(res.chatbot);
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
        <Field label="Startsuggesties" hint="Voorbeeldvragen die de bezoeker direct kan klikken — één per regel.">
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
          {onGenerateStarters && (
            <div style={{ marginTop: 8 }}>
              <GenerateButton
                label="Genereer suggesties"
                pendingLabel="Genereren…"
                action={onGenerateStarters}
                onResult={(d) => update('starterQuestions', d.questions)}
              />
            </div>
          )}
        </Field>
        <Toggle
          label="Startsuggesties tonen"
          help="Aan: de widget toont klikbare voorbeeldvragen bij een leeg gesprek. Uit: geen suggestie-chips (je vragen blijven bewaard)."
          value={s.showStarterQuestions !== false}
          onChange={(v) => update('showStarterQuestions', v)}
        />
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
          help="Aan: als een bezoeker in een andere taal schrijft, antwoordt de bot in die taal. Uit: de bot blijft altijd in de hoofdtaal."
          value={s.autoDetectLanguage}
          onChange={(v) => update('autoDetectLanguage', v)}
        />
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
        {s.honestAboutUnknown && (
          <Field
            label="Formulering bij twijfel"
            hint="Wat zegt de bot wanneer hij iets niet zeker weet? Leeg laten = generieke 'ik weet het niet zeker'-formulering."
          >
            <textarea
              className="klant-textarea"
              value={s.unknownAnswerMessage}
              onChange={(e) => update('unknownAnswerMessage', e.target.value)}
              rows={2}
              placeholder="Bijv. 'Dat weet ik niet zeker op basis van wat ik heb. Neem gerust contact met ons op, dan helpen we je graag verder.'"
            />
          </Field>
        )}
        <Toggle
          label="Mag de chatbot algemene kennisvragen beantwoorden?"
          help="Standaard uit. Aan: als je bronnen géén antwoord op een vraag bevatten, mag de bot een kort algemeen antwoord met disclaimer geven in plaats van 'dat weet ik niet'. Antwoorden mét bron blijven altijd op je bronnen gebaseerd."
          value={s.answerGeneralKnowledge}
          onChange={(v) => {
            // Aanzetten vereist bevestiging; uitzetten gaat direct.
            if (v) setGkConfirmOpen(true);
            else update('answerGeneralKnowledge', false);
          }}
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
          {onGenerateFallback && (
            <div style={{ marginTop: 8 }}>
              <GenerateButton
                label="Genereer fallback"
                pendingLabel="Genereren…"
                action={onGenerateFallback}
                onResult={(d) => update('fallbackMessage', d.message)}
              />
            </div>
          )}
        </Field>
        {onAutofillContact && (
          <div>
            <GenerateButton
              label="Vul contactgegevens automatisch in"
              pendingLabel="Bezig met ophalen…"
              action={onAutofillContact}
              onResult={(d) => {
                if (d.contactEmail) update('contactEmail', d.contactEmail);
                if (d.contactPhone) update('contactPhone', d.contactPhone);
                if (d.contactPageUrl) update('contactPageUrl', d.contactPageUrl);
              }}
            />
            <div className="klant-hint" style={{ marginTop: 6 }}>
              Leest je gecrawlde contactpagina’s en vult onderstaande velden voor je in. Controleer ze en sla op.
            </div>
          </div>
        )}
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
        {showReset && (
          <button
            type="button"
            className="klant-btn"
            data-variant="ghost"
            onClick={reset}
            disabled={pending || !dirty}
          >
            <RotateCcw size={14} strokeWidth={1.8} /> Terugzetten
          </button>
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

      {/* Bevestiging vóór aanzetten van algemene kennis. Volgt het modal-patroon
          van de Q&A-tab (fixed overlay + klant-card); knoppen type="button" zodat
          het formulier niet voortijdig submit. */}
      {gkConfirmOpen && (
        <div
          onClick={() => setGkConfirmOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 100,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Algemene kennisvragen toestaan"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="klant-card"
            style={{
              width: '100%',
              maxWidth: 520,
              background: 'var(--klant-bg-elev)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                color: 'var(--klant-fg)',
              }}
            >
              Algemene kennisvragen toestaan?
            </h3>
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--klant-fg)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <p style={{ margin: 0 }}>
                <strong>Wat verandert er:</strong>{' '}Normaal antwoordt je chatbot alléén op basis
                van jouw eigen bronnen (website, documenten, Q&amp;A). Staat er niets over in je
                bronnen, dan zegt hij eerlijk dat hij het niet weet en verwijst hij door. Met deze
                instelling aan mag de chatbot bij zulke vragen óók een kort, algemeen antwoord uit
                eigen kennis geven — duidelijk herkenbaar, beginnend met{' '}
                <em>&ldquo;dit valt buiten onze specifieke documentatie, maar in het algemeen…&rdquo;</em>.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Wat betekent dat:</strong>{' '}Voordeel — je chatbot blijft behulpzaam bij
                algemene vragen rond je vakgebied in plaats van simpelweg &ldquo;dat weet ik
                niet&rdquo;. Let op — die algemene antwoorden komen <em>niet</em> uit jouw bronnen
                en kunnen minder precies of niet helemaal op jouw situatie van toepassing zijn.
                Vragen waar je bronnen wél iets over zeggen blijven altijd brongebaseerd.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button
                type="button"
                className="klant-btn"
                onClick={() => setGkConfirmOpen(false)}
              >
                Annuleren
              </button>
              <button
                type="button"
                className="klant-btn"
                data-variant="primary"
                onClick={() => {
                  update('answerGeneralKnowledge', true);
                  setGkConfirmOpen(false);
                }}
              >
                Ja, toestaan
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

/** Contactverzoeken-instelling (migr 0053). Eigen sectie + eigen save-action
 *  (saveContactRequestsSettingsAction), bewust LOS van het chatbot-settings-
 *  formulier hierboven: de toggle schrijft een aparte jsonb-kolom en mag een
 *  gelijktijdige chatbot-save niet clobberen. Volgt het #199-patroon: aanzetten
 *  vraagt bevestiging (de bot gaat dan PII van bezoekers verzamelen), uitzetten
 *  gaat direct. Optioneel meldingsadres — leeg = val terug op het account-e-mail. */
export function ContactRequestsSection({
  initial,
  action = saveContactRequestsSettingsAction,
}: {
  initial: ContactRequestsSettings;
  action?: (
    patch: Partial<ContactRequestsSettings>,
  ) => Promise<ActionResult<{ contactRequests: ContactRequestsSettings }>>;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [email, setEmail] = useState(initial.notificationEmail ?? '');
  const [baselineEmail, setBaselineEmail] = useState(initial.notificationEmail ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const emailDirty = email.trim() !== baselineEmail.trim();

  function persist(patch: Partial<ContactRequestsSettings>) {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await action(patch);
      if (res.ok) {
        setEnabled(res.contactRequests.enabled);
        const nextEmail = res.contactRequests.notificationEmail ?? '';
        setEmail(nextEmail);
        setBaselineEmail(nextEmail);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res.error);
      }
    });
  }

  function toggle(next: boolean) {
    // Aanzetten vereist bevestiging (PII-verzameling); uitzetten gaat direct.
    if (next) {
      setConfirmOpen(true);
    } else {
      persist({ enabled: false });
    }
  }

  return (
    <Section
      title="Contactverzoeken"
      help="Laat je chatbot bezoekers met een contactvraag een kort terugbel- of mailverzoek achterlaten. Verzoeken verschijnen in de tab Contactverzoeken; je krijgt er een e-mail van."
    >
      <Toggle
        label="Contactverzoeken inschakelen"
        help="Standaard uit. Aan: merkt de chatbot dat een bezoeker contact wil (terugbellen, offerte), dan biedt hij ná het antwoord een kort formulier aan."
        value={enabled}
        onChange={toggle}
      />
      {enabled && (
        <Field
          label="Meldings-e-mailadres (optioneel)"
          hint="Naar welk adres gaan nieuwe contactverzoeken? Laat leeg om het account-e-mailadres te gebruiken."
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="email"
              className="klant-input"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSaved(false);
              }}
              placeholder="bijv. info@jouwbedrijf.nl"
              style={{ maxWidth: 320 }}
            />
            <button
              type="button"
              className="klant-btn"
              data-variant="primary"
              disabled={pending || !emailDirty}
              onClick={() => persist({ notificationEmail: email.trim() || null })}
            >
              {pending ? 'Bezig…' : 'Opslaan'}
            </button>
          </div>
        </Field>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 18 }}>
        {error && <span style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</span>}
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
      </div>

      {/* Bevestiging vóór aanzetten (PII-verzameling) — zelfde modal-patroon als
          de algemene-kennis-toggle (#199). */}
      {confirmOpen && (
        <div
          onClick={() => setConfirmOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 100,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Contactverzoeken inschakelen"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="klant-card"
            style={{
              width: '100%',
              maxWidth: 520,
              background: 'var(--klant-bg-elev)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                color: 'var(--klant-fg)',
              }}
            >
              Contactverzoeken inschakelen?
            </h3>
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--klant-fg)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <p style={{ margin: 0 }}>
                <strong>Wat verandert er:</strong>{' '}Merkt je chatbot dat een bezoeker contact met
                een mens wil, dan biedt hij ná zijn antwoord aan om je te laten terugbellen of
                mailen. Zegt de bezoeker ja, dan vult die een kort formulier in (naam, contact,
                korte toelichting, toestemming).
              </p>
              <p style={{ margin: 0 }}>
                <strong>Wat betekent dat:</strong>{' '}Je verzamelt dan persoonsgegevens van
                bezoekers. Die landen in de tab Contactverzoeken en worden na 90 dagen automatisch
                verwijderd. Zorg dat je deze gegevens conform de AVG verwerkt.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button type="button" className="klant-btn" onClick={() => setConfirmOpen(false)}>
                Annuleren
              </button>
              <button
                type="button"
                className="klant-btn"
                data-variant="primary"
                onClick={() => {
                  setConfirmOpen(false);
                  persist({ enabled: true });
                }}
              >
                Ja, inschakelen
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
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

/** Kleine ✨-knop die een AI-genereer-action draait en het resultaat aan de
 *  caller teruggeeft (die het in het formulier-state zet). Eigen busy-/fout-state
 *  per knop; gebruikt geen startTransition zodat een save niet wordt geblokkeerd. */
function GenerateButton<T extends Record<string, unknown>>({
  label,
  pendingLabel,
  action,
  onResult,
}: {
  label: string;
  pendingLabel: string;
  action: () => Promise<ActionResult<T>>;
  onResult: (data: T) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button
        type="button"
        className="klant-btn"
        data-variant="ghost"
        disabled={busy}
        onClick={async () => {
          setErr(null);
          setBusy(true);
          try {
            const res = await action();
            if (res.ok) onResult(res);
            else setErr(res.error);
          } catch {
            setErr('Er ging iets mis. Probeer het opnieuw.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles size={14} strokeWidth={1.8} /> {busy ? pendingLabel : label}
      </button>
      {err && <span style={{ fontSize: 12, color: 'var(--klant-danger)' }}>{err}</span>}
    </div>
  );
}
