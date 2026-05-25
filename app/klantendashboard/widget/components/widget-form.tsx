'use client';

import { useRef, useState, useTransition } from 'react';
import {
  Bot,
  Check,
  Copy,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { StatusBadge } from '../../components/status-badge';
import { BubblePreview, MarkPreview } from '../../components/widget-logo';
import { saveWidgetSettingsAction, checkWidgetInstallationAction } from '../../actions';
import type { WidgetSettings } from '@/lib/v0/klantendashboard/types';
import { formatAccentText } from '@/lib/widget/format-accent';
import { PresetColorPicker } from './preset-color-picker';

// Max 200KB voor base64-data-URL — anders wordt de jsonb-row te zwaar.
const MAX_LOGO_BYTES = 200 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

type Section = 'install' | 'design' | 'preview' | 'status';

export function WidgetForm({
  initial,
  chatbotName,
  welcomeMessage,
  orgSlug,
}: {
  initial: WidgetSettings;
  chatbotName: string;
  welcomeMessage: string;
  orgSlug: string;
}) {
  const [w, setW] = useState<WidgetSettings>(initial);
  const [openSection, setOpenSection] = useState<Section>('install');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Granulaire kleur-resolutie zodat de UI altijd waarden toont, ook als alleen
  // primaryColor gezet is (backwards-compat).
  const resolvedColors = {
    logo: w.logoColor || w.primaryColor,
    bg: w.widgetBgColor || '#ffffff',
    pulse: w.pulseColor || w.primaryColor,
    header: w.headerColor || w.primaryColor,
  };

  // origin via window zodat de snippet op localhost én prod het juiste host toont.
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.chatmanta.nl';
  const embedCode = `<script src="${origin}/widget.js" data-org="${orgSlug}" defer></script>`;

  function copy() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function update<K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) {
    setW((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  /** Persist een (deel)patch naar de DB; bij success togglet de feedback-badge. */
  function persist(patch: Partial<WidgetSettings>) {
    const next = { ...w, ...patch };
    setW(next);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await saveWidgetSettingsAction(patch);
      if (res.ok) {
        setW(res.widget);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res.error);
      }
    });
  }

  function save() {
    // Sla de volledige client-state op (= alle ongesaveerde uiterlijk-velden).
    persist(w);
  }

  function handleLogoUpload(file: File) {
    setError(null);
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setError(`Bestandstype niet ondersteund. Kies een PNG, JPG, WebP of SVG.`);
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
    persist({ logoStyle: 'brand-mark', customLogoDataUrl: null });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Installatie */}
      <Collapsible
        title="Installatie"
        subtitle="Plaats deze code op je website om de chatbot zichtbaar te maken."
        open={openSection === 'install'}
        onToggle={() => setOpenSection(openSection === 'install' ? 'design' : 'install')}
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
            {embedCode}
          </pre>
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
        </div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--klant-fg-muted)',
            marginTop: 10,
            lineHeight: 1.6,
          }}
        >
          Plaats deze code vlak vóór de sluitende <code style={{ color: 'var(--klant-accent)' }}>&lt;/body&gt;</code>-tag
          van je website. Je chatbot verschijnt automatisch als chat-knop rechtsonder.
        </p>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['WordPress', 'Webflow', 'Shopify', 'Custom website'] as const).map((platform) => (
            <PlatformAccordion key={platform} platform={platform} />
          ))}
        </div>
      </Collapsible>

      {/* Uiterlijk */}
      <Collapsible
        title="Uiterlijk"
        subtitle="Pas de kleuren, positie en teksten van je widget aan."
        open={openSection === 'design'}
        onToggle={() => setOpenSection(openSection === 'design' ? 'preview' : 'design')}
      >
        {/* Kleuren-blok — 4 granulaire pickers met visuele uitleg. */}
        <div style={{ marginBottom: 18 }}>
          <h4
            style={{
              margin: '0 0 4px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--klant-fg)',
            }}
          >
            Kleuren
          </h4>
          <p
            style={{
              fontSize: 12,
              color: 'var(--klant-fg-muted)',
              margin: '0 0 12px',
              lineHeight: 1.5,
            }}
          >
            Stel de kleuren in voor verschillende delen van je widget. Niet-ingestelde
            velden vallen automatisch terug op de hoofdkleur.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 10,
            }}
          >
            <PresetColorPicker
              label="Logo-kleur"
              hint="ChatManta-mark of chat-bubble"
              value={resolvedColors.logo}
              onChange={(v) => update('logoColor', v)}
            />
            <PresetColorPicker
              label="Achtergrond-knop"
              hint="Rond bolletje rechtsonder"
              value={resolvedColors.bg}
              onChange={(v) => update('widgetBgColor', v)}
            />
            <div
              style={{
                padding: 10,
                background: 'var(--klant-surface)',
                borderRadius: 'var(--klant-r-md)',
                border: '1px solid var(--klant-border)',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 10,
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--klant-fg)',
                  cursor: 'pointer',
                }}
              >
                <span>
                  Pulse-ring{' '}
                  <span style={{ color: 'var(--klant-fg-dim)', fontWeight: 400 }}>
                    · Animatie rond gesloten knop
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={w.pulseEnabled !== false}
                  onChange={(e) => update('pulseEnabled', e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
              </label>
              <PresetColorPicker
                label="Kleur"
                hint="Alleen actief als pulse aanstaat"
                value={resolvedColors.pulse}
                onChange={(v) => update('pulseColor', v)}
                disabled={w.pulseEnabled === false}
              />
            </div>
            <PresetColorPicker
              label="Header + verstuurknop"
              hint="Bovenkant + send-button"
              value={resolvedColors.header}
              onChange={(v) => update('headerColor', v)}
            />
          </div>
        </div>

        {/* Logo-stijl */}
        <div style={{ marginBottom: 18 }}>
          <h4
            style={{
              margin: '0 0 4px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--klant-fg)',
            }}
          >
            Icoon op de chatknop
          </h4>
          <p
            style={{
              fontSize: 12,
              color: 'var(--klant-fg-muted)',
              margin: '0 0 12px',
              lineHeight: 1.5,
            }}
          >
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
              active={w.logoStyle === 'brand-mark'}
              onClick={() => update('logoStyle', 'brand-mark')}
              label="ChatManta-mark"
              hint="Subtiel merkteken — kleurt mee met logo-kleur."
              preview={<MarkPreview color={resolvedColors.logo} />}
            />
            <LogoChoice
              active={w.logoStyle === 'chat-bubble'}
              onClick={() => update('logoStyle', 'chat-bubble')}
              label="Chat-bubbel"
              hint="Universeel pictogram, herkenbaar voor elke bezoeker."
              preview={<BubblePreview color={resolvedColors.logo} />}
            />
            <LogoChoice
              active={w.logoStyle === 'custom-logo'}
              onClick={() => {
                if (w.customLogoDataUrl) {
                  update('logoStyle', 'custom-logo');
                } else {
                  fileInputRef.current?.click();
                }
              }}
              label="Eigen logo uploaden"
              hint="PNG, JPG, WebP of SVG · max 200 KB."
              preview={
                w.customLogoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={w.customLogoDataUrl}
                    alt=""
                    style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6 }}
                  />
                ) : (
                  <Upload size={22} strokeWidth={1.6} style={{ color: 'var(--klant-fg-muted)' }} />
                )
              }
            />
          </div>

          {w.logoStyle === 'custom-logo' && (
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
                {w.customLogoDataUrl ? 'Vervangen' : 'Bestand kiezen'}
              </button>
              {w.customLogoDataUrl && (
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
              <button
                type="button"
                onClick={() => update('position', 'bottom-left')}
                className="klant-btn"
                data-variant={w.position === 'bottom-left' ? 'primary' : 'ghost'}
                style={{ flex: 1 }}
              >
                Linksonder
              </button>
              <button
                type="button"
                onClick={() => update('position', 'bottom-right')}
                className="klant-btn"
                data-variant={w.position === 'bottom-right' ? 'primary' : 'ghost'}
                style={{ flex: 1 }}
              >
                Rechtsonder
              </button>
            </div>
          </Field>
          <Field label="Thema">
            <select
              className="klant-select"
              value={w.theme}
              onChange={(e) =>
                update('theme', e.target.value as WidgetSettings['theme'])
              }
            >
              <option value="auto">Automatisch (volg website)</option>
              <option value="light">Licht</option>
              <option value="dark">Donker</option>
            </select>
          </Field>
          <Field label="Widget-titel">
            <input
              className="klant-input"
              value={w.title}
              onChange={(e) => update('title', e.target.value)}
            />
          </Field>
          <Field label="Subtitel">
            <input
              className="klant-input"
              value={w.subtitle}
              onChange={(e) => update('subtitle', e.target.value)}
            />
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Tekst op chatknop">
              <input
                className="klant-input"
                value={w.launcherText}
                onChange={(e) => update('launcherText', e.target.value)}
                placeholder="Hoi! *Heb je een vraag?*"
              />
              <p
                style={{
                  margin: '6px 2px 0',
                  fontSize: 11.5,
                  color: 'var(--klant-fg-muted)',
                  lineHeight: 1.5,
                }}
              >
                Verschijnt als tooltip boven de chat-knop op je website. Zet woorden tussen{' '}
                <code
                  style={{
                    fontFamily: 'var(--font-mono), monospace',
                    background: 'var(--klant-surface)',
                    border: '1px solid var(--klant-border)',
                    borderRadius: 4,
                    padding: '1px 5px',
                    fontSize: 11,
                    color: 'var(--klant-accent)',
                  }}
                >
                  *sterretjes*
                </code>{' '}
                om ze te accentueren in je hoofdkleur.
              </p>
              {w.launcherText.trim() && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--klant-fg-dim)' }}>
                    Voorbeeld:
                  </span>
                  <span
                    style={{
                      display: 'inline-block',
                      background: '#0e1014',
                      color: '#ffffff',
                      padding: '6px 12px',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 500,
                      lineHeight: 1.3,
                    }}
                  >
                    {formatAccentText(w.launcherText, resolvedColors.header)}
                  </span>
                </div>
              )}
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
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
            type="button"
            onClick={save}
            className="klant-btn"
            data-variant="primary"
            disabled={pending}
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
        onToggle={() => setOpenSection(openSection === 'preview' ? 'status' : 'preview')}
      >
        <WidgetMockup
          settings={w}
          chatbotName={chatbotName}
          welcomeMessage={welcomeMessage}
        />
      </Collapsible>

      {/* Live-status */}
      <Collapsible
        title="Live-status"
        subtitle="Controleer of je widget op je website draait."
        open={openSection === 'status'}
        onToggle={() => setOpenSection(openSection === 'status' ? 'install' : 'status')}
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
            value={w.isInstalled ? 'Ja' : 'Nog niet'}
            tone={w.isInstalled ? 'success' : 'warning'}
          />
          <StatusCell
            label="Status"
            value={<StatusBadge status={w.isActive ? 'active' : w.isInstalled ? 'detected' : 'not_installed'} kind="widget" />}
            tone="neutral"
          />
          <StatusCell
            label="Laatste check"
            value={w.lastCheckedAt ? new Date(w.lastCheckedAt).toLocaleString('nl-NL') : '—'}
            tone="neutral"
          />
          {w.installOrigin && (
            <StatusCell label="Gezien op" value={w.installOrigin} tone="neutral" />
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {w.isActive ? (
            <button
              type="button"
              onClick={() => persist({ isActive: false })}
              className="klant-btn"
              disabled={pending}
            >
              <Pause size={14} strokeWidth={1.8} /> Widget pauzeren
            </button>
          ) : (
            <button
              type="button"
              onClick={() => persist({ isActive: true })}
              className="klant-btn"
              data-variant="primary"
              disabled={pending}
            >
              <Play size={14} strokeWidth={1.8} /> Widget activeren
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const res = await checkWidgetInstallationAction();
                if (res.ok) {
                  setW((prev) => ({
                    ...prev,
                    isInstalled: res.isInstalled,
                    lastSeenAt: res.lastSeenAt,
                    installOrigin: res.installOrigin,
                    lastCheckedAt: res.lastCheckedAt,
                  }));
                } else {
                  setError(res.error);
                }
              })
            }
            className="klant-btn"
            disabled={pending}
          >
            <RefreshCw size={14} strokeWidth={1.8} /> Installatie testen
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
        </div>
      </Collapsible>
    </div>
  );
}

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

function WidgetMockup({
  settings,
  chatbotName,
  welcomeMessage,
}: {
  settings: WidgetSettings;
  chatbotName: string;
  welcomeMessage: string;
}) {
  const c = {
    logo: settings.logoColor || settings.primaryColor,
    bg: settings.widgetBgColor || '#ffffff',
    header: settings.headerColor || settings.primaryColor,
  };
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
          [settings.position === 'bottom-left' ? 'left' : 'right']: 20,
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
            background: c.header,
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
            }}
          >
            <Bot size={14} strokeWidth={1.8} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.2 }}>{settings.title}</div>
            <div style={{ fontSize: 10.5, opacity: 0.85 }}>{settings.subtitle}</div>
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
              {chatbotName}
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

      {/* Launcher knop — toont logo-keuze van de klant op de FAB-achtergrond */}
      <button
        type="button"
        style={{
          position: 'absolute',
          bottom: 20,
          [settings.position === 'bottom-left' ? 'left' : 'right']: 20,
          width: 52,
          height: 52,
          padding: 0,
          background: c.bg,
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
        {settings.logoStyle === 'custom-logo' && settings.customLogoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={settings.customLogoDataUrl}
            alt=""
            style={{ width: 30, height: 30, objectFit: 'contain', borderRadius: 4 }}
          />
        ) : settings.logoStyle === 'chat-bubble' ? (
          <BubblePreview color={c.logo} />
        ) : (
          <MarkPreview color={c.logo} />
        )}
      </button>
    </div>
  );
}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="klant-label">{label}</label>
      {children}
    </div>
  );
}

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
      <div style={{ fontSize: 11, color: 'var(--klant-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: tone === 'success' ? 'var(--klant-success)' : tone === 'warning' ? 'var(--klant-warning)' : 'var(--klant-fg)',
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
