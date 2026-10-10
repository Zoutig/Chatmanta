'use client';

// Bronnen-lezer (M3, item 10) — herbruikbare modal die de volledige inhoud van
// één bron toont "als een tekstbestand". Wordt gevuld door de Documenten- en
// Website-lijst: die roepen de read-action aan, zetten loading, en geven dan
// title/url/text door. Sluiten kan via Escape, klik-buiten of de sluitknop.
//
// Klant.css --klant-* tokens + inline styles (geen Tailwind). De spinner-animatie
// staat in een lokale <style>-tag omdat een @keyframes-toevoeging in globals.css
// soms door de Tailwind v4 PostCSS-pipeline gedropt wordt.

import { useEffect } from 'react';
import { FileText, ExternalLink, X } from 'lucide-react';

export function SourceViewer({
  open,
  onClose,
  loading,
  title,
  url,
  text,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  title: string;
  url?: string;
  text: string;
}) {
  // Escape sluit de modal (alleen geregistreerd zolang hij open is).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Inhoud: ${title}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 1000,
      }}
    >
      <style>{`@keyframes klant-source-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="klant-card"
        style={{
          background: 'var(--klant-bg-elev, #fff)',
          color: 'var(--klant-fg)',
          borderRadius: 'var(--klant-r-lg, 12px)',
          maxWidth: 820,
          width: '100%',
          maxHeight: '82vh',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--klant-border)',
          }}
        >
          <FileText size={15} strokeWidth={1.8} style={{ flexShrink: 0, color: 'var(--klant-fg-muted)' }} />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--klant-fg)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={title}
          >
            {title || 'Bron'}
          </span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="klant-btn"
              data-variant="ghost"
              title="Open de originele pagina in een nieuw tabblad"
              style={{ padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
            >
              <ExternalLink size={13} strokeWidth={1.8} /> Open pagina
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="klant-btn"
            data-variant="ghost"
            style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 40,
              color: 'var(--klant-fg-muted)',
              fontSize: 13,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 16,
                height: 16,
                borderRadius: 999,
                border: '2px solid var(--klant-border)',
                borderTopColor: 'var(--klant-accent)',
                display: 'inline-block',
                animation: 'klant-source-spin 0.7s linear infinite',
              }}
            />
            Inhoud laden…
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              padding: '14px 16px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 12.5,
              lineHeight: 1.55,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: 'var(--klant-fg)',
            }}
          >
            {text}
          </pre>
        )}
      </div>
    </div>
  );
}
