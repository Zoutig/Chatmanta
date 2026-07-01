'use client';
// V1 fork van V0's website-tab.tsx — gewijzigde imports:
//   • action-imports: ../actions (V1) i.p.v. @/app/actions/crawl
//   • WebsiteSource type: ../types (V1)
//   • PageSelection, WebsiteList, SinglePageImport: lokale V1-forks
// JSX/copy verbatim.
import { useState, useEffect, useTransition } from 'react';
import {
  discoverPagesAction, startSelectedCrawlAction, tickCrawlIngestAction, refreshWebsiteSources,
} from '../actions';
import type { WebsiteSource } from '../types';
import { PageSelection } from './page-selection';
import { WebsiteList } from './website-list';
import { SinglePageImport } from './single-page-import';

export function WebsiteTab({ initialSources }: { initialSources: WebsiteSource[] }) {
  const [sources, setSources] = useState<WebsiteSource[]>(initialSources);
  const [mode, setMode] = useState<'list' | 'crawl' | 'single'>('list');
  const [url, setUrl] = useState('');
  const [discovered, setDiscovered] = useState<{ rootUrl: string; urls: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const anyCrawling = sources.some((w) => w.job?.status === 'pending' || w.job?.status === 'processing');

  // Poll terwijl er ergens een crawl loopt.
  useEffect(() => {
    if (!anyCrawling) return;
    const t = setInterval(async () => { try { setSources(await tickCrawlIngestAction()); } catch {} }, 4000);
    return () => clearInterval(t);
  }, [anyCrawling]);

  function onDiscover() {
    if (!url.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await discoverPagesAction(url);
      if (!res.ok) { setError(res.error); return; }
      setDiscovered({ rootUrl: res.rootUrl, urls: res.urls });
    });
  }

  function onStart(selected: string[], maxPages: number) {
    if (!discovered) return;
    setError(null);
    startTransition(async () => {
      const res = await startSelectedCrawlAction(discovered.rootUrl, selected, maxPages);
      if (!res.ok) { setError(res.error); return; }
      setDiscovered(null); setUrl(''); setMode('list');
      try { setSources(await refreshWebsiteSources()); } catch {}
    });
  }

  // Kies-scherm heeft voorrang.
  if (discovered) {
    return <PageSelection rootUrl={discovered.rootUrl} urls={discovered.urls} pending={pending}
      onStart={onStart} onCancel={() => { setDiscovered(null); setMode('list'); }} />;
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="klant-btn" data-variant={mode === 'crawl' ? 'primary' : 'ghost'}
          onClick={() => { setMode(mode === 'crawl' ? 'list' : 'crawl'); setError(null); }}>+ Website crawlen</button>
        <button type="button" className="klant-btn" data-variant={mode === 'single' ? 'primary' : 'ghost'}
          onClick={() => { setMode(mode === 'single' ? 'list' : 'single'); setError(null); }}>+ Losse pagina toevoegen</button>
      </div>

      {mode === 'crawl' && (
        <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="klant-section-help">Geef je website-URL op. We zoeken eerst de pagina&apos;s, daarna kies je welke meegaan.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="url" placeholder="https://jouwwebsite.nl" value={url} disabled={pending}
              onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onDiscover()} className="klant-input" />
            <button type="button" onClick={onDiscover} className="klant-btn" data-variant="primary" disabled={pending || !url.trim()}>
              {pending ? 'Zoeken…' : "Pagina's zoeken"}
            </button>
          </div>
        </div>
      )}

      {mode === 'single' && (
        <SinglePageImport onAdded={(s) => { setSources(s); setMode('list'); }} />
      )}

      {error && <div className="klant-card" data-tone="danger" style={{ fontSize: 13 }}>{error}</div>}

      {sources.length === 0 && mode === 'list' && (
        <div className="klant-card" style={{ fontSize: 13, color: 'var(--klant-fg-dim)' }}>
          Nog geen websites. Klik &ldquo;+ Website crawlen&rdquo; om er een toe te voegen.
        </div>
      )}

      <WebsiteList sources={sources} onChange={setSources} />
    </section>
  );
}
