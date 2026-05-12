'use client';

import { useEffect, useRef } from 'react';
import type { ChatResponse, ChatSource } from '@/lib/v0/server/rag';

export function SourcesView({
  response,
  threshold,
  activeCite,
  onCiteClick,
}: {
  response: ChatResponse | null;
  threshold: number;
  activeCite: number | null;
  onCiteClick: (idx: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (activeCite === null) return;
    const el = cardRefs.current[activeCite];
    const container = scrollRef.current;
    if (el && container) {
      const top = el.offsetTop - 8;
      container.scrollTo({ top, behavior: 'smooth' });
    }
  }, [activeCite]);

  if (!response) {
    return <p className="right-empty">Stel een vraag om opgehaalde chunks te zien.</p>;
  }
  if (response.kind === 'smalltalk') {
    return (
      <p className="right-empty">Direct antwoord — geen documenten doorzocht.</p>
    );
  }
  if (response.sources.length === 0) {
    return <p className="right-empty">Geen chunks opgehaald.</p>;
  }

  const hits = response.sources.filter((s) => s.similarity >= threshold).length;

  return (
    <div ref={scrollRef}>
      <div className="settings-label">
        <span>Opgehaald · sim ≥ {threshold.toFixed(2)}</span>
        <span style={{ color: 'var(--accent)' }}>{hits} hits</span>
      </div>
      {response.sources.map((s, i) => {
        const idx = i + 1;
        const isHit = s.similarity >= threshold;
        const isActive = activeCite === idx;
        return (
          <div
            key={i}
            ref={(el) => {
              cardRefs.current[idx] = el;
            }}
            role="button"
            tabIndex={0}
            className={`source-card${isActive ? ' active' : ''}`}
            onClick={() => onCiteClick(idx)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onCiteClick(idx);
              }
            }}
            style={!isHit ? { opacity: 0.55 } : undefined}
          >
            <div className="source-head">
              <div className="source-num">{idx}</div>
              <div className="source-file">{s.filename ?? '(geen filename)'}</div>
              <div className="source-sim">{s.similarity.toFixed(3)}</div>
            </div>
            <SourceBody source={s} />
            <div className="sim-meter">
              <div className="sim-meter-fill" style={{ width: `${s.similarity * 100}%` }} />
              <div
                className="sim-threshold-mark"
                style={{ left: `${threshold * 100}%` }}
                title={`drempel ${threshold.toFixed(2)}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * V0.5 source-body: toont parentExcerpt als beschikbaar (wat de LLM zag), met
 * een kleine "kern-match"-strook eronder met de small-chunk contentExcerpt.
 * Wanneer parentExcerpt afwezig (oude bot, chunk zonder parent), val terug op
 * alleen contentExcerpt — geen "kern-match"-label want er is geen
 * onderscheid.
 */
function SourceBody({ source }: { source: ChatSource }) {
  const hasParent =
    typeof source.parentExcerpt === 'string' && source.parentExcerpt.length > 0;
  if (!hasParent) {
    return <div className="source-excerpt">{source.contentExcerpt}</div>;
  }
  return (
    <div className="source-excerpt source-excerpt-parent">
      <div className="source-excerpt-parent-text">{source.parentExcerpt}</div>
      <div className="source-kern-match">
        <span
          style={{
            display: 'inline-block',
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--fg-faint)',
            marginRight: 8,
          }}
        >
          kern-match
        </span>
        <span style={{ color: 'var(--fg)' }}>{source.contentExcerpt}</span>
      </div>
    </div>
  );
}
