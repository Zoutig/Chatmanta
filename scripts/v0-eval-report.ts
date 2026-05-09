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
  .select('id, slug, question, gold_answer, gold_facts, tags, difficulty')
  .eq('organization_id', DEV_ORG_ID);
if (qErr) fail(`eval_questions select: ${qErr.message}`);
const qById = new Map((qRows ?? []).map((q) => [q.id as string, q]));

// ---------------------------------------------------------------------------
// 2. Snapshot: voor elke (question_id, bot_version) → meest recente run.
// ---------------------------------------------------------------------------
const latestByPair = new Map<string, typeof runRows[number]>();
for (const r of runRows) {
  const key = `${r.question_id}::${r.bot_version}`;
  if (!latestByPair.has(key)) latestByPair.set(key, r); // runRows is desc op created_at
}
const latestRuns = [...latestByPair.values()];

const versions = [...new Set(latestRuns.map((r) => r.bot_version as string))].sort();
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
lines.push(`- Versies: **${versions.join(', ')}**`);
lines.push(`- Totaal runs in DB: **${runRows.length}** (alle history bewaard)`);
lines.push('');

// 4a. Samenvatting per versie
lines.push('## Samenvatting per versie');
lines.push('');
lines.push('| versie | correctness | completeness | grounding | overall | bot $ | judge $ | bot ms (avg) |');
lines.push('|--------|-------------|--------------|-----------|---------|-------|---------|--------------|');
for (const v of versions) {
  const vRows = latestRuns.filter((r) => r.bot_version === v);
  const c = avgOf(vRows, (r) => r.score_correctness);
  const p = avgOf(vRows, (r) => r.score_completeness);
  const g = avgOf(vRows, (r) => r.score_grounding);
  const all = [c, p, g].filter((n): n is number => n !== null);
  const overall = all.length === 0 ? null : all.reduce((a, b) => a + b, 0) / all.length;
  const bCost = vRows.reduce((s, r) => s + Number(r.bot_cost_usd ?? 0), 0);
  const jCost = vRows.reduce((s, r) => s + Number(r.judge_cost_usd ?? 0), 0);
  const lat = avgOf(vRows, (r) => Number(r.bot_latency_ms ?? 0));
  lines.push(
    `| ${v} | ${fmt(c)} | ${fmt(p)} | ${fmt(g)} | **${fmt(overall)}** | $${bCost.toFixed(4)} | $${jCost.toFixed(4)} | ${fmt(lat, 0)} |`,
  );
}
lines.push('');

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
  lines.push('| versie | C | P | G | kind | bot ms | bot $ |');
  lines.push('|--------|---|---|---|------|--------|-------|');
  for (const v of versions) {
    const r = latestRuns.find((row) => row.question_id === q.id && row.bot_version === v);
    if (!r) {
      lines.push(`| ${v} | — | — | — | — | — | — |`);
      continue;
    }
    lines.push(
      `| ${v} | ${fmtScore(r.score_correctness)} | ${fmtScore(r.score_completeness)} | ${fmtScore(r.score_grounding)} | ${r.bot_kind} | ${r.bot_latency_ms} | $${Number(r.bot_cost_usd ?? 0).toFixed(4)} |`,
    );
  }
  lines.push('');

  // Antwoorden + judge reasoning per versie (collapsible voor leesbaarheid).
  for (const v of versions) {
    const r = latestRuns.find((row) => row.question_id === q.id && row.bot_version === v);
    if (!r) continue;
    lines.push(`<details><summary>${v} — bot answer + judge reasoning</summary>`);
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
  'slug,difficulty,bot_version,correctness,completeness,grounding,bot_kind,bot_latency_ms,bot_cost_usd,judge_cost_usd,judge_parse_error',
);
for (const q of questions) {
  for (const v of versions) {
    const r = latestRuns.find((row) => row.question_id === q.id && row.bot_version === v);
    if (!r) continue;
    csvLines.push(
      [
        q.slug,
        q.difficulty,
        v,
        r.score_correctness ?? '',
        r.score_completeness ?? '',
        r.score_grounding ?? '',
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
for (const v of versions) {
  const vRows = latestRuns.filter((r) => r.bot_version === v);
  const c = avgOf(vRows, (r) => r.score_correctness);
  const p = avgOf(vRows, (r) => r.score_completeness);
  const g = avgOf(vRows, (r) => r.score_grounding);
  const all = [c, p, g].filter((n): n is number => n !== null);
  const overall = all.length === 0 ? null : all.reduce((a, b) => a + b, 0) / all.length;
  console.log(
    `  ${v.padEnd(7)}  C=${fmt(c)}  P=${fmt(p)}  G=${fmt(g)}  →  ${fmt(overall)}/5`,
  );
}
}

main().catch((err) => {
  console.error('✗ Onverwachte fout:', err);
  process.exit(1);
});
