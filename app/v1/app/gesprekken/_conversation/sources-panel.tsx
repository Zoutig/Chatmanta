'use client';

// Bronnen onder een bot-antwoord (thread_messages.sources, migr 0024). Standaard
// ingeklapt: per bericht een eigen paneel, dicht houdt het gesprek rustig.
// Oude berichten zonder bronnen tonen niets.

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ThreadMessageSource } from '@/lib/v1/conversations/sources';

/** URL leesbaar korten tot host + pad. Faalt de parse, toon hem zoals hij is. */
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
  const listId = useId();
  if (sources.length === 0) return null;

  return (
    <div className="v1-gs-src-wrap">
      <button
        type="button"
        className="v1-gs-textbtn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
      >
        {sources.length === 1 ? '1 bron' : `${sources.length} bronnen`}
        <ChevronDown className="v1-gs-chev" size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {open ? (
        <ul id={listId} className="v1-gs-src-list">
          {sources.map((s, i) => (
            <li key={i} className="v1-gs-src">
              <span className="v1-gs-src-head">
                <span className="v1-gs-src-title">{s.title}</span>
                <span className="v1-gs-src-score" title="Overeenkomst met de vraag">
                  {Math.round(s.similarity * 100)}%
                </span>
              </span>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {prettyUrl(s.url)}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
