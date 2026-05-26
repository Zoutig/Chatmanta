'use client';
import { useState } from 'react';
import { groupByPath } from '@/lib/v0/klantendashboard/group-pages';
import { MAX_CRAWL_PAGES } from '@/lib/v0/crawler/firecrawl';

export function PageSelection({
  rootUrl, urls, pending, onStart, onCancel,
}: {
  rootUrl: string; urls: string[]; pending: boolean;
  onStart: (selected: string[], maxPages: number) => void; onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(urls));
  const [maxPages, setMaxPages] = useState(Math.min(urls.length, MAX_CRAWL_PAGES));
  const groups = groupByPath(urls);

  const toggle = (u: string) => setSelected((s) => { const n = new Set(s); n.has(u) ? n.delete(u) : n.add(u); return n; });
  const toggleGroup = (groupUrls: string[]) => setSelected((s) => {
    const n = new Set(s); const allOn = groupUrls.every((u) => n.has(u));
    groupUrls.forEach((u) => (allOn ? n.delete(u) : n.add(u))); return n;
  });
  const setAll = (on: boolean) => setSelected(on ? new Set(urls) : new Set());
  const count = selected.size;

  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h3 className="klant-section-title">Kies welke pagina&apos;s je chatbot mag gebruiken</h3>
          <p className="klant-section-help">We vonden {urls.length} pagina&apos;s op {rootUrl}. Vink uit wat je niet wilt.</p>
        </div>
        <label style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
          Max
          <input type="number" min={1} max={MAX_CRAWL_PAGES} value={maxPages}
            onChange={(e) => setMaxPages(Math.min(MAX_CRAWL_PAGES, Math.max(1, Number(e.target.value) || 1)))}
            className="klant-input" style={{ width: 64 }} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
        <button type="button" className="klant-btn" data-variant="ghost" onClick={() => setAll(true)}>Alles</button>
        <button type="button" className="klant-btn" data-variant="ghost" onClick={() => setAll(false)}>Niets</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {groups.map((g) => {
          const allOn = g.urls.every((u) => selected.has(u));
          return (
            <div key={g.key} style={{ border: '1px solid var(--klant-border)', borderRadius: 10, overflow: 'hidden' }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 12px', background: 'var(--klant-surface-muted)', fontWeight: 600, fontSize: 13 }}>
                <input type="checkbox" checked={allOn} onChange={() => toggleGroup(g.urls)} />
                {g.label} <span style={{ color: 'var(--klant-fg-dim)', fontWeight: 500 }}>· {g.urls.length}</span>
              </label>
              {g.urls.map((u) => (
                <label key={u} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px 8px 30px', fontSize: 12.5, borderTop: '1px solid var(--klant-border)' }}>
                  <input type="checkbox" checked={selected.has(u)} onChange={() => toggle(u)} />
                  <span style={{ color: 'var(--klant-fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u}</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--klant-fg-dim)' }}><b style={{ color: 'var(--klant-fg)' }}>{count}</b> van {urls.length} geselecteerd</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="klant-btn" data-variant="ghost" onClick={onCancel} disabled={pending}>Annuleren</button>
          <button type="button" className="klant-btn" data-variant="primary" disabled={pending || count === 0}
            onClick={() => onStart(Array.from(selected), maxPages)}>
            {pending ? 'Starten…' : `Crawl ${Math.min(count, maxPages)} pagina's starten`}
          </button>
        </div>
      </div>
    </div>
  );
}
