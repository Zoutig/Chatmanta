'use client';
import { useState, type CSSProperties } from 'react';
import { ChevronRight, Search } from 'lucide-react';
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
  const { groups, loose } = groupPagesForDisplay(urls);
  const groupKeys = groups.length > 0 ? [...groups.map((g) => g.key), ...(loose.length ? ['_loose'] : [])] : [];

  const [selected, setSelected] = useState<Set<string>>(() => new Set(urls));
  const [maxPages, setMaxPages] = useState(Math.min(urls.length, MAX_CRAWL_PAGES));
  const [query, setQuery] = useState('');
  // Veel pagina's? Groepen starten ingeklapt — je ziet eerst de mappen + aantallen.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(groupKeys));

  const q = query.trim().toLowerCase();
  const filtering = q !== '';
  const matches = (u: string) => !filtering || u.toLowerCase().includes(q) || pathLabel(u).toLowerCase().includes(q);
  const isOpen = (key: string) => filtering || !collapsed.has(key);

  const fGroups = groups.map((g) => ({ ...g, urls: g.urls.filter(matches) })).filter((g) => g.urls.length > 0);
  const fLoose = loose.filter(matches);
  const visibleUrls = [...fGroups.flatMap((g) => g.urls), ...fLoose];

  const toggle = (u: string) => setSelected((s) => { const n = new Set(s); n.has(u) ? n.delete(u) : n.add(u); return n; });
  const toggleMany = (us: string[]) => setSelected((s) => {
    const n = new Set(s); const allOn = us.every((u) => n.has(u));
    us.forEach((u) => (allOn ? n.delete(u) : n.add(u))); return n;
  });
  const setAll = (on: boolean) => setSelected((s) => {
    const n = new Set(s); visibleUrls.forEach((u) => (on ? n.add(u) : n.delete(u))); return n;
  });
  const toggleCollapse = (key: string) => setCollapsed((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const allCollapsed = groupKeys.length > 0 && groupKeys.every((k) => collapsed.has(k));

  const count = selected.size;
  const host = (() => { try { return new URL(rootUrl).hostname.replace(/^www\./, ''); } catch { return rootUrl; } })();

  const row = (u: string) => (
    <label key={u} title={u}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px 9px 34px', borderTop: '1px solid var(--klant-border)', cursor: 'pointer' }}>
      <input type="checkbox" checked={selected.has(u)} onChange={() => toggle(u)} style={checkbox} />
      <span style={{ flex: 1, minWidth: 0, color: 'var(--klant-fg)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {pathLabel(u)}
      </span>
    </label>
  );

  const groupBox = (key: string, label: string, us: string[]) => {
    const open = isOpen(key);
    const allOn = us.length > 0 && us.every((u) => selected.has(u));
    return (
      <div key={key} style={{ border: '1px solid var(--klant-border-strong)', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--klant-surface-deep)' }}>
          <button type="button" onClick={() => toggleCollapse(key)} aria-label={open ? 'Inklappen' : 'Uitklappen'}
            style={{ display: 'inline-flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--klant-fg-dim)', flexShrink: 0 }}>
            <ChevronRight size={16} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
          </button>
          <input type="checkbox" checked={allOn} onChange={() => toggleMany(us)} style={checkbox} />
          <span onClick={() => toggleCollapse(key)}
            style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, color: 'var(--klant-fg)', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          <span style={{ color: 'var(--klant-fg-dim)', fontSize: 12, flexShrink: 0 }}>{us.length}</span>
        </div>
        {open && us.map(row)}
      </div>
    );
  };

  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h3 className="klant-section-title">Kies welke pagina&apos;s je chatbot mag gebruiken</h3>
          <p className="klant-section-help">
            We vonden {urls.length} pagina&apos;s op {host}. Vink uit wat je niet wilt.
            {urls.length > MAX_CRAWL_PAGES && <> Je chatbot crawlt er maximaal {MAX_CRAWL_PAGES} per keer — kies de belangrijkste.</>}
          </p>
        </div>
        <label style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
          Max
          <input type="number" min={1} max={MAX_CRAWL_PAGES} value={maxPages}
            onChange={(e) => setMaxPages(Math.min(MAX_CRAWL_PAGES, Math.max(1, Number(e.target.value) || 1)))}
            className="klant-input" style={{ width: 64 }} />
        </label>
      </div>

      {urls.length > 8 && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--klant-fg-dim)', pointerEvents: 'none' }} />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek pagina’s…" className="klant-input" style={{ paddingLeft: 30, width: '100%' }} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
          <button type="button" className="klant-btn" data-variant="ghost" onClick={() => setAll(true)}>Alles</button>
          <button type="button" className="klant-btn" data-variant="ghost" onClick={() => setAll(false)}>Niets</button>
          {groupKeys.length > 0 && !filtering && (
            <button type="button" className="klant-btn" data-variant="ghost"
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groupKeys))}>
              {allCollapsed ? 'Alles uitklappen' : 'Alles inklappen'}
            </button>
          )}
        </div>
        <span style={{ fontSize: 13, color: 'var(--klant-fg-dim)' }}>
          {filtering && <>{visibleUrls.length} zichtbaar · </>}
          <b style={{ color: 'var(--klant-fg)' }}>{count}</b> van {urls.length} geselecteerd
        </span>
      </div>

      <div className="crawl-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'min(56vh, 520px)', paddingRight: 4 }}>
        {fGroups.map((g) => groupBox(g.key, g.label, g.urls))}
        {fLoose.length > 0 && (
          groups.length > 0
            ? groupBox('_loose', 'Losse pagina’s', fLoose)
            : <div style={{ border: '1px solid var(--klant-border-strong)', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>{fLoose.map(row)}</div>
        )}
        {visibleUrls.length === 0 && (
          <div style={{ padding: '14px 12px', fontSize: 13, color: 'var(--klant-fg-dim)' }}>Geen pagina&apos;s gevonden voor “{query}”.</div>
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
