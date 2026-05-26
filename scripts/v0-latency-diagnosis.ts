// V0 latency-diagnose — $0 latency-faalanalyse uit eval_runs.stage_timings_ms.
//
// Doel (iter2 Taak 2): lokaliseer de stages achter de p95-latency-gate-failures
// (p95 total ≈11850ms > 8000; p95 first_token ≈7765ms > 1500) zodat de beslisgate
// kan beoordelen of er een triviaal-veilige, flag-guarded fast-path-optimalisatie
// bestaat — of dat latency diagnose-only blijft (HyDE/rerank-keten-herschrijving
// is te riskant voor een onbewaakte run).
//
// $0: leest alleen eval_runs + eval_questions, geen LLM-calls. Per (vraag) de
// NIEUWSTE run van de doelversie (default LATEST_BOT_VERSION). Legacy-getagde
// cases vallen uit (active corpus), gelijk aan audit:taxonomy.
//
// ⚠ Route/pad-slicing (fast/standard/careful) is NIET mogelijk vanuit eval_runs:
// adaptive_decision staat alleen op query_log (migration 0023), niet op eval_runs.
// We segmenteren daarom op question_type + per-stage; dat is de eerlijke grens.
//
// first_token_ms staat NIET in STAGE_KEYS (eval-latency-stats.ts) — we lezen het
// veld direct uit stage_timings_ms.
//
// Usage:
//   npm run audit:latency                  (LATEST_BOT_VERSION)
//   npm run audit:latency -- --version v0.8.1
import { createClient } from '@supabase/supabase-js';
import { LATEST_BOT_VERSION } from '../lib/v0/server/bots';
import type { PhaseTimings } from '../lib/v0/server/rag';
import {
  STAGE_KEYS,
  computeStagePercentiles,
  slowestStageByQuestionType,
  type RunWithStageTimings,
  type StageKey,
} from '../lib/v0/server/eval-latency-stats';

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const ORG_SLUG_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  '00000000-0000-0000-0000-0000000000d0': 'dev-org',
  '00000000-0000-0000-0000-0000000000a1': 'acme-corp',
  '00000000-0000-0000-0000-0000000000a2': 'globex-inc',
  '00000000-0000-0000-0000-0000000000a3': 'initech',
});
const orgSlug = (id: string | null | undefined) =>
  !id ? '(unknown)' : (ORG_SLUG_BY_ID[id] ?? id.slice(-4));

// Pre-answer stages: alles vóór de eerste answer-delta. Hun som moet ≈ first_token_ms
// zijn — dat bevestigt dat first-token-latency = de pre-answer-pijplijn, geen streaming.
const PRE_ANSWER_STAGES: readonly (keyof PhaseTimings)[] = [
  'preprocess_ms',
  'cache_lookup_ms',
  'decompose_ms',
  'hyde_ms',
  'expand_ms',
  'embedding_ms',
  'retrieval_ms',
  'rerank_ms',
];

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

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

