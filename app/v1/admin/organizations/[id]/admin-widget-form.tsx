'use client';

// WP5b — admin-variant van het klant-widgetformulier (uiterlijk-velden). Zelfde reden
// als de admin-settings-form: de klant-V1WidgetForm is hardwired aan session-gescopete
// actions. Deze variant bewerkt de widget-uiterlijk-velden (dezelfde chatbots.settings
// jsonb) via adminSaveChatbotSettingsAction(orgId, patch). Read-only levenscyclus-status
// (is_active / last_seen) toont de tab-RSC erboven. Hergebruikt PresetColorPicker +
// Mark/BubblePreview uit de klant-widget-UI.

import { useRef, useState, useTransition } from 'react';
import { Check, Upload, X } from 'lucide-react';
import { adminSaveChatbotSettingsAction } from './actions';
import { PresetColorPicker } from '@/app/klantendashboard/widget/components/preset-color-picker';
import { MarkPreview, BubblePreview } from '@/app/klantendashboard/components/widget-logo';
import type { V1ChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import type { WidgetPosition, WidgetTheme } from '@/lib/v0/klantendashboard/types';

const MAX_LOGO_BYTES = 200 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

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

  function handleLogoUpload(file: File) {
    setError(null);
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setError('Bestandstype niet ondersteund. Kies een PNG, JPG, WebP of SVG.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(`Bestand is te groot (${(file.size / 1024).toFixed(0)} KB). Max ${MAX_LOGO_BYTES / 1024} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setA((prev) => ({ ...prev, logoStyle: 'custom-logo', customLogoDataUrl: String(reader.result ?? '') }));
      setSaved(false);
    };
    reader.onerror = () => setError('Kon bestand niet lezen.');
    reader.readAsDataURL(file);
  }

  return (
    <section className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header>
        <h3 className="klant-section-title">Widget-uiterlijk</h3>
        <p className="klant-section-help">Kleur, icoon, positie en teksten van de embed-widget van deze klant.</p>
      </header>

      {/* Accentkleur */}
      <div>
        <label className="klant-label">Accentkleur</label>
        <PresetColorPicker
          label="Accentkleur"
          hint="Chat-knop, header & verstuurknop"
          value={a.accentColor}
          onChange={(v) => update('accentColor', v)}
        />
      </div>

      {/* Logo-stijl */}
      <div>
        <label className="klant-label">Icoon op de chatknop</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <LogoChoice active={a.logoStyle === 'brand-mark'} onClick={() => update('logoStyle', 'brand-mark')} label="ChatManta-mark" hint="Merkteken, kleurt mee." preview={<MarkPreview color={a.accentColor} />} />
          <LogoChoice active={a.logoStyle === 'chat-bubble'} onClick={() => update('logoStyle', 'chat-bubble')} label="Chat-bubbel" hint="Universeel pictogram." preview={<BubblePreview color={a.accentColor} />} />
          <LogoChoice
            active={a.logoStyle === 'custom-logo'}
            onClick={() => {
              if (a.customLogoDataUrl) update('logoStyle', 'custom-logo');
              else fileInputRef.current?.click();
            }}
            label="Eigen logo"
            hint="PNG, JPG, WebP of SVG · max 200 KB."
            preview={
              a.customLogoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.customLogoDataUrl} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6 }} />
              ) : (
                <Upload size={22} strokeWidth={1.6} style={{ color: 'var(--klant-fg-muted)' }} />
              )
            }
          />
        </div>
        {a.logoStyle === 'custom-logo' && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--klant-surface)', borderRadius: 'var(--klant-r-md)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="klant-btn" disabled={pending}>
              <Upload size={13} strokeWidth={1.8} /> {a.customLogoDataUrl ? 'Vervangen' : 'Bestand kiezen'}
            </button>
            {a.customLogoDataUrl && (
              <button type="button" onClick={() => update('customLogoDataUrl', null)} className="klant-btn" data-variant="danger" disabled={pending}>
                <X size={13} strokeWidth={1.8} /> Verwijderen
              </button>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_LOGO_TYPES.join(',')}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleLogoUpload(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* Overige velden */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label="Positie">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['bottom-left', 'bottom-right'] as WidgetPosition[]).map((v) => (
              <button key={v} type="button" onClick={() => update('position', v)} className="klant-btn" data-variant={a.position === v ? 'primary' : 'ghost'} style={{ flex: 1 }}>
                {v === 'bottom-left' ? 'Linksonder' : 'Rechtsonder'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Thema">
          <select className="klant-select" value={a.theme} onChange={(e) => update('theme', e.target.value as WidgetTheme)}>
            <option value="auto">Automatisch (volg website)</option>
            <option value="light">Licht</option>
            <option value="dark">Donker</option>
          </select>
        </Field>
        <Field label="Widget-titel" hint="Leeg → de chatbotnaam wordt gebruikt.">
          <input className="klant-input" value={a.headerTitle} onChange={(e) => update('headerTitle', e.target.value)} />
        </Field>
        <Field label="Ondertitel">
          <input className="klant-input" value={a.subtitle} onChange={(e) => update('subtitle', e.target.value)} placeholder="Bijv. 'Powered by AI'" />
        </Field>
        <Field label="Welkomstbericht" hint="Het eerste bericht dat de bezoeker ziet.">
          <input className="klant-input" value={a.welcomeMessage} onChange={(e) => update('welcomeMessage', e.target.value)} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Tekst bij de knop" hint="Optioneel tooltip-bubbeltje. Leeg = geen tooltip.">
            <input className="klant-input" value={a.launcherText} onChange={(e) => update('launcherText', e.target.value)} placeholder="Hoi! Heb je een vraag?" />
          </Field>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
        {error && <span role="alert" style={{ fontSize: 13, color: 'var(--klant-danger)' }}>{error}</span>}
        {saved && (
          <span style={{ fontSize: 13, color: 'var(--klant-success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Check size={14} /> Opgeslagen
          </span>
        )}
        <button type="button" onClick={save} className="klant-btn" data-variant="primary" disabled={pending || !dirty}>
          {pending ? 'Bezig…' : 'Uiterlijk opslaan'}
        </button>
      </div>
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

function LogoChoice({ active, onClick, label, hint, preview }: { active: boolean; onClick: () => void; label: string; hint: string; preview: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
        gap: 8,
        position: 'relative',
      }}
    >
      <div style={{ width: '100%', height: 56, borderRadius: 'var(--klant-r-sm)', background: '#ffffff', border: '1px solid var(--klant-border)', display: 'grid', placeItems: 'center' }}>
        {preview}
      </div>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--klant-fg-muted)', lineHeight: 1.4 }}>{hint}</span>
      {active && <Check size={14} strokeWidth={2.2} style={{ position: 'absolute', top: 10, right: 10, color: 'var(--klant-accent)' }} />}
    </button>
  );
}
