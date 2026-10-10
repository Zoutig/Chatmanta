'use client';

// Inklapbare "Gebruikte bronnen"-kaart voor de gesprek-detailweergave.
// Gedeeld door klant- én admindashboard (beide via klant.css). Default open op
// desktop; op smalle schermen ingeklapt zodat de bronnenlijst de actieknoppen
// niet onder de vouw duwt. Dedupliceert bronnen (multi-turn herhaalt dezelfde
// pagina) en kapt op 10 met een "+N meer"-regel i.p.v. stille truncatie.

import { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import type { ChatSource } from '@/lib/v0/server/rag';

const MAX_VISIBLE = 10;

function dedupe(sources: ChatSource[]): { filename: string; excerpt: string }[] {
  const seen = new Set<string>();
  const out: { filename: string; excerpt: string }[] = [];
  for (const s of sources) {
    const filename = s.filename || 'Onbekend';
    const excerpt = s.parentExcerpt ?? s.contentExcerpt ?? '';
    const key = `${filename}|${excerpt.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ filename, excerpt });
  }
  return out;
}

export function CollapsibleSources({
  sources,
  defaultOpen = true,
}: {
  sources: ChatSource[];
  defaultOpen?: boolean;
}) {
  const items = dedupe(sources);
  const [open, setOpen] = useState(defaultOpen);
  const visible = items.slice(0, MAX_VISIBLE);
  const hiddenCount = items.length - visible.length;

  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: open ? 10 : 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          color: 'inherit',
          font: 'inherit',
          textAlign: 'left',
        }}
      >
        <BookOpen size={15} strokeWidth={1.7} style={{ flexShrink: 0, color: 'var(--klant-muted)' }} />
        <span className="klant-section-title" style={{ margin: 0, flex: 1 }}>
          Gebruikte bronnen{items.length > 0 ? ` (${items.length})` : ''}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          style={{
            flexShrink: 0,
            color: 'var(--klant-muted)',
            transition: 'transform 0.15s ease',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        />
      </button>

      {open &&
        (items.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--klant-fg-muted)', margin: 0 }}>
            Geen bronnen gevonden. Dit gesprek had geen relevant antwoord in je kennisbank.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visible.map((s, i) => (
              <li
                key={i}
                style={{
                  padding: '8px 10px',
                  background: 'var(--klant-surface-muted)',
                  borderRadius: 'var(--klant-r-sm)',
                  fontSize: 12,
                }}
              >
                <div style={{ color: 'var(--klant-fg)', fontWeight: 500 }}>{s.filename}</div>
                {s.excerpt && (
                  <div
                    style={{
                      color: 'var(--klant-fg-muted)',
                      marginTop: 2,
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {s.excerpt}
                  </div>
                )}
              </li>
            ))}
            {hiddenCount > 0 && (
              <li style={{ fontSize: 12, color: 'var(--klant-dim)', padding: '4px 10px' }}>
                +{hiddenCount} meer
              </li>
            )}
          </ul>
        ))}
    </div>
  );
}
