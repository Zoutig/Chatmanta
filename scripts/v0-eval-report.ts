// V0 eval report — leest de meest-recente eval_runs per (vraag × versie)
// en schrijft een markdown + CSV samenvatting naar eval-out/.
//
// Snapshot-mode: per (question_id, bot_version) wordt alleen de NIEUWSTE rij
// uit eval_runs gepakt. Oudere runs blijven in de DB voor regressie-analyse,
// maar het rapport toont je laatste stand van zaken.
//
// Usage:
//   npm run eval:report

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { resolveBot, BOTS, EVAL_DEFAULT_VERSIONS } from '../lib/v0/server/bots';
import type { PhaseTimings } from '../lib/v0/server/rag';
import {
  STAGE_KEYS,
  computeStagePercentiles,
  slowestStageByQuestionType,
  extractLatestAndBaseline,
  compareBaseline,
  type RunWithStageTimings,
} from '../lib/v0/server/eval-latency-stats';

const OUT_DIR = resolve('eval-out');

// V0.7 — friendly slug per org-UUID voor weergave.
const ORG_SLUG_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  '00000000-0000-0000-0000-0000000000d0': 'dev-org',
  '00000000-0000-0000-0000-0000000000a1': 'acme-corp',
  '00000000-0000-0000-0000-0000000000a2': 'globex-inc',
  '00000000-0000-0000-0000-0000000000a3': 'initech',
});
function orgSlug(id: string | null | undefined): string {
  if (!id) return '(unknown)';
  return ORG_SLUG_BY_ID[id] ?? id.slice(-4);
}

// V0.7 — productie-drempels voor betalende klanten. STARTWAARDEN — kalibreer
// op je eerste 2-3 runs. Verdict: een versie passeert pas als ALLE drempels
// gehaald zijn (geaggregeerd over alle ~75 Q in de eval-set).
const PRODUCTION_THRESHOLDS = {
  minAvgCorrectness: 4.0,
  maxZeroCorrectnessRate: 0.02,
  minAvgCompleteness: 3.5,
  minAvgGrounding: 4.0,
  minProductionReadyRate: 0.80,
  minRightLengthRate: 0.85,
  minSourceCitationBindingRate: 0.75,
  minAvgToneMatch: 1.5,
  minRouteCorrectRate: 0.90,
  maxMetaTalkRate: 0.10,
  minAvgRecallAtK: 0.70,
  minAvgMrr: 0.60,
  maxP95TotalMs: 8000,
  maxP95FirstTokenMs: 1500,
} as const;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

