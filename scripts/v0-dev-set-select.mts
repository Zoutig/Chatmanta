// $0, alleen DB-read. Selecteert de Luna dev-set (40 slugs) en schrijft eval-fixtures/dev-set-luna.json.
// Run: node --env-file=.env.local --import tsx scripts/v0-dev-set-select.mts
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: qs, error } = await sb
  .from('eval_questions')
  .select('id, slug, question, conversation_history, question_type, tags');
if (error) throw error;
const { data: runs, error: e2 } = await sb
  .from('eval_runs')
  .select('question_id, bot_kind, score_grounding, answer_length_appropriate, created_at')
  .eq('bot_version', 'v0.11b')
  .eq('judge_model', 'gpt-4o')
  .order('created_at', { ascending: false });
if (e2) throw e2;

// Nieuwste run per vraag.
const latest = new Map<string, (typeof runs)[number]>();
for (const r of runs) if (!latest.has(r.question_id)) latest.set(r.question_id, r);

type Q = { slug: string; question: string; g1: boolean; curt: boolean; kind: string };
const all: Q[] = qs
  .filter((q) => latest.has(q.id))
  .map((q) => {
    const r = latest.get(q.id)!;
    return {
      slug: q.slug as string,
      question: q.question as string,
      g1: r.score_grounding != null && r.score_grounding <= 1,
      curt: r.answer_length_appropriate === 'too_curt',
      kind: r.bot_kind as string,
      _hist: (q.conversation_history ?? []) as unknown[],
    } as Q & { _hist: unknown[] };
  });
const hist = new Map(qs.map((q) => [q.slug as string, (q.conversation_history ?? []) as unknown[]]));

const isMulti = (q: Q) => (hist.get(q.slug) ?? []).length > 0;
const isNon = (q: Q) => q.kind === 'smalltalk' || q.kind === 'fallback';
const isHard = (q: Q) => /\b(prijs|kost|kosten|tarief|€|euro|datum|telefoon|e-?mail|uur|dagen|percentage)\b|%/i.test(q.question);
const isMultiPart = (q: Q) => (q.question.match(/\?/g) ?? []).length > 1 || /\b(en|ook|daarnaast)\b.*\?/i.test(q.question);

const quota: [string, number, (q: Q) => boolean][] = [
  ['multiTurn', 8, isMulti],
  ['nonAnswer', 6, isNon],
  ['hardFact', 8, isHard],
  ['multiPart', 8, isMultiPart],
  ['answer', 10, () => true],
];
const used = new Set<string>();
const cats: Record<string, string[]> = {};
const shortfall: Record<string, number> = {};
let curtTotal = 0;
const pick = (q: Q, cat: string) => {
  used.add(q.slug);
  cats[cat].push(q.slug);
  if (q.curt) curtTotal++;
};
for (const [cat, n, f] of quota) {
  cats[cat] = [];
  const cand = all.filter((q) => !used.has(q.slug) && f(q) && (cat === 'answer' ? q.kind === 'answer' : true));
  // G<=1 eerst, dan too_curt (max ~6 totaal), dan rest.
  const ordered = [...cand.filter((q) => q.g1), ...cand.filter((q) => !q.g1 && q.curt && curtTotal < 6), ...cand.filter((q) => !q.g1)];
  for (const q of ordered) {
    if (cats[cat].length >= n) break;
    if (!used.has(q.slug)) pick(q, cat);
  }
  shortfall[cat] = n - cats[cat].length;
}
// Aanvullen uit answer.
for (const cat of Object.keys(shortfall)) {
  if (cat === 'answer' || shortfall[cat] <= 0) continue;
  const fill = all.filter((q) => !used.has(q.slug) && q.kind === 'answer');
  for (const q of fill.slice(0, shortfall[cat])) pick(q, 'answer');
}
const sel = all.filter((q) => used.has(q.slug));
const slugs = Object.values(cats).flat();
const g1Total = sel.filter((q) => q.g1).length;
const curtSel = sel.filter((q) => q.curt).length;
const g1All = all.filter((q) => q.g1).length;
console.log({ totalQuestionsWithRun: all.length, g1All, counts: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, v.length])), shortfall, total: slugs.length, g1InSet: g1Total, curtInSet: curtSel, multiTurnAvailable: all.filter(isMulti).length });

writeFileSync(
  'eval-fixtures/dev-set-luna.json',
  JSON.stringify(
    {
      description: 'Luna-pipeline dev-set (2026-10-05) — 40 slugs, gequoteerd per categorie',
      categories: cats,
      slugsCsv: slugs.join(','),
    },
    null,
    2,
  ) + '\n',
);
