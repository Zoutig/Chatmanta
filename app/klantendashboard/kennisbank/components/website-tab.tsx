'use client';
import { useState, useEffect, useTransition } from 'react';
import {
  discoverPagesAction, startSelectedCrawlAction, tickCrawlIngestAction,
  refreshWebsiteState,
} from '@/app/actions/crawl';
import type { WebsiteState } from '@/lib/v0/server/crawler';
import { CrawlProgress } from './crawl-progress';
import { PageSelection } from './page-selection';
import { ManagedPages } from './managed-pages';

export function WebsiteTab({ initialState }: { initialState: WebsiteState }) {
  const [state, setState] = useState<WebsiteState>(initialState);
  const [discovered, setDiscovered] = useState<{ rootUrl: string; urls: string[] } | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { source, job, pages } = state;
  const isCrawling = job?.status === 'pending' || job?.status === 'processing';

  // On-mount tick — only fires if the server-render already shows a running job.
  useEffect(() => {
    const j = initialState.job;
    if (!j || (j.status !== 'pending' && j.status !== 'processing')) return;
    let cancelled = false;
    tickCrawlIngestAction()
      .then((s) => { if (!cancelled) setState(s); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // During an active crawl: poll every 4 seconds.
  useEffect(() => {
    if (!isCrawling) return;
    const t = setInterval(async () => { try { setState(await tickCrawlIngestAction()); } catch { /* next tick */ } }, 4000);
    return () => clearInterval(t);
  }, [isCrawling]);

  function onDiscover() {
    if (!url.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await discoverPagesAction(url);
      if (!res.ok) { setError(res.error); return; }
      // ActionResult<DiscoverResult> is FLATTENED — no .data field.
      setDiscovered({ rootUrl: res.rootUrl, urls: res.urls });
    });
  }

  function onStart(selected: string[], maxPages: number) {
    if (!discovered) return;
    setError(null);
    startTransition(async () => {
      const res = await startSelectedCrawlAction(discovered.rootUrl, selected, maxPages);
      if (!res.ok) { setError(res.error); return; }
      setDiscovered(null); setUrl('');
      try { setState(await refreshWebsiteState()); } catch { /* polling pikt het op */ }
    });
  }

  // State machine render: selecting > crawling > managed > input
  if (discovered && !isCrawling) {
    return <PageSelection rootUrl={discovered.rootUrl} urls={discovered.urls} pending={pending}
      onStart={onStart} onCancel={() => setDiscovered(null)} />;
  }
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!source && (
        <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h3 className="klant-section-title">Voeg je website toe</h3>
            <p className="klant-section-help">Geef je website-URL op. We zoeken eerst de pagina&apos;s, daarna kies je welke meegaan.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="url" placeholder="https://jouwwebsite.nl" value={url}
              onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onDiscover()}
              className="klant-input" disabled={pending} />
            <button type="button" onClick={onDiscover} className="klant-btn" data-variant="primary"
              disabled={pending || !url.trim()}>{pending ? 'Zoeken…' : "Pagina's zoeken"}</button>
          </div>
        </div>
      )}
      {error && (
        <div className="klant-card" data-tone="danger" style={{ fontSize: 13 }}>{error}</div>
      )}
      {isCrawling && <CrawlProgress completed={job?.completed ?? 0} total={job?.total ?? 0} />}
      {source && !isCrawling && pages.length > 0 && (
        <ManagedPages state={state} onChange={setState} />
      )}
      {source && !isCrawling && pages.length === 0 && (
        <div className="klant-card" style={{ fontSize: 13, color: 'var(--klant-fg-dim)' }}>
          Nog geen pagina&apos;s gevonden. Gebruik bovenstaand veld om een URL op te geven.
        </div>
      )}
    </section>
  );
}

