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

import { resolveBot, BOTS } from '../lib/v0/server/bots';

const DEV_ORG_ID = '00000000-0000-0000-0000-0000000000d0';
const OUT_DIR = resolve('eval-out');

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
    `id, question_id, bot_version, judge_model, bot_kind, bot_answer, bot_sources,
     bot_cost_usd, bot_latency_ms,
     score_correctness, score_completeness, score_grounding,
     judge_reasoning, judge_parse_error, judge_cost_usd, judge_latency_ms,
     hyde_mode_requested, hyde_mode_actual,
     run_index, retrieved_filenames, retrieval_recall_at_k, retrieval_mrr,
     must_not_violation,
     created_at`,
  )
  .eq('organization_id', DEV_ORG_ID)
  .order('created_at', { ascending: false });
if (runErr) fail(`eval_runs select: ${runErr.message}`);
if (!runRows || runRows.length === 0) {
  console.log('Geen eval_runs in DB. Run eerst `npm run eval:run`.');
  process.exit(0);
}

const { data: qRows, error: qErr } = await sb
  .from('eval_questions')
  .select('id, slug, question, gold_answer, gold_facts, tags, difficulty, question_type, must_not_contain')
  .eq('organization_id', DEV_ORG_ID);
if (qErr) fail(`eval_questions select: ${qErr.message}`);
const qById = new Map((qRows ?? []).map((q) => [q.id as string, q]));

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
  lines.push(`### ${slug}`);
  lines.push('');
  lines.push(`**Vraag:** ${text}`);
  lines.push(`**Difficulty:** ${diff} · **Tags:** ${tags || '—'}`);
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
csvLines.push(
  'slug,difficulty,question_type,bot_version,hyde_mode_actual,hyde_mode_requested,run_index,correctness,completeness,grounding,recall_at_k,mrr,must_not_violation,bot_kind,bot_latency_ms,bot_cost_usd,judge_cost_usd,judge_parse_error',
);
// CSV gebruikt allLatestVariance zodat multi-run rows allemaal in spreadsheet
// belanden voor variance-analyse, niet alleen run_index=0.
for (const q of questions) {
  const qType = (q.question_type as string | null) ?? 'factual';
  for (const r of allLatestVariance) {
    if (r.question_id !== q.id) continue;
    csvLines.push(
      [
        q.slug,
        q.difficulty,
        qType,
        r.bot_version,
        modeKey(r),
        (r.hyde_mode_requested as string | null) ?? '',
        r.run_index ?? 0,
        r.score_correctness ?? '',
        r.score_completeness ?? '',
        r.score_grounding ?? '',
        r.retrieval_recall_at_k ?? '',
        r.retrieval_mrr ?? '',
        r.must_not_violation ? 'true' : 'false',
        r.bot_kind,
        r.bot_latency_ms,
        Number(r.bot_cost_usd ?? 0).toFixed(6),
        Number(r.judge_cost_usd ?? 0).toFixed(6),
        r.judge_parse_error ? 'true' : 'false',
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
}

main().catch((err) => {
  console.error('✗ Onverwachte fout:', err);
  process.exit(1);
});
