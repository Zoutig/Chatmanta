'use client';

// V1 Kennisbank — functionele website-crawler-UI (discover → kies → crawl → beheer).
// Styling via het V0-klantendashboard-designsysteem (klant.css-classes, geladen door
// de /v1/app-shell); alleen markup/className is herstyled — alle crawl-handlers,
// effecten en server-actions zijn onveranderd.

import { useState, useEffect, useTransition, type CSSProperties } from 'react';
import {
  discoverPagesAction,
  startSelectedCrawlAction,
  tickCrawlIngestAction,
  refreshWebsiteSources,
  setPageIncludedAction,
  retryPageAction,
  deleteWebsiteSourceAction,
} from './actions';
import type { WebsiteSource } from './types';

const ellipsis: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function sourceLabel(s: WebsiteSource): string {
  if (s.job?.status === 'pending' || s.job?.status === 'processing') return 'Bezig met verwerken…';
  const a = s.pages.filter((p) => p.status === 'active').length;
  const off = s.pages.filter((p) => p.status === 'disabled').length;
  const err = s.pages.filter((p) => p.status === 'error').length;
  return `${s.pages.length} pagina's · ${a} actief · ${off} uit · ${err} mislukt`;
}

export function V1Kennisbank({ initialSources }: { initialSources: WebsiteSource[] }) {
  const [sources, setSources] = useState<WebsiteSource[]>(initialSources);
  const [mode, setMode] = useState<'list' | 'crawl'>('list');
  const [url, setUrl] = useState('');
  const [discovered, setDiscovered] = useState<{ rootUrl: string; urls: string[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [maxPages, setMaxPages] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const anyCrawling = sources.some((w) => w.job?.status === 'pending' || w.job?.status === 'processing');
  // Poll terwijl er ergens een crawl loopt (client-tick verwerkt de jobs).
  useEffect(() => {
    if (!anyCrawling) return;
    const t = setInterval(() => {
      tickCrawlIngestAction().then(setSources).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [anyCrawling]);

  const refresh = () => {
    refreshWebsiteSources().then(setSources).catch(() => {});
  };

  function onDiscover() {
    if (!url.trim() || pending) return;
    setError(null);
    start(async () => {
      const res = await discoverPagesAction(url);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDiscovered({ rootUrl: res.rootUrl, urls: res.urls });
      setSelected(new Set(res.urls));
      setMaxPages(Math.min(res.urls.length || 1, 50));
    });
  }

  function onStart() {
    if (!discovered || pending) return;
    setError(null);
    start(async () => {
      const res = await startSelectedCrawlAction(discovered.rootUrl, Array.from(selected), maxPages);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDiscovered(null);
      setUrl('');
      setMode('list');
      const fresh = await refreshWebsiteSources().catch(() => null);
      if (fresh) setSources(fresh);
    });
  }

  const toggleUrl = (u: string) => setSelected((s) => { const n = new Set(s); n.has(u) ? n.delete(u) : n.add(u); return n; });
  const toggleOpen = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Handlers checken het ActionResult: bij {ok:false} tonen we de fout i.p.v. stil
  // refreshen (anders ziet de gebruiker ongewijzigde state zonder uitleg).
  const togglePage = (id: string, included: boolean) =>
    start(async () => {
      setBusyId(id); setError(null);
      const res = await setPageIncludedAction(id, included);
      if (!res.ok) setError(res.error);
      refresh(); setBusyId(null);
    });
  const retry = (id: string) =>
    start(async () => {
      setBusyId(id); setError(null);
      const res = await retryPageAction(id);
      if (!res.ok) setError(res.error);
      refresh(); setBusyId(null);
    });
  const del = (id: string) => {
    if (!confirm("Website-bron verwijderen? Alle pagina's gaan uit de kennisbank.")) return;
    start(async () => {
      setError(null);
      const res = await deleteWebsiteSourceAction(id);
      if (!res.ok) { setError(res.error); return; }
      refresh();
    });
  };

  // ─── selectie-paneel (na discover) ──────────────────────────────────────────
  if (discovered) {
    return (
      <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <strong style={{ fontSize: 14 }}>Kies welke pagina&apos;s je chatbot mag gebruiken</strong>
        <div style={{ fontSize: 13, color: 'var(--klant-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>{discovered.urls.length} pagina&apos;s gevonden.</span>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            Max
            <input type="number" min={1} max={50} value={maxPages}
              onChange={(e) => setMaxPages(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              className="klant-input" style={{ width: 60, flex: 'none' }} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
          <button type="button" className="klant-btn" onClick={() => setSelected(new Set(discovered.urls))}>Alles</button>
          <button type="button" className="klant-btn" onClick={() => setSelected(new Set())}>Niets</button>
          <span style={{ color: 'var(--klant-dim)' }}>{selected.size} van {discovered.urls.length} geselecteerd</span>
        </div>
        <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--klant-border)', borderRadius: 'var(--klant-r-md)' }}>
          {discovered.urls.map((u) => (
            <label key={u} title={u} style={{ display: 'flex', gap: 8, padding: '7px 10px', borderTop: '1px solid var(--klant-border)', fontSize: 13, cursor: 'pointer', alignItems: 'center' }}>
              <input type="checkbox" checked={selected.has(u)} onChange={() => toggleUrl(u)} />
              <span style={{ flex: 1, ...ellipsis }}>{u}</span>
            </label>
          ))}
        </div>
        {error && <div style={{ color: 'var(--klant-danger)', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="klant-btn" onClick={() => { setDiscovered(null); setMode('list'); }} disabled={pending}>Annuleren</button>
          <button type="button" className="klant-btn" data-variant="primary" onClick={onStart} disabled={pending || selected.size === 0}>
            {pending ? 'Starten…' : `Crawl ${Math.min(selected.size, maxPages)} pagina's starten`}
          </button>
        </div>
      </div>
    );
  }

  // ─── lijst + crawl-toevoegen ────────────────────────────────────────────────
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <button type="button" className="klant-btn" data-variant={mode === 'crawl' ? 'primary' : undefined}
          onClick={() => { setMode(mode === 'crawl' ? 'list' : 'crawl'); setError(null); }}
          disabled={pending}>
          + Website crawlen
        </button>
      </div>

      {mode === 'crawl' && (
        <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--klant-muted)', margin: 0 }}>
            Geef je website-URL op. We zoeken eerst de pagina&apos;s, daarna kies je welke meegaan.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="url" placeholder="https://jouwwebsite.nl" value={url} disabled={pending}
              onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onDiscover()}
              className="klant-input" style={{ flex: 1, minWidth: 0 }} />
            <button type="button" className="klant-btn" data-variant="primary" onClick={onDiscover} disabled={pending || !url.trim()}>
              {pending ? 'Zoeken…' : "Pagina's zoeken"}
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: 'var(--klant-danger)', fontSize: 13 }}>{error}</div>}

      {sources.length === 0 && (
        <div className="klant-card" style={{ fontSize: 13, color: 'var(--klant-muted)' }}>Nog geen websites. Klik &ldquo;+ Website crawlen&rdquo;.</div>
      )}

      {sources.map((ws) => {
        const id = ws.source.id;
        const crawling = ws.job?.status === 'pending' || ws.job?.status === 'processing';
        const isOpen = open.has(id);
        return (
          <div key={id} className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div role="button" tabIndex={crawling ? -1 : 0}
              onClick={() => !crawling && toggleOpen(id)}
              onKeyDown={(e) => { if (!crawling && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleOpen(id); } }}
              style={{ display: 'flex', gap: 10, padding: '12px 14px', cursor: crawling ? 'default' : 'pointer', alignItems: 'center' }}>
              <span aria-hidden style={{ color: 'var(--klant-dim)', width: 14 }}>{crawling ? '⏳' : isOpen ? '▾' : '▸'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, ...ellipsis }}>{ws.source.host ?? ws.source.rootUrl ?? '(onbekend)'}</div>
                <div style={{ fontSize: 12, color: 'var(--klant-muted)' }}>
                  {sourceLabel(ws)}{crawling && ws.job ? ` (${ws.job.completed}/${ws.job.total})` : ''}
                </div>
              </div>
            </div>
            {isOpen && !crawling && (
              <div style={{ borderTop: '1px solid var(--klant-border)' }}>
                {ws.pages.length === 0 && (
                  <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--klant-muted)' }}>Geen pagina&apos;s.</div>
                )}
                {ws.pages.map((p) => {
                  const busy = pending && busyId === p.id;
                  return (
                    <div key={p.id} style={{ display: 'flex', gap: 10, padding: '8px 14px', alignItems: 'center', fontSize: 13, borderTop: '1px solid var(--klant-border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div title={p.url} style={ellipsis}>{p.title}</div>
                        {p.status === 'error' && p.errorMessage && (
                          <div title={p.errorMessage} style={{ fontSize: 11, color: 'var(--klant-danger)', ...ellipsis }}>⚠ {p.errorMessage}</div>
                        )}
                      </div>
                      {p.status === 'error' ? (
                        <button type="button" className="klant-btn" style={{ fontSize: 12, padding: '4px 9px' }} disabled={busy} onClick={() => retry(p.id)}>
                          Opnieuw
                        </button>
                      ) : (
                        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--klant-muted)', cursor: 'pointer', flexShrink: 0 }}>
                          <input type="checkbox" checked={p.included} disabled={busy} onChange={() => togglePage(p.id, !p.included)} />
                          {p.included ? 'Aan' : 'Uit'}
                        </label>
                      )}
                    </div>
                  );
                })}
                <div style={{ padding: '8px 14px', borderTop: '1px solid var(--klant-border)' }}>
                  <button type="button" className="klant-btn" data-variant="danger" style={{ fontSize: 12 }} onClick={() => del(id)} disabled={pending}>
                    Website-bron verwijderen
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
