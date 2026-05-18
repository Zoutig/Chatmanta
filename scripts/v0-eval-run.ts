// V0 eval runner — voor elke (eval_questions × bot-versie) combinatie:
//   1. roep runRagQuery aan met die bot-config tegen de juiste org
//   2. roep de OpenAI judge (gpt-4o) aan met question/gold/bot-output
//   3. INSERT een rij in public.eval_runs
//
// V0.7 eval-v2 toevoegingen:
//   - Per-Q org-routing: gebruikt q.organization_id ipv hardcoded DEV_ORG
//   - --orgs=<slugs> CLI-filter voor targeted runs
//   - Na alle absolute jobs: pairwise judge tussen de 2 EVAL_DEFAULT_VERSIONS
//     (head-to-head ranking signaal). INSERT in public.eval_pairwise_runs.
//
// Append-only: oude runs blijven staan zodat regressies zichtbaar zijn.
// Concurrency-limiet 2 om gpt-4o TPM (30k/min) niet te overschrijden.
//
// Usage:
//   npm run eval:run                                   # default: 2 nieuwste versies, alle orgs
//   npm run eval:run -- --all                          # alle versies (volledige sweep)
//   npm run eval:run -- --versions=v0.1,v0.3
//   npm run eval:run -- --orgs=acme-corp,globex-inc    # alleen specifieke org(s)
//   npm run eval:run -- --slugs=wat-doet-chatmanta
//   npm run eval:run -- --versions=v0.4 --hyde-mode=upfront

import { createClient } from '@supabase/supabase-js';
import { performance } from 'node:perf_hooks';

import {
  runEvalRow,
  runPairwiseJudge,
  withConcurrency,
  type EvalQuestion,
  type EvalRunRow,
  type PairwiseRunRow,
} from '../lib/v0/server/eval';
import { BOTS, BOT_VERSIONS_ORDERED, EVAL_DEFAULT_VERSIONS, resolveBot } from '../lib/v0/server/bots';
import { isHydeModeRequest, type HydeModeRequest } from '../lib/v0/server/rag';

const JUDGE_MODEL = 'gpt-4o';
const ORG_ID_BY_SLUG: Readonly<Record<string, string>> = Object.freeze({
  'dev-org': '00000000-0000-0000-0000-0000000000d0',
  'acme-corp': '00000000-0000-0000-0000-0000000000a1',
  'globex-inc': '00000000-0000-0000-0000-0000000000a2',
  initech: '00000000-0000-0000-0000-0000000000a3',
});

// V0.5 — verlaagd van 5 naar 2 omdat de uitgebreidere judge-prompt langere
// calls geeft, en 5 parallel vloog vroeger over gpt-4o TPM-limit van 30k/min.
const CONCURRENCY = 2;

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
const orgsFilter = parseListArg('orgs');
const hydeModeArg = parseStringArg('hyde-mode');
const runsArg = parseStringArg('runs');
const runsCount = runsArg ? Math.max(1, Math.min(20, parseInt(runsArg, 10))) : 1;
if (runsArg && (!Number.isFinite(runsCount) || runsCount < 1)) {
  fail(`--runs moet een positief geheel getal zijn (kreeg "${runsArg}")`);
}
const smokeMode = process.argv.includes('--smoke');
const allVersions = process.argv.includes('--all');
const skipPairwise = process.argv.includes('--no-pairwise');
const hydeMode: HydeModeRequest = hydeModeArg
  ? (isHydeModeRequest(hydeModeArg)
      ? hydeModeArg
      : (fail(`Onbekende --hyde-mode: ${hydeModeArg}. Bekend: auto, off, upfront, selective.`) as never))
  : 'auto';

// Default: alleen de twee nieuwste versies — bespaart ~50% judge-cost per run.
const versions = versionsFilter ?? (allVersions ? BOT_VERSIONS_ORDERED : EVAL_DEFAULT_VERSIONS);
for (const v of versions) {
  if (!(v in BOTS)) fail(`Onbekende bot-versie: ${v}. Bekend: ${BOT_VERSIONS_ORDERED.join(', ')}`);
}

