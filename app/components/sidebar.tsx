'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Icon } from './svg-icons';
import type { ThreadSummary } from '@/lib/v0/server/threads';
import type { AllTimeUsage } from '@/lib/v0/server/log';
import type { OrgOption } from './chat-shell';
import { setActiveOrgAction } from '../actions/active-org';
import { logoutAction } from '../actions/logout';

export function Sidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onDeleteThread,
  usage,
  onNewChat,
  activeOrgSlug,
  availableOrgs,
}: {
  threads: ThreadSummary[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  usage: AllTimeUsage;
  onNewChat: () => void;
  activeOrgSlug: string;
  availableOrgs: OrgOption[];
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length === 0) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, search]);

  return (
    <aside className="sidebar">
      <Link
        href="/home"
        prefetch={false}
        aria-label="Terug naar ChatManta home"
        className="brand"
        style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}
      >
        <div className="brand-mark">
          <Image src="/logo/mark.png" alt="" width={510} height={270} priority />
        </div>
        <div className="brand-text">
          <div className="brand-name">
            Chat<span className="brand-name-accent">Manta</span>
          </div>
          <div className="brand-tag">v0 · admin</div>
        </div>
      </Link>

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
        <OrgSwitcher activeSlug={activeOrgSlug} options={availableOrgs} />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// OrgSwitcher — interactieve user-chip linksonder. Klik = popover met de
// beschikbare orgs. Selectie gaat via setActiveOrgAction (zet cookie +
// revalidatePath('/')) zodat sidebar/page een verse render krijgt met de
// data van de nieuwe org.
// ---------------------------------------------------------------------------
function OrgSwitcher({
  activeSlug,
  options,
}: {
  activeSlug: string;
  options: OrgOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside / Escape sluit de popover.
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
      // revalidatePath('/') in de action zorgt voor een verse server-render.
    });
  }

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
      // logoutAction redirect()'t naar /login — code hieronder draait niet meer.
    });
  }

  return (
    <div className="org-switcher" ref={containerRef}>
      <button
        type="button"
        className={`user-chip user-chip-button${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={pending}
      >
        <div className="user-avatar">{initials}</div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div className="user-name">Sebastiaan O.</div>
          <div className="user-org">{active?.name ?? activeSlug} · admin</div>
        </div>
        <span style={{ color: 'var(--fg-dim)', display: 'flex' }}>
          {pending ? <span className="org-switcher-spinner" /> : <Icon name="caret" size={12} />}
        </span>
      </button>

      {open ? (
        <div className="org-switcher-popover" role="menu">
          <div className="org-switcher-label">Wissel organisatie</div>
          {options.map((o) => {
            const isActive = o.slug === activeSlug;
            return (
              <button
                key={o.slug}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                className={`org-switcher-row${isActive ? ' active' : ''}`}
                onClick={() => pick(o.slug)}
                disabled={pending}
              >
                <span className="org-switcher-row-avatar">{deriveInitials(o.name)}</span>
                <span className="org-switcher-row-text">
                  <span className="org-switcher-row-name">{o.name}</span>
                  <span className="org-switcher-row-slug">{o.slug}</span>
                </span>
                {isActive ? (
                  <span className="org-switcher-row-check" aria-hidden="true">
                    <Icon name="check" size={11} />
                  </span>
                ) : null}
              </button>
            );
          })}

          <div className="org-switcher-divider" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="org-switcher-row org-switcher-row-logout"
            onClick={handleLogout}
            disabled={pending}
          >
            <span className="org-switcher-row-icon" aria-hidden="true">
              <Icon name="log-out" size={14} />
            </span>
            <span className="org-switcher-row-text">
              <span className="org-switcher-row-name">Uitloggen</span>
            </span>
          </button>
        </div>
      ) : null}
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
        {/* Relatieve tijd: server en client kunnen seconden uit elkaar lopen
            ("14m" vs "13m"). Dit is geen echte mismatch — de waarde verandert
            inherent met Date.now(). suppressHydrationWarning vertelt React dit
            verschil te tolereren op deze ene span. */}
        <span suppressHydrationWarning>{updated}</span>
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