async function main(): Promise<void> {
const sb = createClient(url!, key!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// 1. Load all eval_runs gejoined met eval_questions
// ---------------------------------------------------------------------------
const { data: runRows, error: runErr } = await sb
  .from('eval_runs')
  .select(
    `id, organization_id, question_id, bot_version, judge_model, bot_kind, bot_answer, bot_sources,
     bot_cost_usd, bot_latency_ms,
     score_correctness, score_completeness, score_grounding,
     score_route_correct, score_meta_talk_present,
     production_ready, answer_length_appropriate, source_citation_binding, score_tone_match,
     judge_reasoning, judge_parse_error, judge_cost_usd, judge_latency_ms,
     hyde_mode_requested, hyde_mode_actual,
     run_index, retrieved_filenames, retrieval_recall_at_k, retrieval_mrr,
     must_not_violation,
     hard_fact_supported, missing_hard_facts, hard_fact_status,
     stage_timings_ms,
     created_at`,
  )
  .order('created_at', { ascending: false });
if (runErr) fail(`eval_runs select: ${runErr.message}`);
if (!runRows || runRows.length === 0) {
  console.log('Geen eval_runs in DB. Run eerst `npm run eval:run`.');
  process.exit(0);
}

const { data: qRows, error: qErr } = await sb
  .from('eval_questions')
  .select('id, organization_id, slug, question, gold_answer, gold_facts, tags, difficulty, question_type, must_not_contain');
if (qErr) fail(`eval_questions select: ${qErr.message}`);
const qById = new Map((qRows ?? []).map((q) => [q.id as string, q]));

// V0.7: pairwise rows voor de win-rate sectie. Filteren is niet nodig — we
// tonen alles uit de meest-recente batch.
const { data: pairwiseRows, error: pwErr } = await sb
  .from('eval_pairwise_runs')
  .select('organization_id, question_id, bot_version_a, bot_version_b, winner, confidence, judge_rationale, judge_parse_error, created_at')
  .order('created_at', { ascending: false });
if (pwErr) fail(`eval_pairwise_runs select: ${pwErr.message}`);

// ---------------------------------------------------------------------------
// 2. Snapshot: voor elke (question_id, bot_version, hyde_mode_actual) →
//    meest recente run. Dedup-key bevat hyde_mode zodat 3-way A/B/C runs
//    (off/upfront/selective) naast elkaar kunnen bestaan en in het rapport
//    afzonderlijk getoond worden. Legacy rijen (van vóór migration 0012)
//    krijgen hyde_mode_actual = '(legacy)' bucket.
// ---------------------------------------------------------------------------
type RunRow = NonNullable<typeof runRows>[number];
function modeKey(r: RunRow): string {
  return (r.hyde_mode_actual as string | null) ?? '(legacy)';
}

// Dedup-strategie:
// - latestByQuad: bewaart per (q, v, mode, run_index) de meest recente run.
//   Dit is de basis voor multi-run variance — alle run_indexes blijven naast
//   elkaar staan zolang ze in dezelfde recente batch zaten.
// - latestRuns: voor de hoofdtabellen dedup op (q, v, mode) → laagste
//   run_index (typisch 0). Zo kan een --runs=3 batch alle 3 variance-rijen
//   bewaren maar het hoofdrapport blijft één regel per cel tonen.
const latestByQuad = new Map<string, RunRow>();
for (const r of runRows) {
  const key = `${r.question_id}::${r.bot_version}::${modeKey(r)}::${r.run_index ?? 0}`;
  if (!latestByQuad.has(key)) latestByQuad.set(key, r);
}
const allLatestVariance = [...latestByQuad.values()];

const latestByTriple = new Map<string, RunRow>();
for (const r of allLatestVariance) {
  const key = `${r.question_id}::${r.bot_version}::${modeKey(r)}`;
  const existing = latestByTriple.get(key);
  if (!existing || (r.run_index ?? 0) < (existing.run_index ?? 0)) {
    latestByTriple.set(key, r);
  }
}
const latestRuns = [...latestByTriple.values()];

// Versie-modus combinaties die in de data voorkomen, gesorteerd. Dit zijn
// de "kolommen" in summary + per-vraag tabellen.
const versionModePairs = [
  ...new Set(latestRuns.map((r) => `${r.bot_version}::${modeKey(r)}`)),
].sort();

const versionsForHeader = [...new Set(latestRuns.map((r) => r.bot_version as string))].sort();
const questionIds = [...new Set(latestRuns.map((r) => r.question_id as string))];
const questions = questionIds
  .map((id) => qById.get(id))
  .filter((q): q is NonNullable<typeof q> => q !== undefined)
  .sort((a, b) => (a.slug as string).localeCompare(b.slug as string));

// ---------------------------------------------------------------------------
// 3. Helpers voor avg / formatting
// ---------------------------------------------------------------------------
type Run = typeof latestRuns[number];

function avgOf(rows: Run[], pick: (r: Run) => number | null): number | null {
  const vals: number[] = [];
  for (const r of rows) {
    const v = pick(r);
    if (v !== null && v !== undefined && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(digits);
}

function fmtScore(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return String(n);
}

// ---------------------------------------------------------------------------
// v0.8 FASE 1.1 — statistiek-helpers voor de noise-floor.
// ---------------------------------------------------------------------------
type Stats = {
  n: number;
  mean: number | null;
  std: number | null;     // sample standard deviation (n-1)
  se: number | null;      // standard error = std / sqrt(n)
  ci95Lo: number | null;
  ci95Hi: number | null;
};

function computeStats(values: number[]): Stats {
  const n = values.length;
  if (n === 0) return { n: 0, mean: null, std: null, se: null, ci95Lo: null, ci95Hi: null };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { n, mean, std: 0, se: 0, ci95Lo: mean, ci95Hi: mean };
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const se = std / Math.sqrt(n);
  return { n, mean, std, se, ci95Lo: mean - 1.96 * se, ci95Hi: mean + 1.96 * se };
}

/** Small-n betrouwbaarheidslabel per spec 1.1 (gebaseerd op #cases, niet
 *  #samples). */
function smallNLabel(nCases: number): string {
  if (nCases < 10) return 'sample too small — diagnostic only';
  if (nCases < 20) return 'watchlist — weak signal';
  if (nCases < 30) return 'moderate signal';
  return 'normal verdict';
}

/** Verdict-helper voor een delta tussen twee versies: significant alleen als
 *  de 95%-CI's NIET overlappen én beide buckets ≥ minCases hebben. */
function deltaVerdict(a: Stats, b: Stats, minCases = 20): string {
  if (a.n === 0 || b.n === 0) return 'no data';
  if (a.ci95Lo === null || a.ci95Hi === null || b.ci95Lo === null || b.ci95Hi === null) {
    return 'within measured noise — do not overinterpret';
  }
  const overlap = a.ci95Lo <= b.ci95Hi && b.ci95Lo <= a.ci95Hi;
  if (overlap) return 'within measured noise — do not overinterpret';
  if (a.n < minCases || b.n < minCases) return 'CI-separated but small-n — weak';
  return 'significant (CI-separated)';
}

// Parsing-guard voor stage_timings_ms JSONB-kolom (migration 0019). Geeft een
// PhaseTimings of null terug. Matcht safeStageTimings in evals-snapshot.ts.
function parseStageTimings(raw: unknown): PhaseTimings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.total_ms !== 'number') return null;
  if (typeof obj.embedding_ms !== 'number') return null;
  if (typeof obj.retrieval_ms !== 'number') return null;
  if (typeof obj.generation_ms !== 'number') return null;
  return obj as unknown as PhaseTimings;
}

// RunRow → RunWithStageTimings adapter voor de eval-latency-stats helpers.
// Inclusief hyde_mode in de pseudo-key zodat A/B/C runs niet door elkaar
// vergeleken worden (regression-check moet same-config zijn).
function toStatsRow(r: RunRow): RunWithStageTimings {
  return {
    questionId: r.question_id as string,
    botVersion: `${r.bot_version as string}::${modeKey(r)}`,
    stageTimingsMs: parseStageTimings(r.stage_timings_ms),
  };
}

// Vertaal de pseudo-key ${version}::${mode} terug voor rendering. Stage-rows
// die geen "::" bevatten (kunnen niet voorkomen via toStatsRow maar defensief)
// vallen terug op de hele string als version + mode='auto'.
function splitVersionMode(combined: string): { version: string; mode: string } {
  const idx = combined.indexOf('::');
  if (idx === -1) return { version: combined, mode: 'auto' };
  return { version: combined.slice(0, idx), mode: combined.slice(idx + 2) };
}

// ---------------------------------------------------------------------------
// 4. Markdown report
// ---------------------------------------------------------------------------
const now = new Date();
const stamp = now
  .toISOString()
  .replace(/\.\d+Z$/, 'Z')
  .replace(/[:T]/g, '-');

const lines: string[] = [];
lines.push(`# V0 Eval Report — ${now.toISOString()}`);
lines.push('');
lines.push(`Snapshot van de meest-recente runs per (vraag × versie). Judge: ${latestRuns[0]?.judge_model ?? 'unknown'}.`);
lines.push('');
lines.push(`- Vragen: **${questions.length}**`);
lines.push(`- Versies: **${versionsForHeader.join(', ')}**`);
lines.push(`- Totaal runs in DB: **${runRows.length}** (alle history bewaard)`);
const hasMultiRun = allLatestVariance.some((r) => (r.run_index ?? 0) > 0);
if (hasMultiRun) {
  const maxRunIdx = Math.max(...allLatestVariance.map((r) => r.run_index ?? 0));
  lines.push(`- Multi-run: tot **${maxRunIdx + 1}** runs per cel — variance-sectie onderaan.`);
}
lines.push('');

// 4a. 🚨 Must-not violations — bovenaan zodat ze niet gemist worden
const violations = latestRuns.filter((r) => r.must_not_violation === true);
lines.push('## 🚨 Must-not violations');
lines.push('');
if (violations.length === 0) {
  lines.push('Geen violations — geen enkele bot heeft een verboden string uitgesproken. ✓');
} else {
  lines.push(`**${violations.length} violation(s)** — bot praatte een verboden string na (typisch een user-geplante leugen of forbidden-content):`);
  lines.push('');
  lines.push('| slug | versie | hyde_mode | bot_kind | verboden | bot_answer (excerpt) |');
  lines.push('|------|--------|-----------|----------|----------|----------------------|');
  for (const r of violations) {
    const q = qById.get(r.question_id as string);
    const slug = q?.slug ?? '(onbekend)';
    const forbidden = (q?.must_not_contain as string[] | undefined)?.join(', ') ?? '—';
    const excerpt = String(r.bot_answer ?? '').replace(/\n/g, ' ').slice(0, 120);
    lines.push(`| ${slug} | ${r.bot_version} | ${modeKey(r)} | ${r.bot_kind} | ${forbidden} | ${excerpt}… |`);
  }
}
lines.push('');

// 4b. Samenvatting per versie × hyde_mode
lines.push('## Samenvatting per versie × hyde_mode');
lines.push('');
lines.push('| versie | hyde_mode | n | C | P | G | overall | bot $ | judge $ | bot ms (avg) |');
lines.push('|--------|-----------|---|---|---|---|---------|-------|---------|--------------|');
for (const pair of versionModePairs) {
  const [v, mode] = pair.split('::');
  const vRows = latestRuns.filter((r) => r.bot_version === v && modeKey(r) === mode);
  const c = avgOf(vRows, (r) => r.score_correctness);
  const p = avgOf(vRows, (r) => r.score_completeness);
  const g = avgOf(vRows, (r) => r.score_grounding);
  const all = [c, p, g].filter((n): n is number => n !== null);
  const overall = all.length === 0 ? null : all.reduce((a, b) => a + b, 0) / all.length;
  const bCost = vRows.reduce((s, r) => s + Number(r.bot_cost_usd ?? 0), 0);
  const jCost = vRows.reduce((s, r) => s + Number(r.judge_cost_usd ?? 0), 0);
  const lat = avgOf(vRows, (r) => Number(r.bot_latency_ms ?? 0));
  lines.push(
    `| ${v} | ${mode} | ${vRows.length} | ${fmt(c)} | ${fmt(p)} | ${fmt(g)} | **${fmt(overall)}** | $${bCost.toFixed(4)} | $${jCost.toFixed(4)} | ${fmt(lat, 0)} |`,
  );
}
lines.push('');

// 4b-bis. V0.7 eval-v2 — per-org × per-versie samenvatting met ALLE dimensies
// (oude C/P/G + nieuwe production_ready / length / source-binding / tone).
// Uitgesplitst per org omdat een versie die op DEV_ORG goed scoort maar op
// initech faalt geen ship-candidate is voor boekhouders-klanten.
lines.push('## V0.7 — Per-org × per-versie alle dimensies');
lines.push('');
const distinctOrgs = [...new Set(latestRuns.map((r) => r.organization_id as string))].sort();
if (distinctOrgs.length === 0) {
  lines.push('_Geen runs._');
} else {
  lines.push('| org | versie | n | C | P | G | route✓ | metaTalk | prod-ready | right-len | citation✓ | tone | recall@k | MRR |');
  lines.push('|-----|--------|---|---|---|---|--------|----------|------------|-----------|-----------|------|----------|-----|');
  for (const orgId of distinctOrgs) {
    for (const v of versionsForHeader) {
      const vRows = latestRuns.filter((r) => r.organization_id === orgId && r.bot_version === v);
      if (vRows.length === 0) continue;
      const c = avgOf(vRows, (r) => r.score_correctness);
      const p = avgOf(vRows, (r) => r.score_completeness);
      const g = avgOf(vRows, (r) => r.score_grounding);
      const routeRows = vRows.filter((r) => r.score_route_correct !== null);
      const routeOk = routeRows.length === 0 ? null
        : routeRows.filter((r) => r.score_route_correct === true).length / routeRows.length;
      const metaRows = vRows.filter((r) => r.score_meta_talk_present !== null);
      const metaRate = metaRows.length === 0 ? null
        : metaRows.filter((r) => r.score_meta_talk_present === true).length / metaRows.length;
      const prRows = vRows.filter((r) => r.production_ready !== null);
      const prRate = prRows.length === 0 ? null
        : prRows.filter((r) => r.production_ready === true).length / prRows.length;
      const lenRows = vRows.filter((r) => r.answer_length_appropriate !== null);
      const lenRate = lenRows.length === 0 ? null
        : lenRows.filter((r) => r.answer_length_appropriate === 'right_length').length / lenRows.length;
      const citationRows = vRows.filter((r) => r.source_citation_binding !== null);
      const citationRate = citationRows.length === 0 ? null
        : citationRows.filter((r) => r.source_citation_binding === true).length / citationRows.length;
      const tone = avgOf(vRows, (r) => r.score_tone_match as number | null);
      const recall = avgOf(vRows.filter((r) => r.retrieval_recall_at_k !== null), (r) => Number(r.retrieval_recall_at_k));
      const mrr = avgOf(vRows.filter((r) => r.retrieval_mrr !== null), (r) => Number(r.retrieval_mrr));
      const pct = (n: number | null) => n === null ? '—' : `${Math.round(n * 100)}%`;
      lines.push(
        `| ${orgSlug(orgId)} | ${v} | ${vRows.length} | ${fmt(c)} | ${fmt(p)} | ${fmt(g)} | ${pct(routeOk)} | ${pct(metaRate)} | ${pct(prRate)} | ${pct(lenRate)} | ${pct(citationRate)} | ${fmt(tone)} | ${fmt(recall, 3)} | ${fmt(mrr, 3)} |`,
      );
    }
  }
  lines.push('');
  lines.push('_route✓ / metaTalk = boolean rates over rijen waar judge ze ge-scored heeft. prod-ready / right-len / citation✓ = true-rates over rijen met niet-null waarde. Tone = avg 0-2 over rijen met persona-spec._');
}
lines.push('');

// 4b-ter. V0.7 — Pairwise win-rate (head-to-head judgments per versie-paar).
// LLM-judges zijn betrouwbaarder in vergelijken dan absolute scoren — dit is
// het primaire ranking-signaal voor close-runners.
lines.push('## V0.7 — Pairwise win-rate');
lines.push('');
const pwAll = pairwiseRows ?? [];
if (pwAll.length === 0) {
  lines.push('_Geen pairwise rijen. Run `npm run eval:run` zonder `--no-pairwise` om ze te vullen._');
} else {
  // Dedup op (org, question, A, B) → meest recente. Oudere comparisons blijven
  // in eval_pairwise_runs voor history maar overzicht toont laatste batch.
  type PwRow = NonNullable<typeof pairwiseRows>[number];
  const pwLatest = new Map<string, PwRow>();
  for (const r of pwAll) {
    const k = `${r.organization_id}::${r.question_id}::${r.bot_version_a}::${r.bot_version_b}`;
    if (!pwLatest.has(k)) pwLatest.set(k, r);
  }
  const pwRecent = [...pwLatest.values()];

  // Versie-paren in deze batch.
  const versionPairs = [...new Set(pwRecent.map((r) => `${r.bot_version_a}::${r.bot_version_b}`))].sort();

  lines.push('### Per versie-paar (over alle orgs)');
  lines.push('');
  lines.push('| paar | n | A wint | tie | B wint | conclusie |');
  lines.push('|------|---|--------|-----|--------|-----------|');
  for (const pair of versionPairs) {
    const [vA, vB] = pair.split('::');
    const rows = pwRecent.filter((r) => r.bot_version_a === vA && r.bot_version_b === vB);
    const n = rows.length;
    const wA = rows.filter((r) => r.winner === 'A').length;
    const wB = rows.filter((r) => r.winner === 'B').length;
    const ties = rows.filter((r) => r.winner === 'tie').length;
    const pctA = Math.round((wA / n) * 100);
    const pctB = Math.round((wB / n) * 100);
    const pctT = Math.round((ties / n) * 100);
    let conclusion = '—';
    if (wA / n >= 0.55) conclusion = `${vA} winnaar (≥55%)`;
    else if (wB / n >= 0.55) conclusion = `${vB} winnaar (≥55%)`;
    else conclusion = 'gelijk-op';
    lines.push(`| ${vA} vs ${vB} | ${n} | ${wA} (${pctA}%) | ${ties} (${pctT}%) | ${wB} (${pctB}%) | ${conclusion} |`);
  }
  lines.push('');

  // Per-org × versie-paar — promotion criterion: geen org mag <45% scoren
  lines.push('### Per-org × versie-paar (promotie-criterium: geen org <45%)');
  lines.push('');
  lines.push('| org | paar | n | A wint | tie | B wint | min-rate | ⚠ |');
  lines.push('|-----|------|---|--------|-----|--------|----------|----|');
  for (const orgId of distinctOrgs) {
    for (const pair of versionPairs) {
      const [vA, vB] = pair.split('::');
      const rows = pwRecent.filter(
        (r) => r.organization_id === orgId
          && r.bot_version_a === vA
          && r.bot_version_b === vB,
      );
      if (rows.length === 0) continue;
      const n = rows.length;
      const wA = rows.filter((r) => r.winner === 'A').length;
      const wB = rows.filter((r) => r.winner === 'B').length;
      const ties = rows.filter((r) => r.winner === 'tie').length;
      const pctA = Math.round((wA / n) * 100);
      const pctB = Math.round((wB / n) * 100);
      const pctT = Math.round((ties / n) * 100);
      const winRateA = wA / n;
      const winRateB = wB / n;
      const minRate = Math.min(winRateA, winRateB);
      const warn = minRate < 0.45 ? '⚠' : '';
      lines.push(`| ${orgSlug(orgId)} | ${vA} vs ${vB} | ${n} | ${wA} (${pctA}%) | ${ties} (${pctT}%) | ${wB} (${pctB}%) | ${Math.round(minRate * 100)}% | ${warn} |`);
    }
  }
  lines.push('');

  // Top 3 winning rationales per versie-paar (insight in WAAROM een versie wint)
  for (const pair of versionPairs) {
    const [vA, vB] = pair.split('::');
    const rows = pwRecent.filter((r) => r.bot_version_a === vA && r.bot_version_b === vB);
    if (rows.length === 0) continue;
    lines.push(`### Voorbeeld rationales — ${vA} vs ${vB}`);
    lines.push('');
    const wins = rows.filter((r) => r.winner === 'A' && r.judge_rationale).slice(0, 3);
    const losses = rows.filter((r) => r.winner === 'B' && r.judge_rationale).slice(0, 3);
    if (wins.length > 0) {
      lines.push(`**${vA} won:**`);
      for (const w of wins) {
        const q = qById.get(w.question_id as string);
        lines.push(`- _${q?.slug ?? '?'}_ (conf=${w.confidence ?? '-'}): ${w.judge_rationale}`);
      }
      lines.push('');
    }
    if (losses.length > 0) {
      lines.push(`**${vB} won:**`);
      for (const l of losses) {
        const q = qById.get(l.question_id as string);
        lines.push(`- _${q?.slug ?? '?'}_ (conf=${l.confidence ?? '-'}): ${l.judge_rationale}`);
      }
      lines.push('');
    }
  }
}
lines.push('');

// 4c. V0.6.2 adaptive RAG: samenvatting per versie × decision.path
// (fast/standard/careful). Bouw op stage_timings_ms.adaptiveDecision.path
// dat eval.ts mee-injecteert. Alleen rijen met aanwezige adaptive_decision
// komen mee — v0.1-v0.6.1 worden automatisch overgeslagen omdat zij geen
// adaptiveDecision in stage_timings_ms hebben.
type AdaptivePathKey = 'fast' | 'standard' | 'careful';
type AdaptivePathRow = {
  version: string;
  path: AdaptivePathKey;
  rows: RunRow[];
};
function adaptivePathOf(r: RunRow): AdaptivePathKey | null {
  const st = r.stage_timings_ms as { adaptiveDecision?: { path?: string } } | null;
  const p = st?.adaptiveDecision?.path;
  if (p === 'fast' || p === 'standard' || p === 'careful') return p;
  return null;
}
const adaptiveBuckets = new Map<string, AdaptivePathRow>();
for (const r of latestRuns) {
  const path = adaptivePathOf(r);
  if (!path) continue;
  const key = `${r.bot_version}::${path}`;
  const bucket = adaptiveBuckets.get(key);
  if (bucket) {
    bucket.rows.push(r);
  } else {
    adaptiveBuckets.set(key, { version: r.bot_version as string, path, rows: [r] });
  }
}
if (adaptiveBuckets.size > 0) {
  lines.push('## V0.6.2 Adaptive decision — samenvatting per versie × path');
  lines.push('');
  lines.push('| versie | path | n | C | P | G | overall | bot $ | bot ms (avg) |');
  lines.push('|--------|------|---|---|---|---|---------|-------|--------------|');
  // Sort: versie alfabetisch, dan path in vaste volgorde
  const pathOrder: Record<AdaptivePathKey, number> = { fast: 0, standard: 1, careful: 2 };
  const sortedBuckets = [...adaptiveBuckets.values()].sort((a, b) =>
    a.version.localeCompare(b.version) || pathOrder[a.path] - pathOrder[b.path],
  );
  for (const b of sortedBuckets) {
    const c = avgOf(b.rows, (r) => r.score_correctness);
    const p = avgOf(b.rows, (r) => r.score_completeness);
    const g = avgOf(b.rows, (r) => r.score_grounding);
    const all = [c, p, g].filter((n): n is number => n !== null);
    const overall = all.length === 0 ? null : all.reduce((a, x) => a + x, 0) / all.length;
    const bCost = b.rows.reduce((s, r) => s + Number(r.bot_cost_usd ?? 0), 0);
    const lat = avgOf(b.rows, (r) => Number(r.bot_latency_ms ?? 0));
    lines.push(
      `| ${b.version} | ${b.path} | ${b.rows.length} | ${fmt(c)} | ${fmt(p)} | ${fmt(g)} | **${fmt(overall)}** | $${bCost.toFixed(4)} | ${fmt(lat, 0)} |`,
    );
  }
  lines.push('');
  lines.push('_Alleen v0.6.2+ runs met `bot.adaptiveRag=true`. Per-path means tonen of `fast` daadwerkelijk de latency drukt zonder grounding-verlies._');
  lines.push('');
}

// 4b-bis. Per-stage latency (p50/p95/p99) — migration 0019 nieuwe sectie.
// Gebruikt latestRuns als input (current snapshot) gekeyed op (v::mode) zodat
// 3-way A/B/C runs niet door elkaar gemengd worden.
lines.push('## Per-stage latency (p50 / p95 / p99)');
lines.push('');
const stageRunsCurrent: RunWithStageTimings[] = latestRuns.map(toStatsRow);
const stagePctls = computeStagePercentiles(stageRunsCurrent);
if (stagePctls.length === 0) {
  lines.push('_Geen rijen met stage_timings_ms — pre-migration data of geen recente runs._');
} else {
  lines.push('| versie | hyde_mode | stage | n | p50 | p95 | p99 |');
  lines.push('|--------|-----------|-------|---|-----|-----|-----|');
  for (const row of stagePctls) {
    const { version, mode } = splitVersionMode(row.botVersion);
    const p99 = row.p99 === null ? '—' : String(row.p99);
    lines.push(
      `| ${version} | ${mode} | ${row.stage} | ${row.n} | ${row.p50} | ${row.p95} | ${p99} |`,
    );
  }
  lines.push('');
  lines.push('_p99 = "—" bij n < 30 (statistische ondergrens)._');
}
lines.push('');

// 4b-ter. Slowest stage per question_type — welke stage domineert per
// categorie? Helpt prioriteren: "factual is generation-bound, multi_hop is
// retrieval-bound".
lines.push('## Slowest stage per question_type');
lines.push('');
const qTypeByQId = new Map<string, string>();
for (const q of questions) {
  qTypeByQId.set(q.id as string, (q.question_type as string | null) ?? 'factual');
}
const slowest = slowestStageByQuestionType(stageRunsCurrent, qTypeByQId);
if (slowest.length === 0) {
  lines.push('_Geen rijen met stage_timings_ms beschikbaar voor segmentatie._');
} else {
  lines.push('| question_type | versie | hyde_mode | slowest stage | p50 (ms) | % of total | n |');
  lines.push('|---------------|--------|-----------|---------------|----------|------------|---|');
  for (const row of slowest) {
    const { version, mode } = splitVersionMode(row.botVersion);
    lines.push(
      `| ${row.questionType} | ${version} | ${mode} | ${row.slowestStage} | ${row.p50} | ${row.pctOfTotal}% | ${row.n} |`,
    );
  }
}
lines.push('');

// 4b-quater. Regressie vs vorige run — vergelijk latest per (q, v, mode) met
// second-latest. Eerste-run-ooit: sectie wordt overgeslagen (geen baseline).
lines.push('## Regressie vs vorige run');
lines.push('');
const allRunsForBaseline: RunWithStageTimings[] = (runRows ?? []).map((r) => toStatsRow(r));
const { latest: regLatest, baseline: regBaseline } =
  extractLatestAndBaseline(allRunsForBaseline);
if (regBaseline.length === 0) {
  lines.push('_Geen baseline beschikbaar — dit lijkt de eerste run te zijn voor deze (vraag × versie × hyde_mode) combinaties._');
} else {
  const comparisons = compareBaseline(regLatest, regBaseline);
  if (comparisons.length === 0) {
    lines.push('_Geen overlappende (versie, stage) cellen tussen current en baseline._');
  } else {
    lines.push('| versie | hyde_mode | stage | baseline p95 | current p95 | Δ | % | verdict |');
    lines.push('|--------|-----------|-------|--------------|-------------|---|---|---------|');
    for (const row of comparisons) {
      const { version, mode } = splitVersionMode(row.botVersion);
      const verdictIcon =
        row.verdict === 'regression' ? '🚨 regression' : row.verdict === 'watch' ? '🟡 watch' : 'ok';
      const deltaStr = row.deltaMs >= 0 ? `+${row.deltaMs}ms` : `${row.deltaMs}ms`;
      const pctStr = row.pctChange >= 0 ? `+${row.pctChange}%` : `${row.pctChange}%`;
      lines.push(
        `| ${version} | ${mode} | ${row.stage} | ${row.baselineP95} | ${row.currentP95} | ${deltaStr} | ${pctStr} | ${verdictIcon} |`,
      );
    }
    lines.push('');
    lines.push('_Verdict: regression = p95 >+20% ÉN >+200ms · watch = p95 >+10%._');
  }
}
lines.push('');

// 4c. Per-question_type breakdown — toont waar adversarial categorieën zwak zijn
lines.push('## Per-question_type breakdown');
lines.push('');
const allTypes = new Set<string>();
for (const q of questions) {
  const t = (q.question_type as string | null) ?? 'factual';
  allTypes.add(t);
}
const typeList = [...allTypes].sort();
lines.push('| question_type | versie | n | C | P | G | overall | violations |');
lines.push('|---------------|--------|---|---|---|---|---------|------------|');
for (const qt of typeList) {
  const qIdsForType = new Set(
    questions.filter((q) => ((q.question_type as string | null) ?? 'factual') === qt).map((q) => q.id as string),
  );
  for (const v of versionsForHeader) {
    const rows = latestRuns.filter((r) => qIdsForType.has(r.question_id as string) && r.bot_version === v);
    if (rows.length === 0) continue;
    const c = avgOf(rows, (r) => r.score_correctness);
    const p = avgOf(rows, (r) => r.score_completeness);
    const g = avgOf(rows, (r) => r.score_grounding);
    const all = [c, p, g].filter((n): n is number => n !== null);
    const overall = all.length === 0 ? null : all.reduce((a, b) => a + b, 0) / all.length;
    const vios = rows.filter((r) => r.must_not_violation).length;
    lines.push(`| ${qt} | ${v} | ${rows.length} | ${fmt(c)} | ${fmt(p)} | ${fmt(g)} | **${fmt(overall)}** | ${vios > 0 ? `🚨 ${vios}` : '0'} |`);
  }
}
lines.push('');

// 4e. Retrieval metrics per versie
lines.push('## Retrieval metrics (waar ideal_source_filenames is opgegeven)');
lines.push('');
lines.push('| versie | n_met_ideal | recall@k (avg) | MRR (avg) |');
lines.push('|--------|-------------|----------------|-----------|');
for (const v of versionsForHeader) {
  const rows = latestRuns.filter((r) => r.bot_version === v && r.retrieval_recall_at_k !== null);
  if (rows.length === 0) {
    lines.push(`| ${v} | 0 | — | — |`);
    continue;
  }
  const recall = avgOf(rows, (r) => Number(r.retrieval_recall_at_k));
  const mrr = avgOf(rows, (r) => Number(r.retrieval_mrr));
  lines.push(`| ${v} | ${rows.length} | ${fmt(recall, 3)} | ${fmt(mrr, 3)} |`);
}
lines.push('');

// 4f. Budget check — per-versie targets vs werkelijkheid
lines.push('## Budget check (per-versie targets uit bots.ts)');
lines.push('');
lines.push('| versie | latency target | latency avg | latency status | cost target | cost avg | cost status |');
lines.push('|--------|----------------|-------------|----------------|-------------|----------|-------------|');
for (const v of versionsForHeader) {
  const bot = (v in BOTS) ? resolveBot(v) : null;
  if (!bot) {
    lines.push(`| ${v} | — | — | (onbekende versie) | — | — | — |`);
    continue;
  }
  const rows = latestRuns.filter((r) => r.bot_version === v);
  if (rows.length === 0) continue;
  const avgLatency = rows.reduce((s, r) => s + Number(r.bot_latency_ms ?? 0), 0) / rows.length;
  const avgCost = rows.reduce((s, r) => s + Number(r.bot_cost_usd ?? 0), 0) / rows.length;
  const latencyOk = avgLatency <= bot.evalBudgetMs;
  const costOk = avgCost <= bot.evalBudgetUsd;
  lines.push(
    `| ${v} | ${bot.evalBudgetMs}ms | ${avgLatency.toFixed(0)}ms | ${latencyOk ? '✅' : '⚠'} | $${bot.evalBudgetUsd.toFixed(4)} | $${avgCost.toFixed(4)} | ${costOk ? '✅' : '⚠'} |`,
  );
}
lines.push('');

// ===========================================================================
// v0.8 FASE 1.1 — Noise-floor (multi-run variance). Per versie × metric:
// mean / std / SE / 95%-CI over ALLE samples (cases × runs) uit
// allLatestVariance, plus n_cases en n_runs. De CI-breedte is de "noise-band":
// een delta tussen versies telt pas als signaal als de CI's niet overlappen
// (zie deltaVerdict + spec 1.1).
// ===========================================================================
type NoiseMetric = { key: string; label: string; pick: (r: RunRow) => number | null };
const NOISE_METRICS: NoiseMetric[] = [
  { key: 'correctness', label: 'correctness (0-5)', pick: (r) => r.score_correctness as number | null },
  { key: 'completeness', label: 'completeness (0-5)', pick: (r) => r.score_completeness as number | null },
  { key: 'grounding', label: 'grounding (0-5)', pick: (r) => r.score_grounding as number | null },
  { key: 'production_ready', label: 'production-ready rate', pick: (r) => r.production_ready === null || r.production_ready === undefined ? null : (r.production_ready ? 1 : 0) },
  { key: 'route_correct', label: 'route-correct rate', pick: (r) => r.score_route_correct === null || r.score_route_correct === undefined ? null : (r.score_route_correct ? 1 : 0) },
  { key: 'meta_talk', label: 'meta-talk rate', pick: (r) => r.score_meta_talk_present === null || r.score_meta_talk_present === undefined ? null : (r.score_meta_talk_present ? 1 : 0) },
  { key: 'must_not', label: 'must-not rate', pick: (r) => (r.must_not_violation ? 1 : 0) },
  { key: 'unsupported_hard_fact', label: 'unsupported-hard-fact rate', pick: (r) => r.hard_fact_status == null ? null : (r.hard_fact_status === 'unsupported' ? 1 : 0) },
];

lines.push('## v0.8 — Noise-floor (multi-run variance)');
lines.push('');
lines.push('Per versie × metric over alle samples (cases × runs). 95%-CI = noise-band; een versie-delta telt pas als signaal als de CI’s niet overlappen én de bucket voldoende n heeft (spec 1.1).');
lines.push('');
lines.push('| versie | metric | n (samples) | n_cases | mean | std | SE | 95% CI | small-n |');
lines.push('|--------|--------|-------------|---------|------|-----|-----|--------|---------|');
const noiseStatsByVersionMetric = new Map<string, Stats>();
for (const v of versionsForHeader) {
  const vRows = allLatestVariance.filter((r) => r.bot_version === v);
  const nCases = new Set(vRows.map((r) => r.question_id as string)).size;
  const nRuns = vRows.length === 0 ? 0 : Math.max(...vRows.map((r) => (r.run_index ?? 0))) + 1;
  for (const m of NOISE_METRICS) {
    const vals = vRows.map(m.pick).filter((x): x is number => x !== null && Number.isFinite(x));
    const s = computeStats(vals);
    noiseStatsByVersionMetric.set(`${v}::${m.key}`, s);
    const ci = s.ci95Lo === null ? '—' : `[${fmt(s.ci95Lo, 3)}, ${fmt(s.ci95Hi, 3)}]`;
    lines.push(`| ${v} | ${m.label} | ${s.n} | ${nCases} | ${fmt(s.mean, 3)} | ${fmt(s.std, 3)} | ${fmt(s.se, 3)} | ${ci} | ${smallNLabel(nCases)} (n_runs=${nRuns}) |`);
  }
}
lines.push('');

// Delta-verdict tussen de twee kandidaat-versies (indien beide aanwezig) —
// CI-overlap-check per metric.
const candidatesPresent = EVAL_DEFAULT_VERSIONS.filter((v) => versionsForHeader.includes(v));
if (candidatesPresent.length === 2) {
  const [vA, vB] = candidatesPresent;
  lines.push(`### Delta-verdict ${vA} → ${vB} (CI-overlap)`);
  lines.push('');
  lines.push('| metric | ' + vA + ' mean | ' + vB + ' mean | Δ | verdict |');
  lines.push('|--------|------------|------------|---|---------|');
  for (const m of NOISE_METRICS) {
    const sA = noiseStatsByVersionMetric.get(`${vA}::${m.key}`);
    const sB = noiseStatsByVersionMetric.get(`${vB}::${m.key}`);
    if (!sA || !sB || sA.mean === null || sB.mean === null) continue;
    const delta = sB.mean - sA.mean;
    lines.push(`| ${m.label} | ${fmt(sA.mean, 3)} | ${fmt(sB.mean, 3)} | ${delta >= 0 ? '+' : ''}${fmt(delta, 3)} | ${deltaVerdict(sA, sB)} |`);
  }
  lines.push('');
}

// ===========================================================================
// v0.8 FASE 1.2 — Hard-fact support. Unsupported hard facts (= hallucinatie-
// risico op prijzen/datums/aantallen) overall, per question_type, per versie,
// + slug-lijst. unknown-op-risk-case = warning (nooit auto-PASS).
// ===========================================================================
const RISK_QUESTION_TYPES = new Set(['factual', 'planted_fact', 'false_premise', 'multi_hop']);
function qTypeOf(qid: string): string {
  const q = qById.get(qid);
  return ((q?.question_type as string | null) ?? 'factual');
}
lines.push('## v0.8 — Hard-fact support');
lines.push('');
lines.push('`unsupported` = bot noemde een hard feit dat niet in de sources staat (hallucinatie-risico). `unknown` = verifier draaide niet (fallback/smalltalk/error) terwijl de output wél harde feiten bevatte — op een risk-case telt dit als warning, **nooit** auto-PASS. `none_detected` = geen harde feiten. Snapshot = run_index 0.');
lines.push('');
lines.push('| versie | n | none_detected | supported | unsupported | unknown | unsupported-rate | unknown-on-risk |');
lines.push('|--------|---|---------------|-----------|-------------|---------|------------------|-----------------|');
const hardFactGateByVersion = new Map<string, { unsupported: number; unknownOnRisk: number }>();
for (const v of versionsForHeader) {
  const vRows = latestRuns.filter((r) => r.bot_version === v);
  if (vRows.length === 0) continue;
  const withStatus = vRows.filter((r) => r.hard_fact_status != null);
  const none = withStatus.filter((r) => r.hard_fact_status === 'none_detected').length;
  const sup = withStatus.filter((r) => r.hard_fact_status === 'supported').length;
  const unsup = withStatus.filter((r) => r.hard_fact_status === 'unsupported').length;
  const unk = withStatus.filter((r) => r.hard_fact_status === 'unknown').length;
  const unkOnRisk = withStatus.filter((r) => r.hard_fact_status === 'unknown' && RISK_QUESTION_TYPES.has(qTypeOf(r.question_id as string))).length;
  const unsupRate = withStatus.length === 0 ? '—' : `${Math.round((unsup / withStatus.length) * 100)}%`;
  hardFactGateByVersion.set(v, { unsupported: unsup, unknownOnRisk: unkOnRisk });
  lines.push(`| ${v} | ${withStatus.length} | ${none} | ${sup} | ${unsup} | ${unk} | ${unsupRate} | ${unkOnRisk} |`);
}
lines.push('');
// Slug-lijst van unsupported hard facts (per versie) — directe diagnose.
for (const v of versionsForHeader) {
  const unsupRows = latestRuns.filter((r) => r.bot_version === v && r.hard_fact_status === 'unsupported');
  if (unsupRows.length === 0) continue;
  lines.push(`**${v} — unsupported hard facts (${unsupRows.length}):**`);
  for (const r of unsupRows) {
    const q = qById.get(r.question_id as string);
    const missing = Array.isArray(r.missing_hard_facts) ? (r.missing_hard_facts as string[]).join(', ') : '—';
    lines.push(`- _${q?.slug ?? '?'}_ (${qTypeOf(r.question_id as string)}): missing ${missing}`);
  }
  lines.push('');
}
// Per question_type × versie — unsupported-rate.
lines.push('### Hard-fact-status per question_type × versie');
lines.push('');
lines.push('| question_type | versie | n_met_status | unsupported | unknown | unsupported-rate |');
lines.push('|---------------|--------|--------------|-------------|---------|------------------|');
for (const qt of [...allTypesForHardFact()].sort()) {
  for (const v of versionsForHeader) {
    const rows = latestRuns.filter((r) => r.bot_version === v && qTypeOf(r.question_id as string) === qt && r.hard_fact_status != null);
    if (rows.length === 0) continue;
    const unsup = rows.filter((r) => r.hard_fact_status === 'unsupported').length;
    const unk = rows.filter((r) => r.hard_fact_status === 'unknown').length;
    lines.push(`| ${qt} | ${v} | ${rows.length} | ${unsup} | ${unk} | ${Math.round((unsup / rows.length) * 100)}% |`);
  }
}
lines.push('');
function allTypesForHardFact(): Set<string> {
  const s = new Set<string>();
  for (const q of questions) s.add(((q.question_type as string | null) ?? 'factual'));
  return s;
}

// ===========================================================================
// v0.8 FASE 1.4 — Pairwise per question_type (primair relatief signaal).
// ===========================================================================
lines.push('## v0.8 — Pairwise win-rate per question_type');
lines.push('');
const pwAllForType = pairwiseRows ?? [];
if (pwAllForType.length === 0) {
  lines.push('_Geen pairwise rijen._');
} else {
  type PwRow2 = NonNullable<typeof pairwiseRows>[number];
  const pwLatest2 = new Map<string, PwRow2>();
  for (const r of pwAllForType) {
    const k = `${r.organization_id}::${r.question_id}::${r.bot_version_a}::${r.bot_version_b}`;
    if (!pwLatest2.has(k)) pwLatest2.set(k, r);
  }
  const pwRecent2 = [...pwLatest2.values()];
  const versionPairs2 = [...new Set(pwRecent2.map((r) => `${r.bot_version_a}::${r.bot_version_b}`))].sort();
  for (const pair of versionPairs2) {
    const [vA, vB] = pair.split('::');
    lines.push(`### ${vA} vs ${vB} — per question_type`);
    lines.push('');
    lines.push('| question_type | n | A wint | tie | B wint | winrate A | small-n |');
    lines.push('|---------------|---|--------|-----|--------|-----------|---------|');
    const types = [...new Set(pwRecent2.map((r) => qTypeOf(r.question_id as string)))].sort();
    for (const qt of types) {
      const rows = pwRecent2.filter((r) => r.bot_version_a === vA && r.bot_version_b === vB && qTypeOf(r.question_id as string) === qt);
      if (rows.length === 0) continue;
      const n = rows.length;
      const wA = rows.filter((r) => r.winner === 'A').length;
      const wB = rows.filter((r) => r.winner === 'B').length;
      const ties = rows.filter((r) => r.winner === 'tie').length;
      lines.push(`| ${qt} | ${n} | ${wA} | ${ties} | ${wB} | ${Math.round((wA / n) * 100)}% | ${smallNLabel(n)} |`);
    }
    lines.push('');
  }
}

// 4g. V0.7 — Productie-drempel-gate. Per versie: passeert alle drempels?
// Niet alleen averages — ook p95 latency, hallucinatie-rate, etc.
// Bij faal: exit-code 1. Drempels staan in PRODUCTION_THRESHOLDS bovenaan
// het bestand — STARTWAARDEN; kalibreer na 2-3 echte runs.
lines.push('## V0.7 — Productie-drempel-gate (klant-bereidheid)');
lines.push('');
lines.push('Per versie: passeert deze de minimale drempels om naar betalende klanten te gaan?');
lines.push('');
lines.push(`> ℹ️ **Gate-scope**: alleen kandidaat-versies (\`EVAL_DEFAULT_VERSIONS\` = ${EVAL_DEFAULT_VERSIONS.join(', ')}) triggeren exit-code 1. Historische versies worden voor referentie getoond maar blokkeren de report-run niet.`);
lines.push('');

type ThresholdCheck = {
  label: string;
  actual: string;
  target: string;
  pass: boolean;
};

function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length));
  return sorted[idx];
}

