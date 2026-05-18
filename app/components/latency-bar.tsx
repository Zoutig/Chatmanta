'use client';

// LatencyBar — inline waterfall onder elke assistant-message met
// kind === 'answer'. Default ingeklapt: alleen badge "⏱ 3.4s ▾". Klik =
// expand naar horizontale stacked bar + legenda. Pure presentatie; data
// komt via prop uit ChatResponse.extras.phaseTimingsMs.
//
// Rendert null als phaseTimings undefined of total_ms onbruikbaar (0/NaN).

import { useState } from 'react';
import type { PhaseTimings } from '@/lib/v0/server/rag';

// Alle PhaseTimings keys behalve 'total_ms' (dat is het geheel, niet een fase
// op zich) en 'first_token_ms' (V0.7 eval-only marker — geen duration). Door
// dit type te gebruiken voor de lookup tables krijgen we compile-time
// exhaustiveness: een nieuwe PhaseTimings-key zonder color/label triggert een
// type-error.
type PhaseDisplayKey = Exclude<keyof PhaseTimings, 'total_ms' | 'first_token_ms'>;

// Kleuren — Tokyo Night uitgebreid, mode-aware via CSS-vars in globals.css.
// 12 unieke tints; dark = default, light = override op html:not(.dark).
const PHASE_COLOR: Record<PhaseDisplayKey, string> = {
  embedding_ms: 'var(--phase-embedding)',
  retrieval_ms: 'var(--phase-retrieval)',
  rerank_ms: 'var(--phase-rerank)',
  generation_ms: 'var(--phase-generation)',
  preprocess_ms: 'var(--phase-preprocess)',
  cache_lookup_ms: 'var(--phase-cache-lookup)',
  decompose_ms: 'var(--phase-decompose)',
  hyde_ms: 'var(--phase-hyde)',
  expand_ms: 'var(--phase-expand)',
  verify_ms: 'var(--phase-verify)',
  followups_ms: 'var(--phase-followups)',
  cascade_ms: 'var(--phase-cascade)',
};

const PHASE_LABEL: Record<PhaseDisplayKey, string> = {
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

// Pipeline-volgorde — bepaalt links-naar-rechts in de stacked bar. Hoisted
// naar module scope om per-render allocatie te vermijden.
const ORDER: readonly PhaseDisplayKey[] = [
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

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function LatencyBar({ phaseTimings }: { phaseTimings: PhaseTimings | undefined }) {
  const [open, setOpen] = useState(false);

  if (!phaseTimings) return null;
  const total = phaseTimings.total_ms;
  if (!Number.isFinite(total) || total <= 0) return null;

  // Verzamel non-zero fases in pipeline-volgorde (zie ORDER hierboven).
  const phases = ORDER.flatMap((k) => {
    const v = phaseTimings[k];
    if (typeof v !== 'number' || v <= 0) return [];
    return [{ key: k, ms: v }];
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
                  style={{ width: `${pct}%`, background: PHASE_COLOR[p.key] ?? 'var(--phase-cascade)' }}
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
                  style={{ background: PHASE_COLOR[p.key] ?? 'var(--phase-cascade)' }}
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
