'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatResponse, ChatSource } from '@/lib/v0/server/rag';

type CitedPositions = Map<number, number>;

/**
 * Vindt alle `[N]` citaten in een antwoordtekst en geeft per N de eerste
 * positie in de tekst terug. Door positie te bewaren kunnen we de
 * "Geciteerd in antwoord"-groep sorteren op leesvolgorde i.p.v. similarity.
 */
function extractCitedIndices(text: string): CitedPositions {
  const out: CitedPositions = new Map();
  const re = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (!out.has(n)) out.set(n, m.index);
  }
  return out;
}

function SimDots({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value * 5)));
  return (
    <span className="source-dots" title={value.toFixed(3)} aria-label={`similarity ${value.toFixed(3)}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < filled ? 'source-dot on' : 'source-dot'} />
      ))}
    </span>
  );
}

function SourceCard({
  source,
  idx,
  isActive,
  isExpanded,
  onActivate,
  onToggleExpand,
  cardRef,
}: {
  source: ChatSource;
  idx: number;
  isActive: boolean;
  isExpanded: boolean;
  onActivate: () => void;
  onToggleExpand: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const hasParent = typeof source.parentExcerpt === 'string' && source.parentExcerpt.length > 0;
  const hasSection = source.parentIndex != null;

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      className={`source-card${isActive ? ' active' : ''}${isExpanded ? ' expanded' : ''}`}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <div className="source-head">
        <div className="source-num">{idx}</div>
        <div className="source-file">{source.filename ?? '(geen filename)'}</div>
        <SimDots value={source.similarity} />
      </div>
      <div className="source-excerpt">{source.contentExcerpt}</div>
      <div className="source-meta">
        {hasSection ? (
          <span
            className="source-section-badge"
            title="Parent-chunk index in dit document"
          >
            Sectie {(source.parentIndex as number) + 1}
          </span>
        ) : (
          <span />
        )}
        {hasParent ? (
          <button
            type="button"
            className="source-expand"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Parent-context inklappen' : 'Parent-context uitklappen'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
          >
            {isExpanded ? '▴' : '▾'}
          </button>
        ) : null}
      </div>
      {isExpanded && hasParent ? (
        <div className="source-parent">
          <div className="source-parent-label">Parent context</div>
          <div className="source-parent-text">{source.parentExcerpt}</div>
        </div>
      ) : null}
    </div>
  );
}
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

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // null = auto (default open als alles sub-threshold is); true/false = expliciete user-keuze
  const [subOpenOverride, setSubOpenOverride] = useState<boolean | null>(null);
  // Tracks de laatste `activeCite` waarde die we hebben gezien zodat we 'm één keer
  // auto-expanden zonder setState-in-effect (React 19 lint-regel).
  const [lastSeenActive, setLastSeenActive] = useState<number | null>(null);

  const answerText =
    response && (response.kind === 'answer' || response.kind === 'fallback')
      ? response.answer
      : '';

  const citedPositions = useMemo(() => extractCitedIndices(answerText), [answerText]);

  const groups = useMemo(() => {
    if (!response || response.kind === 'smalltalk') {
      return {
        cited: [] as { source: ChatSource; idx: number; pos: number }[],
        retrieved: [] as { source: ChatSource; idx: number }[],
        sub: [] as { source: ChatSource; idx: number }[],
      };
    }
    const cited: { source: ChatSource; idx: number; pos: number }[] = [];
    const retrieved: { source: ChatSource; idx: number }[] = [];
    const sub: { source: ChatSource; idx: number }[] = [];

    response.sources.forEach((s, i) => {
      const idx = i + 1;
      const pos = citedPositions.get(idx);
      if (pos !== undefined) {
        cited.push({ source: s, idx, pos });
      } else if (s.similarity >= threshold) {
        retrieved.push({ source: s, idx });
      } else {
        sub.push({ source: s, idx });
      }
    });

    cited.sort((a, b) => a.pos - b.pos);
    // retrieved + sub komen al op similarity-desc binnen, geen extra sort

    return { cited, retrieved, sub };
  }, [response, threshold, citedPositions]);

  // Auto-expand een card wanneer activeCite verandert. Render-time prop-sync ipv
  // useEffect — toegestaan door React 19 (zie React docs "Adjusting state based on
  // changed props"). Voorkomt set-state-in-effect lint error.
  if (activeCite !== lastSeenActive) {
    setLastSeenActive(activeCite);
    if (activeCite !== null && !expanded.has(activeCite)) {
      const next = new Set(expanded);
      next.add(activeCite);
      setExpanded(next);
    }
  }

  // Auto-scroll naar actieve card (alleen DOM-mutatie, geen setState — useEffect OK).
  useEffect(() => {
    if (activeCite === null) return;
    const el = cardRefs.current[activeCite];
    const container = scrollRef.current;
    if (el && container) {
      const top = el.offsetTop - 8;
      container.scrollTo({ top, behavior: 'smooth' });
    }
  }, [activeCite]);

  // Default-staat voor "Onder drempel"-groep: open als alles sub-threshold is
  // (anders ziet user niks). Derived ipv state + effect.
  const allSubThreshold =
    groups.cited.length === 0 && groups.retrieved.length === 0 && groups.sub.length > 0;
  const subOpen = subOpenOverride ?? allSubThreshold;

  if (!response) {
    return <p className="right-empty">Stel een vraag om opgehaalde chunks te zien.</p>;
  }
  if (response.kind === 'smalltalk') {
    return <p className="right-empty">Direct antwoord — geen documenten doorzocht.</p>;
  }
  if (response.sources.length === 0) {
    return <p className="right-empty">Geen chunks opgehaald.</p>;
  }

  const totalRetrieved = response.sources.length;
  const hitsAboveThreshold = response.sources.filter((s) => s.similarity >= threshold).length;

  const handleActivate = (idx: number) => {
    onCiteClick(idx);
    setExpanded((prev) => {
      if (prev.has(idx)) return prev;
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  };

  const handleToggle = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const renderCard = ({ source, idx }: { source: ChatSource; idx: number }) => (
    <SourceCard
      key={idx}
      source={source}
      idx={idx}
      isActive={activeCite === idx}
      isExpanded={expanded.has(idx)}
      onActivate={() => handleActivate(idx)}
      onToggleExpand={() => handleToggle(idx)}
      cardRef={(el) => {
        cardRefs.current[idx] = el;
      }}
    />
  );

  return (
    <div ref={scrollRef}>
      <div className="sources-header">
        <span>Opgehaald · sim ≥ {threshold.toFixed(2)}</span>
        <span className="sources-header-hits" style={{ color: 'var(--accent)' }}>
          {hitsAboveThreshold}/{totalRetrieved} hits
        </span>
      </div>
      <div className="sources-header-sub">gesorteerd op similarity</div>

      {groups.cited.length > 0 ? (
        <section className="source-group">
          <header className="source-group-header">
            <span className="source-group-title">Geciteerd in antwoord</span>
            <span className="source-group-count">{groups.cited.length}</span>
          </header>
          {groups.cited.map(renderCard)}
        </section>
      ) : null}

      {groups.retrieved.length > 0 ? (
        <section className="source-group">
          <header className="source-group-header">
            <span className="source-group-title">
              {groups.cited.length > 0 ? 'Opgehaald, niet geciteerd' : 'Opgehaald'}
            </span>
            <span className="source-group-count">{groups.retrieved.length}</span>
          </header>
          {groups.retrieved.map(renderCard)}
        </section>
      ) : null}

      {groups.sub.length > 0 ? (
        <section className="source-group">
          <button
            type="button"
            className="source-group-header source-group-toggle"
            aria-expanded={subOpen}
            onClick={() => setSubOpenOverride(!subOpen)}
          >
            <span className="source-group-title">
              {subOpen ? '▾' : '▸'} Onder drempel
            </span>
            <span className="source-group-count">{groups.sub.length}</span>
          </button>
          {subOpen ? groups.sub.map(renderCard) : null}
        </section>
      ) : null}
    </div>
  );
}
