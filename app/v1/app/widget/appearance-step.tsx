'use client';

// Stap 1 Uiterlijk: velden links, live voorbeeld rechts. Direct bewerken; de
// opslaanbalk verschijnt pas bij een wijziging en stuurt alleen de gewijzigde
// velden naar de bestaande saveChatbotSettingsAction. Een logo uploaden of
// verwijderen slaat direct op (alleen de logo-velden), zonder andere nog niet
// opgeslagen wijzigingen weg te gooien.

import { useRef, useState, useTransition } from 'react';
import { Upload } from 'lucide-react';
import { COLOR_PRESETS } from '@/lib/widget/color-presets';
import { toWidgetAppearance } from '@/lib/v1/widget/appearance';
import { WidgetView } from '@/app/embed-v1/_widget/widget-view';
import { Field, Segmented } from '@/app/v1/_ui/controls';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { saveChatbotSettingsAction } from '../instellingen/actions';
import { PreviewFrame } from '../preview/preview-frame';
import { changedFields, normalizeHex } from './format';
import type { EditableAppearance } from './widget-form';

// Max 200 KB voor de base64-data-URL (server-side cap = 300 KB incl. base64-overhead).
const MAX_LOGO_BYTES = 200 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const SWATCHES = ['#0c1e2e', ...COLOR_PRESETS];

const POSITIONS = [
  { value: 'bottom-right', label: 'Rechtsonder' },
  { value: 'bottom-left', label: 'Linksonder' },
] as const;

function pickEditable(s: EditableAppearance): EditableAppearance {
  return {
    accentColor: s.accentColor,
    position: s.position,
    headerTitle: s.headerTitle,
    subtitle: s.subtitle,
    welcomeMessage: s.welcomeMessage,
    launcherText: s.launcherText,
    logoStyle: s.logoStyle,
    customLogoDataUrl: s.customLogoDataUrl,
  };
}