async function main(): Promise<void> {
  const versionArg = process.argv.indexOf('--version');
  const version = versionArg >= 0 ? process.argv[versionArg + 1] : LATEST_BOT_VERSION;

  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Vragen — type, tags (legacy-filter), slug, org.
  const { data: qRows, error: qErr } = await sb
    .from('eval_questions')
    .select('id, organization_id, slug, question_type, tags');
  if (qErr) fail(`eval_questions: ${qErr.message}`);
  const qById = new Map((qRows ?? []).map((q) => [q.id as string, q]));

  // 2. Runs van de doelversie — pagineren (supabase-js capt op 1000), newest-first.
  const runs: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('eval_runs')
      .select('question_id, bot_version, stage_timings_ms, created_at')
      .eq('bot_version', version)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) fail(`eval_runs: ${error.message}`);
    runs.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // 3. Nieuwste run per vraag (eerste occurrence in newest-first volgorde).
  const latest = new Map<string, any>();
  for (const r of runs) {
    const id = r.question_id as string;
    if (!latest.has(id)) latest.set(id, r);
  }

  // 4. Active corpus (legacy uit) → RunWithStageTimings + per-vraag-metadata.
  type Row = {
    slug: string;
    org: string;
    qType: string;
    timings: PhaseTimings | null;
  };
  const rows: Row[] = [];
  const forHelpers: RunWithStageTimings[] = [];
  const qTypeByQId = new Map<string, string>();
  let legacySkipped = 0;
  let missingTimings = 0;
  for (const r of latest.values()) {
    const q = qById.get(r.question_id as string);
    if (!q) continue;
    const tags = (q.tags as string[] | null) ?? [];
    if (tags.includes('legacy')) { legacySkipped++; continue; }
    const qType = (q.question_type as string) ?? 'factual';
    const timings = (r.stage_timings_ms as PhaseTimings | null) ?? null;
    if (!timings) missingTimings++;
    qTypeByQId.set(r.question_id as string, qType);
    forHelpers.push({
      questionId: r.question_id as string,
      botVersion: r.bot_version as string,
      stageTimingsMs: timings,
    });
    rows.push({ slug: q.slug as string, org: orgSlug(q.organization_id as string), qType, timings });
  }

  const withTimings = rows.filter((r) => r.timings);

  console.log(`# Latency-diagnose — ${version}`);
  console.log('');
  console.log(
    `Active corpus: ${rows.length} cases (legacy uit: ${legacySkipped}; zonder stage_timings_ms: ${missingTimings} → overgeslagen in percentielen). n met timings: ${withTimings.length}.`,
  );
  if (withTimings.length === 0) {
    fail('Geen runs met stage_timings_ms — zijn de runs van ná migration 0021? Draai eerst een verse eval.');
  }
  console.log('');

  // 5. Overall p50/p75/p95 per stage + first_token_ms.
  const pctls = computeStagePercentiles(forHelpers); // p50/p95/p99 per stage
  // p75 niet in de helper — los bijberekenen per stage voor de volledige tabel.
  const p75ByStage = new Map<StageKey, number>();
  for (const stage of STAGE_KEYS) {
    const vals = withTimings
      .map((r) => num((r.timings as any)[stage]))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (vals.length) p75ByStage.set(stage, Math.round(percentile(vals, 0.75)));
  }

  console.log('## Overall percentielen per stage (ms)');
  console.log('');
  console.log('| stage | n | p50 | p75 | p95 |');
  console.log('|-------|---|-----|-----|-----|');
  for (const stage of STAGE_KEYS) {
    const row = pctls.find((p) => p.stage === stage);
    if (!row) continue;
    console.log(`| ${stage} | ${row.n} | ${row.p50} | ${p75ByStage.get(stage) ?? '–'} | ${row.p95} |`);
  }

  // first_token_ms apart (niet in STAGE_KEYS).
  const ftVals = withTimings
    .map((r) => num((r.timings as PhaseTimings).first_token_ms))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  console.log('');
  console.log(
    `**first_token_ms** (n=${ftVals.length}): p50=${ftVals.length ? Math.round(percentile(ftVals, 0.5)) : '–'} · p75=${ftVals.length ? Math.round(percentile(ftVals, 0.75)) : '–'} · p95=${ftVals.length ? Math.round(percentile(ftVals, 0.95)) : '–'} (gate ≤1500)`,
  );

  // 6. Slowest-stage per question_type.
  console.log('');
  console.log('## Traagste stage per question_type (p50)');
  console.log('');
  console.log('| question_type | traagste stage | p50 | % van total | n |');
  console.log('|---------------|----------------|-----|-------------|---|');
  for (const row of slowestStageByQuestionType(forHelpers, qTypeByQId)) {
    console.log(`| ${row.questionType} | ${row.slowestStage} | ${row.p50} | ${row.pctOfTotal}% | ${row.n} |`);
  }

  // 7. Top-20 traagste slugs op total_ms + boosdoener-stage.
  const ranked = withTimings
    .filter((r) => num((r.timings as PhaseTimings).total_ms) !== null)
    .sort((a, b) => (b.timings as PhaseTimings).total_ms - (a.timings as PhaseTimings).total_ms)
    .slice(0, 20);
  console.log('');
  console.log('## Top-20 traagste cases (total_ms) + boosdoener-stage');
  console.log('');
  console.log('| slug | org | type | total_ms | boosdoener | stage_ms | first_token_ms |');
  console.log('|------|-----|------|----------|------------|----------|----------------|');
  for (const r of ranked) {
    const t = r.timings as PhaseTimings;
    let culprit: StageKey = 'generation_ms';
    let culpritVal = -1;
    for (const stage of STAGE_KEYS) {
      if (stage === 'total_ms') continue;
      const v = num((t as any)[stage]);
      if (v !== null && v > culpritVal) { culpritVal = v; culprit = stage; }
    }
    console.log(
      `| ${r.slug} | ${r.org} | ${r.qType} | ${Math.round(t.total_ms)} | ${culprit} | ${Math.round(culpritVal)} | ${num(t.first_token_ms) ?? '–'} |`,
    );
  }

  // 8. Pre-answer-som vs first_token (bevestigt: first-token = pre-answer-pijplijn).
  const deltas: number[] = [];
  for (const r of withTimings) {
    const t = r.timings as PhaseTimings;
    const ft = num(t.first_token_ms);
    if (ft === null) continue;
    let sum = 0;
    for (const stage of PRE_ANSWER_STAGES) {
      const v = num((t as any)[stage]);
      if (v !== null) sum += v;
    }
    deltas.push(ft - sum);
  }
  if (deltas.length) {
    const sorted = [...deltas].sort((a, b) => a - b);
    const med = Math.round(percentile(sorted, 0.5));
    console.log('');
    console.log('## first_token_ms vs som(pre-answer-stages)');
    console.log('');
    console.log(
      `n=${deltas.length}; mediaan(first_token − pre_answer_som) = ${med}ms. ` +
        `Een kleine/positieve delta bevestigt dat first-token-latency ≈ de pre-answer-pijplijn (geen streaming-startvertraging als losse boosdoener).`,
    );
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
