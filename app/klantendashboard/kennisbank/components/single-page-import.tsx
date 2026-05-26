'use client';
import { useState, useTransition } from 'react';
import { scrapeSinglePageAction, refreshWebsiteState } from '@/app/actions/crawl';
import type { WebsiteState } from '@/lib/v0/server/crawler';

export function SinglePageImport({ onAdded }: { onAdded: (s: WebsiteState) => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function add() {
    if (!url.trim() || pending) return;
    setError(null);
    start(async () => {
      const res = await scrapeSinglePageAction(url);
      if (!res.ok) { setError(res.error); return; }
      setUrl(''); try { onAdded(await refreshWebsiteState()); } catch {}
    });
  }
  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Losse pagina importeren</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="url" className="klant-input" placeholder="https://jouwsite.nl/nieuwe-pagina"
          value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} disabled={pending} />
        <button type="button" className="klant-btn" data-variant="primary" onClick={add} disabled={pending || !url.trim()}>
          {pending ? 'Toevoegen…' : 'Toevoegen'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--klant-fg-dim)' }}>⚡ Direct opgehaald — geen wachten, geen volledige crawl.</div>
      {error && <div style={{ fontSize: 12, color: 'var(--klant-danger, #dc2626)' }}>{error}</div>}
    </div>
  );
}
