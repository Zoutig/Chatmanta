// V0 eval-latency stats — pure helpers voor per-stage percentielen,
// slowest-stage segmentatie en regressie-vergelijking. Geen Supabase, geen
// side-effects. Bewust GEEN 'server-only' directive: dit module is universeel
// bruikbaar (CLI-script én client-component) omdat alle functies pure data-
// transformaties zijn. PhaseTimings is een type-only import (runtime erased).
//
// Wordt geconsumeerd door:
//   - scripts/v0-eval-report.ts (CLI markdown + CSV)
//   - app/components/evals-view.tsx (web UI panel)
//
// Datamodel: elke eval-rij heeft optioneel een PhaseTimings JSONB (migration
// 0019). Rijen zonder stage_timings_ms (pre-migration, synthetic-fallback)
// worden stilletjes overgeslagen — percentielen zijn altijd over n rijen MET
// timing-data.

import type { PhaseTimings } from './rag';

// Volgorde matcht de declaratie in rag.ts:954-968. Wordt gebruikt voor
// deterministische output (tabel-volgorde in eval-report, bar-order in UI).
export const STAGE_KEYS = [
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
  'total_ms',
] as const satisfies readonly (keyof PhaseTimings)[];

export type StageKey = (typeof STAGE_KEYS)[number];

// Minimal shape die alle helpers nodig hebben. Past op zowel EvalSnapshotRun
// als raw scripts/v0-eval-report.ts rijen — generic shape voorkomt dat de
// helper twee verschillende interfaces moet kennen.
export type RunWithStageTimings = {
  questionId: string;
  botVersion: string;
  stageTimingsMs: PhaseTimings | null;
};

// ---------------------------------------------------------------------------
// Percentile (linear interpolation — gelijk aan SQL percentile_cont).
// ---------------------------------------------------------------------------
function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

// Statistische ondergrens voor p99 — onder n=30 is p99 ruis, niet signaal.
const P99_MIN_N = 30;

// ---------------------------------------------------------------------------
// computeStagePercentiles — p50/p95/p99 per (botVersion, stage).
// ---------------------------------------------------------------------------
export type StagePercentileRow = {
  botVersion: string;
  stage: StageKey;
  n: number;
  p50: number;
  p95: number;
  p99: number | null;
};

