'use client';
// Kies welke gevonden pagina's meegaan in de crawl. Logica ongewijzigd t.o.v.
// de V0-fork (selectie, groepen, max per keer); vormgeving V1.
import { useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { groupPagesForDisplay, pathLabel } from '@/lib/v0/klantendashboard/group-pages';
import { Button } from '@/app/v1/_ui/button';

// Spiegelt MAX_CRAWL_PAGES uit lib/v1/crawler/firecrawl (die module trekt de Firecrawl-SDK mee).
const MAX_CRAWL_PAGES = 50;

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
  // Veel pagina's? Groepen starten ingeklapt: je ziet eerst de mappen + aantallen.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(groupKeys));

  const q = query.trim().toLowerCase();
  const filtering = q !== '';
  const matches = (u: string) => !filtering || u.toLowerCase().includes(q) || pathLabel(u).toLowerCase().includes(q);
  const isOpen = (key: string) => filtering || !collapsed.has(key);

  const fGroups = groups.map((g) => ({ ...g, urls: g.urls.filter(matches) })).filter((g) => g.urls.length > 0);
  const fLoose = loose.filter(matches);
  const visibleUrls = [...fGroups.flatMap((g) => g.urls), ...fLoose];

  const toggle = (u: string) => setSelected((s) => { const n = new Set(s); if (n.has(u)) n.delete(u); else n.add(u); return n; });
  const toggleMany = (us: string[]) => setSelected((s) => {
    const n = new Set(s); const allOn = us.every((u) => n.has(u));
    us.forEach((u) => (allOn ? n.delete(u) : n.add(u))); return n;
  });
  const setAll = (on: boolean) => setSelected((s) => {
    const n = new Set(s); visibleUrls.forEach((u) => (on ? n.add(u) : n.delete(u))); return n;
  });
  const toggleCollapse = (key: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const allCollapsed = groupKeys.length > 0 && groupKeys.every((k) => collapsed.has(k));

  const count = selected.size;
  const host = (() => { try { return new URL(rootUrl).hostname.replace(/^www\./, ''); } catch { return rootUrl; } })();

  const row = (u: string) => (
    <li key={u}>
      <label className="v1-kb-pick" title={u}>
        <input type="checkbox" className="v1-kb-check" checked={selected.has(u)} onChange={() => toggle(u)} />
        <span>{pathLabel(u)}</span>
      </label>
    </li>
  );

  const group = (key: string, label: string, us: string[]) => {
    const open = isOpen(key);
    const allOn = us.length > 0 && us.every((u) => selected.has(u));
    return (
      <div key={key} className="v1-kb-group">
        <div className="v1-kb-group-row">
          <input type="checkbox" className="v1-kb-check" checked={allOn} onChange={() => toggleMany(us)}
            aria-label={`Alle pagina's in ${label}`} />
          <button type="button" className="v1-kb-group-head" aria-expanded={open} onClick={() => toggleCollapse(key)}>
            <ChevronRight size={16} strokeWidth={1.8} className="v1-kb-chevron" data-open={open} aria-hidden="true" />
            <span className="v1-kb-group-label">{label}</span>
            <span className="v1-kb-group-count">{us.length}</span>
          </button>
        </div>
        {open && <ul className="v1-list v1-kb-nested">{us.map(row)}</ul>}
      </div>
    );
  };

  return (
    <section className="v1-card v1-kb-card-stack" aria-label="Pagina's kiezen">
      <div className="v1-kb-card-head">
        <div>
          <h2 className="v1-kb-card-title">Kies welke pagina&apos;s je chatbot mag gebruiken</h2>
          <p className="v1-hint">
            We vonden {urls.length} pagina&apos;s op {host}. Vink uit wat je niet wilt.
            {urls.length > MAX_CRAWL_PAGES && <> Per keer gaan er maximaal {MAX_CRAWL_PAGES} mee, dus kies de belangrijkste.</>}
          </p>
        </div>
        <label className="v1-kb-max">
          Maximaal
          <input type="number" min={1} max={MAX_CRAWL_PAGES} value={maxPages} className="v1-input"
            onChange={(e) => setMaxPages(Math.min(MAX_CRAWL_PAGES, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
      </div>

      {urls.length > 8 && (
        <div className="v1-kb-search">
          <Search size={16} strokeWidth={1.8} aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek pagina's" aria-label="Zoek pagina's" className="v1-input" />
        </div>
      )}

      <div className="v1-toolbar">
        <Button variant="ghost" size="sm" onClick={() => setAll(true)}>Alles</Button>
        <Button variant="ghost" size="sm" onClick={() => setAll(false)}>Niets</Button>
        {groupKeys.length > 0 && !filtering && (
          <Button variant="ghost" size="sm" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groupKeys))}>
            {allCollapsed ? 'Alles uitklappen' : 'Alles inklappen'}
          </Button>
        )}
        <span className="v1-toolbar-end v1-kb-count-line" aria-live="polite">
          {filtering && <>{visibleUrls.length} zichtbaar · </>}
          <b>{count}</b>&nbsp;van {urls.length} gekozen
        </span>
      </div>

      <div className="v1-kb-scroll">
        {fGroups.map((g) => group(g.key, g.label, g.urls))}
        {fLoose.length > 0 && (
          groups.length > 0 ? group('_loose', 'Losse pagina’s', fLoose) : <ul className="v1-list">{fLoose.map(row)}</ul>
        )}
        {visibleUrls.length === 0 && (
          <p className="v1-hint">Geen pagina&apos;s gevonden voor &ldquo;{query}&rdquo;.</p>
        )}
      </div>

      <div className="v1-kb-actions-end">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>Annuleren</Button>
        <Button loading={pending} disabled={count === 0} onClick={() => onStart(Array.from(selected), maxPages)}>
          {pending ? 'Starten' : `${Math.min(count, maxPages)} pagina's ophalen`}
        </Button>
      </div>
    </section>
  );
}
