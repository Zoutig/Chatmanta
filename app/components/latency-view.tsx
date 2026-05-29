'use client';

// LatencyView — tab in right-panel. Lazy-load via getLatencySnapshotAction.
// Window-toggle (24u / 7d / all) triggert nieuwe fetch. Toont aggregate-card
// per bot-versie + lijst slowest queries (top 10) zonder klik-door.

import { useCallback, useEffect, useState } from 'react';
import { getLatencySnapshotAction } from '../actions/latency';
import type {
  LatencyAggregate,
  LatencySnapshot,
  LatencyWindow,
  SlowQueryRow,
} from '@/lib/v0/server/latency-snapshot';

const WINDOWS: { key: LatencyWindow; label: string }[] = [
  { key: '24h', label: '24u' },
  { key: '7d', label: '7d' },
  { key: 'all', label: 'all' },
];

export function LatencyView({ organizationId }: { organizationId: string }) {
  const [currentWindow, setCurrentWindow] = useState<LatencyWindow>('7d');
  const [snapshot, setSnapshot] = useState<LatencySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (w: LatencyWindow) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getLatencySnapshotAction(organizationId, w);
        if (res.ok) setSnapshot(res.snapshot);
        else setError(res.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'fetch failed');
      } finally {
        setLoading(false);
      }
    },
    [organizationId],
  );

  useEffect(() => {
    void load(currentWindow);
  }, [load, currentWindow]);

  return (
    <div className="latency-view">
      <div className="latency-view-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="latency-window-toggle" role="tablist">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              role="tab"
              aria-selected={currentWindow === w.key}
              className={currentWindow === w.key ? 'active' : ''}
              onClick={() => setCurrentWindow(w.key)}
              disabled={loading}
            >
              {w.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void load(currentWindow)}
          disabled={loading}
          style={{ padding: '4px 8px', fontSize: 11 }}
        >
          {loading ? '…' : 'Vernieuwen'}
        </button>
      </div>

      {error ? (
        <p className="latency-empty" style={{ color: 'var(--err)' }}>
          Kon latency-data niet laden: {error}
        </p>
      ) : null}

      {!error && loading && !snapshot ? (
        <p className="latency-empty">Latency-data laden…</p>
      ) : null}

      {!error && snapshot ? (
        <>
          <Aggregates aggregates={snapshot.aggregates} />
          <Slowest slowest={snapshot.slowest} />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Aggregates({ aggregates }: { aggregates: LatencyAggregate[] }) {
  if (aggregates.length === 0) {
    return <p className="latency-empty">Nog geen latency-data in dit venster.</p>;
  }
  // Sort: nieuwste-versie eerst (string desc — werkt voor "v0.4" > "v0.3").
  const sorted = [...aggregates].sort((a, b) =>
    a.botVersion < b.botVersion ? 1 : a.botVersion > b.botVersion ? -1 : 0,
  );
  return (
    <div>
      <div className="latency-section-label">Per bot-versie · p50 / p95</div>
      {sorted.map((a) => (
        <div key={a.botVersion} className="latency-card">
          <div className="latency-card-head">
            <span className="latency-card-version">{a.botVersion}</span>
            <span className="latency-card-n">n={a.n}</span>
          </div>
          <div className="latency-card-grid">
            <span className="latency-card-grid-header">fase</span>
            <span className="latency-card-grid-header">p50</span>
            <span className="latency-card-grid-header">p95</span>

            <span className="latency-card-grid-label">total</span>
            <span>{fmt(a.p50TotalMs)}</span>
            <span>{fmt(a.p95TotalMs)}</span>

            <span
              className="latency-card-grid-label"
              title="time-to-first-token — tijd tot het eerste antwoord-woord. De gevoelde snelheid. Alleen streamende antwoorden (cache-hits tellen niet mee)."
            >
              ttft
            </span>
            <span style={{ fontWeight: 600 }}>{fmt(a.p50FirstTokenMs)}</span>
            <span style={{ fontWeight: 600 }}>{fmt(a.p95FirstTokenMs)}</span>

            <span className="latency-card-grid-label">embed</span>
            <span>{fmt(a.p50EmbeddingMs)}</span>
            <span>{fmt(a.p95EmbeddingMs)}</span>

            <span className="latency-card-grid-label">retrieval</span>
            <span>{fmt(a.p50RetrievalMs)}</span>
            <span>{fmt(a.p95RetrievalMs)}</span>

            <span className="latency-card-grid-label">rerank</span>
            <span>{fmt(a.p50RerankMs)}</span>
            <span>{fmt(a.p95RerankMs)}</span>

            <span className="latency-card-grid-label">gen</span>
            <span style={{ color: 'var(--err)' }}>{fmt(a.p50GenerationMs)}</span>
            <span style={{ color: 'var(--err)' }}>{fmt(a.p95GenerationMs)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Slowest({ slowest }: { slowest: SlowQueryRow[] }) {
  if (slowest.length === 0) return null;
  return (
    <div>
      <div className="latency-section-label">Slowest queries (top {slowest.length})</div>
      <div className="latency-slowest">
        {slowest.map((r) => (
          <div key={r.id} className="latency-slowest-row">
            <span className="latency-slowest-q" title={r.question}>
              {r.question}
            </span>
            <span className={`latency-slowest-ms${r.totalMs >= 5000 ? ' crit' : ''}`}>
              {fmt(r.totalMs)}
            </span>
            <span className="latency-slowest-meta">
              {r.botVersion} · {formatRelative(r.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function fmt(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}`;
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'nu';
    if (diff < 3600) return `${Math.round(diff / 60)}m`;
    if (diff < 86400) return `${Math.round(diff / 3600)}u`;
    if (diff < 7 * 86400) return `${Math.round(diff / 86400)}d`;
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
  } catch {
    return iso;
  }
}
