'use client';

import { Fragment, useMemo } from 'react';
import type { ChatResponse, DocSummary } from '@/lib/v0/server/rag';
import { SourcesView } from '../sources-view';
import { DocsView } from '../docs-view';
import { SettingsView } from '../settings-view';
import { OpmaakView } from '../opmaak-view';
import { EmbedView } from '../embed-view';
import { EvalsView } from '../evals-view';
import { LatencyView } from '../latency-view';
import { FaqView } from '../faq-view';
import { PromptView } from '../prompt-view';
import { ClaimsView } from '../claims-view';
import type { BotMeta } from '../bot-dropdown';
import type { Length, Tone } from '@/lib/v0/style-types';
import type { OutputStyleVersion } from '@/lib/v0/style';
import type { HydeMode } from '../use-hyde-mode';
import type { RightTab } from '../right-panel';

type RailGroup = 'Antwoord' | 'Configuratie' | 'Bibliotheek';
type RailTab = {
  id: RightTab;
  label: string;
  group: RailGroup;
  icon: React.ReactNode;
  badge?: number;
};

// Mapping: behoud bestaande tab-IDs (geen state-breaking change),
// hergroepeer ze in 3 secties zoals het Manta-ontwerp toont.
function buildTabs(sourceCount: number, claimCount: number, docCount: number): RailTab[] {
  return [
    {
      id: 'sources',
      label: 'Bronnen',
      group: 'Antwoord',
      badge: sourceCount,
      icon: (
        <g>
          <rect x="3" y="3" width="7" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M6 3v9M10 5h2v8H6v-1" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
        </g>
      ),
    },
    {
      id: 'claims',
      label: 'Claims',
      group: 'Antwoord',
      badge: claimCount,
      icon: (
        <g>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M6 8l1.5 1.5L10.5 6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ),
    },
    {
      id: 'docs',
      label: 'Documenten',
      group: 'Antwoord',
      badge: docCount,
      icon: (
        <g>
          <path d="M5 2.5h5l2.5 2.5v8.5h-7.5z" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
          <path d="M10 2.5v3h2.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
        </g>
      ),
    },
    {
      id: 'latency',
      label: 'Latency',
      group: 'Antwoord',
      icon: (
        <g>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      ),
    },
    {
      id: 'faq',
      label: 'FAQ',
      group: 'Antwoord',
      icon: (
        <g>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path
            d="M6.4 6.4c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6c0 1.1-1.6 1.3-1.6 2.4"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11" r="0.7" fill="currentColor" />
        </g>
      ),
    },
    {
      id: 'settings',
      label: 'Instellingen',
      group: 'Configuratie',
      icon: (
        <g>
          <circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path
            d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      ),
    },
    {
      id: 'opmaak',
      label: 'Opmaak',
      group: 'Configuratie',
      icon: (
        <g>
          <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <circle cx="11" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <circle cx="5" cy="11" r="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <circle cx="11" cy="11" r="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </g>
      ),
    },
    {
      id: 'prompt',
      label: 'Prompt',
      group: 'Configuratie',
      icon: (
        <g>
          <path
            d="M3 11V5a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0113 5v6a1.5 1.5 0 01-1.5 1.5H6L3 14.5z"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinejoin="round"
          />
          <path d="M5.5 7h5M5.5 9.5h3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      ),
    },
    {
      id: 'embed',
      label: 'Widget',
      group: 'Bibliotheek',
      icon: (
        <g>
          <path
            d="M6 4l-3.5 4 3.5 4M10 4l3.5 4-3.5 4"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ),
    },
    {
      id: 'evals',
      label: 'Evaluaties',
      group: 'Bibliotheek',
      icon: (
        <g>
          <path
            d="M3 13V8M7 13V4M11 13v-6M13 13H3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>
      ),
    },
  ];
}

export function MantaRightPanel({
  tab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
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
  collapsed: boolean;
  onToggleCollapsed: () => void;
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

  const tabs = useMemo(
    () => buildTabs(sourceCount, claimCount, docs.length),
    [sourceCount, claimCount, docs.length],
  );

  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  function handlePick(id: RightTab) {
    if (collapsed) {
      onToggleCollapsed();
      onTabChange(id);
      return;
    }
    if (id === tab) {
      onToggleCollapsed();
      return;
    }
    onTabChange(id);
  }

  return (
    <aside className={`manta-right-panel${collapsed ? ' collapsed' : ''}`}>
      <MantaRail
        tabs={tabs}
        activeId={tab}
        collapsed={collapsed}
        onPick={handlePick}
        onToggle={onToggleCollapsed}
      />
      {!collapsed ? (
        <div className="manta-right-content">
          <div className="manta-right-header">
            <div className="manta-right-breadcrumb">
              <span className="manta-right-breadcrumb-group">{current.group}</span>
              <span className="manta-right-breadcrumb-sep">›</span>
              <span className="manta-right-breadcrumb-tab">{current.label}</span>
            </div>
            <span className="manta-right-live">
              <span className="manta-right-live-dot" />
              live
            </span>
          </div>

          <div className="manta-right-body">
            {tab === 'sources' ? (
              <SourcesView
                response={response}
                threshold={threshold}
                activeCite={activeCite}
                onCiteClick={onCiteClick}
              />
            ) : null}
            {tab === 'claims' ? <ClaimsView response={response} onCiteClick={onCiteClick} /> : null}
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
            {tab === 'faq' ? <FaqView organizationId={activeOrgId} /> : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function MantaRail({
  tabs,
  activeId,
  collapsed,
  onPick,
  onToggle,
}: {
  tabs: RailTab[];
  activeId: RightTab;
  collapsed: boolean;
  onPick: (id: RightTab) => void;
  onToggle: () => void;
}) {
  return (
    <div className="manta-rail">
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? 'Paneel uitklappen' : 'Paneel inklappen'}
        aria-label={collapsed ? 'Paneel uitklappen' : 'Paneel inklappen'}
        className="manta-rail-toggle"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          {collapsed ? (
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </button>
      <div className="manta-rail-divider" />
      {tabs.map((t, idx) => {
        const prev = idx > 0 ? tabs[idx - 1] : null;
        const groupBreak = prev !== null && prev.group !== t.group;
        const active = !collapsed && t.id === activeId;
        return (
          <Fragment key={t.id}>
            {groupBreak ? <div className="manta-rail-divider" /> : null}
            <button
              type="button"
              onClick={() => onPick(t.id)}
              title={t.label}
              aria-label={t.label}
              className={`manta-rail-tab${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {active ? <span className="manta-rail-tab-marker" aria-hidden="true" /> : null}
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                {t.icon}
              </svg>
              {t.badge && t.badge > 0 ? (
                <span className="manta-rail-tab-badge">{t.badge > 99 ? '99+' : t.badge}</span>
              ) : null}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
