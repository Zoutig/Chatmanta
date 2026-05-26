'use client';
import { useState, useTransition, type CSSProperties } from 'react';
import { RefreshCw, Trash2, ChevronRight, Search } from 'lucide-react';
import {
  setPageIncludedAction, retryPageAction, deleteWebsiteSourceAction, refreshWebsiteState,
} from '@/app/actions/crawl';
import type { WebsiteState } from '@/lib/v0/server/crawler';
import { groupPagesForDisplay, pathLabel } from '@/lib/v0/klantendashboard/group-pages';
import { StatusBadge } from '../../components/status-badge';
import { SinglePageImport } from './single-page-import';

// Zichtbaar vinkje in dark mode: native checkboxes verdwijnen zonder accent-color.
const checkbox: CSSProperties = { width: 16, height: 16, accentColor: 'var(--klant-accent)', cursor: 'pointer', flexShrink: 0 };

export function ManagedPages({ state, onChange }: { state: WebsiteState; onChange: (s: WebsiteState) => void }) {
  const { source, pages } = state;
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const { groups, loose } = groupPagesForDisplay(pages.map((p) => p.url));
  const groupKeys = groups.length > 0 ? [...groups.map((g) => g.key), ...(loose.length ? ['_loose'] : [])] : [];

  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(groupKeys));

  const q = query.trim().toLowerCase();
  const filtering = q !== '';
  const matches = (u: string) => {
    if (!filtering) return true;
    const p = byUrl.get(u);
    return u.toLowerCase().includes(q) || pathLabel(u).toLowerCase().includes(q) || (p?.title?.toLowerCase().includes(q) ?? false);
  };
  const isOpen = (key: string) => filtering || !collapsed.has(key);

  const fGroups = groups.map((g) => ({ ...g, urls: g.urls.filter(matches) })).filter((g) => g.urls.length > 0);
  const fLoose = loose.filter(matches);
  const visibleCount = fGroups.reduce((n, g) => n + g.urls.length, 0) + fLoose.length;

  const counts = {
    active: pages.filter((p) => p.status === 'active').length,
    off: pages.filter((p) => p.status === 'disabled').length,
    failed: pages.filter((p) => p.status === 'error').length,
  };

  const refresh = async () => { try { onChange(await refreshWebsiteState()); } catch {} };
  const toggle = (id: string, included: boolean) => start(async () => {
    setBusyId(id); await setPageIncludedAction(id, included); await refresh(); setBusyId(null);
  });
  const retry = (id: string) => start(async () => { setBusyId(id); await retryPageAction(id); await refresh(); setBusyId(null); });
  const del = () => {
    if (!source || !confirm('Website-bron verwijderen? Alle pagina’s gaan uit de kennisbank.')) return;
    start(async () => { await deleteWebsiteSourceAction(source.id); onChange({ source: null, job: null, pages: [] }); });
  };
  const toggleCollapse = (key: string) => setCollapsed((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const allCollapsed = groupKeys.length > 0 && groupKeys.every((k) => collapsed.has(k));

  const row = (u: string) => {
    const p = byUrl.get(u);
    if (!p) return null;
    const realTitle = p.title && p.title !== p.url ? p.title : null;
    const primary = realTitle ?? pathLabel(p.url);
    const secondary = realTitle ? pathLabel(p.url) : null;
    const busy = pending && busyId === p.id;
    return (
      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px 9px 34px', borderTop: '1px solid var(--klant-border)' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div title={p.url} style={{ fontWeight: 500, color: 'var(--klant-fg)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{primary}</div>
          {secondary && (
            <div style={{ fontSize: 11, color: 'var(--klant-fg-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{secondary}</div>
          )}
          {p.status === 'error' && p.errorMessage && (
            <div style={{ fontSize: 11, color: 'var(--klant-danger, #dc2626)' }}>⚠ {p.errorMessage}</div>
          )}
        </div>
        <StatusBadge status={p.status} kind="webpage" />
        {p.status === 'error' ? (
          <button type="button" className="klant-btn" data-variant="ghost" disabled={busy}
            onClick={() => retry(p.id)} style={{ padding: '4px 9px', fontSize: 12, flexShrink: 0 }}>
            <RefreshCw size={12} /> Opnieuw
          </button>
        ) : (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--klant-fg-dim)', cursor: 'pointer', flexShrink: 0, minWidth: 38, justifyContent: 'flex-end' }}>
            <input type="checkbox" checked={p.included} disabled={busy} onChange={() => toggle(p.id, !p.included)} style={checkbox} />
            {p.included ? 'Aan' : 'Uit'}
          </label>
        )}
      </div>
    );
  };

  const groupHeader = (key: string, label: string, n: number) => {
    const open = isOpen(key);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--klant-surface-deep)', cursor: 'pointer' }}
        onClick={() => toggleCollapse(key)}>
        <ChevronRight size={16} style={{ color: 'var(--klant-fg-dim)', flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, color: 'var(--klant-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <span style={{ color: 'var(--klant-fg-dim)', fontSize: 12, flexShrink: 0 }}>{n}</span>
      </div>
    );
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="klant-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🌐 {source?.rootUrl}</div>
          <div style={{ fontSize: 12, color: 'var(--klant-fg-dim)' }}>
            {pages.length} pagina&apos;s · {counts.active} actief · {counts.off} uit · {counts.failed} mislukt
          </div>
        </div>
        <button type="button" className="klant-btn" data-variant="danger" onClick={del} disabled={pending} title="Verwijderen" style={{ padding: 6, flexShrink: 0 }}>
          <Trash2 size={14} />
        </button>
      </div>

      <SinglePageImport onAdded={onChange} />

      {pages.length > 8 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--klant-fg-dim)', pointerEvents: 'none' }} />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek pagina’s…" className="klant-input" style={{ paddingLeft: 30, width: '100%' }} />
          </div>
          {groupKeys.length > 0 && !filtering && (
            <button type="button" className="klant-btn" data-variant="ghost" style={{ fontSize: 12, whiteSpace: 'nowrap' }}
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groupKeys))}>
              {allCollapsed ? 'Alles uitklappen' : 'Alles inklappen'}
            </button>
          )}
        </div>
      )}

      <div className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
        {fGroups.map((g) => (
          <div key={g.key}>
            {groupHeader(g.key, g.label, g.urls.length)}
            {isOpen(g.key) && g.urls.map(row)}
          </div>
        ))}
        {fLoose.length > 0 && (
          groups.length > 0
            ? <div>{groupHeader('_loose', 'Losse pagina’s', fLoose.length)}{isOpen('_loose') && fLoose.map(row)}</div>
            : <div>{fLoose.map(row)}</div>
        )}
        {visibleCount === 0 && (
          <div style={{ padding: '14px 12px', fontSize: 13, color: 'var(--klant-fg-dim)' }}>Geen pagina&apos;s gevonden voor “{query}”.</div>
        )}
      </div>
    </section>
  );
}
