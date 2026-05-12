// V0 eval runner — voor elke (eval_questions × bot-versie) combinatie:
//   1. roep runRagQuery aan met die bot-config
//   2. roep de OpenAI judge (gpt-4o) aan met question/gold/bot-output
//   3. INSERT een rij in public.eval_runs
//
// Append-only: oude runs blijven staan zodat regressies zichtbaar zijn.
// Concurrency-limiet 5 om OpenAI rate-limits te vermijden zonder dat een run
// een half uur duurt.
//
// Usage:
//   npm run eval:run                    # alle versies × alle vragen
//   npm run eval:run -- --versions=v0.1,v0.3
//   npm run eval:run -- --slugs=wat-doet-chatmanta,fallback-gedrag
//   npm run eval:run -- --versions=v0.4 --hyde-mode=off       # forceer HyDE uit
//   npm run eval:run -- --versions=v0.4 --hyde-mode=upfront   # forceer upfront
//   npm run eval:run -- --versions=v0.4 --hyde-mode=selective # forceer selective

import { createClient } from '@supabase/supabase-js';
import { performance } from 'node:perf_hooks';

import { runEvalRow, withConcurrency, type EvalQuestion, type EvalRunRow } from '../lib/v0/server/eval';
import { BOTS, BOT_VERSIONS_ORDERED, resolveBot } from '../lib/v0/server/bots';
import { isHydeModeRequest, type HydeModeRequest } from '../lib/v0/server/rag';

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';
const CONCURRENCY = 5;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function parseListArg(name: string): string[] | null {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(new RegExp(`^--${name}=(.+)$`));
    if (m) return m[1].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return null;
}

function parseStringArg(name: string): string | null {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(new RegExp(`^--${name}=(.+)$`));
    if (m) return m[1].trim();
  }
  return null;
}

const versionsFilter = parseListArg('versions');
const slugsFilter = parseListArg('slugs');
const hydeModeArg = parseStringArg('hyde-mode');
const runsArg = parseStringArg('runs');
const runsCount = runsArg ? Math.max(1, Math.min(20, parseInt(runsArg, 10))) : 1;
if (runsArg && (!Number.isFinite(runsCount) || runsCount < 1)) {
  fail(`--runs moet een positief geheel getal zijn (kreeg "${runsArg}")`);
}
const hydeMode: HydeModeRequest = hydeModeArg
  ? (isHydeModeRequest(hydeModeArg)
      ? hydeModeArg
      : (fail(`Onbekende --hyde-mode: ${hydeModeArg}. Bekend: auto, off, upfront, selective.`) as never))
  : 'auto';

const versions = versionsFilter ?? BOT_VERSIONS_ORDERED;
for (const v of versions) {
  if (!(v in BOTS)) fail(`Onbekende bot-versie: ${v}. Bekend: ${BOT_VERSIONS_ORDERED.join(', ')}`);
}

// ---------------------------------------------------------------------------
// DB client
// ---------------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
if (!process.env.OPENAI_API_KEY) fail('Missing OPENAI_API_KEY');

