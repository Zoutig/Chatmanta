'use client';

// V1 Widget — volledig-geporte widget-editor (V0-parity).
// Bewerkt de widget-uiterlijk-velden in chatbots.settings via de BESTAANDE
// saveChatbotSettingsAction (merge-over-current + answer-cache-purge).
// Nieuw t.o.v. de vorige versie:
//  - Logo-stijl picker (brand-mark / chat-bubble / eigen upload ≤200 KB)
//  - Thema-selector (auto/licht/donker)
//  - Ondertitel-veld
//  - Preview-sectie (statische WidgetMockup — geen live-preview zonder V1 botVersion-prop)
//  - Live-status-paneel (graceful: V1 heeft geen heartbeat-endpoint of DB-kolommen;
//    zie ponytail-notitie onderaan)
//
// ponytail: V1 heeft geen widget_pings-tabel, /api/v1/widget/ping-route, of
// isInstalled/isActive/lastCheckedAt/installOrigin-kolommen op chatbots.
// Live-status toont daarom statische state (allowed_domains aanwezig = geconfigureerd).
// Voeg een processing_job/ping-tabel + cron toe als installatie-tracking nodig wordt.
// Activate/Pause-toggle ontbreekt eveneens (geen isActive-veld). V1-blocker voor
// productie-go-live als klanten zelf moeten kunnen aan/uitzetten.

import { useRef, useState, useTransition } from 'react';
import { Bot, Check, ChevronDown, ChevronRight, Copy, ExternalLink, Upload, X } from 'lucide-react';
import { saveChatbotSettingsAction } from '../instellingen/actions';
import { PresetColorPicker } from '@/app/klantendashboard/widget/components/preset-color-picker';
import { MarkPreview, BubblePreview } from '@/app/klantendashboard/components/widget-logo';
import type { V1ChatbotSettings } from '../instellingen/settings-config';
import type { WidgetLogoStyle, WidgetPosition, WidgetTheme } from '@/lib/v0/klantendashboard/types';

// Max 200KB voor base64-data-URL (server-side cap = 300KB incl. base64-overhead).
const MAX_LOGO_BYTES = 200 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

type Section = 'install' | 'design' | 'preview' | 'status';

type Appearance = Pick<
  V1ChatbotSettings,
  | 'accentColor'
  | 'position'
  | 'headerTitle'
  | 'launcherText'
  | 'welcomeMessage'
  | 'logoStyle'
  | 'customLogoDataUrl'
  | 'theme'
  | 'subtitle'
>;

