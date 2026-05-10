'use client';

// LatencyBar — inline waterfall onder elke assistant-message met
// kind === 'answer'. Default ingeklapt: alleen badge "⏱ 3.4s ▾". Klik =
// expand naar horizontale stacked bar + legenda. Pure presentatie; data
// komt via prop uit ChatResponse.extras.phaseTimingsMs.
//
// Rendert null als phaseTimings undefined of total_ms onbruikbaar (0/NaN).

import { useState } from 'react';
import type { PhaseTimings } from '@/lib/v0/server/rag';

type PhaseKey = keyof PhaseTimings;

// Kleuren — consistent met het mockup en de Latency-tab.
const PHASE_COLOR: Record<string, string> = {
  embedding_ms: '#7aa2f7',
  retrieval_ms: '#9ece6a',
  rerank_ms: '#e0af68',
  generation_ms: '#f06e8c',
  preprocess_ms: '#bb9af7',
  cache_lookup_ms: '#7dcfff',
  decompose_ms: '#bb9af7',
  hyde_ms: '#bb9af7',
  expand_ms: '#bb9af7',
  verify_ms: '#a9b1d6',
  followups_ms: '#a9b1d6',
  cascade_ms: '#a9b1d6',
};

const PHASE_LABEL: Record<string, string> = {
  embedding_ms: 'embed',
  retrieval_ms: 'retrieval',
  rerank_ms: 'rerank',
  generation_ms: 'generation',
  preprocess_ms: 'preprocess',
  cache_lookup_ms: 'cache',
  decompose_ms: 'decompose',
  hyde_ms: 'hyde',
  expand_ms: 'expand',
  verify_ms: 'verify',
  followups_ms: 'followups',
  cascade_ms: 'cascade',
};

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function LatencyBar({ phaseTimings }: { phaseTimings: PhaseTimings | undefined }) {
  const [open, setOpen] = useState(false);

  if (!phaseTimings) return null;
  const total = phaseTimings.total_ms;
  if (!Number.isFinite(total) || total <= 0) return null;

  // Verzamel non-zero non-total fases in de volgorde waarin ze in de pipeline
  // ongeveer voorkomen. Zo blijft de stacked-bar leesbaar.
  const ORDER: PhaseKey[] = [
    'preprocess_ms',
    'cache_lookup_ms',
    'decompose_ms',
    'hyde_ms',
    'expand_ms',
    'embedding_ms',
    'retrieval_ms',
    'rerank_ms',
    'generation_ms',
    'verify_ms',
    'followups_ms',
    'cascade_ms',
  ];
  const phases = ORDER.flatMap((k) => {
    const v = phaseTimings[k];
    if (typeof v !== 'number' || v <= 0) return [];
    return [{ key: k as string, ms: v }];
  });

  if (phases.length === 0) {
    // Toon alleen totaal als badge — geen breakdown.
    return (
      <div className="latency-bar collapsed">
        <span className="latency-badge">⏱ {formatMs(total)}</span>
      </div>
    );
  }

  return (
    <div className="latency-bar">
      <button
        type="button"
        className="latency-badge latency-badge-button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        ⏱ {formatMs(total)} {open ? '▾' : '▸'}
      </button>
      {open ? (
        <div className="latency-bar-detail">
          <div className="latency-stacked" role="img" aria-label="Per-fase latency breakdown">
            {phases.map((p) => {
              const pct = (p.ms / total) * 100;
              return (
                <span
                  key={p.key}
                  className="latency-stacked-seg"
                  style={{ width: `${pct}%`, background: PHASE_COLOR[p.key] ?? '#a9b1d6' }}
                  title={`${PHASE_LABEL[p.key] ?? p.key}: ${formatMs(p.ms)} (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>
          <div className="latency-legend">
            {phases.map((p) => (
              <span key={p.key} className="latency-legend-item">
                <span
                  className="latency-legend-swatch"
                  style={{ background: PHASE_COLOR[p.key] ?? '#a9b1d6' }}
                  aria-hidden="true"
                />
                <span className="latency-legend-label">
                  {PHASE_LABEL[p.key] ?? p.key}
                </span>
                <span className="latency-legend-ms">{formatMs(p.ms)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
