'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '../svg-icons';
import type { ThreadSummary } from '@/lib/v0/server/threads';
import type { AllTimeUsage } from '@/lib/v0/server/log';
import type { OrgOption } from '../chat-shell';
import { setActiveOrgAction } from '../../actions/active-org';
import { logoutAction } from '../../actions/logout';

export function MantaSidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onDeleteThread,
  usage,
  onNewChat,
  activeOrgSlug,
  availableOrgs,
  collapsed,
  onToggleCollapsed,
}: {
  threads: ThreadSummary[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  usage: AllTimeUsage;
  onNewChat: () => void;
  activeOrgSlug: string;
  availableOrgs: OrgOption[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length === 0) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, search]);

  return (
    <aside className={`manta-sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="manta-sidebar-brand">
        {/* Logo + "ChatManta" tekst zijn klikbaar — terug naar /home hub.
            Collapse-button blijft buiten de Link (geen button-in-anchor). */}
        <Link
          href="/home"
          prefetch={false}
          aria-label="Terug naar ChatManta home"
          className="manta-sidebar-brand-home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'inherit',
            textDecoration: 'none',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          <div className="manta-sidebar-brand-mark" aria-hidden="true">
            <Image src="/logo/mark.png" alt="" width={510} height={270} priority />
          </div>
          {!collapsed ? (
            <span className="manta-sidebar-brand-text">
              Chat<span className="manta-sidebar-brand-accent">Manta</span>
            </span>
          ) : null}
        </Link>
        {!collapsed ? (
          <button
            type="button"
            className="manta-sidebar-collapse-btn"
            onClick={onToggleCollapsed}
            title="Inklappen"
            aria-label="Sidebar inklappen"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 3l-4 4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="manta-sidebar-newchat">
        <div className="manta-new-wrap">
          <div className="manta-new-glow" aria-hidden="true" />
          <button className="manta-new" onClick={onNewChat} type="button" title="Nieuw gesprek">
            <svg
              className="manta-plus"
              width="13"
              height="13"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {!collapsed ? <span>Nieuw gesprek</span> : null}
          </button>
        </div>
      </div>

      {collapsed ? (
        <button
          type="button"
          className="manta-sidebar-expand-btn"
          onClick={onToggleCollapsed}
          title="Uitklappen"
          aria-label="Sidebar uitklappen"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}

      {!collapsed ? (
        <>
          {threads.length > 0 ? (
            <div className="manta-sidebar-search">
              <Icon name="search" size={12} />
              <input
                placeholder="Zoek"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Zoek gesprekken"
              />
              <span className="manta-sidebar-kbd">⌘K</span>
            </div>
          ) : null}

          <div className="manta-sidebar-section-label">
            <span>Geschiedenis</span>
            <span className="manta-sidebar-section-count">{threads.length}</span>
          </div>

          <div className="manta-sidebar-threads">
            {threads.length === 0 ? (
              <div className="manta-sidebar-empty">
                Stel een vraag — dit gesprek verschijnt hier zodra het eerste antwoord binnen is.
              </div>
            ) : filtered.length === 0 ? (
              <div className="manta-sidebar-empty">Geen treffers voor &ldquo;{search}&rdquo;.</div>
            ) : (
              filtered.map((t) => (
                <MantaThreadItem
                  key={t.id}
                  thread={t}
                  active={t.id === activeThreadId}
                  onSelect={onSelectThread}
                  onDelete={onDeleteThread}
                />
              ))
            )}
          </div>

          <div className="manta-sidebar-footer">
            <MantaUsageStrip usage={usage} />
            <MantaOrgSwitcher activeSlug={activeOrgSlug} options={availableOrgs} />
          </div>
        </>
      ) : null}
    </aside>
  );
}

function MantaThreadItem({
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
      className={`manta-thread-item${active ? ' active' : ''}`}
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
      <div className="manta-thread-meta">
        <span suppressHydrationWarning>
          {turns} {turns === 1 ? 'turn' : 'turns'} · {updated}
        </span>
      </div>
      <div className="manta-thread-title">{thread.title}</div>
      <button
        type="button"
        className="manta-thread-delete"
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

function MantaOrgSwitcher({
  activeSlug,
  options,
}: {
  activeSlug: string;
  options: OrgOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = options.find((o) => o.slug === activeSlug) ?? options[0];
  const initials = active ? deriveInitials(active.name) : 'SO';

  function pick(slug: string) {
    if (slug === activeSlug) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const r = await setActiveOrgAction(slug);
      if (!r.ok) {
        console.warn('setActiveOrg failed:', r.error);
        return;
      }
      setOpen(false);
    });
  }

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  return (
    <div className="manta-org-switcher" ref={containerRef}>
      <button
        type="button"
        className={`manta-user-chip${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
      >
        <div className="manta-user-avatar">{initials}</div>
        <div className="manta-user-meta">
          <div className="manta-user-name">Sebastiaan O.</div>
          <div className="manta-user-org">{active?.name ?? activeSlug} · admin</div>
        </div>
        <Icon name="dots" size={12} />
      </button>

      {open ? (
        <div className="manta-org-popover" role="menu">
          <div className="manta-org-popover-label">Wissel organisatie</div>
          {options.map((o) => {
            const isActive = o.slug === activeSlug;
            return (
              <button
                key={o.slug}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                className={`manta-org-row${isActive ? ' active' : ''}`}
                onClick={() => pick(o.slug)}
                disabled={pending}
              >
                <span className="manta-org-row-avatar">{deriveInitials(o.name)}</span>
                <span className="manta-org-row-text">
                  <span className="manta-org-row-name">{o.name}</span>
                  <span className="manta-org-row-slug">{o.slug}</span>
                </span>
                {isActive ? (
                  <span className="manta-org-row-check" aria-hidden="true">
                    <Icon name="check" size={11} />
                  </span>
                ) : null}
              </button>
            );
          })}

          <div className="manta-org-divider" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="manta-org-row manta-org-row-logout"
            onClick={handleLogout}
            disabled={pending}
          >
            <span className="manta-org-row-avatar" aria-hidden="true">
              <Icon name="log-out" size={14} />
            </span>
            <span className="manta-org-row-text">
              <span className="manta-org-row-name">Uitloggen</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MantaUsageStrip({ usage }: { usage: AllTimeUsage }) {
  const tooltip = [
    `${usage.queryCount} vragen totaal`,
    `embed:    ${usage.embedTokens.toLocaleString('nl-NL')} tok`,
    `chat in:  ${usage.chatInputTokens.toLocaleString('nl-NL')} tok`,
    `chat uit: ${usage.chatOutputTokens.toLocaleString('nl-NL')} tok`,
    `pre:      ${usage.preTokens.toLocaleString('nl-NL')} tok`,
    `kosten:   $${usage.totalCostUsd.toFixed(4)}`,
  ].join('\n');
  return (
    <div className="manta-usage-strip" title={tooltip}>
      <span>${usage.totalCostUsd.toFixed(4)}</span>
      <span className="manta-usage-sep">·</span>
      <span>{formatTokens(usage.totalTokens)} tok</span>
      <span className="manta-usage-sep">·</span>
      <span>{usage.queryCount} {usage.queryCount === 1 ? 'vraag' : 'vragen'}</span>
    </div>
  );
}

function deriveInitials(name: string): string {
  const parts = name
    .replace(/[(){}\[\]]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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
