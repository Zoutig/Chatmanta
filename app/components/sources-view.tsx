'use client';

import { useEffect, useRef } from 'react';
import type { ChatResponse } from '@/lib/v0/server/rag';

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
            <div className="source-excerpt">{s.contentExcerpt}</div>
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
