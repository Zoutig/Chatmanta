'use client';

// V0.5 KnowledgeGapView — tab in right-panel. Toont vragen die geen antwoord
// opleverden (kind='fallback' → docs-gap) en off-topic vragen apart
// (category='off_topic' → out-of-scope). Window-toggle (24u / 7d / all)
// triggert nieuwe fetch via getKnowledgeGapSnapshotAction.
//
// Doel: bot-owner (= dev in V0) ziet welke vragen klanten écht stellen die
// de docs niet dekken — actionable input voor content-uitbreiding.
// Pattern: copy van LatencyView component-structuur.

import { useCallback, useEffect, useState } from 'react';
import { getKnowledgeGapSnapshotAction } from '../actions/knowledge-gap';
import type {
  KnowledgeGapItem,
  KnowledgeGapSnapshot,
  KnowledgeGapWindow,
} from '@/lib/v0/server/knowledge-gap-snapshot';

const WINDOWS: { key: KnowledgeGapWindow; label: string }[] = [
  { key: '24h', label: '24u' },
  { key: '7d', label: '7d' },
  { key: 'all', label: 'all' },
];

export function KnowledgeGapView({ organizationId }: { organizationId: string }) {
  const [currentWindow, setCurrentWindow] = useState<KnowledgeGapWindow>('7d');
  const [snapshot, setSnapshot] = useState<KnowledgeGapSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (w: KnowledgeGapWindow) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getKnowledgeGapSnapshotAction(organizationId, w);
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
      <div
        className="latency-view-head"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
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
          Kon knowledge-gap-data niet laden: {error}
        </p>
      ) : null}

      {!error && loading && !snapshot ? (
        <p className="latency-empty">Knowledge-gap-data laden…</p>
      ) : null}

      {!error && snapshot ? <SnapshotBody snapshot={snapshot} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SnapshotBody({ snapshot }: { snapshot: KnowledgeGapSnapshot }) {
  const pct = snapshot.totalQueries === 0 ? 0 : Math.round(snapshot.fallbackRate * 100);
  return (
    <>
      <div className="latency-card" style={{ marginTop: 12 }}>
        <div className="latency-card-head">
          <span className="latency-card-version">Overzicht</span>
          <span className="latency-card-n">n={snapshot.totalQueries}</span>
        </div>
        <div className="latency-card-grid" style={{ gridTemplateColumns: '1fr auto' }}>
          <span className="latency-card-grid-label">Fallback (geen docs-match)</span>
          <span style={{ color: snapshot.fallbackCount > 0 ? 'var(--warn)' : 'inherit' }}>
            {snapshot.fallbackCount} ({pct}%)
          </span>
          <span className="latency-card-grid-label">Off-topic (re-classifier)</span>
          <span>{snapshot.offTopicCount}</span>
        </div>
      </div>

      <GapList
        title={`Top onbeantwoorde vragen (${snapshot.topUnanswered.length})`}
        empty="Geen onbeantwoorde vragen in dit venster — alles werd door de docs gedekt."
        items={snapshot.topUnanswered}
      />
      <GapList
        title={`Off-topic vragen (${snapshot.topOffTopic.length})`}
        empty="Geen off-topic vragen in dit venster."
        items={snapshot.topOffTopic}
      />
    </>
  );
}

function GapList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: KnowledgeGapItem[];
}) {
  if (items.length === 0) {
    return (
      <div>
        <div className="latency-section-label">{title}</div>
        <p className="latency-empty">{empty}</p>
      </div>
    );
  }
  return (
    <div>
      <div className="latency-section-label">{title}</div>
      <div className="latency-slowest">
        {items.map((it, idx) => (
          <div
            key={`${idx}-${it.question.slice(0, 20)}`}
            className="latency-slowest-row"
            title="Klik om de vraag te kopiëren"
            onClick={() => {
              try {
                void navigator.clipboard?.writeText(it.question);
              } catch {
                /* clipboard unavailable — silent */
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <span className="latency-slowest-q">{it.question}</span>
            <span className={`latency-slowest-ms${it.count >= 3 ? ' crit' : ''}`}>
              ×{it.count}
            </span>
            <span className="latency-slowest-meta">
              {it.botVersions.join(', ')} · {formatRelative(it.lastAsked)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
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