// Orgs filter: vertaal slugs naar UUIDs voor de DB-query.
let orgIdsFilter: string[] | null = null;
if (orgsFilter) {
  orgIdsFilter = orgsFilter.map((slug) => {
    const id = ORG_ID_BY_SLUG[slug];
    if (!id) fail(`Onbekende org-slug: ${slug}. Bekend: ${Object.keys(ORG_ID_BY_SLUG).join(', ')}`);
    return id;
  });
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
  // Load questions — multi-org. organization_id wordt nu per-rij gebruikt.
  // ---------------------------------------------------------------------------
  let qBuilder = sb
    .from('eval_questions')
    .select(
      `id, organization_id, slug, question, gold_answer, gold_facts, tags, difficulty, category,
       question_type, expected_kind, must_not_contain, ideal_source_filenames,
       conversation_history`,
    )
    .order('slug');

  if (orgIdsFilter) qBuilder = qBuilder.in('organization_id', orgIdsFilter);
  if (slugsFilter) qBuilder = qBuilder.in('slug', slugsFilter);

  const { data: qRows, error: qErr } = await qBuilder;
  if (qErr) fail(`eval_questions select: ${qErr.message}`);
  let questions = (qRows ?? []) as EvalQuestion[];
  if (questions.length === 0) {
    fail(
      slugsFilter || orgsFilter
        ? `Geen vragen gevonden voor de opgegeven filters. Run eerst \`npm run eval:seed\`.`
        : 'Geen eval_questions in DB. Run eerst `npm run eval:seed`.',
    );
  }

  // --smoke: pak eerste vraag per question_type → snelle iteratie-set.
  if (smokeMode && !slugsFilter) {
    const seenKeys = new Set<string>();
    const smoke: EvalQuestion[] = [];
    for (const q of questions) {
      // Voor multi-org smoke: dedup op (org_id, question_type) zodat we per
      // org elk type 1x zien. Anders zou een vroeg-alphabetic org alle smoke
      // slots opeten.
      const t = q.question_type ?? 'factual';
      const k = `${q.organization_id}::${t}`;
      if (seenKeys.has(k)) continue;
      seenKeys.add(k);
      smoke.push(q);
    }
    questions = smoke;
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
  const versionsMode = versionsFilter
    ? ' (--versions filter)'
    : allVersions
      ? ' (--all sweep)'
      : ' (default: 2 nieuwste — voor volledige sweep: --all)';

  // Distincte org-IDs in deze run (voor logging).
  const distinctOrgs = Array.from(new Set(questions.map((q) => q.organization_id))).map((id) => {
    const slug = Object.entries(ORG_ID_BY_SLUG).find(([, v]) => v === id)?.[0] ?? id.slice(-4);
    return slug;
  });

  console.log(`--- V0 Eval Run ---`);
  console.log(`  versies      : ${versions.join(', ')}${versionsMode}`);
  console.log(`  orgs         : ${distinctOrgs.join(', ')}${orgsFilter ? ' (--orgs filter)' : ''}`);
  const qFilter = slugsFilter ? ' (gefilterd op slug)' : smokeMode ? ' (smoke subset)' : '';
  console.log(`  vragen       : ${questions.length}${qFilter}`);
  console.log(`  runs/cell    : ${runsCount}${runsCount > 1 ? ' (multi-run voor variance)' : ''}`);
  console.log(`  jobs         : ${jobs.length}`);
  console.log(`  concurrency  : ${CONCURRENCY}`);
  console.log(`  hyde-mode    : ${hydeMode}${hydeMode === 'auto' ? ' (volgt bot-config)' : ' (override)'}`);
  console.log(`  pairwise     : ${skipPairwise ? 'OFF (--no-pairwise)' : 'AAN tussen ' + EVAL_DEFAULT_VERSIONS.join(' vs ')}`);
  console.log('');

  // ---------------------------------------------------------------------------
  // Absolute eval: per (Q × versie) → eval_runs INSERT
  // ---------------------------------------------------------------------------
  let completed = 0;
  let failed = 0;
  let totalBotCost = 0;
  let totalJudgeCost = 0;

  // V0.7: bewaar de bot_answer-strings per (Q, versie) zodat we ze daarna
  // voor pairwise judging kunnen gebruiken zonder de bots opnieuw te runnen.
  // Key = `${question_id}::${bot_version}::${runIndex}`. Alleen runIndex=0
  // wordt gepaird (multi-run is voor variance op absolute, niet pairwise).
  const answerStash = new Map<string, string>();

  const rows = await withConcurrency<Job, EvalRunRow | null>(jobs, CONCURRENCY, async (job, idx) => {
    const bot = resolveBot(job.botVersion);
    const runSuffix = runsCount > 1 ? `#${job.runIndex}` : '';
    const tag = `[${idx + 1}/${jobs.length}] ${job.question.slug}@${job.botVersion}${runSuffix}`;
    try {
      const row = await runEvalRow({
        organizationId: job.question.organization_id,
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
      // Stash antwoord voor pairwise (alleen runIndex=0).
      if (job.runIndex === 0 && !skipPairwise) {
        answerStash.set(`${job.question.id}::${job.botVersion}::0`, row.bot_answer);
      }
      completed++;
      totalBotCost += row.bot_cost_usd;
      totalJudgeCost += row.judge_cost_usd;
      const scores = `C${row.score_correctness ?? '-'}/P${row.score_completeness ?? '-'}/G${row.score_grounding ?? '-'}`;
      const flag = row.judge_parse_error ? ' ⚠judge-parse' : '';
      const violation = row.must_not_violation ? ' 🚨MUST-NOT' : '';
      const kind = row.bot_kind === 'answer' ? '' : ` [${row.bot_kind}]`;
      const prod = row.production_ready === true ? ' ✓ship' : row.production_ready === false ? ' ✗ship' : '';
      console.log(`  ✓ ${tag} ${scores}${prod}${kind}${flag}${violation}  bot:${row.bot_latency_ms}ms judge:${row.judge_latency_ms}ms`);
      return row;
    } catch (err) {
      console.error(`  ✗ ${tag} — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
      return null;
    }
  });

  const absoluteSec = Math.round((performance.now() - t0) / 100) / 10;
  const okRows = rows.filter((r): r is EvalRunRow => r !== null);

  // ---------------------------------------------------------------------------
  // V0.7 Pairwise judging — tussen de 2 EVAL_DEFAULT_VERSIONS. Slaat over
  // als er minder dan 2 default-versies in de run zaten.
  // ---------------------------------------------------------------------------
  let pairwiseRows: PairwiseRunRow[] = [];
  let totalPairwiseCost = 0;
  const pairwiseTargets = EVAL_DEFAULT_VERSIONS.filter((v) => versions.includes(v));
  if (!skipPairwise && pairwiseTargets.length === 2) {
    const [vA, vB] = pairwiseTargets;
    console.log(`\n--- Pairwise judging: ${vA} vs ${vB} ---`);

    type PairJob = { question: EvalQuestion };
    const pairJobs: PairJob[] = questions
      .filter((q) =>
        answerStash.has(`${q.id}::${vA}::0`)
        && answerStash.has(`${q.id}::${vB}::0`),
      )
      .map((q) => ({ question: q }));

    if (pairJobs.length === 0) {
      console.log('  (geen vragen met succesvolle runs voor beide versies — pairwise overgeslagen)');
    } else {
      const pwResults = await withConcurrency<PairJob, PairwiseRunRow | null>(
        pairJobs,
        CONCURRENCY,
        async (pj, i) => {
          const tagP = `  [${i + 1}/${pairJobs.length}] ${pj.question.slug}`;
          const answerA = answerStash.get(`${pj.question.id}::${vA}::0`);
          const answerB = answerStash.get(`${pj.question.id}::${vB}::0`);
          if (!answerA || !answerB) {
            console.log(`${tagP} (skip — answer stash leeg)`);
            return null;
          }
          try {
            const judge = await runPairwiseJudge({
              question: pj.question,
              answerA,
              answerB,
              organizationId: pj.question.organization_id,
            });
            const row: PairwiseRunRow = {
              organization_id: pj.question.organization_id,
              question_id: pj.question.id,
              bot_version_a: vA,
              bot_version_b: vB,
              winner: judge.winner,
              confidence: judge.confidence,
              judge_rationale: judge.rationale,
              judge_model: JUDGE_MODEL,
              judge_cost_usd: judge.costUsd,
              judge_latency_ms: judge.latencyMs,
              judge_parse_error: judge.parseError,
            };
            const { error: insErr } = await sb.from('eval_pairwise_runs').insert(row);
            if (insErr) {
              console.error(`${tagP} ✗ insert: ${insErr.message}`);
              return null;
            }
            totalPairwiseCost += judge.costUsd;
            const winFlag = judge.winner === 'A' ? `A=${vA}` : judge.winner === 'B' ? `B=${vB}` : 'tie';
            console.log(`${tagP} ${winFlag} (conf=${judge.confidence ?? '-'}) ${judge.parseError ? '⚠parse' : ''}`);
            return row;
          } catch (err) {
            console.error(`${tagP} ✗ ${err instanceof Error ? err.message : String(err)}`);
            return null;
          }
        },
      );
      pairwiseRows = pwResults.filter((r): r is PairwiseRunRow => r !== null);
    }
  } else if (!skipPairwise) {
    console.log(`\n(pairwise overgeslagen — vereist beide EVAL_DEFAULT_VERSIONS ${EVAL_DEFAULT_VERSIONS.join(', ')} in run)`);
  }

  const totalSec = Math.round((performance.now() - t0) / 100) / 10;

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
  function rate(rows: EvalRunRow[], pred: (r: EvalRunRow) => boolean): string {
    if (rows.length === 0) return '  -  ';
    const n = rows.filter(pred).length;
    return `${Math.round((n / rows.length) * 100)}%`;
  }

  console.log(`\n--- Summary (${totalSec}s total, abs:${absoluteSec}s, ${completed} ok, ${failed} failed) ---`);
  console.log('  versie  | C    P    G    | avg  | prod-ready | bot $    judge $');
  console.log('  --------|----------------|------|------------|------------------');
  for (const v of versions) {
    const vRows = okRows.filter((r) => r.bot_version === v);
    if (vRows.length === 0) {
      console.log(`  ${v.padEnd(7)} | (geen succesvolle runs)`);
      continue;
    }
    const c = avg(vRows.map((r) => r.score_correctness));
    const p = avg(vRows.map((r) => r.score_completeness));
    const g = avg(vRows.map((r) => r.score_grounding));
    const all = [c, p, g].filter((n): n is number => n !== null);
    const overall = all.length === 0 ? null : all.reduce((a, b) => a + b, 0) / all.length;
    const prodRate = rate(vRows, (r) => r.production_ready === true);
    const bCost = vRows.reduce((s, r) => s + r.bot_cost_usd, 0);
    const jCost = vRows.reduce((s, r) => s + r.judge_cost_usd, 0);
    console.log(
      `  ${v.padEnd(7)} | ${fmtAvg(c)} ${fmtAvg(p)} ${fmtAvg(g)} | ${fmtAvg(overall)} | ${prodRate.padStart(10)} | $${bCost.toFixed(4)}  $${jCost.toFixed(4)}`,
    );
  }
  console.log(`\n  totale cost: bot $${totalBotCost.toFixed(4)} + judge $${totalJudgeCost.toFixed(4)} + pairwise $${totalPairwiseCost.toFixed(4)} = $${(totalBotCost + totalJudgeCost + totalPairwiseCost).toFixed(4)}`);

  // ---------------------------------------------------------------------------
  // Pairwise win-rate samenvatting
  // ---------------------------------------------------------------------------
  if (pairwiseRows.length > 0) {
    const wA = pairwiseRows.filter((r) => r.winner === 'A').length;
    const wB = pairwiseRows.filter((r) => r.winner === 'B').length;
    const ties = pairwiseRows.filter((r) => r.winner === 'tie').length;
    const total = pairwiseRows.length;
    console.log(`\n--- Pairwise (${pairwiseRows[0].bot_version_a} vs ${pairwiseRows[0].bot_version_b}) — n=${total} ---`);
    console.log(`  ${pairwiseRows[0].bot_version_a} wint: ${wA} (${Math.round((wA / total) * 100)}%)`);
    console.log(`  ${pairwiseRows[0].bot_version_b} wint: ${wB} (${Math.round((wB / total) * 100)}%)`);
    console.log(`  ties           : ${ties} (${Math.round((ties / total) * 100)}%)`);
  }

  // ---------------------------------------------------------------------------
  // Must-not violations — direct gele kaarten tonen.
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
  // Budget-check per versie.
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
