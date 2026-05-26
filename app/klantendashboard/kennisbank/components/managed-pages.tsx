'use client';
import { useState, useTransition } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import {
  setPageIncludedAction, retryPageAction, deleteWebsiteSourceAction, refreshWebsiteState,
} from '@/app/actions/crawl';
import type { WebsiteState } from '@/lib/v0/server/crawler';
import { groupByPath } from '@/lib/v0/klantendashboard/group-pages';
import { StatusBadge } from '../../components/status-badge';
import { SinglePageImport } from './single-page-import';

export function ManagedPages({ state, onChange }: { state: WebsiteState; onChange: (s: WebsiteState) => void }) {
  const { source, pages } = state;
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const groups = groupByPath(pages.map((p) => p.url));
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

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="klant-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>🌐 {source?.rootUrl}</div>
          <div style={{ fontSize: 12, color: 'var(--klant-fg-dim)' }}>
            {pages.length} pagina&apos;s · {counts.active} actief · {counts.off} uit · {counts.failed} mislukt
          </div>
        </div>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" className="klant-btn" data-variant="danger" onClick={del} disabled={pending} title="Verwijderen" style={{ padding: 6 }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <SinglePageImport onAdded={onChange} />

      <div className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
        {groups.map((g) => (
          <div key={g.key}>
            <div style={{ padding: '9px 12px', background: 'var(--klant-surface-muted)', fontWeight: 600, fontSize: 13 }}>
              {g.label} <span style={{ color: 'var(--klant-fg-dim)', fontWeight: 500 }}>· {g.urls.length}</span>
            </div>
            {g.urls.map((u) => {
              const p = byUrl.get(u)!;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: '1px solid var(--klant-border)' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500, color: 'var(--klant-fg)' }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--klant-fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.url}</div>
                    {p.status === 'error' && p.errorMessage && (
                      <div style={{ fontSize: 11, color: 'var(--klant-danger, #dc2626)' }}>⚠ {p.errorMessage}</div>
                    )}
                  </div>
                  <StatusBadge status={p.status} kind="webpage" />
                  {p.status === 'error' ? (
                    <button type="button" className="klant-btn" data-variant="ghost" disabled={pending && busyId === p.id}
                      onClick={() => retry(p.id)} style={{ padding: '4px 9px', fontSize: 12 }}>
                      <RefreshCw size={12} /> Opnieuw
                    </button>
                  ) : (
                    <input type="checkbox" checked={p.included} disabled={pending && busyId === p.id}
                      onChange={() => toggle(p.id, !p.included)} title={p.included ? 'Aan' : 'Uit'} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
