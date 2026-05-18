'use client';

// Orchestrator voor /widget demo-platform.
//
// Top-bar: org-dropdown + bot-dropdown + reset. Tile-rendering: <FakeSite/>
// per skin + <ChatMantaWidget/> linksonder. State leeft hier zodat zowel de
// fake-site als de widget tegelijk meebewegen bij elke switch.
//
// De widget krijgt een key={`${org}-${bot}`} zodat chat-history reset bij
// elke switch — gewenst gedrag voor sales-demo's.

import { useState } from 'react';
import { FakeSite } from './components/fake-site';
import { ChatMantaWidget } from './components/chatmanta-widget';
import { getSkin, ORG_SLUGS_ORDERED } from './org-skins';
import type { OrgSlug } from '@/lib/v0/server/active-org';

export type BotOption = {
  version: string;
  label: string;
};

export type WidgetDemoProps = {
  initialOrgSlug: OrgSlug;
  initialBotVersion: string;
  bots: BotOption[];
};

export function WidgetDemo({
  initialOrgSlug,
  initialBotVersion,
  bots,
}: WidgetDemoProps) {
  const [orgSlug, setOrgSlug] = useState<OrgSlug>(initialOrgSlug);
  const [botVersion, setBotVersion] = useState<string>(initialBotVersion);
  const [resetKey, setResetKey] = useState(0);

  const skin = getSkin(orgSlug);

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Demo-bar — duidelijk geen onderdeel van de fake site */}
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
          borderRadius: 999,
          fontSize: 12,
          fontFamily: 'var(--font-inter), system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
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
          value={orgSlug}
          onChange={(v) => setOrgSlug(v as OrgSlug)}
          options={ORG_SLUGS_ORDERED.map((s) => ({
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

      <FakeSite skin={skin} />

      <ChatMantaWidget
        key={`${orgSlug}-${botVersion}-${resetKey}`}
        orgSlug={orgSlug}
        botVersion={botVersion}
        companyName={skin.companyName}
        primaryColor={skin.primaryColor}
        suggested={skin.suggestedQuestions}
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
