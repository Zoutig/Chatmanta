'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Icon } from './svg-icons';
import type { ThreadSummary } from '@/lib/v0/server/threads';
import type { AllTimeUsage } from '@/lib/v0/server/log';

export function Sidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onDeleteThread,
  usage,
  onNewChat,
}: {
  threads: ThreadSummary[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  usage: AllTimeUsage;
  onNewChat: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length === 0) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, search]);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Image src="/logo/mark.png" alt="ChatManta" width={510} height={270} priority />
        </div>
        <div className="brand-text">
          <div className="brand-name">
            Chat<span className="brand-name-accent">Manta</span>
          </div>
          <div className="brand-tag">v0 · admin</div>
        </div>
      </div>

      <div className="sidebar-actions">
        <button type="button" className="btn-new" onClick={onNewChat}>
          <Icon name="plus" size={14} />
          <span>Nieuwe vraag</span>
        </button>
      </div>

      {threads.length > 0 ? (
        <div className="search-bar">
          <Icon name="search" size={13} />
          <input
            placeholder="Zoek gesprekken…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      ) : null}

      <div className="threads-section">
        <div className="threads-label">
          <span>Recent</span>
          {threads.length > 0 ? <span className="kbd">{threads.length}</span> : null}
        </div>
        {threads.length === 0 ? (
          <div className="threads-empty">
            Stel een vraag — dit gesprek verschijnt hier zodra het eerste antwoord binnen is.
          </div>
        ) : filtered.length === 0 ? (
          <div className="threads-empty">Geen treffers voor &ldquo;{search}&rdquo;.</div>
        ) : (
          filtered.map((t) => (
            <ThreadItem
              key={t.id}
              thread={t}
              active={t.id === activeThreadId}
              onSelect={onSelectThread}
              onDelete={onDeleteThread}
            />
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <UsageStrip usage={usage} />
        <div className="user-chip">
          <div className="user-avatar">SO</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">Sebastiaan O.</div>
            <div className="user-org">jorion · admin</div>
          </div>
          <span style={{ color: 'var(--fg-dim)' }}>
            <Icon name="dots" size={14} />
          </span>
        </div>
      </div>
    </aside>
  );
}

function ThreadItem({
  thread,
  active,
  onSelect,
  onDelete,
}: {
  thread: ThreadSummary;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const turns = Math.floor(thread.messageCount / 2);
  const updated = formatRelative(thread.updatedAt);

  return (
    <div
      className={`thread-item${active ? ' active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(thread.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(thread.id);
        }
      }}
      aria-current={active ? 'page' : undefined}
    >
      <div className="thread-title">{thread.title}</div>
      <div className="thread-meta">
        <span>
          {turns} {turns === 1 ? 'turn' : 'turns'}
        </span>
        <span className="sep">·</span>
        <span className="ver">{thread.botVersion}</span>
        <span className="sep">·</span>
        <span>{updated}</span>
      </div>
      <button
        type="button"
        className="thread-delete"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Verwijder gesprek "${thread.title}"?`)) onDelete(thread.id);
        }}
        aria-label={`Verwijder ${thread.title}`}
        title="Verwijder gesprek"
      >
        <Icon name="x" size={11} />
      </button>
    </div>
  );
}

function UsageStrip({ usage }: { usage: AllTimeUsage }) {
  const tooltip = [
    `${usage.queryCount} vragen totaal`,
    `embed:    ${usage.embedTokens.toLocaleString('nl-NL')} tok`,
    `chat in:  ${usage.chatInputTokens.toLocaleString('nl-NL')} tok`,
    `chat uit: ${usage.chatOutputTokens.toLocaleString('nl-NL')} tok`,
    `pre:      ${usage.preTokens.toLocaleString('nl-NL')} tok`,
    `kosten:   $${usage.totalCostUsd.toFixed(4)}`,
  ].join('\n');
  return (
    <div className="usage-strip" title={tooltip}>
      <span className="usage-metric">
        <span className="v">${usage.totalCostUsd.toFixed(4)}</span>
      </span>
      <span className="usage-sep">·</span>
      <span className="usage-metric">
        <span className="v">{formatTokens(usage.totalTokens)}</span>
        <span className="u">tok</span>
      </span>
      <span className="usage-sep">·</span>
      <span className="usage-metric">
        <span className="v">{usage.queryCount}</span>
        <span className="u">{usage.queryCount === 1 ? 'vraag' : 'vragen'}</span>
      </span>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'nu';
    if (diff < 3600) return `${Math.round(diff / 60)}m`;
    if (diff < 86400) return `${Math.round(diff / 3600)}u`;
    if (diff < 7 * 86400) return `${Math.round(diff / 86400)}d`;
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}