let anyVersionFailed = false;
for (const v of versionsForHeader) {
  const vRows = latestRuns.filter((r) => r.bot_version === v);
  if (vRows.length === 0) continue;

  const checks: ThresholdCheck[] = [];
  const T = PRODUCTION_THRESHOLDS;

  // Aggregates
  const avgC = avgOf(vRows, (r) => r.score_correctness);
  const zeroC = vRows.filter((r) => r.score_correctness === 0).length / vRows.length;
  const avgP = avgOf(vRows, (r) => r.score_completeness);
  const avgG = avgOf(vRows, (r) => r.score_grounding);
  const prRows = vRows.filter((r) => r.production_ready !== null);
  const prRate = prRows.length === 0 ? null
    : prRows.filter((r) => r.production_ready === true).length / prRows.length;
  const lenRows = vRows.filter((r) => r.answer_length_appropriate !== null);
  const lenRate = lenRows.length === 0 ? null
    : lenRows.filter((r) => r.answer_length_appropriate === 'right_length').length / lenRows.length;
  const citationRows = vRows.filter((r) => r.source_citation_binding !== null);
  const citationRate = citationRows.length === 0 ? null
    : citationRows.filter((r) => r.source_citation_binding === true).length / citationRows.length;
  const avgTone = avgOf(vRows, (r) => r.score_tone_match as number | null);
  const routeRows = vRows.filter((r) => r.score_route_correct !== null);
  const routeRate = routeRows.length === 0 ? null
    : routeRows.filter((r) => r.score_route_correct === true).length / routeRows.length;
  const metaRows = vRows.filter((r) => r.score_meta_talk_present !== null);
  const metaRate = metaRows.length === 0 ? null
    : metaRows.filter((r) => r.score_meta_talk_present === true).length / metaRows.length;
  const recallRows = vRows.filter((r) => r.retrieval_recall_at_k !== null);
  const avgRecall = avgOf(recallRows, (r) => Number(r.retrieval_recall_at_k));
  const mrrRows = vRows.filter((r) => r.retrieval_mrr !== null);
  const avgMrr = avgOf(mrrRows, (r) => Number(r.retrieval_mrr));
  const totalMsValues: number[] = [];
  const firstTokenMsValues: number[] = [];
  for (const r of vRows) {
    const st = parseStageTimings(r.stage_timings_ms);
    if (st?.total_ms !== undefined) totalMsValues.push(st.total_ms);
    if (st?.first_token_ms !== undefined) firstTokenMsValues.push(st.first_token_ms);
  }
  const p95Total = p95(totalMsValues);
  const p95FirstToken = p95(firstTokenMsValues);
  const violations = vRows.filter((r) => r.must_not_violation === true).length;

  // Build checks. Skip checks waar de actual NULL is (geen data) — anders
  // faalt elke versie zonder pairwise/persona-rijen automatisch.
  function addCheck(label: string, actual: number | null, target: number, op: '>=' | '<=' | '=='): void {
    if (actual === null) {
      checks.push({ label, actual: '—', target: `${op}${target}`, pass: true /* skip */ });
      return;
    }
    const pass = op === '>=' ? actual >= target : op === '<=' ? actual <= target : actual === target;
    // p95 latencies en p95 first_token zijn ms (toFixed(0)); andere zijn
    // rates of averages (toFixed(2)). Heuristiek op label is robuuster dan
    // op de waarde zelf.
    const isMs = label.includes('p95');
    const fmtA = isMs ? actual.toFixed(0) : actual.toFixed(2);
    checks.push({ label, actual: fmtA, target: `${op}${target}`, pass });
  }

  addCheck('avg correctness', avgC, T.minAvgCorrectness, '>=');
  addCheck('zero-correctness rate', zeroC, T.maxZeroCorrectnessRate, '<=');
  addCheck('avg completeness', avgP, T.minAvgCompleteness, '>=');
  addCheck('avg grounding', avgG, T.minAvgGrounding, '>=');
  addCheck('production-ready rate', prRate, T.minProductionReadyRate, '>=');
  addCheck('right-length rate', lenRate, T.minRightLengthRate, '>=');
  addCheck('source-citation rate', citationRate, T.minSourceCitationBindingRate, '>=');
  addCheck('avg tone-match', avgTone, T.minAvgToneMatch, '>=');
  addCheck('route-correct rate', routeRate, T.minRouteCorrectRate, '>=');
  addCheck('meta-talk rate', metaRate, T.maxMetaTalkRate, '<=');
  addCheck('avg recall@k', avgRecall, T.minAvgRecallAtK, '>=');
  addCheck('avg MRR', avgMrr, T.minAvgMrr, '>=');
  addCheck('p95 total_ms', p95Total, T.maxP95TotalMs, '<=');
  addCheck('p95 first_token_ms', p95FirstToken, T.maxP95FirstTokenMs, '<=');
  // Must-not violations hardgrens (=0): aparte check omdat het integer is.
  checks.push({
    label: 'must-not violations',
    actual: String(violations),
    target: '=0',
    pass: violations === 0,
  });
  // v0.8 — binaire hard-fact gate. unsupported = bot noemde een hard feit dat
  // niet in de sources staat = hallucinatie op een hard-fact-risk case.
  // Hardgrens =0; mag NOOIT versoepeld worden (safety gate).
  const hfGate = hardFactGateByVersion.get(v) ?? { unsupported: 0, unknownOnRisk: 0 };
  checks.push({
    label: 'unsupported hard facts',
    actual: String(hfGate.unsupported),
    target: '=0',
    pass: hfGate.unsupported === 0,
  });
  // unknown-op-risk: warning (telt nooit als auto-PASS maar blokkeert de gate
  // niet — kan legitiem fallback zijn). Zichtbaar zodat het niet wegvalt.
  checks.push({
    label: 'unknown hard-fact on risk-case (warn)',
    actual: String(hfGate.unknownOnRisk),
    target: 'warn',
    pass: true,
  });

  const failed = checks.filter((c) => !c.pass && c.actual !== '—');
  // Alleen kandidaat-versies (EVAL_DEFAULT_VERSIONS) triggeren exit-1.
  // Historische versies tonen we voor referentie maar blokkeren niet —
  // anders zou een report-run op een DB met oude failing v0.5-rows altijd
  // exit-1 geven, ook al gaat de PR alleen over v0.7.
  const isCandidate = EVAL_DEFAULT_VERSIONS.includes(v);
  if (failed.length > 0 && isCandidate) anyVersionFailed = true;
  const candidateTag = isCandidate ? '🎯 kandidaat — ' : '📜 historisch — ';
  const verdict = failed.length === 0
    ? '✅ PRODUCTIE-KLAAR'
    : isCandidate
      ? `❌ FAALT op ${failed.length} drempel(s)`
      : `⚠ ${failed.length} drempel(s) ge-mist (alleen referentie)`;

  lines.push(`### ${v} — ${candidateTag}${verdict} (n=${vRows.length})`);
  lines.push('');
  lines.push('| drempel | actual | target | status |');
  lines.push('|---------|--------|--------|--------|');
  for (const c of checks) {
    const status = c.actual === '—' ? '— (geen data)' : c.pass ? '✓' : '✗';
    lines.push(`| ${c.label} | ${c.actual} | ${c.target} | ${status} |`);
  }
  lines.push('');
}

