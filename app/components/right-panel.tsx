'use client';

import { useMemo } from 'react';
import type { ChatResponse, DocSummary } from '@/lib/v0/server/rag';
import { SourcesView } from './sources-view';
import { DocsView } from './docs-view';
import { SettingsView } from './settings-view';
import { EmbedView } from './embed-view';
import { EvalsView } from './evals-view';
import { PromptView } from './prompt-view';
import { ClaimsView } from './claims-view';
import type { BotMeta } from './bot-dropdown';
import type { Length, Tone } from '@/lib/v0/style-types';

export type RightTab = 'sources' | 'claims' | 'docs' | 'settings' | 'prompt' | 'embed' | 'evals';

export function RightPanel({
  tab,
  onTabChange,
  response,
  threshold,
  onThreshold,
  tone,
  onToneChange,
  length,
  onLengthChange,
  rewriteOn,
  onToggleRewrite,
  botVersion,
  botSystemPrompt,
  bots,
  botFlags,
  activeCite,
  onCiteClick,
  docs,
}: {
  tab: RightTab;
  onTabChange: (t: RightTab) => void;
  response: ChatResponse | null;
  threshold: number;
  onThreshold: (v: number) => void;
  tone: Tone;
  onToneChange: (t: Tone) => void;
  length: Length;
  onLengthChange: (l: Length) => void;
  rewriteOn: boolean;
  onToggleRewrite: () => void;
  botVersion: string;
  botSystemPrompt: string;
  bots: BotMeta[];
  botFlags: {
    cacheEnabled: boolean;
    selfReflect: boolean;
    cascadeOnLowConfidence: boolean;
    cascadeModel: string;
  };
  activeCite: number | null;
  onCiteClick: (idx: number) => void;
  docs: DocSummary[];
}) {
  const sourceCount = useMemo(() => {
    if (!response || response.kind === 'smalltalk') return 0;
    return response.sources.length;
  }, [response]);

  const claimCount = useMemo(() => {
    if (!response || response.kind !== 'answer') return 0;
    return response.extras?.claims?.length ?? 0;
  }, [response]);

  return (
    <aside className="right-panel">
      {/* Inline styles als bypass van een PostCSS/Tailwind v4 quirk waardoor
          overflow-x: auto in globals.css niet doorkwam naar de computed
          style. Gevolg: 7 tabs op 380px width pasten niet en de laatste
          (Evals) was niet bereikbaar. Quick-fix; nettere oplossing
          (overflow-menu of stacked) komt in een latere sessie. */}
      <div
        className="right-tabs"
        role="tablist"
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'thin',
          scrollBehavior: 'smooth',
          maskImage:
            'linear-gradient(to right, black 0, black calc(100% - 18px), transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to right, black 0, black calc(100% - 18px), transparent 100%)',
        }}
      >
        <Tab tab="sources" active={tab === 'sources'} onClick={onTabChange} count={sourceCount}>
          Bronnen
        </Tab>
        <Tab tab="claims" active={tab === 'claims'} onClick={onTabChange} count={claimCount}>
          Claims
        </Tab>
        <Tab tab="docs" active={tab === 'docs'} onClick={onTabChange} count={docs.length}>
          Documenten
        </Tab>
        <Tab tab="settings" active={tab === 'settings'} onClick={onTabChange}>
          Instellingen
        </Tab>
        <Tab tab="prompt" active={tab === 'prompt'} onClick={onTabChange}>
          Prompt
        </Tab>
        <Tab tab="embed" active={tab === 'embed'} onClick={onTabChange}>
          Widget
        </Tab>
        <Tab tab="evals" active={tab === 'evals'} onClick={onTabChange}>
          Evals
        </Tab>
      </div>
      <div className="right-content">
        {tab === 'sources' ? (
          <SourcesView
            response={response}
            threshold={threshold}
            activeCite={activeCite}
            onCiteClick={onCiteClick}
          />
        ) : null}
        {tab === 'claims' ? (
          <ClaimsView response={response} onCiteClick={onCiteClick} />
        ) : null}
        {tab === 'docs' ? <DocsView docs={docs} /> : null}
        {tab === 'settings' ? (
          <SettingsView
            threshold={threshold}
            onThreshold={onThreshold}
            tone={tone}
            onToneChange={onToneChange}
            length={length}
            onLengthChange={onLengthChange}
            rewriteOn={rewriteOn}
            onToggleRewrite={onToggleRewrite}
            botVersion={botVersion}
            bots={bots}
            botFlags={botFlags}
          />
        ) : null}
        {tab === 'prompt' ? (
          <PromptView
            botVersion={botVersion}
            botSystemPrompt={botSystemPrompt}
            tone={tone}
            length={length}
          />
        ) : null}
        {tab === 'embed' ? <EmbedView botVersion={botVersion} /> : null}
        {tab === 'evals' ? <EvalsView /> : null}
      </div>
    </aside>
  );
}

function Tab({
  tab,
  active,
  onClick,
  count,
  children,
}: {
  tab: RightTab;
  active: boolean;
  onClick: (t: RightTab) => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`right-tab${active ? ' active' : ''}`}
      onClick={() => onClick(tab)}
      style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
    >
      {children}
      {count !== undefined && count > 0 ? <span className="count">{count}</span> : null}
    </button>
  );
}