export function AppearanceStep({
  initial,
  fallbackTitle,
  starterQuestions,
}: {
  initial: EditableAppearance;
  fallbackTitle: string;
  starterQuestions: string[];
}) {
  const toast = useToast();
  const [base, setBase] = useState<EditableAppearance>(initial);
  const [draft, setDraft] = useState<EditableAppearance>(initial);
  const [hexText, setHexText] = useState(initial.accentColor);
  const [hexError, setHexError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [saving, startSave] = useTransition();
  const [logoBusy, startLogo] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = changedFields(base, draft);
  const dirty = Object.keys(patch).length > 0;

  const preview = toWidgetAppearance(
    { ...draft, chatbotName: '', starterQuestions, showStarterQuestions: true },
    fallbackTitle,
  );

  function set<K extends keyof EditableAppearance>(key: K, value: EditableAppearance[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setColor(hex: string) {
    set('accentColor', hex);
    setHexText(hex);
    setHexError(null);
  }

  function commitHex() {
    const hex = normalizeHex(hexText);
    if (!hex) {
      setHexError('Gebruik een kleurcode als #0C1E2E.');
      return;
    }
    setColor(hex);
  }

  function save() {
    if (!dirty || hexError) return;
    startSave(async () => {
      const res = await saveChatbotSettingsAction(patch);
      if (res.ok) {
        const saved = pickEditable(res.settings);
        setBase(saved);
        setDraft(saved);
        setHexText(saved.accentColor);
        toast.success('Uiterlijk opgeslagen');
      } else {
        toast.error(res.error || 'Opslaan lukte niet. Probeer het opnieuw.');
      }
    });
  }

  function cancel() {
    setDraft(base);
    setHexText(base.accentColor);
    setHexError(null);
  }

  // Logo-wijzigingen slaan direct op; alleen de logo-velden van base en draft
  // worden bijgewerkt, zodat andere ongesavede wijzigingen blijven staan.
  function saveLogo(logoPatch: Pick<EditableAppearance, 'logoStyle' | 'customLogoDataUrl'>, okText: string) {
    startLogo(async () => {
      const res = await saveChatbotSettingsAction(logoPatch);
      if (res.ok) {
        const saved = { logoStyle: res.settings.logoStyle, customLogoDataUrl: res.settings.customLogoDataUrl };
        setBase((b) => ({ ...b, ...saved }));
        setDraft((d) => ({ ...d, ...saved }));
        toast.success(okText);
      } else {
        setLogoError(res.error || 'Opslaan van het logo lukte niet.');
      }
    });
  }

  function onLogoFile(file: File) {
    setLogoError(null);
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setLogoError('Kies een PNG, JPG, WebP of SVG.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`Dit bestand is ${(file.size / 1024).toFixed(0)} KB. Maximaal ${MAX_LOGO_BYTES / 1024} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => saveLogo({ logoStyle: 'custom-logo', customLogoDataUrl: String(reader.result ?? '') }, 'Logo opgeslagen');
    reader.onerror = () => setLogoError('Kon het bestand niet lezen.');
    reader.readAsDataURL(file);
  }

  const iconOptions = [
    { value: 'chat-bubble', label: 'Chat-bubbel' },
    { value: 'brand-mark', label: 'ChatManta' },
    { value: 'custom-logo', label: 'Eigen logo' },
  ] as const;

  return (
    <section className="v1-wg-step" aria-labelledby="wg-step-1">
      <h2 id="wg-step-1" className="v1-wg-step-title">
        <span className="v1-wg-step-num">1</span> Uiterlijk
      </h2>

      <div className="v1-wg-split">
        <div className="v1-card v1-wg-form">
          <div className="v1-field">
            <span className="v1-label" id="wg-color-label">
              Kleur
            </span>
            <div className="v1-wg-swatches" role="radiogroup" aria-labelledby="wg-color-label">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={draft.accentColor.toLowerCase() === c.toLowerCase()}
                  aria-label={c}
                  className="v1-wg-swatch"
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
              <label className="v1-wg-swatch v1-wg-swatch--custom" title="Eigen kleur kiezen">
                <span className="v1-sr-only">Eigen kleur kiezen</span>
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(draft.accentColor) ? draft.accentColor : '#0c1e2e'}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
            </div>
            <input
              className="v1-input v1-wg-hex"
              value={hexText}
              aria-label="Kleurcode"
              aria-invalid={hexError ? true : undefined}
              onChange={(e) => {
                setHexText(e.target.value);
                setHexError(null);
                const hex = normalizeHex(e.target.value);
                if (hex && e.target.value.replace('#', '').length === 6) set('accentColor', hex);
              }}
              onBlur={commitHex}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitHex();
                }
              }}
            />
            {hexError ? <p className="v1-wg-error">{hexError}</p> : null}
          </div>

          <div className="v1-field">
            <span className="v1-label" id="wg-icon-label">
              Icoon
            </span>
            <div className="v1-wg-icons" role="radiogroup" aria-labelledby="wg-icon-label">
              {iconOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.logoStyle === o.value}
                  className="v1-wg-icon"
                  disabled={logoBusy}
                  onClick={() => {
                    if (o.value === 'custom-logo' && !draft.customLogoDataUrl) fileRef.current?.click();
                    else set('logoStyle', o.value);
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {draft.logoStyle === 'custom-logo' && draft.customLogoDataUrl ? (
              <div className="v1-wg-logo-row">
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={logoBusy}>
                  <Upload size={14} /> Ander logo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={logoBusy}
                  onClick={() => saveLogo({ logoStyle: 'chat-bubble', customLogoDataUrl: null }, 'Logo verwijderd')}
                >
                  Logo verwijderen
                </Button>
              </div>
            ) : null}
            <p className="v1-hint">Eigen logo: PNG, JPG, WebP of SVG, maximaal 200 KB. Vierkant werkt het best.</p>
            {logoError ? (
              <p className="v1-wg-error" role="alert">
                {logoError}
              </p>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept={ALLOWED_LOGO_TYPES.join(',')}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onLogoFile(f);
                e.target.value = '';
              }}
            />
          </div>

          <div className="v1-field">
            <span className="v1-label">Positie</span>
            <Segmented label="Positie" value={draft.position} options={POSITIONS} onChange={(v) => set('position', v)} />
          </div>

          <Field label="Titel" hint="Leeg laten voor de naam van je chatbot.">
            {(id) => (
              <input
                id={id}
                className="v1-input"
                value={draft.headerTitle}
                placeholder={fallbackTitle}
                maxLength={120}
                onChange={(e) => set('headerTitle', e.target.value)}
              />
            )}
          </Field>
          <Field label="Ondertitel" hint="Optioneel, klein onder de titel.">
            {(id) => (
              <input
                id={id}
                className="v1-input"
                value={draft.subtitle}
                placeholder="Bijvoorbeeld: meestal binnen een minuut antwoord"
                maxLength={120}
                onChange={(e) => set('subtitle', e.target.value)}
              />
            )}
          </Field>
          <Field label="Begroeting" hint="Groot in de kop zolang er nog geen gesprek is.">
            {(id) => (
              <input
                id={id}
                className="v1-input"
                value={draft.welcomeMessage}
                maxLength={300}
                onChange={(e) => set('welcomeMessage', e.target.value)}
              />
            )}
          </Field>
          <Field label="Tekst bij de knop" hint="Optioneel. Verschijnt even naast de chatknop.">
            {(id) => (
              <input
                id={id}
                className="v1-input"
                value={draft.launcherText}
                placeholder="Hoi! Heb je een vraag?"
                maxLength={120}
                onChange={(e) => set('launcherText', e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="v1-wg-preview" aria-label="Voorbeeld van je widget">
          <PreviewFrame compact>
            <WidgetView
              appearance={preview}
              mode="contained"
              open={previewOpen}
              onOpenChange={setPreviewOpen}
              messages={[]}
              peek={!previewOpen}
              readOnly
            />
          </PreviewFrame>
        </div>
      </div>

      {dirty ? (
        <div className="v1-wg-savebar" role="region" aria-label="Niet opgeslagen wijzigingen">
          <span>Je hebt wijzigingen die nog niet zijn opgeslagen.</span>
          <div className="v1-wg-savebar-actions">
            <Button variant="ghost" onClick={cancel} disabled={saving}>
              Annuleren
            </Button>
            <Button onClick={save} loading={saving} disabled={!!hexError}>
              Opslaan
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
