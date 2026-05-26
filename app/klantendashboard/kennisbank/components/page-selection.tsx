'use client';
import { useState, type CSSProperties } from 'react';
import { groupPagesForDisplay, pathLabel } from '@/lib/v0/klantendashboard/group-pages';
import { MAX_CRAWL_PAGES } from '@/lib/v0/crawler/firecrawl';

// Zichtbaar vinkje in dark mode: native checkboxes verdwijnen zonder accent-color.
const checkbox: CSSProperties = { width: 16, height: 16, accentColor: 'var(--klant-accent)', cursor: 'pointer', flexShrink: 0 };

export function PageSelection({
  rootUrl, urls, pending, onStart, onCancel,
}: {
  rootUrl: string; urls: string[]; pending: boolean;
  onStart: (selected: string[], maxPages: number) => void; onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(urls));
  const [maxPages, setMaxPages] = useState(Math.min(urls.length, MAX_CRAWL_PAGES));
  const { groups, loose } = groupPagesForDisplay(urls);

  const toggle = (u: string) => setSelected((s) => { const n = new Set(s); n.has(u) ? n.delete(u) : n.add(u); return n; });
  const toggleMany = (us: string[]) => setSelected((s) => {
    const n = new Set(s); const allOn = us.every((u) => n.has(u));
    us.forEach((u) => (allOn ? n.delete(u) : n.add(u))); return n;
  });
  const setAll = (on: boolean) => setSelected(on ? new Set(urls) : new Set());
  const count = selected.size;

  const host = (() => { try { return new URL(rootUrl).hostname.replace(/^www\./, ''); } catch { return rootUrl; } })();

  const row = (u: string) => (
    <label key={u} title={u}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--klant-border)', cursor: 'pointer' }}>
      <input type="checkbox" checked={selected.has(u)} onChange={() => toggle(u)} style={checkbox} />
      <span style={{ flex: 1, minWidth: 0, color: 'var(--klant-fg)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {pathLabel(u)}
      </span>
    </label>
  );

  const groupBox = (key: string, label: string, us: string[]) => {
    const allOn = us.every((u) => selected.has(u));
    return (
      <div key={key} style={{ border: '1px solid var(--klant-border-strong)', borderRadius: 10, overflow: 'hidden' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--klant-surface-deep)', cursor: 'pointer' }}>
          <input type="checkbox" checked={allOn} onChange={() => toggleMany(us)} style={checkbox} />
          <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, color: 'var(--klant-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          <span style={{ color: 'var(--klant-fg-dim)', fontSize: 12, flexShrink: 0 }}>{us.length}</span>
        </label>
        {us.map(row)}
      </div>
    );
  };

  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h3 className="klant-section-title">Kies welke pagina&apos;s je chatbot mag gebruiken</h3>
          <p className="klant-section-help">We vonden {urls.length} pagina&apos;s op {host}. Vink uit wat je niet wilt.</p>
        </div>
        <label style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
          Max
          <input type="number" min={1} max={MAX_CRAWL_PAGES} value={maxPages}
            onChange={(e) => setMaxPages(Math.min(MAX_CRAWL_PAGES, Math.max(1, Number(e.target.value) || 1)))}
            className="klant-input" style={{ width: 64 }} />
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
          <button type="button" className="klant-btn" data-variant="ghost" onClick={() => setAll(true)}>Alles</button>
          <button type="button" className="klant-btn" data-variant="ghost" onClick={() => setAll(false)}>Niets</button>
        </div>
        <span style={{ fontSize: 13, color: 'var(--klant-fg-dim)' }}>
          <b style={{ color: 'var(--klant-fg)' }}>{count}</b> van {urls.length} geselecteerd
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
        {groups.map((g) => groupBox(g.key, g.label, g.urls))}
        {loose.length > 0 && (
          groups.length > 0
            ? groupBox('_loose', 'Losse pagina’s', loose)
            : <div style={{ border: '1px solid var(--klant-border-strong)', borderRadius: 10, overflow: 'hidden' }}>{loose.map(row)}</div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="klant-btn" data-variant="ghost" onClick={onCancel} disabled={pending}>Annuleren</button>
        <button type="button" className="klant-btn" data-variant="primary" disabled={pending || count === 0}
          onClick={() => onStart(Array.from(selected), maxPages)}>
          {pending ? 'Starten…' : `Crawl ${Math.min(count, maxPages)} pagina's starten`}
        </button>
      </div>
    </div>
  );
}
