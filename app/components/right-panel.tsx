'use client';

import { useMemo } from 'react';
import type { ChatResponse, DocSummary } from '@/lib/v0/server/rag';
import { SourcesView } from './sources-view';
import { DocsView } from './docs-view';
import { SettingsView } from './settings-view';
import { EmbedView } from './embed-view';
import type { BotMeta } from './bot-dropdown';

export type RightTab = 'sources' | 'docs' | 'settings' | 'embed';

export function RightPanel({
  tab,
  onTabChange,
  response,
  threshold,
  onThreshold,
  rewriteOn,
  onToggleRewrite,
  botVersion,
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
  rewriteOn: boolean;
  onToggleRewrite: () => void;
  botVersion: string;
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

  return (
    <aside className="right-panel">
      <div className="right-tabs" role="tablist">
        <Tab tab="sources" active={tab === 'sources'} onClick={onTabChange} count={sourceCount}>
          Bronnen
        </Tab>
        <Tab tab="docs" active={tab === 'docs'} onClick={onTabChange} count={docs.length}>
          Documenten
        </Tab>
        <Tab tab="settings" active={tab === 'settings'} onClick={onTabChange}>
          Instellingen
        </Tab>
        <Tab tab="embed" active={tab === 'embed'} onClick={onTabChange}>
          Widget
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
        {tab === 'docs' ? <DocsView docs={docs} /> : null}
        {tab === 'settings' ? (
          <SettingsView
            threshold={threshold}
            onThreshold={onThreshold}
            rewriteOn={rewriteOn}
            onToggleRewrite={onToggleRewrite}
            botVersion={botVersion}
            bots={bots}
            botFlags={botFlags}
          />
        ) : null}
        {tab === 'embed' ? <EmbedView botVersion={botVersion} /> : null}
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
    >
      {children}
      {count !== undefined && count > 0 ? <span className="count">{count}</span> : null}
    </button>
  );
}
