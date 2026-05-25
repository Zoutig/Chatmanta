'use client';

import { useState, useEffect, useTransition } from 'react';
import { Globe, RefreshCw, Trash2, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import { StatusBadge } from '../../components/status-badge';
import {
  startWebsiteCrawlAction,
  deleteWebsiteSourceAction,
  refreshWebsiteState,
  tickCrawlIngestAction,
} from '@/app/actions/crawl';
import type { WebsiteState } from '@/lib/v0/server/crawler';

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return 'zojuist';
  if (diffH < 24) return `${diffH}u geleden`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d geleden`;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export function WebsiteTab({ initialState }: { initialState: WebsiteState }) {
  const [state, setState] = useState<WebsiteState>(initialState);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { source, job, pages } = state;
  const isCrawling = job?.status === 'pending' || job?.status === 'processing';
  const jobFailed = job?.status === 'failed';

  // Inhaal-tick bij openen: een crawl kan afgerond zijn terwijl de tab dicht was.
  useEffect(() => {
    let cancelled = false;
    tickCrawlIngestAction()
      .then((s) => { if (!cancelled) setState(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Tijdens een lopende crawl: elke 4s de tick draaien (poll + ingest).
  useEffect(() => {
    if (!isCrawling) return;
    const timer = setInterval(async () => {
      try { setState(await tickCrawlIngestAction()); } catch { /* volgende tick */ }
    }, 4000);
    return () => clearInterval(timer);
  }, [isCrawling]);

  function submitCrawl(target: string) {
    setError(null);
    startTransition(async () => {
      const res = await startWebsiteCrawlAction(target);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUrl('');
      try {
        setState(await refreshWebsiteState());
      } catch {
        /* polling pikt het op */
      }
    });
  }

  function onAdd() {
    if (!url.trim() || pending) return;
    submitCrawl(url);
  }

  function onRecrawl() {
    if (!source?.rootUrl || pending) return;
    if (!confirm('Website opnieuw crawlen? De bestaande pagina’s worden vervangen.')) return;
    submitCrawl(source.rootUrl);
  }

  function onDelete() {
    if (!source || pending) return;
    if (!confirm('Website-bron verwijderen? Alle gecrawlde pagina’s gaan uit de kennisbank.')) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteWebsiteSourceAction(source.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState({ source: null, job: null, pages: [] });
    });
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Invoer */}
      <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h3 className="klant-section-title">
            {source ? 'Website van je chatbot' : 'Voeg je website toe'}
          </h3>
          <p className="klant-section-help">
            Geef de URL van je website op. Wij crawlen de pagina&apos;s (max 50) en je chatbot
            haalt daar antwoorden uit. Dit kan een paar minuten duren.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            placeholder="https://jouwwebsite.nl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAdd();
            }}
            className="klant-input"
            disabled={pending || isCrawling}
          />
          <button
            type="button"
            onClick={onAdd}
            className="klant-btn"
            data-variant="primary"
            disabled={pending || isCrawling || !url.trim()}
          >
            {isCrawling ? 'Bezig…' : pending ? 'Starten…' : 'Crawl starten'}
          </button>
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--klant-fg-dim)',
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <Globe size={12} /> We verwerken alleen de pagina-content (geen formulieren of
          interactieve elementen).
        </div>
      </div>

      {/* Fout-melding */}
      {error && (
        <div className="klant-card" data-tone="danger" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={16} style={{ color: 'var(--klant-danger, #dc2626)' }} />
          <span style={{ fontSize: 13 }}>{error}</span>
        </div>
      )}

      {/* Bron-status + acties */}
      {source && (
        <div
          className="klant-card"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--klant-fg)', fontWeight: 500 }}>{source.rootUrl}</span>
              {isCrawling && (
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--klant-fg-dim)' }}
                >
                  <Loader2 size={13} style={{ animation: 'org-spin 0.9s linear infinite' }} /> Bezig met crawlen…
                </span>
              )}
            </div>
            {jobFailed && (
              <span style={{ fontSize: 12, color: 'var(--klant-danger, #dc2626)' }}>
                Laatste crawl mislukte{job?.error ? `: ${job.error}` : '.'}
              </span>
            )}
          </div>
          <div style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={onRecrawl}
              className="klant-btn"
              data-variant="ghost"
              disabled={pending || isCrawling}
              title="Opnieuw crawlen"
            >
              <RefreshCw size={14} strokeWidth={1.7} /> Opnieuw crawlen
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="klant-btn"
              data-variant="danger"
              disabled={pending || isCrawling}
              title="Bron verwijderen"
              style={{ padding: 6 }}
            >
              <Trash2 size={14} strokeWidth={1.7} />
            </button>
          </div>
        </div>
      )}

      {/* Pagina-lijst */}
      {pages.length === 0 ? (
        <div className="klant-empty">
          <div className="klant-empty-icon">
            <Globe size={26} strokeWidth={1.6} />
          </div>
          <h3 className="klant-empty-title">{isCrawling ? 'Crawlen…' : 'Nog geen pagina’s'}</h3>
          <p className="klant-empty-sub">
            {isCrawling
              ? 'We zijn je website aan het verwerken. Zodra de pagina’s klaar zijn verschijnen ze hier.'
              : 'Voeg je website-URL toe via het veld hierboven. Wij crawlen de content zodat je chatbot vragen kan beantwoorden.'}
          </p>
        </div>
      ) : (
        <div className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="klant-table">
            <thead>
              <tr>
                <th>Pagina</th>
                <th>Status</th>
                <th>Laatst verwerkt</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ color: 'var(--klant-fg)', fontWeight: 500 }}>{p.title}</span>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 12,
                          color: 'var(--klant-fg-dim)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {p.url}
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={p.status} kind="webpage" />
                  </td>
                  <td style={{ color: 'var(--klant-fg-muted)' }}>{formatDate(p.lastProcessedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
