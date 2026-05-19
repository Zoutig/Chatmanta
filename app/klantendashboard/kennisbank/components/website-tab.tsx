'use client';

import { useState } from 'react';
import { Globe, RefreshCw, Power, Trash2, ExternalLink } from 'lucide-react';
import { StatusBadge } from '../../components/status-badge';
import type { WebsitePage } from '@/lib/v0/klantendashboard/types';

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

export function WebsiteTab({ initialPages }: { initialPages: WebsitePage[] }) {
  const [pages, setPages] = useState<WebsitePage[]>(initialPages);
  const [url, setUrl] = useState('');
  const [crawling, setCrawling] = useState(false);

  function addUrl() {
    if (!url.trim() || crawling) return;
    setCrawling(true);
    // Mock crawl — in V0 simuleren we een "verwerking" en voegen na 1.2s een
    // page toe met status processing → active.
    const newPage: WebsitePage = {
      id: `mock-${Date.now()}`,
      title: new URL(url, 'https://invalid').hostname.replace(/^www\./, '') + ' — toegevoegd',
      url: url.startsWith('http') ? url : `https://${url}`,
      status: 'processing',
      lastProcessedAt: new Date().toISOString(),
    };
    setPages((p) => [newPage, ...p]);
    setTimeout(() => {
      setPages((p) =>
        p.map((x) =>
          x.id === newPage.id
            ? { ...x, status: 'active' as const, lastProcessedAt: new Date().toISOString() }
            : x,
        ),
      );
      setCrawling(false);
      setUrl('');
    }, 1200);
  }

  function togglePage(id: string) {
    setPages((p) =>
      p.map((x) =>
        x.id === id ? { ...x, status: x.status === 'active' ? 'disabled' : 'active' } : x,
      ),
    );
  }

  function reprocess(id: string) {
    setPages((p) => p.map((x) => (x.id === id ? { ...x, status: 'processing' as const } : x)));
    setTimeout(() => {
      setPages((p) =>
        p.map((x) =>
          x.id === id
            ? { ...x, status: 'active' as const, lastProcessedAt: new Date().toISOString() }
            : x,
        ),
      );
    }, 1000);
  }

  function removePage(id: string) {
    if (!confirm('Pagina verwijderen uit kennisbank?')) return;
    setPages((p) => p.filter((x) => x.id !== id));
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h3 className="klant-section-title">Voeg website-pagina&apos;s toe</h3>
          <p className="klant-section-help">
            Voeg pagina&apos;s toe die je chatbot mag gebruiken om vragen te beantwoorden.
            Je chatbot leest de content en haalt daar antwoorden uit.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            placeholder="https://jouwwebsite.nl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addUrl();
            }}
            className="klant-input"
            disabled={crawling}
          />
          <button
            type="button"
            onClick={addUrl}
            className="klant-btn"
            data-variant="primary"
            disabled={crawling || !url.trim()}
          >
            {crawling ? 'Bezig…' : 'Toevoegen'}
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
          <Globe size={12} /> We verwerken in v0 alleen de pagina-content (geen formulieren of
          interactieve elementen).
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="klant-empty">
          <div className="klant-empty-icon">
            <Globe size={26} strokeWidth={1.6} />
          </div>
          <h3 className="klant-empty-title">Nog geen pagina&apos;s</h3>
          <p className="klant-empty-sub">
            Voeg je eerste website-URL toe via het veld hierboven. Wij verwerken de content
            zodat je chatbot vragen kan beantwoorden.
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
                <th style={{ textAlign: 'right' }}>Acties</th>
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
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => togglePage(p.id)}
                        className="klant-btn"
                        data-variant="ghost"
                        title={p.status === 'active' ? 'Uitschakelen' : 'Inschakelen'}
                        style={{ padding: 6 }}
                      >
                        <Power size={14} strokeWidth={1.7} />
                      </button>
                      <button
                        type="button"
                        onClick={() => reprocess(p.id)}
                        className="klant-btn"
                        data-variant="ghost"
                        title="Opnieuw verwerken"
                        style={{ padding: 6 }}
                      >
                        <RefreshCw size={14} strokeWidth={1.7} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePage(p.id)}
                        className="klant-btn"
                        data-variant="danger"
                        title="Verwijderen"
                        style={{ padding: 6 }}
                      >
                        <Trash2 size={14} strokeWidth={1.7} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
