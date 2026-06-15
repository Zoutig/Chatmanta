'use client';
import { useState, useTransition, type CSSProperties } from 'react';
import { RefreshCw, ChevronRight, Search, Eye } from 'lucide-react';
import {
  setPageIncludedAction, retryPageAction, deleteWebsiteSourceAction, refreshWebsiteSources,
} from '@/app/actions/crawl';
import { getKlantPageContentAction } from '../../actions';
import type { WebsiteSource } from '@/lib/v0/server/crawler';
import { groupPagesForDisplay, pathLabel } from '@/lib/v0/klantendashboard/group-pages';
import { StatusBadge } from '../../components/status-badge';
import { SourceViewer } from './source-viewer';

// Zichtbaar vinkje in dark mode: native checkboxes verdwijnen zonder accent-color.
const checkbox: CSSProperties = { width: 16, height: 16, accentColor: 'var(--klant-accent)', cursor: 'pointer', flexShrink: 0 };

/** Vertaalt de technische per-pagina foutreden naar klant-taal. De rauwe melding
 *  blijft als tooltip beschikbaar (en staat voluit in het operator-overzicht). */
function humanizePageError(msg: string): string {
  if (/HTTP\s*404/i.test(msg)) return 'Pagina niet gevonden (404)';
  if (/HTTP\s*403/i.test(msg)) return 'Geen toegang tot deze pagina (403)';
  if (/HTTP\s*5\d\d/i.test(msg)) return 'De pagina gaf een serverfout';
  if (/^Embedding mislukt/i.test(msg)) return 'Verwerken mislukt — probeer opnieuw';
  if (/^Chunk-opslag mislukt/i.test(msg)) return 'Opslaan mislukt — probeer opnieuw';
  return msg;
}

export function ManagedPages({
  data,
  onChange,
  onDelete,
}: {
  data: WebsiteSource;
  onChange: (s: WebsiteSource[]) => void;
  onDelete: (sourceId: string) => void;
}) {
  const { source, pages } = data;
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const { groups, loose } = groupPagesForDisplay(pages.map((p) => p.url));
  const groupKeys = groups.length > 0 ? [...groups.map((g) => g.key), ...(loose.length ? ['_loose'] : [])] : [];

  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(groupKeys));

  // Bronnen-lezer (item 10): klik op het oog → laad de gecrawlde inhoud in een modal.
  const [viewing, setViewing] = useState<{ title: string; url?: string; text: string } | null>(null);
  const [viewBusyId, setViewBusyId] = useState<string | null>(null);
  const [, startView] = useTransition();

  const viewPage = (id: string, fallbackTitle: string) => {
    setViewBusyId(id);
    setViewing({ title: fallbackTitle, text: '' });
    startView(async () => {
      const res = await getKlantPageContentAction(id);
      setViewBusyId(null);
      if (res.ok) {
        setViewing({
          title: res.title || res.url || fallbackTitle,
          url: res.url,
          text: res.text || '(geen tekst opgeslagen voor deze pagina)',
        });
      } else {
        setViewing({ title: fallbackTitle, text: `Kon de inhoud niet laden: ${res.error}` });
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
  const del = () => {
    if (!confirm('Website-bron verwijderen? Alle pagina’s gaan uit de kennisbank.')) return;
    start(async () => { await deleteWebsiteSourceAction(source.id); onDelete(source.id); });
  };
  const toggleCollapse = (key: string) => setCollapsed((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

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
            <div title={p.errorMessage} style={{ fontSize: 11, color: 'var(--klant-danger, #dc2626)' }}>⚠ {humanizePageError(p.errorMessage)}</div>
          )}
        </div>
        <StatusBadge status={p.status} kind="webpage" />
        {p.status !== 'error' && (
          <button type="button" className="klant-btn" data-variant="ghost"
            onClick={() => viewPage(p.id, primary)} title="Inhoud bekijken" aria-label="Inhoud bekijken"
            style={{ padding: '4px 9px', fontSize: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Eye size={12} strokeWidth={1.8} />
          </button>
        )}
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

      <div className="klant-card crawl-scroll" style={{ padding: 0, maxHeight: 'min(56vh, 520px)' }}>
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
          <div style={{ padding: '14px 12px', fontSize: 13, color: 'var(--klant-fg-dim)' }}>Geen pagina&apos;s gevonden voor &ldquo;{query}&rdquo;.</div>
        )}
      </div>

      <button type="button" className="klant-btn" data-variant="ghost" onClick={del} disabled={pending}
        style={{ alignSelf: 'flex-start', fontSize: 12 }}>
        Website-bron verwijderen
      </button>

      <SourceViewer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        loading={viewBusyId !== null}
        title={viewing?.title ?? ''}
        url={viewing?.url}
        text={viewing?.text ?? ''}
      />
    </section>
  );
}
