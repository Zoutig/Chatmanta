'use client';

// Persistent shell rond élke /widget/[slug]/[page] route.
//
// Wat hier leeft:
//   - De top demo-bar (org-dropdown / bot-dropdown / reset / home-link).
//     Org-switch doet router.push naar de nieuwe org's eerste pagina.
//     Bot-switch en reset zijn client-state.
//   - De ChatManta-widget. Hij hangt vast aan dit layout-segment, dus
//     overleeft een pagina-navigatie binnen dezelfde org. Bij wissel
//     van [slug] unmount Next.js deze hele subtree → chat reset.
//   - {children} = <FakeSite>{page body}</FakeSite> uit de layout.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ChatMantaWidget } from './chatmanta-widget';
import { getSkin, ORG_SLUGS_WIDGET, type OrgSkin } from '../org-skins';

export type BotOption = {
  version: string;
  label: string;
};

export type WidgetShellProps = {
  skin: OrgSkin;
  bots: BotOption[];
  initialBotVersion: string;
  children: React.ReactNode;
  /** Klantendashboard-overrides die naar ChatMantaWidget gaan. */
  widgetOverrides?: {
    position?: 'bottom-right' | 'bottom-left';
    headerTitle?: string;
    headerSubtitle?: string;
    isActive?: boolean;
    logoColor?: string;
    widgetBgColor?: string;
    pulseColor?: string;
    headerColor?: string;
    logoStyle?: 'brand-mark' | 'chat-bubble' | 'custom-logo';
    customLogoDataUrl?: string | null;
  };
};

export function WidgetShell({
  skin,
  bots,
  initialBotVersion,
  children,
  widgetOverrides,
}: WidgetShellProps) {
  const router = useRouter();
  const [botVersion, setBotVersion] = useState<string>(initialBotVersion);
  const [resetKey, setResetKey] = useState(0);

  const handleOrgChange = (newSlug: string) => {
    if (newSlug === skin.slug) return;
    const firstPage = getSkin(newSlug).pages[0];
    if (!firstPage) return;
    router.push(`/widget/${newSlug}/${firstPage.slug}`);
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Demo-bar. Op smal scherm: max-width binnen viewport + wrap zodat hij
          niet over de zijkant valt. borderRadius wordt rechthoekiger als hij
          wrapt zodat de pills-look niet vreemd uitvalt. */}
      <div
        style={{
          position: 'fixed',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          background: 'rgba(15,17,22,0.92)',
          backdropFilter: 'blur(12px) saturate(140%)',
          WebkitBackdropFilter: 'blur(12px) saturate(140%)',
          color: '#eaf6fb',
          padding: '8px 14px',
          borderRadius: 18,
          fontSize: 12,
          fontFamily: 'var(--font-inter), system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          flexWrap: 'wrap',
          rowGap: 6,
          maxWidth: 'calc(100vw - 16px)',
          boxShadow: '0 12px 32px -10px rgba(0,0,0,0.4)',
          border: '1px solid rgba(120,200,230,0.18)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#00CC9B',
            paddingRight: 4,
          }}
        >
          DEMO
        </span>
        <DemoSelect
          label="Klant"
          value={skin.slug}
          onChange={handleOrgChange}
          options={ORG_SLUGS_WIDGET.map((s) => ({
            value: s,
            label: getSkin(s).companyName,
          }))}
        />
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)' }} />
        <DemoSelect
          label="Bot"
          value={botVersion}
          onChange={(v) => setBotVersion(v)}
          options={bots.map((b) => ({ value: b.version, label: b.version }))}
        />
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)' }} />
        <button
          type="button"
          onClick={() => setResetKey((k) => k + 1)}
          style={{
            background: 'transparent',
            color: '#9bd5e0',
            border: '1px solid rgba(120,200,230,0.25)',
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          title="Reset chat-history zonder van org of bot te wisselen"
        >
          Reset chat
        </button>
        <a
          href="/home"
          style={{
            color: 'rgba(155,213,224,0.7)',
            fontSize: 11,
            textDecoration: 'none',
            paddingLeft: 4,
          }}
        >
          ← Home
        </a>
      </div>

      {children}

      <ChatMantaWidget
        key={`${botVersion}-${resetKey}`}
        orgSlug={skin.slug}
        botVersion={botVersion}
        companyName={skin.companyName}
        primaryColor={skin.primaryColor}
        suggested={skin.suggestedQuestions}
        position={widgetOverrides?.position}
        headerTitle={widgetOverrides?.headerTitle}
        headerSubtitle={widgetOverrides?.headerSubtitle}
        isActive={widgetOverrides?.isActive}
        logoColor={widgetOverrides?.logoColor}
        widgetBgColor={widgetOverrides?.widgetBgColor}
        pulseColor={widgetOverrides?.pulseColor}
        headerColor={widgetOverrides?.headerColor}
        logoStyle={widgetOverrides?.logoStyle}
        customLogoDataUrl={widgetOverrides?.customLogoDataUrl}
      />
    </div>
  );
}

function DemoSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'rgba(155,213,224,0.65)', fontSize: 11 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'rgba(255,255,255,0.06)',
          color: '#eaf6fb',
          border: '1px solid rgba(120,200,230,0.22)',
          borderRadius: 6,
          padding: '3px 6px',
          fontSize: 12,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: '#0f1116', color: '#eaf6fb' }}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
