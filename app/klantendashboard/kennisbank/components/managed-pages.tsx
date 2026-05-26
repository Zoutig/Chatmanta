'use client';
import { useState, useTransition, type CSSProperties } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import {
  setPageIncludedAction, retryPageAction, deleteWebsiteSourceAction, refreshWebsiteState,
} from '@/app/actions/crawl';
import type { WebsiteState } from '@/lib/v0/server/crawler';
import { groupPagesForDisplay, pathLabel } from '@/lib/v0/klantendashboard/group-pages';
import { StatusBadge } from '../../components/status-badge';
import { SinglePageImport } from './single-page-import';

// Zichtbaar vinkje in dark mode: native checkboxes verdwijnen zonder accent-color.
const checkbox: CSSProperties = { width: 16, height: 16, accentColor: 'var(--klant-accent)', cursor: 'pointer', flexShrink: 0 };
const groupHeader: CSSProperties = { padding: '10px 12px', background: 'var(--klant-surface-deep)', fontWeight: 600, fontSize: 13, color: 'var(--klant-fg)' };

export function ManagedPages({ state, onChange }: { state: WebsiteState; onChange: (s: WebsiteState) => void }) {
  const { source, pages } = state;
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const { groups, loose } = groupPagesForDisplay(pages.map((p) => p.url));
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

  const row = (u: string) => {
    const p = byUrl.get(u);
    if (!p) return null;
    const realTitle = p.title && p.title !== p.url ? p.title : null;
    const primary = realTitle ?? pathLabel(p.url);
    const secondary = realTitle ? pathLabel(p.url) : null;
    const busy = pending && busyId === p.id;
    return (
      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--klant-border)' }}>
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

      <div className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
        {groups.map((g) => (
          <div key={g.key}>
            <div style={groupHeader}>
              {g.label} <span style={{ color: 'var(--klant-fg-dim)', fontWeight: 500, fontSize: 12 }}>· {g.urls.length}</span>
            </div>
            {g.urls.map(row)}
          </div>
        ))}
        {loose.length > 0 && (
          <div>
            {groups.length > 0 && (
              <div style={groupHeader}>
                Losse pagina’s <span style={{ color: 'var(--klant-fg-dim)', fontWeight: 500, fontSize: 12 }}>· {loose.length}</span>
              </div>
            )}
            {loose.map(row)}
          </div>
        )}
      </div>
    </section>
  );
}
