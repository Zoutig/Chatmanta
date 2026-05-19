'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { StatusBadge } from '../../components/status-badge';
import type { WidgetSettings } from '@/lib/v0/klantendashboard/types';

type Section = 'install' | 'design' | 'preview' | 'status';

export function WidgetForm({
  initial,
  chatbotName,
  welcomeMessage,
  workspaceId,
}: {
  initial: WidgetSettings;
  chatbotName: string;
  welcomeMessage: string;
  workspaceId: string;
}) {
  const [w, setW] = useState<WidgetSettings>(initial);
  const [openSection, setOpenSection] = useState<Section>('install');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const embedCode = `<script src="https://cdn.chatmanta.nl/widget.js" data-chatbot-id="${workspaceId}"></script>`;

  function copy() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function update<K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) {
    setW((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          <Field label="Primaire kleur">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={w.primaryColor}
                onChange={(e) => update('primaryColor', e.target.value)}
                style={{
                  width: 40,
                  height: 36,
                  border: '1px solid var(--klant-border)',
                  borderRadius: 'var(--klant-r-sm)',
                  background: 'none',
                  cursor: 'pointer',
                }}
              />
              <input
                className="klant-input"
                value={w.primaryColor}
                onChange={(e) => update('primaryColor', e.target.value)}
                style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 13 }}
              />
            </div>
          </Field>
          <Field label="Positie">
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => update('position', 'bottom-right')}
                className="klant-btn"
                data-variant={w.position === 'bottom-right' ? 'primary' : 'ghost'}
                style={{ flex: 1 }}
              >
                Rechtsonder
              </button>
              <button
                type="button"
                onClick={() => update('position', 'bottom-left')}
                className="klant-btn"
                data-variant={w.position === 'bottom-left' ? 'primary' : 'ghost'}
                style={{ flex: 1 }}
              >
                Linksonder
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
          <Field label="Tekst op chatknop">
            <input
              className="klant-input"
              value={w.launcherText}
              onChange={(e) => update('launcherText', e.target.value)}
            />
          </Field>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
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
          <button type="button" onClick={save} className="klant-btn" data-variant="primary">
            Uiterlijk opslaan
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
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {w.isActive ? (
            <button
              type="button"
              onClick={() => update('isActive', false)}
              className="klant-btn"
            >
              <Pause size={14} strokeWidth={1.8} /> Widget pauzeren
            </button>
          ) : (
            <button
              type="button"
              onClick={() => update('isActive', true)}
              className="klant-btn"
              data-variant="primary"
            >
              <Play size={14} strokeWidth={1.8} /> Widget activeren
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              update('lastCheckedAt', new Date().toISOString());
              update('isInstalled', true);
            }}
            className="klant-btn"
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
            background: settings.primaryColor,
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

      {/* Launcher button */}
      <button
        type="button"
        style={{
          position: 'absolute',
          bottom: 20,
          [settings.position === 'bottom-left' ? 'left' : 'right']: 20,
          padding: '10px 16px',
          background: settings.primaryColor,
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 6px 16px -4px rgba(0,0,0,0.30)',
        }}
      >
        <Bot size={14} strokeWidth={1.8} />
        {settings.launcherText}
      </button>
    </div>
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
