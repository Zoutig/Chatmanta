'use client';

import { useMemo } from 'react';
import type { ChatResponse, DocSummary } from '@/lib/v0/server/rag';
import { SourcesView } from './sources-view';
import { DocsView } from './docs-view';
import { SettingsView } from './settings-view';
import { OpmaakView } from './opmaak-view';
import { EmbedView } from './embed-view';
import { EvalsView } from './evals-view';
import { LatencyView } from './latency-view';
import { KnowledgeGapView } from './knowledge-gap-view';
import { FaqView } from './faq-view';
import { PromptView } from './prompt-view';
import { ClaimsView } from './claims-view';
import type { BotMeta } from './bot-dropdown';
import type { Length, Tone } from '@/lib/rag/style-types';
import type { OutputStyleVersion } from '@/lib/rag/style';
import type { HydeMode } from './use-hyde-mode';

export type RightTab =
  | 'sources'
  | 'claims'
  | 'docs'
  | 'settings'
  | 'opmaak'
  | 'prompt'
  | 'embed'
  | 'evals'
  | 'latency'
  | 'gaps'
  | 'faq';

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
  hydeMode,
  onHydeModeChange,
  rewriteOn,
  onToggleRewrite,
  generalKnowledgeOn,
  onToggleGeneralKnowledge,
  botVersion,
  botSystemPrompt,
  botOutputStyleVersion,
  bots,
  botFlags,
  activeCite,
  onCiteClick,
  docs,
  activeOrgId,
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
  hydeMode: HydeMode;
  onHydeModeChange: (m: HydeMode) => void;
  rewriteOn: boolean;
  onToggleRewrite: () => void;
  generalKnowledgeOn: boolean;
  onToggleGeneralKnowledge: () => void;
  botVersion: string;
  botSystemPrompt: string;
  botOutputStyleVersion?: OutputStyleVersion;
  bots: BotMeta[];
  botFlags: {
    cacheEnabled: boolean;
    selfReflect: boolean;
    cascadeOnLowConfidence: boolean;
    cascadeModel: string;
    generalKnowledgeEnabled: boolean;
  };
  activeCite: number | null;
  onCiteClick: (idx: number) => void;
  docs: DocSummary[];
  activeOrgId: string;
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
          (overflow-menu of stacked) komt in een latere sessie.

          ::-webkit-scrollbar regels kunnen niet via inline-style; een
          dedicated <style>-tag (raw CSS, geen PostCSS pipeline) zet de
          dark/light scrollbar-tinten correct. */}
      <style>{`
        .right-tabs::-webkit-scrollbar { height: 4px; }
        .right-tabs::-webkit-scrollbar-track { background: transparent; }
        .right-tabs::-webkit-scrollbar-thumb {
          background: var(--surface-3);
          border-radius: 2px;
          border: none;
        }
        .right-tabs::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }
      `}</style>
      <div
        className="right-tabs"
        role="tablist"
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--surface-3) transparent',
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
        <Tab tab="opmaak" active={tab === 'opmaak'} onClick={onTabChange}>
          Opmaak
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
        <Tab tab="latency" active={tab === 'latency'} onClick={onTabChange}>
          Latency
        </Tab>
        <Tab tab="gaps" active={tab === 'gaps'} onClick={onTabChange}>
          Gaps
        </Tab>
        <Tab tab="faq" active={tab === 'faq'} onClick={onTabChange}>
          FAQ
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
            hydeMode={hydeMode}
            onHydeModeChange={onHydeModeChange}
            rewriteOn={rewriteOn}
            onToggleRewrite={onToggleRewrite}
            generalKnowledgeOn={generalKnowledgeOn}
            onToggleGeneralKnowledge={onToggleGeneralKnowledge}
            botVersion={botVersion}
            bots={bots}
            botFlags={botFlags}
          />
        ) : null}
        {tab === 'opmaak' ? <OpmaakView /> : null}
        {tab === 'prompt' ? (
          <PromptView
            botVersion={botVersion}
            botSystemPrompt={botSystemPrompt}
            tone={tone}
            length={length}
            outputStyleVersion={botOutputStyleVersion}
          />
        ) : null}
        {tab === 'embed' ? <EmbedView botVersion={botVersion} /> : null}
        {tab === 'evals' ? <EvalsView /> : null}
        {tab === 'latency' ? <LatencyView organizationId={activeOrgId} /> : null}
        {tab === 'gaps' ? <KnowledgeGapView organizationId={activeOrgId} /> : null}
        {tab === 'faq' ? <FaqView organizationId={activeOrgId} /> : null}
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