export function V1WidgetForm({
  initial,
  slug,
  allowedDomains,
}: {
  initial: V1ChatbotSettings;
  slug: string;
  allowedDomains: string[];
}) {
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
  const [openSection, setOpenSection] = useState<Section>('install');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(a) !== JSON.stringify(baseline);

  // Chatbotnaam voor de preview-mockup: headerTitle wint van chatbotName.
  const previewName = a.headerTitle || initial.chatbotName || 'Chatbot';

  // origin via window zodat de snippet op localhost én prod de juiste host toont.
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://www.chatmanta.nl';
  const embedCode = `<script src="${origin}/widget-v1.js" data-org="${slug}" defer></script>`;

  function update<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    setA((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function persist(patch: Partial<Appearance>) {
    const next = { ...a, ...patch };
    setA(next);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await saveChatbotSettingsAction(patch);
      if (res.ok) {
        const nextApp: Appearance = {
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
        setA(nextApp);
        setBaseline(nextApp);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res.error);
      }
    });
  }

  function save() {
    persist(a);
  }

  function copy() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleLogoUpload(file: File) {
    setError(null);
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setError('Bestandstype niet ondersteund. Kies een PNG, JPG, WebP of SVG.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(
        `Bestand is te groot (${(file.size / 1024).toFixed(0)} KB). Max ${MAX_LOGO_BYTES / 1024} KB.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      persist({ logoStyle: 'custom-logo', customLogoDataUrl: dataUrl });
    };
    reader.onerror = () => setError('Kon bestand niet lezen.');
    reader.readAsDataURL(file);
  }

  function clearCustomLogo() {
    persist({ logoStyle: 'chat-bubble', customLogoDataUrl: null });
  }

  function toggle(section: Section) {
    setOpenSection((prev) => {
      const sections: Section[] = ['install', 'design', 'preview', 'status'];
      const idx = sections.indexOf(section);
      if (prev === section) {
        return sections[(idx + 1) % sections.length];
      }
      return section;
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Installatie */}
      <Collapsible
        title="Installatie"
        subtitle="Plaats deze code op je website om de chatbot zichtbaar te maken."
        open={openSection === 'install'}
        onToggle={() => toggle('install')}
      >
        <div
          style={{
            background: 'var(--klant-bg)',
            border: '1px solid var(--klant-border)',
            borderRadius: 'var(--klant-r-md)',
            padding: 14,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <pre
            style={{
              flex: 1,
              margin: 0,
              fontFamily: 'var(--font-mono), monospace',
              fontSize: 12,
              color: 'var(--klant-fg)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              lineHeight: 1.6,
            }}
          >
            {slug ? embedCode : '(slug ontbreekt — organisatie nog niet geconfigureerd)'}
          </pre>
          {slug && (
            <button
              type="button"
              onClick={copy}
              className="klant-btn"
              data-variant={copied ? 'primary' : 'ghost'}
              style={{ flexShrink: 0 }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Gekopieerd' : 'Kopieer'}
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--klant-fg-muted)', marginTop: 10, lineHeight: 1.6 }}>
          Plaats deze code vlak vóór de sluitende{' '}
          <code style={{ color: 'var(--klant-accent)' }}>&lt;/body&gt;</code>-tag van je website.
          Je chatbot verschijnt automatisch als chat-knop rechtsonder.
        </p>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['WordPress', 'Webflow', 'Shopify', 'Custom website'] as const).map((platform) => (
            <PlatformAccordion key={platform} platform={platform} />
          ))}
        </div>

        {/* Toegestane domeinen — READ-ONLY (Jorion-beheerd, M-D). */}
        <div style={{ marginTop: 18, borderTop: '1px solid var(--klant-border)', paddingTop: 14 }}>
          <label className="klant-label">Toegestane domeinen</label>
          <div className="klant-hint" style={{ marginBottom: 6 }}>
            Beheerd door ChatManta. Leeg = de widget werkt op elk domein; met een lijst verschijnt
            hij alléén op deze domeinen.
          </div>
          {allowedDomains.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--klant-fg-muted)' }}>
              Geen beperking — werkt overal.
            </span>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--klant-fg)' }}>
              {allowedDomains.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      </Collapsible>

      {/* Uiterlijk */}
      <Collapsible
        title="Uiterlijk"
        subtitle="Pas de kleuren, het icoon, positie en teksten van je widget aan."
        open={openSection === 'design'}
        onToggle={() => toggle('design')}
      >
        {/* Accentkleur */}
        <div style={{ marginBottom: 18 }}>
          <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--klant-fg)' }}>
            Kleur
          </h4>
          <p style={{ fontSize: 12, color: 'var(--klant-fg-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
            Accentkleur voor de chat-knop, header en verstuurknop.
          </p>
          <PresetColorPicker
            label="Accentkleur"
            hint="Chat-knop, header & verstuurknop"
            value={a.accentColor}
            onChange={(v) => update('accentColor', v)}
          />
        </div>

        {/* Logo-stijl */}
        <div style={{ marginBottom: 18 }}>
          <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--klant-fg)' }}>
            Icoon op de chatknop
          </h4>
          <p style={{ fontSize: 12, color: 'var(--klant-fg-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
            Kies wat bezoekers zien op de chat-knop voordat ze hem openen.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 8,
            }}
          >
            <LogoChoice
              active={a.logoStyle === 'brand-mark'}
              onClick={() => update('logoStyle', 'brand-mark')}
              label="ChatManta-mark"
              hint="Subtiel merkteken — kleurt mee met de accentkleur."
              preview={<MarkPreview color={a.accentColor} />}
            />
            <LogoChoice
              active={a.logoStyle === 'chat-bubble'}
              onClick={() => update('logoStyle', 'chat-bubble')}
              label="Chat-bubbel"
              hint="Universeel pictogram, herkenbaar voor elke bezoeker."
              preview={<BubblePreview color={a.accentColor} />}
            />
            <LogoChoice
              active={a.logoStyle === 'custom-logo'}
              onClick={() => {
                if (a.customLogoDataUrl) {
                  update('logoStyle', 'custom-logo');
                } else {
                  fileInputRef.current?.click();
                }
              }}
              label="Eigen logo uploaden"
              hint="PNG, JPG, WebP of SVG · max 200 KB."
              preview={
                a.customLogoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.customLogoDataUrl}
                    alt=""
                    style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6 }}
                  />
                ) : (
                  <Upload size={22} strokeWidth={1.6} style={{ color: 'var(--klant-fg-muted)' }} />
                )
              }
            />
          </div>

          {a.logoStyle === 'custom-logo' && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 12px',
                background: 'var(--klant-surface)',
                borderRadius: 'var(--klant-r-md)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="klant-btn"
                disabled={pending}
              >
                <Upload size={13} strokeWidth={1.8} />
                {a.customLogoDataUrl ? 'Vervangen' : 'Bestand kiezen'}
              </button>
              {a.customLogoDataUrl && (
                <button
                  type="button"
                  onClick={clearCustomLogo}
                  className="klant-btn"
                  data-variant="danger"
                  disabled={pending}
                >
                  <X size={13} strokeWidth={1.8} />
                  Verwijderen
                </button>
              )}
              <span style={{ fontSize: 12, color: 'var(--klant-fg-dim)' }}>
                Tip: vierkant logo, transparante achtergrond, ongeveer 100 × 100 pixels.
              </span>
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

        {/* Overige uiterlijk-velden */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          <Field label="Positie">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['bottom-left', 'bottom-right'] as WidgetPosition[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => update('position', v)}
                  className="klant-btn"
                  data-variant={a.position === v ? 'primary' : 'ghost'}
                  style={{ flex: 1 }}
                >
                  {v === 'bottom-left' ? 'Linksonder' : 'Rechtsonder'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Thema">
            <select
              className="klant-select"
              value={a.theme}
              onChange={(e) => update('theme', e.target.value as WidgetTheme)}
            >
              <option value="auto">Automatisch (volg website)</option>
              <option value="light">Licht</option>
              <option value="dark">Donker</option>
            </select>
          </Field>
          <Field label="Widget-titel" hint="Leeg laten → de chatbotnaam wordt gebruikt.">
            <input
              className="klant-input"
              value={a.headerTitle}
              onChange={(e) => update('headerTitle', e.target.value)}
            />
          </Field>
          <Field label="Ondertitel">
            <input
              className="klant-input"
              value={a.subtitle}
              onChange={(e) => update('subtitle', e.target.value)}
              placeholder="Bijv. 'Powered by AI'"
            />
          </Field>
          <Field label="Welkomstbericht" hint="Het eerste bericht dat de bezoeker ziet.">
            <input
              className="klant-input"
              value={a.welcomeMessage}
              onChange={(e) => update('welcomeMessage', e.target.value)}
            />
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Tekst bij de knop" hint="Optioneel tooltip-bubbeltje naast de chat-knop. Leeg = geen tooltip.">
              <input
                className="klant-input"
                value={a.launcherText}
                onChange={(e) => update('launcherText', e.target.value)}
                placeholder="Hoi! Heb je een vraag?"
              />
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
          {error && (
            <span role="alert" style={{ fontSize: 13, color: 'var(--klant-danger)' }}>
              {error}
            </span>
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
            type="button"
            onClick={save}
            className="klant-btn"
            data-variant="primary"
            disabled={pending || !dirty}
          >
            {pending ? 'Bezig…' : 'Uiterlijk opslaan'}
          </button>
        </div>
      </Collapsible>

      {/* Preview */}
      <Collapsible
        title="Preview"
        subtitle="Zo ziet je widget eruit voor je bezoekers."
        open={openSection === 'preview'}
        onToggle={() => toggle('preview')}
      >
        <WidgetMockup
          accentColor={a.accentColor}
          position={a.position}
          logoStyle={a.logoStyle}
          customLogoDataUrl={a.customLogoDataUrl}
          headerTitle={previewName}
          subtitle={a.subtitle}
          welcomeMessage={a.welcomeMessage}
        />
      </Collapsible>

      {/* Live-status */}
      {/* ponytail: statische status — V1 heeft geen heartbeat-endpoint of
          isInstalled/isActive/lastCheckedAt/installOrigin-kolommen op chatbots.
          Voeg een widget_pings-tabel + /api/v1/widget/ping-route toe en wire
          checkWidgetInstallationAction als installatie-tracking nodig wordt. */}
      <Collapsible
        title="Live-status"
        subtitle="Controleer of je widget op je website draait."
        open={openSection === 'status'}
        onToggle={() => toggle('status')}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          <StatusCell
            label="Gevonden op website"
            value="Nog niet gecontroleerd"
            tone="warning"
          />
          <StatusCell
            label="Domeinen geconfigureerd"
            value={allowedDomains.length > 0 ? `${allowedDomains.length} domein${allowedDomains.length === 1 ? '' : 'en'}` : 'Geen beperking'}
            tone={allowedDomains.length > 0 ? 'success' : 'neutral'}
          />
          <StatusCell label="Laatste check" value="—" tone="neutral" />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* ponytail: Activate/Pause-toggle ontbreekt — V1 heeft geen isActive-kolom.
              Voeg een chatbots.is_active-kolom (migr) toe als klanten zelf moeten
              kunnen aan/uitzetten. */}
          <button
            type="button"
            className="klant-btn"
            disabled
            title="Installatie-check vereist een widget-ping-endpoint dat V1 nog niet heeft."
          >
            Installatie testen
          </button>
          <a
            href="/widget"
            target="_blank"
            rel="noopener noreferrer"
            className="klant-btn"
            style={{ textDecoration: 'none' }}
          >
            <ExternalLink size={14} strokeWidth={1.8} /> Open demo-pagina
          </a>
          <span style={{ fontSize: 12, color: 'var(--klant-fg-muted)' }}>
            Installatie-check is beschikbaar na V1-hardening (heartbeat-endpoint gepland).
          </span>
        </div>
      </Collapsible>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WidgetMockup — statische preview van de widget (V0-patroon, V1-kleur-model)
// In V1 is er één accentColor in plaats van granulaire logo/bg/header-kleuren.
// ---------------------------------------------------------------------------

function WidgetMockup({
  accentColor,
  position,
  logoStyle,
  customLogoDataUrl,
  headerTitle,
  subtitle,
  welcomeMessage,
}: {
  accentColor: string;
  position: WidgetPosition;
  logoStyle: WidgetLogoStyle;
  customLogoDataUrl: string | null;
  headerTitle: string;
  subtitle: string;
  welcomeMessage: string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        minHeight: 380,
        background:
          'repeating-linear-gradient(45deg, var(--klant-surface) 0 10px, transparent 10px 20px)',
        borderRadius: 'var(--klant-r-md)',
        border: '1px solid var(--klant-border)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          fontSize: 11,
          color: 'var(--klant-fg-dim)',
          background: 'var(--klant-bg)',
          padding: '4px 10px',
          borderRadius: 999,
          border: '1px solid var(--klant-border)',
        }}
      >
        jouwwebsite.nl
      </div>

      {/* Open widget mock */}
      <div
        style={{
          position: 'absolute',
          bottom: 80,
          [position === 'bottom-left' ? 'left' : 'right']: 20,
          width: 280,
          background: '#fff',
          color: '#0f172a',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 12px 32px -8px rgba(0,0,0,0.35)',
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            background: accentColor,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.20)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Bot size={14} strokeWidth={1.8} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.2 }}>{headerTitle}</div>
            {subtitle && <div style={{ fontSize: 10.5, opacity: 0.85 }}>{subtitle}</div>}
          </div>
        </div>
        <div style={{ padding: 12, background: '#f8fafc', minHeight: 80 }}>
          <div
            style={{
              padding: '8px 10px',
              background: '#fff',
              borderRadius: 10,
              fontSize: 12,
              border: '1px solid #e2e8f0',
              color: '#0f172a',
              maxWidth: 230,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 10, marginBottom: 2, color: '#64748b' }}>
              {headerTitle}
            </div>
            {welcomeMessage}
          </div>
        </div>
        <div
          style={{
            padding: '8px 10px',
            background: '#fff',
            borderTop: '1px solid #e2e8f0',
            fontSize: 11,
            color: '#94a3b8',
          }}
        >
          Typ je vraag…
        </div>
      </div>

      {/* Launcher knop */}
      <button
        type="button"
        style={{
          position: 'absolute',
          bottom: 20,
          [position === 'bottom-left' ? 'left' : 'right']: 20,
          width: 52,
          height: 52,
          padding: 0,
          background: accentColor,
          color: '#fff',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 999,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 16px -4px rgba(0,0,0,0.30)',
        }}
        aria-label="Open chat (preview)"
      >
        {logoStyle === 'custom-logo' && customLogoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={customLogoDataUrl}
            alt=""
            style={{ width: 30, height: 30, objectFit: 'contain', borderRadius: 4 }}
          />
        ) : logoStyle === 'chat-bubble' ? (
          <BubblePreview color="#fff" size={26} />
        ) : (
          <MarkPreview color="#fff" size={22} />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible accordion
// ---------------------------------------------------------------------------

function Collapsible({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '14px 18px',
          background: 'none',
          border: 'none',
          color: 'var(--klant-fg)',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{title}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--klant-fg-muted)' }}>
            {subtitle}
          </span>
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--klant-border)' }}>
          <div style={{ paddingTop: 14 }}>{children}</div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Platform-installatie-accordions (gespiegeld van V0)
// ---------------------------------------------------------------------------

function PlatformAccordion({ platform }: { platform: string }) {
  const [open, setOpen] = useState(false);
  const instructions: Record<string, string[]> = {
    WordPress: [
      'Ga naar Uiterlijk → Thema-editor (of installeer een "Header & Footer Scripts" plugin).',
      'Plak de code in het "Footer scripts"-veld.',
      'Sla op en bekijk je website — de widget verschijnt rechtsonder.',
    ],
    Webflow: [
      'Open je Webflow-project en ga naar Site Settings → Custom Code.',
      'Plak de code in het "Footer Code"-veld.',
      'Publiceer je site — de widget is direct actief.',
    ],
    Shopify: [
      'Ga naar Online Store → Themes → Edit Code.',
      'Open theme.liquid en plak de code vlak vóór </body>.',
      'Sla op en open je winkel — de chatbot is zichtbaar.',
    ],
    'Custom website': [
      'Plak de code in je HTML, vlak vóór de sluitende </body>-tag.',
      'Upload de gewijzigde pagina.',
      'Ververs je website — de widget verschijnt.',
    ],
  };
  return (
    <div
      style={{
        border: '1px solid var(--klant-border)',
        borderRadius: 'var(--klant-r-sm)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'var(--klant-surface)',
          border: 'none',
          color: 'var(--klant-fg)',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Instructies voor {platform}
      </button>
      {open && (
        <ol
          style={{
            margin: 0,
            padding: '12px 16px 14px 32px',
            fontSize: 13,
            color: 'var(--klant-fg-muted)',
            lineHeight: 1.6,
          }}
        >
          {instructions[platform].map((s, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logo-keuze-kaart (gespiegeld van V0 LogoChoice)
// ---------------------------------------------------------------------------

function LogoChoice({
  active,
  onClick,
  label,
  hint,
  preview,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  preview: React.ReactNode;
}) {
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
      <div
        style={{
          width: '100%',
          height: 56,
          borderRadius: 'var(--klant-r-sm)',
          background: '#ffffff',
          border: '1px solid var(--klant-border)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {preview}
      </div>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--klant-fg-muted)', lineHeight: 1.4 }}>{hint}</span>
      {active && (
        <Check
          size={14}
          strokeWidth={2.2}
          style={{ position: 'absolute', top: 10, right: 10, color: 'var(--klant-accent)' }}
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// StatusCell voor het live-status-paneel
// ---------------------------------------------------------------------------

function StatusCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone: 'success' | 'warning' | 'neutral';
}) {
  return (
    <div
      style={{
        padding: 12,
        background: 'var(--klant-surface)',
        borderRadius: 'var(--klant-r-sm)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--klant-fg-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color:
            tone === 'success'
              ? 'var(--klant-success)'
              : tone === 'warning'
              ? 'var(--klant-warning)'
              : 'var(--klant-fg)',
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field helper
// ---------------------------------------------------------------------------

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
