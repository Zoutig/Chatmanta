'use client';

// WP5b — admin-variant van het klant-widgetformulier (uiterlijk-velden). Zelfde reden
// als de admin-settings-form: de klant-V1WidgetForm is hardwired aan session-gescopete
// actions. Deze variant bewerkt de widget-uiterlijk-velden (dezelfde chatbots.settings
// jsonb) via adminSaveChatbotSettingsAction(orgId, patch). Read-only levenscyclus-status
// (is_active / last_seen) toont de tab-RSC erboven. Kleur via de V1-ColorField,
// icoonkeuze via ChoiceTiles (geen live-voorbeeld; dat toont het klantscherm).

import { useRef, useState, useTransition } from 'react';
import { Check, Upload, X } from 'lucide-react';
import { adminSaveChatbotSettingsAction } from './actions';
import type { V1ChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import type { WidgetPosition, WidgetTheme } from '@/lib/v0/klantendashboard/types';
import { Button } from '@/app/v1/_ui/button';
import { ChoiceTiles, Field, Segmented } from '@/app/v1/_ui/controls';
import { ColorField } from '@/app/v1/_ui/color-field';
import { ALLOWED_LOGO_TYPES, LogoError, normalizeLogoFile } from '@/lib/v1/widget/logo-normalize';
import './org-forms.css';

type LogoStyle = V1ChatbotSettings['logoStyle'];

const LOGO_OPTIONS: { value: LogoStyle; label: string; help: string }[] = [
  { value: 'brand-mark', label: 'ChatManta-mark', help: 'Merkteken, kleurt mee met de accentkleur.' },
  { value: 'chat-bubble', label: 'Chat-bubbel', help: 'Universeel pictogram.' },
  { value: 'custom-logo', label: 'Eigen logo', help: 'PNG, JPG, WebP of SVG. Wordt bijgesneden en passend gemaakt voor de ronde knop.' },
];

const POSITION_OPTIONS: { value: WidgetPosition; label: string }[] = [
  { value: 'bottom-left', label: 'Linksonder' },
  { value: 'bottom-right', label: 'Rechtsonder' },
];

type Appearance = Pick<
  V1ChatbotSettings,
  'accentColor' | 'position' | 'headerTitle' | 'launcherText' | 'welcomeMessage' | 'logoStyle' | 'customLogoDataUrl' | 'theme' | 'subtitle'
>;

export function AdminWidgetForm({ orgId, initial }: { orgId: string; initial: V1ChatbotSettings }) {
  const [a, setA] = useState<Appearance>({
    accentColor: initial.accentColor,
    position: initial.position,
    headerTitle: initial.headerTitle,
    launcherText: initial.launcherText,
    welcomeMessage: initial.welcomeMessage,
    logoStyle: initial.logoStyle,
    customLogoDataUrl: initial.customLogoDataUrl,
    theme: initial.theme,
    subtitle: initial.subtitle,
  });
  const [baseline, setBaseline] = useState<Appearance>(a);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoWarning, setLogoWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(a) !== JSON.stringify(baseline);

  function update<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    setA((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function save() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await adminSaveChatbotSettingsAction(orgId, a);
      if (res.ok) {
        const next: Appearance = {
          accentColor: res.settings.accentColor,
          position: res.settings.position,
          headerTitle: res.settings.headerTitle,
          launcherText: res.settings.launcherText,
          welcomeMessage: res.settings.welcomeMessage,
          logoStyle: res.settings.logoStyle,
          customLogoDataUrl: res.settings.customLogoDataUrl,
          theme: res.settings.theme,
          subtitle: res.settings.subtitle,
        };
        setA(next);
        setBaseline(next);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res.error);
      }
    });
  }

  // Zelfde bijsnijden als op het klantscherm (lib/v1/widget/logo-normalize).
  async function handleLogoUpload(file: File) {
    setError(null);
    setLogoWarning(null);
    try {
      const { dataUrl, warning } = await normalizeLogoFile(file);
      setLogoWarning(warning);
      setA((prev) => ({ ...prev, logoStyle: 'custom-logo', customLogoDataUrl: dataUrl }));
      setSaved(false);
    } catch (e) {
      setError(e instanceof LogoError ? e.message : 'Het logo kon niet worden verwerkt.');
    }
  }

  return (
    <section className="v1-card v1-adm-of-card">
      <header className="v1-adm-of-card-head">
        <h2 className="v1-section-title">Widget-uiterlijk</h2>
        <p className="v1-adm-of-card-help">Kleur, icoon, positie en teksten van de embed-widget van deze klant.</p>
      </header>

      <ColorField label="Accentkleur" value={a.accentColor} onChange={(v) => update('accentColor', v)} disabled={pending} />

      <div className="v1-field">
        <span className="v1-label">Icoon op de chatknop</span>
        <ChoiceTiles
          label="Icoon op de chatknop"
          value={a.logoStyle}
          options={LOGO_OPTIONS}
          onChange={(v) => {
            if (v === 'custom-logo' && !a.customLogoDataUrl) fileInputRef.current?.click();
            else update('logoStyle', v);
          }}
        />
        {a.logoStyle === 'custom-logo' && (
          <div className="v1-adm-of-logo">
            {a.customLogoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.customLogoDataUrl} alt="Huidig logo" />
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={pending}>
              <Upload size={14} strokeWidth={1.8} /> {a.customLogoDataUrl ? 'Vervangen' : 'Bestand kiezen'}
            </Button>
            {a.customLogoDataUrl && (
              <Button variant="ghost" size="sm" onClick={() => update('customLogoDataUrl', null)} disabled={pending}>
                <X size={14} strokeWidth={1.8} /> Verwijderen
              </Button>
            )}
          </div>
        )}
        {logoWarning && a.logoStyle === 'custom-logo' ? <p className="v1-hint">{logoWarning}</p> : null}
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_LOGO_TYPES.join(',')}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleLogoUpload(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="v1-edit-grid">
        <div className="v1-field">
          <span className="v1-label">Positie</span>
          <Segmented label="Positie" value={a.position} options={POSITION_OPTIONS} onChange={(v) => update('position', v)} />
        </div>
        <Field label="Thema">
          {(id) => (
            <select id={id} className="v1-input" value={a.theme} onChange={(e) => update('theme', e.target.value as WidgetTheme)}>
              <option value="auto">Automatisch (volg website)</option>
              <option value="light">Licht</option>
              <option value="dark">Donker</option>
            </select>
          )}
        </Field>
        <Field label="Widget-titel" hint="Leeg laten voor de chatbotnaam.">
          {(id) => <input id={id} className="v1-input" value={a.headerTitle} onChange={(e) => update('headerTitle', e.target.value)} />}
        </Field>
        <Field label="Ondertitel">
          {(id) => (
            <input
              id={id}
              className="v1-input"
              value={a.subtitle}
              onChange={(e) => update('subtitle', e.target.value)}
              placeholder="Bijvoorbeeld: meestal binnen een minuut antwoord"
            />
          )}
        </Field>
        <Field label="Welkomstbericht" hint="Het eerste bericht dat de bezoeker ziet.">
          {(id) => <input id={id} className="v1-input" value={a.welcomeMessage} onChange={(e) => update('welcomeMessage', e.target.value)} />}
        </Field>
        <div className="v1-adm-of-wide">
          <Field label="Tekst bij de knop" hint="Optioneel tekstballonnetje naast de knop. Leeg laten voor geen ballonnetje.">
            {(id) => (
              <input
                id={id}
                className="v1-input"
                value={a.launcherText}
                onChange={(e) => update('launcherText', e.target.value)}
                placeholder="Hoi! Heb je een vraag?"
              />
            )}
          </Field>
        </div>
      </div>

      {error && (
        <p role="alert" className="v1-alert v1-alert--error">
          {error}
        </p>
      )}
      <div className="v1-adm-of-actions v1-adm-of-actions--end">
        {saved && (
          <span className="v1-saved" role="status">
            <Check size={14} /> Opgeslagen
          </span>
        )}
        <Button variant="primary" onClick={save} loading={pending} disabled={!dirty}>
          Uiterlijk opslaan
        </Button>
      </div>
    </section>
  );
}
