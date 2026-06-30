'use client';

// V1 Widget — uiterlijk-editor + installatie-snippet. Bewerkt alléén de widget-
// uiterlijk-velden die in chatbots.settings leven en door sanitizeChatbotPatch
// geaccepteerd worden (accentColor/position/headerTitle/launcherText/welcomeMessage).
// Save → de BESTAANDE, gedeelde saveChatbotSettingsAction (merge-over-current +
// answer-cache-purge). Styling via het V0-klantendashboard-designsysteem
// (klant.css-classes, geladen door de /v1/app-shell). De PresetColorPicker is
// 1-op-1 hergebruikt uit het V0-klantendashboard (import-only, geen V0-wijziging).

import { useState, useTransition } from 'react';
import { Check, Copy } from 'lucide-react';
import { saveChatbotSettingsAction } from '../instellingen/actions';
import { PresetColorPicker } from '@/app/klantendashboard/widget/components/preset-color-picker';
import type { V1ChatbotSettings } from '../instellingen/settings-config';
import type { WidgetPosition } from '@/lib/v0/klantendashboard/types';

type Appearance = Pick<
  V1ChatbotSettings,
  'accentColor' | 'position' | 'headerTitle' | 'launcherText' | 'welcomeMessage'
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
  });
  const [baseline, setBaseline] = useState<Appearance>(a);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    setA((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function save() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await saveChatbotSettingsAction(a);
      if (res.ok) {
        const next: Appearance = {
          accentColor: res.settings.accentColor,
          position: res.settings.position,
          headerTitle: res.settings.headerTitle,
          launcherText: res.settings.launcherText,
          welcomeMessage: res.settings.welcomeMessage,
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

  const dirty = JSON.stringify(a) !== JSON.stringify(baseline);

  // origin via window zodat de snippet op localhost én prod de juiste host toont.
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://www.chatmanta.nl';
  const embedCode = `<script src="${origin}/widget-v1.js" data-org="${slug}" defer></script>`;

  function copy() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Installatie */}
      <section className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h3 className="klant-section-title" style={{ margin: 0 }}>
            Installatie
          </h3>
          <p className="klant-hint" style={{ marginTop: 4 }}>
            Plaats deze code vlak vóór de sluitende <code>&lt;/body&gt;</code>-tag van je website.
            De chatbot verschijnt automatisch als chat-knop.
          </p>
        </div>

        {slug ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <pre
              style={{
                flex: 1,
                margin: 0,
                padding: 12,
                background: 'var(--klant-surface)',
                border: '1px solid var(--klant-border)',
                borderRadius: 'var(--klant-r-md)',
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
        ) : (
          <p className="klant-hint">
            De installatiecode verschijnt zodra je organisatie een adres (slug) heeft.
          </p>
        )}

        {/* Toegestane domeinen — READ-ONLY. Door ChatManta (Jorion) beheerd (M-D),
            niet klant-instelbaar; hier alleen ter informatie getoond. */}
        <div>
          <label className="klant-label">Toegestane domeinen</label>
          <div className="klant-hint" style={{ marginBottom: 6 }}>
            Beheerd door ChatManta. Leeg = de widget werkt op elk domein; met een lijst
            verschijnt hij alléén op deze domeinen.
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
      </section>

      {/* Uiterlijk */}
      <section className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 className="klant-section-title" style={{ margin: 0 }}>
          Uiterlijk
        </h3>

        <PresetColorPicker
          label="Accentkleur"
          hint="Chat-knop, header & verstuurknop"
          value={a.accentColor}
          onChange={(v) => update('accentColor', v)}
        />

        <Field label="Positie" hint="Hoek waar de chat-knop op de site verschijnt.">
          <select
            className="klant-select"
            value={a.position}
            onChange={(e) => update('position', e.target.value as WidgetPosition)}
          >
            <option value="bottom-right">Rechtsonder</option>
            <option value="bottom-left">Linksonder</option>
          </select>
        </Field>

        <Field label="Titel in de header" hint="Leeg laten → de chatbotnaam wordt gebruikt.">
          <input
            className="klant-input"
            value={a.headerTitle}
            onChange={(e) => update('headerTitle', e.target.value)}
          />
        </Field>

        <Field
          label="Welkomstbericht"
          hint="Het eerste bericht dat de bezoeker ziet in het chatvenster."
        >
          <input
            className="klant-input"
            value={a.welcomeMessage}
            onChange={(e) => update('welcomeMessage', e.target.value)}
          />
        </Field>

        <Field
          label="Tekst bij de knop"
          hint="Optioneel tooltip-bubbeltje naast de chat-knop. Leeg = geen tooltip."
        >
          <input
            className="klant-input"
            value={a.launcherText}
            onChange={(e) => update('launcherText', e.target.value)}
          />
        </Field>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={save}
            className="klant-btn"
            data-variant="primary"
            disabled={pending || !dirty}
          >
            {pending ? 'Bezig…' : 'Uiterlijk opslaan'}
          </button>
          {saved && <span style={{ fontSize: 13, color: 'var(--klant-success)' }}>Opgeslagen</span>}
          {error && (
            <span role="alert" style={{ fontSize: 13, color: 'var(--klant-danger)' }}>
              {error}
            </span>
          )}
        </div>
      </section>
    </div>
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
