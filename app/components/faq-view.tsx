'use client';

// V0 FAQ-tab — top-vragen ranking + pre-cache management.
//
// Window-toggle (24u/7d/all) en version-toggle (v0.4/v0.5) bepalen de
// snapshot-scope. Vier knoppen:
//   - "Vernieuw ranking" — herberekent top-10 (geen pre-cache)
//   - "Pre-cache top 5"  — judge + write top-5 naar answer_cache
//   - "Vernieuw alles"   — ranking + pre-cache sequentieel
//   - per-item invalidate — verwijder gecachte rij voor één FAQ-entry
//
// Patroon: KnowledgeGapView template + version-toggle ernaast.

import { useCallback, useEffect, useState } from 'react';
import {
  getFaqSnapshotAction,
  refreshFaqRankingAction,
  precacheFaqTopAction,
  invalidateFaqCacheItemAction,
} from '../actions/faq';
import {
  FAQ_BOT_VERSIONS,
  type FaqBotVersion,
  type FaqItem,
  type FaqSnapshot,
  type FaqWindow,
} from '@/lib/v0/faq-types';

const WINDOWS: { key: FaqWindow; label: string }[] = [
  { key: '24h', label: '24u' },
  { key: '7d', label: '7d' },
  { key: 'all', label: 'all' },
];

const PRECACHE_TOP_N = 5;