lines.push('_Drempels zijn STARTWAARDEN (zie `PRODUCTION_THRESHOLDS` in `scripts/v0-eval-report.ts`). Kalibreer na 2-3 echte multi-org runs._');
lines.push('');

// ===========================================================================
// v0.8 FASE 1.5 — Threshold-herijkings-voorstel (geen greenwashing).
// recommended_min = max(safety_floor, baseline_mean − noise_margin), waar
// noise_margin de gemeten 95%-CI-halfbreedte is. Aspirational = de huidige
// drempel ligt buiten de gemeten noise-band (waarschijnlijk te streng).
// Binaire safety-gates (must-not, unsupported hard fact, planted_fact) blijven
// HARD en worden hier NIET voorgesteld te verlagen.
// ===========================================================================
const proposalVersion = [...EVAL_DEFAULT_VERSIONS].reverse().find((v) => versionsForHeader.includes(v)) ?? versionsForHeader[versionsForHeader.length - 1];
lines.push('## v0.8 — Threshold-herijkings-voorstel');
lines.push('');
if (!proposalVersion) {
  lines.push('_Geen versie beschikbaar voor een voorstel._');
} else {
  lines.push(`Baseline-versie voor het voorstel: **${proposalVersion}**. Formule: \`recommended = max(safety_floor, baseline_95%CI-ondergrens)\` voor min-drempels; \`min(safety_ceiling, 95%CI-bovengrens)\` voor max-drempels. **Pas waarden alleen toe als veilig + transparant.**`);
  lines.push('');
  type ThProposal = { label: string; current: number; metricKey: string; dir: 'min' | 'max'; floor: number };
  const proposals: ThProposal[] = [
    { label: 'minAvgCorrectness', current: PRODUCTION_THRESHOLDS.minAvgCorrectness, metricKey: 'correctness', dir: 'min', floor: 3.0 },
    { label: 'minAvgCompleteness', current: PRODUCTION_THRESHOLDS.minAvgCompleteness, metricKey: 'completeness', dir: 'min', floor: 2.5 },
    { label: 'minAvgGrounding', current: PRODUCTION_THRESHOLDS.minAvgGrounding, metricKey: 'grounding', dir: 'min', floor: 3.0 },
    { label: 'minProductionReadyRate', current: PRODUCTION_THRESHOLDS.minProductionReadyRate, metricKey: 'production_ready', dir: 'min', floor: 0.50 },
    { label: 'minRouteCorrectRate', current: PRODUCTION_THRESHOLDS.minRouteCorrectRate, metricKey: 'route_correct', dir: 'min', floor: 0.70 },
    { label: 'maxMetaTalkRate', current: PRODUCTION_THRESHOLDS.maxMetaTalkRate, metricKey: 'meta_talk', dir: 'max', floor: 0.20 },
  ];
  lines.push('| drempel | huidig | baseline mean | 95% CI | recommended | aspirational? |');
  lines.push('|---------|--------|---------------|--------|-------------|---------------|');
  for (const p of proposals) {
    const s = noiseStatsByVersionMetric.get(`${proposalVersion}::${p.metricKey}`);
    if (!s || s.mean === null || s.ci95Lo === null || s.ci95Hi === null) {
      lines.push(`| ${p.label} | ${p.current} | — | — | (geen data) | — |`);
      continue;
    }
    const ci = `[${fmt(s.ci95Lo, 3)}, ${fmt(s.ci95Hi, 3)}]`;
    let recommended: number;
    let aspirational: boolean;
    if (p.dir === 'min') {
      recommended = Math.max(p.floor, Math.round(s.ci95Lo * 100) / 100);
      aspirational = p.current > s.ci95Hi; // drempel boven de noise-band = te streng
    } else {
      recommended = Math.min(p.floor, Math.round(s.ci95Hi * 100) / 100);
      aspirational = p.current < s.ci95Lo; // drempel onder de noise-band = te streng
    }
    lines.push(`| ${p.label} | ${p.current} | ${fmt(s.mean, 3)} | ${ci} | ${fmt(recommended, 2)} | ${aspirational ? '⚠ ja (buiten noise-band)' : 'nee'} |`);
  }
  lines.push('');
  lines.push('**HARD — niet verlagen (binaire safety-gates):** `must-not violations` (=0), `unsupported hard facts` (=0), planted_fact-meebewegen. Deze blijven ongewijzigd ongeacht baseline.');
  lines.push('');
}

