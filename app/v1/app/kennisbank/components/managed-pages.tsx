'use client';
// Paginalijst van één websitebron: zoeken, groepen in- en uitklappen, pagina
// aan/uit, opnieuw proberen bij een fout en de inhoud bekijken (zijpaneel).
// Data en acties ongewijzigd t.o.v. de V0-fork; alleen de vormgeving is V1.
import { useCallback, useState, useTransition } from 'react';
import { ChevronRight, Eye, RefreshCw, Search } from 'lucide-react';
import {
  setPageIncludedAction, retryPageAction, refreshWebsiteSources, getPageContentAction,
} from '../actions';
import type { WebsitePage, WebsitePageStatus, WebsiteSource } from '../types';
import { groupPagesForDisplay, pathLabel } from '@/lib/v0/klantendashboard/group-pages';
import { Badge, InfoTip, type Tone } from '@/app/v1/_ui/feedback';
import { Button } from '@/app/v1/_ui/button';
import { List, ListRow } from '@/app/v1/_ui/list';
import { SourceDrawer, type SourceView } from './source-drawer';

const PAGE_STATUS: Record<WebsitePageStatus, { label: string; tone: Tone }> = {
  active: { label: 'Actief', tone: 'ok' },
  disabled: { label: 'Uit', tone: 'neutral' },
  error: { label: 'Fout', tone: 'danger' },
  processing: { label: 'Wordt verwerkt', tone: 'accent' },
};

/** Vertaalt de technische per-pagina foutreden naar klant-taal. De rauwe melding
 *  blijft in de tooltip beschikbaar. */
function humanizePageError(msg: string): string {
  if (/HTTP\s*404/i.test(msg)) return 'Pagina niet gevonden (404)';
  if (/HTTP\s*403/i.test(msg)) return 'Geen toegang tot deze pagina (403)';
  if (/HTTP\s*5\d\d/i.test(msg)) return 'De pagina gaf een serverfout';
  if (/^Embedding mislukt/i.test(msg)) return 'Verwerken mislukt. Probeer het opnieuw.';
  if (/^Chunk-opslag mislukt/i.test(msg)) return 'Opslaan mislukt. Probeer het opnieuw.';
  return msg;
}

export function ManagedPages({
  data,
  onChange,
}: {
  data: WebsiteSource;
  onChange: (s: WebsiteSource[]) => void;
}) {
  const { pages } = data;
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const { groups, loose } = groupPagesForDisplay(pages.map((p) => p.url));
  const groupKeys = groups.length > 0 ? [...groups.map((g) => g.key), ...(loose.length ? ['_loose'] : [])] : [];

  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(groupKeys));

  // Bron bekijken: laad de opgeslagen tekst in het zijpaneel.
  const [viewing, setViewing] = useState<SourceView | null>(null);
  const [, startView] = useTransition();
  const closeView = useCallback(() => setViewing(null), []);

  const viewPage = (id: string, fallbackTitle: string) => {
    setViewing({ title: fallbackTitle, text: '', loading: true });
    startView(async () => {
      const res = await getPageContentAction(id);
      if (res.ok) {
        setViewing({
          title: res.title || res.url || fallbackTitle,
          url: res.url || undefined,
          text: res.text || '(geen tekst opgeslagen voor deze pagina)',
          loading: false,
        });
      } else {
        setViewing({ title: fallbackTitle, text: `Kon de inhoud niet laden: ${res.error}`, loading: false });
      }
    });
  };

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
  const allCollapsed = groupKeys.length > 0 && groupKeys.every((k) => collapsed.has(k));

  const refresh = async () => { try { onChange(await refreshWebsiteSources()); } catch {} };
  const toggle = (id: string, included: boolean) => start(async () => {
    setBusyId(id); await setPageIncludedAction(id, included); await refresh(); setBusyId(null);
  });
  const retry = (id: string) => start(async () => { setBusyId(id); await retryPageAction(id); await refresh(); setBusyId(null); });
  const toggleCollapse = (key: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const row = (u: string) => {
    const p: WebsitePage | undefined = byUrl.get(u);
    if (!p) return null;
    const realTitle = p.title && p.title !== p.url ? p.title : null;
    const primary = realTitle ?? pathLabel(p.url);
    const busy = pending && busyId === p.id;
    const st = PAGE_STATUS[p.status];
    const errorText = p.status === 'error' && p.errorMessage
      ? `${humanizePageError(p.errorMessage)}${humanizePageError(p.errorMessage) !== p.errorMessage ? ` (${p.errorMessage})` : ''}`
      : null;
    return (
      <ListRow
        key={p.id}
        title={<span title={p.url}>{primary}</span>}
        meta={realTitle ? pathLabel(p.url) : undefined}
        end={
          <>
            <Badge tone={st.tone}>{st.label}</Badge>
            {errorText ? <InfoTip text={errorText} /> : null}
            {p.status !== 'error' && (
              <button type="button" className="v1-menu-btn" onClick={() => viewPage(p.id, primary)}
                aria-label={`Inhoud bekijken: ${primary}`} title="Inhoud bekijken">
                <Eye size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
            {p.status === 'error' ? (
              <Button variant="ghost" size="sm" loading={busy} onClick={() => retry(p.id)}>
                {busy ? null : <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />}
                Opnieuw
              </Button>
            ) : (
              <button type="button" role="switch" className="v1-switch" aria-checked={p.included} disabled={busy}
                aria-label={`${primary} gebruiken`} title={p.included ? 'Aan' : 'Uit'}
                onClick={() => toggle(p.id, !p.included)} />
            )}
          </>
        }
      />
    );
  };

  const group = (key: string, label: string, urls: string[]) => {
    const open = isOpen(key);
    return (
      <div key={key} className="v1-kb-group">
        <button type="button" className="v1-kb-group-head" aria-expanded={open} onClick={() => toggleCollapse(key)}>
          <ChevronRight size={16} strokeWidth={1.8} className="v1-kb-chevron" data-open={open} aria-hidden="true" />
          <span className="v1-kb-group-label">{label}</span>
          <span className="v1-kb-group-count">{urls.length}</span>
        </button>
        {open && (
          <div className="v1-kb-nested">
            <List>{urls.map(row)}</List>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="v1-kb-pages">
      {pages.length > 8 && (
        <div className="v1-toolbar">
          <div className="v1-kb-search">
            <Search size={16} strokeWidth={1.8} aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek pagina's" aria-label="Zoek pagina's" className="v1-input" />
          </div>
          {groupKeys.length > 0 && !filtering && (
            <Button variant="ghost" size="sm" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groupKeys))}>
              {allCollapsed ? 'Alles uitklappen' : 'Alles inklappen'}
            </Button>
          )}
        </div>
      )}

      <div className="v1-kb-scroll">
        {fGroups.map((g) => group(g.key, g.label, g.urls))}
        {fLoose.length > 0 && (
          groups.length > 0 ? group('_loose', 'Losse pagina’s', fLoose) : <List>{fLoose.map(row)}</List>
        )}
        {visibleCount === 0 && (
          <p className="v1-hint">Geen pagina&apos;s gevonden voor &ldquo;{query}&rdquo;.</p>
        )}
      </div>

      {viewing ? <SourceDrawer view={viewing} onClose={closeView} /> : null}
    </div>
  );
}