export function computeStagePercentiles(
  rows: readonly RunWithStageTimings[],
): StagePercentileRow[] {
  // Bucket: botVersion → stage → list of ms-values.
  const buckets = new Map<string, Map<StageKey, number[]>>();
  for (const r of rows) {
    if (!r.stageTimingsMs) continue;
    let perStage = buckets.get(r.botVersion);
    if (!perStage) {
      perStage = new Map();
      buckets.set(r.botVersion, perStage);
    }
    for (const key of STAGE_KEYS) {
      const v = r.stageTimingsMs[key];
      if (typeof v !== 'number') continue;
      let arr = perStage.get(key);
      if (!arr) {
        arr = [];
        perStage.set(key, arr);
      }
      arr.push(v);
    }
  }

  const out: StagePercentileRow[] = [];
  const versionsSorted = [...buckets.keys()].sort();
  for (const botVersion of versionsSorted) {
    const perStage = buckets.get(botVersion)!;
    for (const stage of STAGE_KEYS) {
      const values = perStage.get(stage);
      if (!values || values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      out.push({
        botVersion,
        stage,
        n: sorted.length,
        p50: Math.round(percentile(sorted, 0.5)),
        p95: Math.round(percentile(sorted, 0.95)),
        p99: sorted.length >= P99_MIN_N ? Math.round(percentile(sorted, 0.99)) : null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// slowestStageByQuestionType — welke stage is de bottleneck voor elk type?
//
// Per (questionType, botVersion) pakken we de stage met de hoogste p50, met
// total_ms uitgesloten (total_ms IS de som — bottleneck-zoektocht gaat over
// componenten). Geeft een p50-waarde + percentage-van-total terug.
// ---------------------------------------------------------------------------
export type SlowestStageRow = {
  questionType: string;
  botVersion: string;
  slowestStage: StageKey;
  p50: number;
  pctOfTotal: number; // 0..100
  n: number;
};

export function slowestStageByQuestionType(
  rows: readonly RunWithStageTimings[],
  questionTypeByQId: ReadonlyMap<string, string>,
): SlowestStageRow[] {
  // Group: (questionType, botVersion) → stage → number[]
  const groups = new Map<string, Map<StageKey, number[]>>();
  const totals = new Map<string, number[]>(); // (qType,bv) → total_ms[]
  for (const r of rows) {
    if (!r.stageTimingsMs) continue;
    const qType = questionTypeByQId.get(r.questionId) ?? 'unknown';
    const groupKey = `${qType}::${r.botVersion}`;
    let perStage = groups.get(groupKey);
    if (!perStage) {
      perStage = new Map();
      groups.set(groupKey, perStage);
    }
    for (const stage of STAGE_KEYS) {
      if (stage === 'total_ms') continue; // skip — total IS de som
      const v = r.stageTimingsMs[stage];
      if (typeof v !== 'number') continue;
      let arr = perStage.get(stage);
      if (!arr) {
        arr = [];
        perStage.set(stage, arr);
      }
      arr.push(v);
    }
    if (typeof r.stageTimingsMs.total_ms === 'number') {
      let totalArr = totals.get(groupKey);
      if (!totalArr) {
        totalArr = [];
        totals.set(groupKey, totalArr);
      }
      totalArr.push(r.stageTimingsMs.total_ms);
    }
  }

  const out: SlowestStageRow[] = [];
  const groupKeysSorted = [...groups.keys()].sort();
  for (const groupKey of groupKeysSorted) {
    const [questionType, botVersion] = groupKey.split('::');
    const perStage = groups.get(groupKey)!;
    let winner: { stage: StageKey; p50: number; n: number } | null = null;
    for (const [stage, values] of perStage) {
      const sorted = [...values].sort((a, b) => a - b);
      const p50 = Math.round(percentile(sorted, 0.5));
      if (!winner || p50 > winner.p50) {
        winner = { stage, p50, n: values.length };
      }
    }
    if (!winner) continue;
    const totalsArr = totals.get(groupKey) ?? [];
    const totalP50 =
      totalsArr.length === 0
        ? winner.p50
        : Math.round(percentile([...totalsArr].sort((a, b) => a - b), 0.5));
    const pctOfTotal = totalP50 > 0 ? Math.round((winner.p50 / totalP50) * 100) : 0;
    out.push({
      questionType,
      botVersion,
      slowestStage: winner.stage,
      p50: winner.p50,
      pctOfTotal,
      n: winner.n,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// extractLatestAndBaseline — splits newest-first rijen in latest- + second-
// latest-per-pair. "Latest" = jongste rij voor elke (questionId, botVersion);
// baseline = de op-één-na-jongste. Beide groepen worden geretourneerd zodat
// compareBaseline percentiel-stats per groep kan berekenen.
//
// Input: rows newest-first (eval-report fetch'ed al .order('created_at',
// ascending:false)).
// ---------------------------------------------------------------------------
export type LatestAndBaseline<T extends RunWithStageTimings> = {
  latest: T[];
  baseline: T[];
};

export function extractLatestAndBaseline<T extends RunWithStageTimings>(
  rowsNewestFirst: readonly T[],
): LatestAndBaseline<T> {
  const seen = new Map<string, number>(); // pair-key → count
  const latest: T[] = [];
  const baseline: T[] = [];
  for (const r of rowsNewestFirst) {
    const key = `${r.questionId}::${r.botVersion}`;
    const c = seen.get(key) ?? 0;
    if (c === 0) latest.push(r);
    else if (c === 1) baseline.push(r);
    // c >= 2 → genegeerd (oudere historie)
    seen.set(key, c + 1);
  }
  return { latest, baseline };
}

// ---------------------------------------------------------------------------
// compareBaseline — per (botVersion, stage) deltas tussen current en baseline
// percentielen. Verdict-regels:
//   - 'regression' als current p95 > 1.20 × baseline p95 ÉN delta > 200ms
//   - 'watch'      als current p95 > 1.10 × baseline p95
//   - 'ok'         anders
// ---------------------------------------------------------------------------
export type BaselineComparisonRow = {
  botVersion: string;
  stage: StageKey;
  baselineP95: number;
  currentP95: number;
  deltaMs: number;
  pctChange: number; // signed, e.g. +20 = +20%
  verdict: 'ok' | 'watch' | 'regression';
};

export function compareBaseline(
  currentRows: readonly RunWithStageTimings[],
  baselineRows: readonly RunWithStageTimings[],
): BaselineComparisonRow[] {
  const currentPctls = computeStagePercentiles(currentRows);
  const baselinePctls = computeStagePercentiles(baselineRows);
  const baselineMap = new Map<string, StagePercentileRow>();
  for (const row of baselinePctls) {
    baselineMap.set(`${row.botVersion}::${row.stage}`, row);
  }

  const out: BaselineComparisonRow[] = [];
  for (const cur of currentPctls) {
    const base = baselineMap.get(`${cur.botVersion}::${cur.stage}`);
    if (!base) continue; // no baseline → no comparison
    const deltaMs = cur.p95 - base.p95;
    const pctChange = base.p95 > 0 ? Math.round((deltaMs / base.p95) * 100) : 0;
    let verdict: BaselineComparisonRow['verdict'] = 'ok';
    if (cur.p95 > base.p95 * 1.2 && deltaMs > 200) verdict = 'regression';
    else if (cur.p95 > base.p95 * 1.1) verdict = 'watch';
    out.push({
      botVersion: cur.botVersion,
      stage: cur.stage,
      baselineP95: base.p95,
      currentP95: cur.p95,
      deltaMs,
      pctChange,
      verdict,
    });
  }
  return out;
}