// (Multi-run variance sectie weggehaald — was alleen relevant bij --runs > 1
// en gaf in de praktijk een lege/ruisige tabel. Multi-run data blijft wel in
// de CSV voor handmatige spreadsheet-analyse.)

// 4b. Per-vraag detail
lines.push('## Per-vraag detail');
lines.push('');
for (const q of questions) {
  const slug = q.slug as string;
  const text = q.question as string;
  const diff = q.difficulty as string;
  const tags = (q.tags as string[]).join(', ');
  const qOrg = orgSlug(q.organization_id as string | null);
  lines.push(`### [${qOrg}] ${slug}`);
  lines.push('');
  lines.push(`**Vraag:** ${text}`);
  lines.push(`**Difficulty:** ${diff} · **Tags:** ${tags || '—'} · **Org:** ${qOrg}`);
  lines.push('');
  lines.push(`**Gold answer:** ${q.gold_answer}`);
  if ((q.gold_facts as string[]).length > 0) {
    lines.push('');
    lines.push('**Gold facts:**');
    for (const f of q.gold_facts as string[]) lines.push(`- ${f}`);
  }
  lines.push('');
  lines.push('| versie | hyde_mode | C | P | G | kind | violation | bot ms | bot $ |');
  lines.push('|--------|-----------|---|---|---|------|-----------|--------|-------|');
  for (const pair of versionModePairs) {
    const [v, mode] = pair.split('::');
    const r = latestRuns.find(
      (row) => row.question_id === q.id && row.bot_version === v && modeKey(row) === mode,
    );
    if (!r) {
      lines.push(`| ${v} | ${mode} | — | — | — | — | — | — | — |`);
      continue;
    }
    const vio = r.must_not_violation ? '🚨' : '';
    lines.push(
      `| ${v} | ${mode} | ${fmtScore(r.score_correctness)} | ${fmtScore(r.score_completeness)} | ${fmtScore(r.score_grounding)} | ${r.bot_kind} | ${vio} | ${r.bot_latency_ms} | $${Number(r.bot_cost_usd ?? 0).toFixed(4)} |`,
    );
  }
  lines.push('');

  // Antwoorden + judge reasoning per (versie × mode) — collapsible voor leesbaarheid.
  for (const pair of versionModePairs) {
    const [v, mode] = pair.split('::');
    const r = latestRuns.find(
      (row) => row.question_id === q.id && row.bot_version === v && modeKey(row) === mode,
    );
    if (!r) continue;
    lines.push(`<details><summary>${v} (hyde=${mode}) — bot answer + judge reasoning</summary>`);
    lines.push('');
    lines.push(`**Bot answer (${r.bot_kind}):**`);
    lines.push('');
    lines.push('> ' + (r.bot_answer as string).replace(/\n/g, '\n> '));
    lines.push('');
    lines.push(`**Judge reasoning${r.judge_parse_error ? ' (⚠ parse error)' : ''}:** ${r.judge_reasoning ?? '—'}`);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }
}

