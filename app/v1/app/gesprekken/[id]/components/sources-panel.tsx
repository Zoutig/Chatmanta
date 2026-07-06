'use client';

// WP4.3 — inklapbaar "Bronnen"-paneel onder een assistant-bericht in het V1
// gesprek-detail. Visueel/UX naar V0's CollapsibleSources, maar op de compacte
// V1-vorm (titel/bestandsnaam + optionele bron-URL + similarity). Standaard
// ingeklapt: per bericht een eigen paneel, dus dicht houdt het transcript rustig.

import { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import type { ThreadMessageSource } from '@/lib/v1/conversations/sources';

/** URL leesbaar korten tot host + pad (zonder schema/query). Faalt de parse, toon rauw. */
function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

export function SourcesPanel({ sources }: { sources: ThreadMessageSource[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  return (
    <div style={{ marginTop: 6, width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          color: 'var(--klant-muted)',
          font: 'inherit',
          fontSize: 11.5,
        }}
      >
        <BookOpen size={13} strokeWidth={1.7} style={{ flexShrink: 0 }} />
        <span>Bronnen ({sources.length})</span>
        <ChevronDown
          size={13}
          strokeWidth={2}
          style={{
            flexShrink: 0,
            transition: 'transform 0.15s ease',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        />
      </button>

      {open && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '6px 0 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {sources.map((s, i) => (
            <li
              key={i}
              style={{
                padding: '6px 9px',
                background: 'var(--klant-surface-muted)',
                border: '1px solid var(--klant-border)',
                borderRadius: 'var(--klant-r-sm)',
                fontSize: 11.5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: 'var(--klant-ink)', fontWeight: 500, wordBreak: 'break-word' }}>
                  {s.title}
                </span>
                <span
                  style={{ color: 'var(--klant-dim)', fontFamily: 'var(--klant-font-mono)', flexShrink: 0 }}
                  title="Overeenkomst met de vraag"
                >
                  {Math.round(s.similarity * 100)}%
                </span>
              </div>
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    marginTop: 2,
                    color: 'var(--klant-accent)',
                    textDecoration: 'none',
                    wordBreak: 'break-all',
                  }}
                >
                  {prettyUrl(s.url)}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
