'use client';

// Evals tab — read-only snapshot uit eval_runs. Lazy-load via server action;
// geen live updates. Gebruiker draait `npm run eval:run-all` in de terminal en
// refresht hier (tab uit/in of "Vernieuwen" knop).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEvalSnapshotAction } from '../actions/evals';
import type {
  EvalSnapshot,
  EvalSnapshotQuestion,
  EvalSnapshotRun,
} from '@/lib/v0/server/evals-snapshot';
import {
  STAGE_KEYS,
  computeStagePercentiles,
  slowestStageByQuestionType,
  type RunWithStageTimings,
  type StageKey,
} from '@/lib/v0/server/eval-latency-stats';

export function EvalsView() {
  const [snapshot, setSnapshot] = useState<EvalSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getEvalSnapshotAction();
      if (res.ok) {
        setSnapshot(res.snapshot);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback((slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  if (loading && !snapshot) {
    return <p className="right-empty">Eval-data laden…</p>;
  }
  if (error) {
    return (
      <p className="right-empty" style={{ color: 'var(--err)' }}>
        Kon evals niet laden: {error}
      </p>
    );
  }
  if (!snapshot) return null;

  if (snapshot.questions.length === 0 || snapshot.runs.length === 0) {
    return (
      <div>
        <p className="right-empty">
          Nog geen eval-runs.
          <br />
          Run in de terminal:
          <br />
          <code style={{ fontFamily: 'var(--font-mono)' }}>npm run eval:run-all</code>
        </p>
        <button
          type="button"
          className="btn-secondary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={() => void load()}
        >
          Vernieuwen
        </button>
      </div>
    );
  }

  return (
    <div className="evals-view">
      <SummaryStrip snapshot={snapshot} onRefresh={() => void load()} loading={loading} />

      <StageLatencyPanel snapshot={snapshot} />

      <div className="evals-meta">
        <span>{snapshot.questions.length} vragen</span>
        <span>·</span>
        <span>{snapshot.versions.length} versies</span>
        <span>·</span>
        <span title="totaal in eval_runs over alle history">
          {snapshot.meta.totalRunsAllHistory} runs in DB
        </span>
        {snapshot.meta.latestRunAt ? (
          <>
            <span>·</span>
            <span title={snapshot.meta.latestRunAt}>
              laatste: {formatRelative(snapshot.meta.latestRunAt)}
            </span>
          </>
        ) : null}
      </div>

      <div className="evals-list">
        {snapshot.questions.map((q) => {
          const runs = snapshot.runs.filter((r) => r.questionId === q.id);
          if (runs.length === 0) return null;
          const isOpen = expanded.has(q.slug);
          return (
            <QuestionCard
              key={q.id}
              question={q}
              versions={snapshot.versions}
              runs={runs}
              open={isOpen}
              onToggle={() => toggle(q.slug)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SummaryStrip({
  snapshot,
  onRefresh,
  loading,
}: {
  snapshot: EvalSnapshot;
  onRefresh: () => void;
  loading: boolean;
}) {
  const stats = useMemo(() => {
    const out: {
      version: string;
      c: number | null;
      p: number | null;
      g: number | null;
      overall: number | null;
      botCost: number;
      judgeCost: number;
      latencyMs: number | null;
    }[] = [];
    for (const v of snapshot.versions) {
      const vRows = snapshot.runs.filter((r) => r.botVersion === v);
      const c = avgPick(vRows, (r) => r.scoreCorrectness);
      const p = avgPick(vRows, (r) => r.scoreCompleteness);
      const g = avgPick(vRows, (r) => r.scoreGrounding);
      const all = [c, p, g].filter((n): n is number => n !== null);
      const overall = all.length === 0 ? null : all.reduce((a, b) => a + b, 0) / all.length;
      const botCost = vRows.reduce((s, r) => s + r.botCostUsd, 0);
      const judgeCost = vRows.reduce((s, r) => s + r.judgeCostUsd, 0);
      const latencyMs = avgPick(vRows, (r) => r.botLatencyMs);
      out.push({ version: v, c, p, g, overall, botCost, judgeCost, latencyMs });
    }
    return out;
  }, [snapshot]);

  return (
    <div className="evals-summary">
      <div className="evals-summary-head">
        <strong>Snapshot — meest recente run per (vraag × versie)</strong>
        <button
          type="button"
          className="btn-secondary"
          onClick={onRefresh}
          disabled={loading}
          style={{ padding: '4px 8px', fontSize: 11 }}
        >
          {loading ? '…' : 'Vernieuwen'}
        </button>
      </div>
      <div className="evals-summary-rows">
        {stats.map((s) => (
          <div key={s.version} className="evals-summary-row">
            <div className="evals-summary-row-top">
              <span className="evals-summary-version">{s.version}</span>
              <span className="evals-summary-overall">
                {s.overall === null ? '—' : s.overall.toFixed(2)}
                <span className="evals-summary-overall-suffix">/5</span>
              </span>
              <span className="evals-summary-meta" title={`cost (bot+judge) · avg bot-latency`}>
                ${(s.botCost + s.judgeCost).toFixed(4)}
                {' · '}
                {s.latencyMs === null ? '—' : `${Math.round(s.latencyMs)}ms`}
              </span>
            </div>
            <div className="evals-summary-row-bars">
              <ScoreBar label="C" value={s.c} />
              <ScoreBar label="P" value={s.p} />
              <ScoreBar label="G" value={s.g} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const pct = value === null ? 0 : (value / 5) * 100;
  const color =
    value === null
      ? 'var(--fg-faint)'
      : value >= 4
        ? 'var(--ok)'
        : value >= 2.5
          ? 'var(--warn)'
          : 'var(--err)';
  return (
    <span className="evals-score-bar" title={`${label} = ${value === null ? '—' : value.toFixed(2)}/5`}>
      <span className="evals-score-bar-label">{label}</span>
      <span className="evals-score-bar-track">
        <span
          className="evals-score-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </span>
      <span className="evals-score-bar-value">
        {value === null ? '—' : value.toFixed(1)}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
function QuestionCard({
  question,
  versions,
  runs,
  open,
  onToggle,
}: {
  question: EvalSnapshotQuestion;
  versions: string[];
  runs: EvalSnapshotRun[];
  open: boolean;
  onToggle: () => void;
}) {
  // Compact line-scores per versie (4-5 char chips).
  const headerScores = versions.map((v) => {
    const r = runs.find((x) => x.botVersion === v);
    return { version: v, run: r ?? null };
  });

  return (
    <div className={`evals-card${open ? ' open' : ''}`}>
      <button type="button" className="evals-card-head" onClick={onToggle} aria-expanded={open}>
        <span className="evals-card-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="evals-card-question">{question.question}</span>
        <span className={`evals-card-difficulty d-${question.difficulty}`}>
          {question.difficulty}
        </span>
        <span className="evals-card-scores">
          {headerScores.map(({ version, run }) => (
            <span key={version} className="evals-card-score-chip">
              <span className="evals-card-score-version">{version}</span>
              {run === null ? (
                <span className="evals-card-score-cell">—</span>
              ) : (
                <CompactScore run={run} />
              )}
            </span>
          ))}
        </span>
      </button>

      {open ? (
        <div className="evals-card-body">
          <div className="evals-card-gold">
            <strong>Gold answer:</strong> {question.goldAnswer}
            {question.goldFacts.length > 0 ? (
              <ul className="evals-card-gold-facts">
                {question.goldFacts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            ) : null}
            {question.tags.length > 0 ? (
              <div className="evals-card-tags">
                {question.tags.map((t) => (
                  <span key={t} className="evals-tag">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="evals-card-versions">
            {versions.map((v) => {
              const r = runs.find((x) => x.botVersion === v);
              if (!r) {
                return (
                  <div key={v} className="evals-card-version">
                    <div className="evals-card-version-head">
                      <span className="evals-card-version-name">{v}</span>
                      <span className="evals-card-version-empty">geen run</span>
                    </div>
                  </div>
                );
              }
              return <VersionDetail key={v} run={r} />;
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CompactScore({ run }: { run: EvalSnapshotRun }) {
  if (run.judgeParseError && run.scoreCorrectness === null) {
    return <span className="evals-card-score-cell warn">⚠</span>;
  }
  return (
    <span className="evals-card-score-cell">
      <ScoreDot value={run.scoreCorrectness} />
      <ScoreDot value={run.scoreCompleteness} />
      <ScoreDot value={run.scoreGrounding} />
    </span>
  );
}

function ScoreDot({ value }: { value: number | null }) {
  const color =
    value === null
      ? 'var(--fg-faint)'
      : value >= 4
        ? 'var(--ok)'
        : value >= 2.5
          ? 'var(--warn)'
          : 'var(--err)';
  return (
    <span
      className="evals-score-dot"
      style={{ background: color }}
      title={value === null ? '—' : `${value}/5`}
    />
  );
}

function VersionDetail({ run }: { run: EvalSnapshotRun }) {
  return (
    <div className="evals-card-version">
      <div className="evals-card-version-head">
        <span className="evals-card-version-name">{run.botVersion}</span>
        <span className={`evals-card-version-kind kind-${run.botKind}`}>{run.botKind}</span>
        <span className="evals-card-version-meta">
          {run.botLatencyMs}ms · ${run.botCostUsd.toFixed(4)}
        </span>
      </div>

      <div className="evals-card-scores-row">
        <ScoreBar label="C" value={run.scoreCorrectness} />
        <ScoreBar label="P" value={run.scoreCompleteness} />
        <ScoreBar label="G" value={run.scoreGrounding} />
      </div>

      <div className="evals-card-answer">
        <div className="evals-card-section-label">Bot antwoord</div>
        <div className="evals-card-answer-body">{run.botAnswer}</div>
      </div>

      {run.judgeReasoning ? (
        <div className={`evals-card-reasoning${run.judgeParseError ? ' parse-error' : ''}`}>
          <div className="evals-card-section-label">
            Judge {run.judgeParseError ? '⚠ parse error' : `(${run.judgeModel})`}
          </div>
          <div className="evals-card-reasoning-body">{run.judgeReasoning}</div>
        </div>
      ) : null}

      {run.botSources.length > 0 ? (
        <details className="evals-card-sources">
          <summary>{run.botSources.length} sources gebruikt</summary>
          <ol className="evals-card-sources-list">
            {run.botSources.map((s, i) => (
              <li key={i}>
                <span className="evals-source-file">{s.filename ?? 'onbekend'}</span>
                <span className="evals-source-sim">sim={s.similarity.toFixed(3)}</span>
                <span className="evals-source-excerpt">{s.excerpt}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StageLatencyPanel — migration 0019 visualisatie.
//
// Toont per (botVersion) een gestapelde bar van stage-p50's + p50/p95 cijfers,
// en daaronder een tabel "slowest stage per question_type". Filter op
// question_type werkt in-memory op de bestaande snapshot — geen extra fetch.
// Default collapsed zodat de Evals-tab op kleine schermen niet meteen
// volgepropt staat.
// ---------------------------------------------------------------------------

const STAGE_CSS_VAR: Record<StageKey, string> = {
  preprocess_ms: '--phase-preprocess',
  cache_lookup_ms: '--phase-cache-lookup',
  decompose_ms: '--phase-decompose',
  hyde_ms: '--phase-hyde',
  expand_ms: '--phase-expand',
  embedding_ms: '--phase-embedding',
  retrieval_ms: '--phase-retrieval',
  rerank_ms: '--phase-rerank',
  generation_ms: '--phase-generation',
  verify_ms: '--phase-verify',
  followups_ms: '--phase-followups',
  cascade_ms: '--phase-cascade',
  total_ms: '--fg-faint', // unused — total wordt niet als bar-segment gerenderd
};

function shortStage(stage: StageKey): string {
  // Drop het '_ms' suffix voor compacte labels.
  return stage.replace(/_ms$/, '');
}

function StageLatencyPanel({ snapshot }: { snapshot: EvalSnapshot }) {
  const [open, setOpen] = useState(false);
  const [questionTypeFilter, setQuestionTypeFilter] = useState<string>('alle');

  // Map questionId → questionType voor segmentatie.
  const qTypeByQId = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of snapshot.questions) m.set(q.id, q.questionType);
    return m;
  }, [snapshot.questions]);

  const allQuestionTypes = useMemo(() => {
    const s = new Set<string>();
    for (const q of snapshot.questions) s.add(q.questionType);
    return ['alle', ...[...s].sort()];
  }, [snapshot.questions]);

  // Filter runs op question_type indien actief.
  const filteredRuns: RunWithStageTimings[] = useMemo(() => {
    return snapshot.runs
      .filter((r) => {
        if (questionTypeFilter === 'alle') return true;
        return qTypeByQId.get(r.questionId) === questionTypeFilter;
      })
      .map((r) => ({
        questionId: r.questionId,
        botVersion: r.botVersion,
        stageTimingsMs: r.stageTimingsMs,
      }));
  }, [snapshot.runs, qTypeByQId, questionTypeFilter]);

  const pctls = useMemo(() => computeStagePercentiles(filteredRuns), [filteredRuns]);
  const slowest = useMemo(
    () => slowestStageByQuestionType(filteredRuns, qTypeByQId),
    [filteredRuns, qTypeByQId],
  );

  // Bouw per-version groep: { version: { stage: p50, total: p50, p95 } }.
  const perVersion = useMemo(() => {
    type Row = { stage: StageKey; p50: number; p95: number };
    const map = new Map<string, { rows: Row[]; total: Row | null }>();
    for (const r of pctls) {
      let entry = map.get(r.botVersion);
      if (!entry) {
        entry = { rows: [], total: null };
        map.set(r.botVersion, entry);
      }
      if (r.stage === 'total_ms') {
        entry.total = { stage: r.stage, p50: r.p50, p95: r.p95 };
      } else {
        entry.rows.push({ stage: r.stage, p50: r.p50, p95: r.p95 });
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [pctls]);

  const haveData = perVersion.length > 0;

  return (
    <div className="evals-stage-panel" style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          background: 'var(--bg-soft, transparent)',
          border: '1px solid var(--border, #2a2a2a)',
          borderRadius: 6,
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span>Stage latency · p50 / p95</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-faint)' }}>
          {haveData ? `${perVersion.length} versies` : 'geen data'}
        </span>
      </button>

      {open ? (
        <div style={{ padding: '10px 4px 4px' }}>
          {!haveData ? (
            <p style={{ fontSize: 12, color: 'var(--fg-faint)', margin: 0 }}>
              Geen runs met <code>stage_timings_ms</code> — pre-migration data of nog
              geen recente eval-runs gedraaid sinds migration 0019.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 11 }}>
                <label htmlFor="qt-filter" style={{ color: 'var(--fg-faint)' }}>
                  question_type:
                </label>
                <select
                  id="qt-filter"
                  value={questionTypeFilter}
                  onChange={(e) => setQuestionTypeFilter(e.target.value)}
                  style={{
                    background: 'var(--bg-soft, transparent)',
                    color: 'inherit',
                    border: '1px solid var(--border, #2a2a2a)',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 11,
                  }}
                >
                  {allQuestionTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {perVersion.map(([version, entry]) => (
                  <StageBarRow key={version} version={version} rows={entry.rows} total={entry.total} />
                ))}
              </div>

              {questionTypeFilter === 'alle' && slowest.length > 0 ? (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--fg-faint)' }}>
                    Slowest stage per question_type
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 0.6fr', gap: 4, fontSize: 11 }}>
                    <div style={{ color: 'var(--fg-faint)' }}>type</div>
                    <div style={{ color: 'var(--fg-faint)' }}>versie</div>
                    <div style={{ color: 'var(--fg-faint)' }}>bottleneck</div>
                    <div style={{ color: 'var(--fg-faint)', textAlign: 'right' }}>% van total</div>
                    {slowest.map((row, i) => (
                      <Slot key={i} row={row} />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StageBarRow({
  version,
  rows,
  total,
}: {
  version: string;
  rows: { stage: StageKey; p50: number; p95: number }[];
  total: { stage: StageKey; p50: number; p95: number } | null;
}) {
  const totalP50 = total?.p50 ?? rows.reduce((s, r) => s + r.p50, 0);
  const totalP95 = total?.p95 ?? null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, marginBottom: 3 }}>
        <span style={{ fontWeight: 600 }}>{version}</span>
        <span style={{ color: 'var(--fg-faint)' }}>
          p50 {totalP50}ms{totalP95 !== null ? ` · p95 ${totalP95}ms` : ''}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          height: 14,
          width: '100%',
          borderRadius: 3,
          overflow: 'hidden',
          background: 'var(--bg-soft, #1a1a1a)',
        }}
        title={rows.map((r) => `${shortStage(r.stage)}: ${r.p50}ms`).join(' · ')}
      >
        {rows.map((r) => {
          const pct = totalP50 > 0 ? (r.p50 / totalP50) * 100 : 0;
          if (pct < 0.5) return null; // hide invisibly thin segments
          return (
            <span
              key={r.stage}
              style={{
                width: `${pct}%`,
                background: `var(${STAGE_CSS_VAR[r.stage]})`,
              }}
              title={`${shortStage(r.stage)}: ${r.p50}ms p50, ${r.p95}ms p95`}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, fontSize: 10 }}>
        {rows.map((r) => (
          <span key={r.stage} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span
              style={{
                width: 8,
                height: 8,
                background: `var(${STAGE_CSS_VAR[r.stage]})`,
                borderRadius: 2,
              }}
            />
            <span style={{ color: 'var(--fg-faint)' }}>
              {shortStage(r.stage)} {r.p50}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Slot({
  row,
}: {
  row: { questionType: string; botVersion: string; slowestStage: StageKey; p50: number; pctOfTotal: number };
}) {
  return (
    <>
      <div>{row.questionType}</div>
      <div>{row.botVersion}</div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            width: 8,
            height: 8,
            background: `var(${STAGE_CSS_VAR[row.slowestStage]})`,
            borderRadius: 2,
            display: 'inline-block',
          }}
        />
        {shortStage(row.slowestStage)} ({row.p50}ms)
      </div>
      <div style={{ textAlign: 'right' }}>{row.pctOfTotal}%</div>
    </>
  );
}

// ---------------------------------------------------------------------------
function avgPick<T>(rows: T[], pick: (r: T) => number | null): number | null {
  const vals: number[] = [];
  for (const r of rows) {
    const v = pick(r);
    if (v !== null && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
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