// ---------------------------------------------------------------------------
// 5. CSV (machine-leesbaar voor spreadsheet-analyse)
// ---------------------------------------------------------------------------
const csvLines: string[] = [];
// 13 per-stage kolommen (migration 0019) — volgorde matcht STAGE_KEYS in
// eval-latency-stats.ts, gelijk aan PhaseTimings declaratie in rag.ts.
const stageCsvHeaders = STAGE_KEYS.join(',');
csvLines.push(
  `slug,org_slug,difficulty,question_type,bot_version,hyde_mode_actual,hyde_mode_requested,run_index,correctness,completeness,grounding,route_correct,meta_talk_present,production_ready,answer_length_appropriate,source_citation_binding,score_tone_match,recall_at_k,mrr,must_not_violation,bot_kind,bot_latency_ms,bot_cost_usd,judge_cost_usd,judge_parse_error,${stageCsvHeaders}`,
);
// CSV gebruikt allLatestVariance zodat multi-run rows allemaal in spreadsheet
// belanden voor variance-analyse, niet alleen run_index=0.
for (const q of questions) {
  const qType = (q.question_type as string | null) ?? 'factual';
  for (const r of allLatestVariance) {
    if (r.question_id !== q.id) continue;
    const stages = parseStageTimings(r.stage_timings_ms);
    const stageCells = STAGE_KEYS.map((k) => {
      const v = stages?.[k];
      return typeof v === 'number' ? String(v) : '';
    });
    csvLines.push(
      [
        q.slug,
        orgSlug(q.organization_id as string | null),
        q.difficulty,
        qType,
        r.bot_version,
        modeKey(r),
        (r.hyde_mode_requested as string | null) ?? '',
        r.run_index ?? 0,
        r.score_correctness ?? '',
        r.score_completeness ?? '',
        r.score_grounding ?? '',
        r.score_route_correct === null || r.score_route_correct === undefined ? '' : (r.score_route_correct ? 'true' : 'false'),
        r.score_meta_talk_present === null || r.score_meta_talk_present === undefined ? '' : (r.score_meta_talk_present ? 'true' : 'false'),
        r.production_ready === null || r.production_ready === undefined ? '' : (r.production_ready ? 'true' : 'false'),
        (r.answer_length_appropriate as string | null) ?? '',
        r.source_citation_binding === null || r.source_citation_binding === undefined ? '' : (r.source_citation_binding ? 'true' : 'false'),
        r.score_tone_match ?? '',
        r.retrieval_recall_at_k ?? '',
        r.retrieval_mrr ?? '',
        r.must_not_violation ? 'true' : 'false',
        r.bot_kind,
        r.bot_latency_ms,
        Number(r.bot_cost_usd ?? 0).toFixed(6),
        Number(r.judge_cost_usd ?? 0).toFixed(6),
        r.judge_parse_error ? 'true' : 'false',
        ...stageCells,
      ].join(','),
    );
  }
}

