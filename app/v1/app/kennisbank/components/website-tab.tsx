'use client';
// Website-tab: website ophalen (pagina's zoeken → kiezen → crawl), losse pagina
// toevoegen, en de bronnenlijst met statusregels. Acties en polling ongewijzigd;
// de bronnen-state woont in de Kennisbank-view (voor de teller op de tab).
import { useEffect, useRef, useState, useTransition, type Dispatch, type SetStateAction } from 'react';
import { Globe, Link2 } from 'lucide-react';
import {
  discoverPagesAction, startSelectedCrawlAction, tickCrawlIngestAction, refreshWebsiteSources,
} from '../actions';
import type { WebsiteSource } from '../types';
import { Button } from '@/app/v1/_ui/button';
import { Field } from '@/app/v1/_ui/controls';
import { EmptyState } from '@/app/v1/_ui/feedback';
import { useToast } from '@/app/v1/_ui/toast';
import { PageSelection } from './page-selection';
import { WebsiteList } from './website-list';
import { SinglePageImport } from './single-page-import';

export function WebsiteTab({
  sources,
  setSources,
  crawlRequest,
}: {
  sources: WebsiteSource[];
  setSources: Dispatch<SetStateAction<WebsiteSource[]>>;
  /** Telt op als "Website ophalen" in het Toevoegen-menu gekozen wordt. */
  crawlRequest: number;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'list' | 'crawl' | 'single'>('list');
  const [url, setUrl] = useState('');
  const [discovered, setDiscovered] = useState<{ rootUrl: string; urls: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const urlRef = useRef<HTMLInputElement>(null);

  const anyCrawling = sources.some((w) => w.job?.status === 'pending' || w.job?.status === 'processing');

  // Poll terwijl er ergens een crawl loopt.
  useEffect(() => {
    if (!anyCrawling) return;
    const t = setInterval(async () => { try { setSources(await tickCrawlIngestAction()); } catch {} }, 4000);
    return () => clearInterval(t);
  }, [anyCrawling, setSources]);

  // Toevoegen-menu → "Website ophalen": open het formulier en zet de focus in het URL-veld.
  // (State bijwerken tijdens render bij een nieuw verzoek; de focus volgt in het effect.)
  const [seenCrawlRequest, setSeenCrawlRequest] = useState(crawlRequest);
  if (crawlRequest !== seenCrawlRequest) {
    setSeenCrawlRequest(crawlRequest);
    setDiscovered(null);
    setError(null);
    setMode('crawl');
  }
  useEffect(() => {
    if (crawlRequest === 0) return;
    const raf = requestAnimationFrame(() => urlRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [crawlRequest]);

  function openMode(next: 'crawl' | 'single') {
    setError(null);
    setMode(next);
  }

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
      if (!res.ok) { setError(res.error); toast.error(res.error); return; }
      setDiscovered(null); setUrl(''); setMode('list');
      toast.success('Je website wordt opgehaald');
      try { setSources(await refreshWebsiteSources()); } catch {}
    });
  }

  // Kies-scherm heeft voorrang.
  if (discovered) {
    return (
      <>
        <PageSelection rootUrl={discovered.rootUrl} urls={discovered.urls} pending={pending}
          onStart={onStart} onCancel={() => { setDiscovered(null); setMode('list'); }} />
        {error && <p className="v1-alert v1-alert--error" role="alert">{error}</p>}
      </>
    );
  }

  return (
    <>
      {sources.length > 0 && mode === 'list' && (
        <div className="v1-toolbar">
          <Button variant="secondary" size="sm" onClick={() => openMode('crawl')}>
            <Globe size={16} strokeWidth={1.8} aria-hidden="true" />
            Website ophalen
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openMode('single')}>
            <Link2 size={16} strokeWidth={1.8} aria-hidden="true" />
            Losse pagina
          </Button>
        </div>
      )}

      {mode === 'crawl' && (
        <form noValidate className="v1-card v1-kb-card-stack" onSubmit={(e) => { e.preventDefault(); onDiscover(); }}>
          <Field label="Webadres" hint="Daarna kies je welke pagina's meegaan.">
            {(id) => (
              <div className="v1-kb-form-row">
                <input ref={urlRef} id={id} type="url" placeholder="https://jouwwebsite.nl" value={url} disabled={pending}
                  onChange={(e) => setUrl(e.target.value)} className="v1-input" />
                <Button type="submit" loading={pending} disabled={!url.trim()}>
                  {pending ? 'Zoeken' : "Pagina's zoeken"}
                </Button>
                <Button variant="ghost" onClick={() => { setMode('list'); setError(null); }} disabled={pending}>
                  Annuleren
                </Button>
              </div>
            )}
          </Field>
          {error && <p className="v1-alert v1-alert--error" role="alert">{error}</p>}
          <p className="v1-hint">
            Alleen een paar pagina&apos;s nodig?{' '}
            <button type="button" className="v1-link v1-kb-linkbtn" onClick={() => openMode('single')}>
              Voeg een losse pagina toe
            </button>
          </p>
        </form>
      )}

      {mode === 'single' && (
        <SinglePageImport onAdded={(s) => { setSources(s); setMode('list'); }} onCancel={() => setMode('list')} />
      )}

      {sources.length === 0 && mode === 'list' ? (
        <div className="v1-card v1-kb-card-flush">
          <EmptyState action={<Button variant="secondary" size="sm" onClick={() => openMode('crawl')}>Toevoegen</Button>}>
            Nog geen website toegevoegd. Haal je website op, dan kan je chatbot je pagina&apos;s gebruiken.
          </EmptyState>
        </div>
      ) : (
        <WebsiteList sources={sources} onChange={setSources} />
      )}
    </>
  );
}