async function main(): Promise<void> {
const sb = createClient(url!, key!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Load questions
// ---------------------------------------------------------------------------
let qBuilder = sb
  .from('eval_questions')
  .select(
    `id, slug, question, gold_answer, gold_facts, tags, difficulty,
     question_type, expected_kind, must_not_contain, ideal_source_filenames,
     conversation_history`,
  )
  .eq('organization_id', DEV_ORG_ID)
  .order('slug');

if (slugsFilter) qBuilder = qBuilder.in('slug', slugsFilter);

const { data: qRows, error: qErr } = await qBuilder;
if (qErr) fail(`eval_questions select: ${qErr.message}`);
const questions = (qRows ?? []) as EvalQuestion[];
if (questions.length === 0) {
  fail(slugsFilter
    ? `Geen vragen gevonden met slugs: ${slugsFilter.join(', ')}. Run eerst \`npm run eval:seed\`.`
    : 'Geen eval_questions in DB. Run eerst `npm run eval:seed`.');
}

// ---------------------------------------------------------------------------
// Build (question × version × runIndex) jobs
// ---------------------------------------------------------------------------
type Job = { question: EvalQuestion; botVersion: string; runIndex: number };
const jobs: Job[] = [];
for (const v of versions) {
  for (const q of questions) {
    for (let r = 0; r < runsCount; r++) {
      jobs.push({ question: q, botVersion: v, runIndex: r });
    }
  }
}

const t0 = performance.now();
console.log(`--- V0 Eval Run ---`);
console.log(`  versies      : ${versions.join(', ')}`);
console.log(`  vragen       : ${questions.length}${slugsFilter ? ` (gefilterd op slug)` : ''}`);
console.log(`  runs/cell    : ${runsCount}${runsCount > 1 ? ' (multi-run voor variance)' : ''}`);
console.log(`  jobs         : ${jobs.length}`);
console.log(`  concurrency  : ${CONCURRENCY}`);
console.log(`  hyde-mode    : ${hydeMode}${hydeMode === 'auto' ? ' (volgt bot-config)' : ' (override)'}`);
console.log('');

// ---------------------------------------------------------------------------
// Run + insert per job (one-by-one DB insert zodat partial progress
// bewaard blijft als de runner gekilld wordt).
// ---------------------------------------------------------------------------
let completed = 0;
let failed = 0;
let totalBotCost = 0;
let totalJudgeCost = 0;

const rows = await withConcurrency<Job, EvalRunRow | null>(jobs, CONCURRENCY, async (job, idx) => {
  const bot = resolveBot(job.botVersion);
  const runSuffix = runsCount > 1 ? `#${job.runIndex}` : '';
  const tag = `[${idx + 1}/${jobs.length}] ${job.question.slug}@${job.botVersion}${runSuffix}`;
  try {
    const row = await runEvalRow({
      organizationId: DEV_ORG_ID,
      question: job.question,
      bot,
      hydeMode,
      runIndex: job.runIndex,
    });
    const { error: insErr } = await sb.from('eval_runs').insert(row);
    if (insErr) {
      console.error(`  ✗ ${tag} — insert: ${insErr.message}`);
      failed++;
      return null;
    }
    completed++;
    totalBotCost += row.bot_cost_usd;
    totalJudgeCost += row.judge_cost_usd;
    const scores = `C${row.score_correctness ?? '-'}/P${row.score_completeness ?? '-'}/G${row.score_grounding ?? '-'}/I${row.score_citation ?? '-'}`;
    const flag = row.judge_parse_error ? ' ⚠judge-parse' : '';
    const violation = row.must_not_violation ? ' 🚨MUST-NOT' : '';
    const kind = row.bot_kind === 'answer' ? '' : ` [${row.bot_kind}]`;
    console.log(`  ✓ ${tag} ${scores}${kind}${flag}${violation}  bot:${row.bot_latency_ms}ms judge:${row.judge_latency_ms}ms`);
    return row;
  } catch (err) {
    console.error(`  ✗ ${tag} — ${err instanceof Error ? err.message : String(err)}`);
    failed++;
    return null;
  }
});

const totalSec = Math.round((performance.now() - t0) / 100) / 10;
const okRows = rows.filter((r): r is EvalRunRow => r !== null);

// ---------------------------------------------------------------------------
// Per-version summary
// ---------------------------------------------------------------------------
function avg(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
function fmtAvg(n: number | null): string {
  return n === null ? '  -  ' : n.toFixed(2);
}

console.log(`\n--- Summary (${totalSec}s, ${completed} ok, ${failed} failed) ---`);
console.log('  versie  | C    P    G    I    | avg  | bot $    judge $');
console.log('  --------|---------------------|------|------------------');
for (const v of versions) {
  const vRows = okRows.filter((r) => r.bot_version === v);
  if (vRows.length === 0) {
    console.log(`  ${v.padEnd(7)} | (geen succesvolle runs)`);
    continue;
  }
  const c = avg(vRows.map((r) => r.score_correctness));
  const p = avg(vRows.map((r) => r.score_completeness));
  const g = avg(vRows.map((r) => r.score_grounding));
  const i = avg(vRows.map((r) => r.score_citation));
  const all = [c, p, g, i].filter((n): n is number => n !== null);
  const overall = all.length === 0 ? null : all.reduce((a, b) => a + b, 0) / all.length;
  const bCost = vRows.reduce((s, r) => s + r.bot_cost_usd, 0);
  const jCost = vRows.reduce((s, r) => s + r.judge_cost_usd, 0);
  console.log(
    `  ${v.padEnd(7)} | ${fmtAvg(c)} ${fmtAvg(p)} ${fmtAvg(g)} ${fmtAvg(i)} | ${fmtAvg(overall)} | $${bCost.toFixed(4)}  $${jCost.toFixed(4)}`,
  );
}
console.log(`\n  totale cost: bot $${totalBotCost.toFixed(4)} + judge $${totalJudgeCost.toFixed(4)} = $${(totalBotCost + totalJudgeCost).toFixed(4)}`);

// ---------------------------------------------------------------------------
// Must-not violations — direct gele kaarten tonen, niet wachten op report
// ---------------------------------------------------------------------------
const violations = okRows.filter((r) => r.must_not_violation);
if (violations.length > 0) {
  console.log(`\n🚨 ${violations.length} must-not violation(s) gedetecteerd:`);
  for (const v of violations) {
    const q = questions.find((x) => x.id === v.question_id);
    console.log(`   ✗ ${q?.slug ?? v.question_id}@${v.bot_version} — antwoord bevatte verboden string`);
  }
} else {
  console.log(`\n✓ Geen must-not violations.`);
}

// ---------------------------------------------------------------------------
// Budget-check per versie — bot-latency en bot-cost vs evalBudget{Ms,Usd}.
// Exit-code 1 bij overschrijding zodat regressies CI-achtig zichtbaar worden.
// ---------------------------------------------------------------------------
console.log(`\n--- Budget check (per-versie targets uit bots.ts) ---`);
let budgetExceeded = false;
for (const v of versions) {
  const vRows = okRows.filter((r) => r.bot_version === v);
  if (vRows.length === 0) continue;
  const bot = resolveBot(v);
  const avgLatency = vRows.reduce((s, r) => s + r.bot_latency_ms, 0) / vRows.length;
  const avgCost = vRows.reduce((s, r) => s + r.bot_cost_usd, 0) / vRows.length;
  const latencyOk = avgLatency <= bot.evalBudgetMs;
  const costOk = avgCost <= bot.evalBudgetUsd;
  if (!latencyOk || !costOk) budgetExceeded = true;
  const latencyMark = latencyOk ? '✓' : '⚠';
  const costMark = costOk ? '✓' : '⚠';
  console.log(
    `  ${v.padEnd(7)} latency ${latencyMark} ${avgLatency.toFixed(0)}ms / ${bot.evalBudgetMs}ms   cost ${costMark} $${avgCost.toFixed(4)} / $${bot.evalBudgetUsd.toFixed(4)}`,
  );
}

if (failed > 0 || violations.length > 0 || budgetExceeded) {
  const reasons: string[] = [];
  if (failed > 0) reasons.push(`${failed} failed job(s)`);
  if (violations.length > 0) reasons.push(`${violations.length} must-not violation(s)`);
  if (budgetExceeded) reasons.push('budget overschreden');
  console.log(`\n⚠ Exit-code 1: ${reasons.join(', ')}. Eval-runs voor geslaagde jobs zijn opgeslagen.`);
  process.exit(1);
}
console.log(`\n✓ Klaar. Run \`npm run eval:report\` voor een markdown-rapport.`);
}

main().catch((err) => {
  console.error('✗ Onverwachte fout:', err);
  process.exit(1);
});