// ---------------------------------------------------------------------------
// 6. Schrijf bestanden
// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const mdPath = resolve(OUT_DIR, `eval-${stamp}.md`);
const csvPath = resolve(OUT_DIR, `eval-${stamp}.csv`);
writeFileSync(mdPath, lines.join('\n'), 'utf8');
writeFileSync(csvPath, csvLines.join('\n'), 'utf8');

console.log(`✓ Markdown : ${mdPath}`);
console.log(`✓ CSV      : ${csvPath}`);
console.log('');
console.log('Samenvatting:');
for (const pair of versionModePairs) {
  const [v, mode] = pair.split('::');
  const vRows = latestRuns.filter((r) => r.bot_version === v && modeKey(r) === mode);
  const c = avgOf(vRows, (r) => r.score_correctness);
  const p = avgOf(vRows, (r) => r.score_completeness);
  const g = avgOf(vRows, (r) => r.score_grounding);
  const all = [c, p, g].filter((n): n is number => n !== null);
  const overall = all.length === 0 ? null : all.reduce((a, b) => a + b, 0) / all.length;
  console.log(
    `  ${v.padEnd(7)} ${mode.padEnd(11)}  C=${fmt(c)}  P=${fmt(p)}  G=${fmt(g)}  →  ${fmt(overall)}/5  (n=${vRows.length})`,
  );
}

// V0.7 — productie-drempel-gate: exit-code 1 als een KANDIDAAT-versie
// (EVAL_DEFAULT_VERSIONS) faalt op de drempels. Zo wordt het rapport CI-
// achtig: een PR die regressies introduceert faalt de eval-step. Oude
// historische versies blokkeren niet — anders zou een DB met oude failing
// v0.5-rows altijd exit-1 geven, ook bij PR's die alleen v0.7 raken.
if (anyVersionFailed) {
  console.log('');
  console.log(`⚠ Eén of meer KANDIDAAT-versies (${EVAL_DEFAULT_VERSIONS.join(', ')}) falen productie-drempels.`);
  console.log('  Zie sectie "V0.7 — Productie-drempel-gate" in het rapport.');
  console.log('  Exit-code 1.');
  process.exit(1);
} // closes if(anyVersionFailed)
} // closes async function main()

main().catch((err) => {
  console.error('✗ Onverwachte fout:', err);
  process.exit(1);
});