export function FaqView({ organizationId }: { organizationId: string }) {
  const [currentWindow, setCurrentWindow] = useState<FaqWindow>('7d');
  const [currentVersion, setCurrentVersion] = useState<FaqBotVersion>('v0.5');
  const [snapshot, setSnapshot] = useState<FaqSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | 'refresh' | 'precache' | 'all'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Initial load + on toggle change.
  const load = useCallback(
    async (w: FaqWindow, v: FaqBotVersion) => {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const res = await getFaqSnapshotAction(organizationId, v, w);
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
    void load(currentWindow, currentVersion);
  }, [load, currentWindow, currentVersion]);

  const refreshRanking = useCallback(async () => {
    setBusy('refresh');
    setError(null);
    setNotice(null);
    try {
      const res = await refreshFaqRankingAction(organizationId, currentVersion, currentWindow);
      if (res.ok) {
        setSnapshot(res.snapshot);
        setNotice(`Ranking vernieuwd — ${res.snapshot.items.length} clusters.`);
      } else setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'refresh failed');
    } finally {
      setBusy(null);
    }
  }, [organizationId, currentVersion, currentWindow]);

  const precacheTop = useCallback(
    async (snap: FaqSnapshot): Promise<FaqSnapshot | null> => {
      const res = await precacheFaqTopAction(snap.id, PRECACHE_TOP_N);
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      const costCents = (res.judgeCostUsd * 100).toFixed(2);
      setNotice(
        `Pre-cache klaar — ${res.cached} gecached, ${res.skipped} overgeslagen ($${costCents}ct judge).`,
      );
      return res.snapshot;
    },
    [],
  );

  const doPrecache = useCallback(async () => {
    if (!snapshot) return;
    setBusy('precache');
    setError(null);
    setNotice(null);
    try {
      const updated = await precacheTop(snapshot);
      if (updated) setSnapshot(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'precache failed');
    } finally {
      setBusy(null);
    }
  }, [snapshot, precacheTop]);

  const doRefreshAll = useCallback(async () => {
    setBusy('all');
    setError(null);
    setNotice(null);
    try {
      const refreshRes = await refreshFaqRankingAction(organizationId, currentVersion, currentWindow);
      if (!refreshRes.ok) {
        setError(refreshRes.error);
        return;
      }
      const updated = await precacheTop(refreshRes.snapshot);
      setSnapshot(updated ?? refreshRes.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'refresh-all failed');
    } finally {
      setBusy(null);
    }
  }, [organizationId, currentVersion, currentWindow, precacheTop]);

  const doInvalidate = useCallback(
    async (rank: number) => {
      if (!snapshot) return;
      setError(null);
      setNotice(null);
      try {
        const res = await invalidateFaqCacheItemAction(snapshot.id, rank);
        if (res.ok) {
          setSnapshot(res.snapshot);
          if (res.removed) setNotice(`Cache-rij verwijderd voor rang #${rank}.`);
        } else setError(res.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'invalidate failed');
      }
    },
    [snapshot],
  );

  const anyBusy = busy !== null || loading;

  return (
    <div className="latency-view">
      <div
        className="latency-view-head"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="latency-window-toggle" role="tablist" aria-label="Tijdvenster">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                role="tab"
                aria-selected={currentWindow === w.key}
                className={currentWindow === w.key ? 'active' : ''}
                onClick={() => setCurrentWindow(w.key)}
                disabled={anyBusy}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="latency-window-toggle" role="tablist" aria-label="Bot-versie">
            {FAQ_BOT_VERSIONS.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={currentVersion === v}
                className={currentVersion === v ? 'active' : ''}
                onClick={() => setCurrentVersion(v)}
                disabled={anyBusy}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void refreshRanking()}
            disabled={anyBusy}
            style={{ padding: '4px 8px', fontSize: 11 }}
            title="Recompute top-10 ranking (geen cache-writes)"
          >
            {busy === 'refresh' ? '…' : 'Vernieuw ranking'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void doPrecache()}
            disabled={anyBusy || !snapshot || snapshot.items.length === 0}
            style={{ padding: '4px 8px', fontSize: 11 }}
            title={`Judge + write top-${PRECACHE_TOP_N} naar answer_cache`}
          >
            {busy === 'precache' ? '…' : `Pre-cache top ${PRECACHE_TOP_N}`}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void doRefreshAll()}
            disabled={anyBusy}
            style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600 }}
            title="Refresh ranking + pre-cache top-5 in één klik"
          >
            {busy === 'all' ? '…' : 'Vernieuw alles'}
          </button>
        </div>
      </div>

      {error ? (
        <p className="latency-empty" style={{ color: 'var(--err)' }}>
          {error}
        </p>
      ) : null}
      {notice && !error ? (
        <p className="latency-empty" style={{ color: 'var(--text-muted)' }}>
          {notice}
        </p>
      ) : null}

      {!error && loading && !snapshot ? (
        <p className="latency-empty">FAQ-data laden…</p>
      ) : null}

      {!error && !loading && snapshot === null ? (
        <p className="latency-empty">
          Nog geen FAQ-snapshot voor {currentVersion} / {currentWindow}. Klik
          op &quot;Vernieuw ranking&quot; om de eerste te bouwen.
        </p>
      ) : null}

      {!error && snapshot ? (
        <SnapshotBody snapshot={snapshot} onInvalidate={doInvalidate} disabled={anyBusy} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SnapshotBody({
  snapshot,
  onInvalidate,
  disabled,
}: {
  snapshot: FaqSnapshot;
  onInvalidate: (rank: number) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="latency-card" style={{ marginTop: 12 }}>
        <div className="latency-card-head">
          <span className="latency-card-version">Overzicht</span>
          <span className="latency-card-n">n={snapshot.totalQueries}</span>
        </div>
        <div className="latency-card-grid" style={{ gridTemplateColumns: '1fr auto' }}>
          <span className="latency-card-grid-label">Unieke vragen in venster</span>
          <span>{snapshot.totalUnique}</span>
          <span className="latency-card-grid-label">Clusters (top-10)</span>
          <span>{snapshot.items.length}</span>
          <span className="latency-card-grid-label">Snapshot van</span>
          <span>{formatRelative(snapshot.generatedAt)}</span>
          <span className="latency-card-grid-label">Embed + judge cost</span>
          <span>
            ${(snapshot.embedCostUsd + snapshot.judgeCostUsd).toFixed(4)}
          </span>
        </div>
      </div>

      {snapshot.items.length === 0 ? (
        <p className="latency-empty">
          Geen vragen in dit venster — open eerst een paar chats op deze
          org/versie, of probeer een ruimer tijdvenster.
        </p>
      ) : snapshot.items.length < 10 ? (
        <p className="latency-empty" style={{ fontSize: 11 }}>
          Slechts {snapshot.items.length} unieke clusters — probeer een ruimer
          tijdvenster voor een voller beeld.
        </p>
      ) : null}

      {snapshot.items.length > 0 ? (
        <div>
          <div className="latency-section-label">Top FAQ</div>
          <div className="latency-slowest">
            {snapshot.items.map((it) => (
              <FaqRow
                key={`${it.rank}-${it.question.slice(0, 16)}`}
                item={it}
                onInvalidate={onInvalidate}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function FaqRow({
  item,
  onInvalidate,
  disabled,
}: {
  item: FaqItem;
  onInvalidate: (rank: number) => void;
  disabled: boolean;
}) {
  const cached = item.cachedAnswerId !== null;
  const reasonLabel =
    item.judgeReason === 'judge-pick'
      ? 'judge'
      : item.judgeReason === 'auto-pick-fallback'
        ? 'auto-pick'
        : item.judgeReason === 'reuse-existing-cache'
          ? 'reused'
          : null;

  return (
    <div className="latency-slowest-row" style={{ alignItems: 'flex-start' }}>
      <span
        className="latency-slowest-q"
        title={
          item.memberQuestions.length > 1
            ? `Cluster van ${item.memberQuestions.length} varianten:\n• ${item.memberQuestions.slice(0, 5).join('\n• ')}`
            : item.question
        }
      >
        #{item.rank}. {item.question}
      </span>
      <span className={`latency-slowest-ms${item.count >= 3 ? ' crit' : ''}`}>
        ×{item.count}
      </span>
      <span className="latency-slowest-meta" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {cached ? (
          <span
            title={`Gecached in answer_cache (${reasonLabel ?? 'gecached'})`}
            style={{
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 8,
              background: 'var(--surface-3)',
              color: 'var(--text)',
            }}
          >
            ✓ cache{reasonLabel ? ` · ${reasonLabel}` : ''}
          </span>
        ) : null}
        <span>{formatRelative(item.lastAsked)}</span>
        {cached ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onInvalidate(item.rank)}
            disabled={disabled}
            style={{ padding: '2px 6px', fontSize: 10 }}
            title="Verwijder uit answer_cache"
          >
            ×
          </button>
        ) : null}
      </span>
    </div>
  );
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
