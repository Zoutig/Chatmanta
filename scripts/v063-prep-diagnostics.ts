// V0.6.3 prep — diagnostic queries op eval_runs.
//
// Drie analyses:
//   1.1 top1Sim distributie v0.6.2 (p25/p50/p75/p90) → threshold-realisme check
//   1.2 fast-path blocker-analyse via adaptiveDecision.reasonCodes
//   1.3 careful-pad score-vergelijking v0.5/v0.6.1/v0.6.2 op zelfde question_ids
//
// Run: node --env-file=.env.local --conditions=react-server --import tsx scripts/v063-prep-diagnostics.ts

import { createClient } from '@supabase/supabase-js';

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const sb = createClient(url!, key!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type EvalRow = {
  id: string;
  question_id: string;
  bot_version: string;
  bot_kind: string | null;
  bot_sources: Array<{ similarity?: number }> | null;
  bot_cost_usd: number | null;
  bot_latency_ms: number | null;
  score_correctness: number | null;
  score_completeness: number | null;
  score_grounding: number | null;
  stage_timings_ms: Record<string, unknown> | null;
  run_index: number | null;
  created_at: string;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function avg(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fmt(n: number, digits = 3): string {
  if (Number.isNaN(n)) return 'N/A';
  return n.toFixed(digits);
}

async function main(): Promise<void> {
  const { data, error } = await sb
    .from('eval_runs')
    .select(
      `id, question_id, bot_version, bot_kind, bot_sources,
       bot_cost_usd, bot_latency_ms,
       score_correctness, score_completeness, score_grounding,
       stage_timings_ms, run_index, created_at`,
    )
    .eq('organization_id', DEV_ORG_ID)
    .in('bot_version', ['v0.5', 'v0.6.1', 'v0.6.2'])
    .order('created_at', { ascending: false });
  if (error) fail(`eval_runs select: ${error.message}`);

  // Snapshot dedup: per (question_id × bot_version × run_index), keep newest.
  const byKey = new Map<string, EvalRow>();
  for (const r of (data ?? []) as EvalRow[]) {
    const key = `${r.question_id}::${r.bot_version}::${r.run_index ?? 0}`;
    if (!byKey.has(key)) byKey.set(key, r);
  }
  const rows = [...byKey.values()];
  console.log(`Loaded ${rows.length} dedup'd eval_runs across v0.5/v0.6.1/v0.6.2`);

  // -------------------------------------------------------------------------
  // 1.1 top1Sim distributie v0.6.2 — extract top similarity from bot_sources[0]
  // -------------------------------------------------------------------------
  const v062Rows = rows.filter((r) => r.bot_version === 'v0.6.2');
  const v062TopSims: number[] = [];
  for (const r of v062Rows) {
    const sources = r.bot_sources ?? [];
    if (sources.length === 0) continue;
    const sims = sources
      .map((s) => (typeof s.similarity === 'number' ? s.similarity : null))
      .filter((s): s is number => s !== null);
    if (sims.length === 0) continue;
    v062TopSims.push(Math.max(...sims));
  }
  v062TopSims.sort((a, b) => a - b);

  console.log('\n=== 1.1 top1Sim distributie v0.6.2 ===');
  console.log(`n = ${v062TopSims.length} (rows with at least 1 source)`);
  console.log(`min: ${fmt(v062TopSims[0])}`);
  console.log(`p10: ${fmt(percentile(v062TopSims, 0.10))}`);
  console.log(`p25: ${fmt(percentile(v062TopSims, 0.25))}`);
  console.log(`p50: ${fmt(percentile(v062TopSims, 0.50))}`);
  console.log(`p75: ${fmt(percentile(v062TopSims, 0.75))}`);
  console.log(`p90: ${fmt(percentile(v062TopSims, 0.90))}`);
  console.log(`max: ${fmt(v062TopSims[v062TopSims.length - 1])}`);
  console.log(`mean: ${fmt(avg(v062TopSims))}`);
  const STRONG = 0.62;
  const WEAK = 0.45;
  const above = v062TopSims.filter((s) => s >= STRONG).length;
  const between = v062TopSims.filter((s) => s >= WEAK && s < STRONG).length;
  const below = v062TopSims.filter((s) => s < WEAK).length;
  console.log(`\nClassificatie met huidige thresholds (strong=${STRONG}, weak=${WEAK}):`);
  console.log(`  strong (≥${STRONG}): ${above} (${((above / v062TopSims.length) * 100).toFixed(1)}%)`);
  console.log(`  medium (${WEAK}-${STRONG}): ${between} (${((between / v062TopSims.length) * 100).toFixed(1)}%)`);
  console.log(`  weak (<${WEAK}): ${below} (${((below / v062TopSims.length) * 100).toFixed(1)}%)`);

  // -------------------------------------------------------------------------
  // 1.2 fast-path blocker-analyse — count reasonCodes per path
  // -------------------------------------------------------------------------
  console.log('\n=== 1.2 fast-path blocker-analyse ===');
  const pathCounts = new Map<string, number>();
  const reasonCodesAll: string[] = [];
  const reasonCodesByPath = new Map<string, Map<string, number>>();
  let withDecision = 0;
  for (const r of v062Rows) {
    const stage = r.stage_timings_ms as Record<string, unknown> | null;
    const ad = stage?.adaptiveDecision as
      | { path?: string; reasonCodes?: string[] }
      | undefined;
    if (!ad) continue;
    withDecision++;
    const path = ad.path ?? 'unknown';
    pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);
    const codes = ad.reasonCodes ?? [];
    reasonCodesAll.push(...codes);
    let pathMap = reasonCodesByPath.get(path);
    if (!pathMap) {
      pathMap = new Map();
      reasonCodesByPath.set(path, pathMap);
    }
    for (const c of codes) {
      pathMap.set(c, (pathMap.get(c) ?? 0) + 1);
    }
  }
  console.log(`Rows met adaptiveDecision: ${withDecision} / ${v062Rows.length}`);
  console.log('\nPath distributie:');
  for (const [p, c] of [...pathCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p}: ${c}`);
  }
  console.log('\nReason codes (TOTAL, alle paden):');
  const totalCodes = new Map<string, number>();
  for (const c of reasonCodesAll) totalCodes.set(c, (totalCodes.get(c) ?? 0) + 1);
  for (const [c, n] of [...totalCodes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c}: ${n}`);
  }
  console.log('\nReason codes PER PATH:');
  for (const [p, codes] of [...reasonCodesByPath.entries()].sort()) {
    console.log(`\n  [${p}]:`);
    for (const [c, n] of [...codes.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${c}: ${n}`);
    }
  }

  // Bonus: per-path-score-mean — verifieer dat careful echt slechter scoort
  console.log('\nPath × score-gemiddelden (v0.6.2):');
  console.log(`  path     | n  | corr | comp | grnd | avg  | $/q     | ms`);
  for (const [p, _c] of [...pathCounts.entries()].sort()) {
    const rs = v062Rows.filter((r) => {
      const ad = (r.stage_timings_ms as Record<string, unknown> | null)?.adaptiveDecision as
        | { path?: string }
        | undefined;
      return ad?.path === p;
    });
    const corr = rs.map((r) => r.score_correctness ?? 0).filter((x) => x > 0);
    const comp = rs.map((r) => r.score_completeness ?? 0).filter((x) => x > 0);
    const grnd = rs.map((r) => r.score_grounding ?? 0).filter((x) => x > 0);
    const all = [...corr, ...comp, ...grnd];
    const cost = rs.map((r) => r.bot_cost_usd ?? 0).filter((x) => x > 0);
    const lat = rs.map((r) => r.bot_latency_ms ?? 0).filter((x) => x > 0);
    console.log(
      `  ${p.padEnd(8)} | ${String(rs.length).padStart(2)} | ${fmt(avg(corr), 2)} | ${fmt(avg(comp), 2)} | ${fmt(avg(grnd), 2)} | ${fmt(avg(all), 2)} | $${fmt(avg(cost), 4)} | ${Math.round(avg(lat))}`,
    );
  }

  // -------------------------------------------------------------------------
  // 1.3 careful-pad score-vergelijking v0.5/v0.6.1/v0.6.2
  // -------------------------------------------------------------------------
  console.log('\n=== 1.3 careful-cases score-vergelijking ===');
  const carefulQuestionIds = new Set<string>();
  for (const r of v062Rows) {
    const ad = (r.stage_timings_ms as Record<string, unknown> | null)?.adaptiveDecision as
      | { path?: string }
      | undefined;
    if (ad?.path === 'careful') carefulQuestionIds.add(r.question_id);
  }
  console.log(`Aantal careful-cases in v0.6.2: ${carefulQuestionIds.size}`);

  const carefulRows = rows.filter((r) => carefulQuestionIds.has(r.question_id));
  console.log(`\nPer-versie score op deze ${carefulQuestionIds.size} careful-cases:`);
  console.log(`  version  | n  | corr | comp | grnd | avg`);
  for (const v of ['v0.5', 'v0.6.1', 'v0.6.2']) {
    const rs = carefulRows.filter((r) => r.bot_version === v);
    const corr = rs.map((r) => r.score_correctness ?? 0).filter((x) => x > 0);
    const comp = rs.map((r) => r.score_completeness ?? 0).filter((x) => x > 0);
    const grnd = rs.map((r) => r.score_grounding ?? 0).filter((x) => x > 0);
    const all = [...corr, ...comp, ...grnd];
    console.log(
      `  ${v.padEnd(8)} | ${String(rs.length).padStart(2)} | ${fmt(avg(corr), 2)} | ${fmt(avg(comp), 2)} | ${fmt(avg(grnd), 2)} | ${fmt(avg(all), 2)}`,
    );
  }

  // Per-question detail — toont of careful echt slechter is dan v0.5
  console.log(`\nPer-question detail (n=${carefulQuestionIds.size} careful-cases):`);
  console.log(`  question_id (truncated) | v0.5 avg | v0.6.1 avg | v0.6.2 avg | v62-v50 delta`);
  for (const qid of carefulQuestionIds) {
    const v50 = rows.find((r) => r.question_id === qid && r.bot_version === 'v0.5');
    const v61 = rows.find((r) => r.question_id === qid && r.bot_version === 'v0.6.1');
    const v62 = rows.find((r) => r.question_id === qid && r.bot_version === 'v0.6.2');
    const avgScore = (r: EvalRow | undefined): number => {
      if (!r) return NaN;
      const xs = [r.score_correctness, r.score_completeness, r.score_grounding].filter(
        (x): x is number => typeof x === 'number' && x > 0,
      );
      return avg(xs);
    };
    const a5 = avgScore(v50);
    const a61 = avgScore(v61);
    const a62 = avgScore(v62);
    const delta = a62 - a5;
    console.log(
      `  ${qid.slice(0, 30).padEnd(30)} | ${fmt(a5, 2).padStart(8)} | ${fmt(a61, 2).padStart(10)} | ${fmt(a62, 2).padStart(10)} | ${fmt(delta, 2).padStart(13)}`,
    );
  }

  // -------------------------------------------------------------------------
  // Slot: aanbeveling threshold-tuning
  // -------------------------------------------------------------------------
  console.log('\n=== Aanbevelingen voor v0.6.3 ===');
  const p50 = percentile(v062TopSims, 0.50);
  const p75 = percentile(v062TopSims, 0.75);
  console.log(`top1Sim p50 = ${fmt(p50)}, p75 = ${fmt(p75)}`);
  console.log(`Huidige strong=${STRONG} pakt ${((above / v062TopSims.length) * 100).toFixed(0)}% van queries`);
  console.log(`Suggestie strong-threshold: ~${fmt(p75)} (=top 25%)`);
  console.log(`Suggestie weak-threshold: ~${fmt(percentile(v062TopSims, 0.20))} (=onderste 20%)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
