// V0 eval label-doctor — QA-pass over de ideal_source_filenames-labels van élke
// live eval_question. Read-only, $0 (geen LLM-calls).
//
// Waarom: recall@k / MRR vergelijken retrieved_filenames exact met
// ideal_source_filenames. Als die labels stale zijn (corpus geheringest onder
// een andere filename) of te streng (een ander-maar-geldig doc telt als miss),
// liegt recall@k. Dit script flag't verdachte labels zodat ze gecureerd kunnen
// worden. De live eval_questions-tabel is de bron van waarheid (eval:run leest
// de DB, niet de fixtures), dus we kijken naar wat er ECHT geëvalueerd wordt.
//
// Per vraag: huidige labels, of ze nog in het live corpus bestaan, wat de bot
// in de praktijk ophaalt, de gemiddelde score, en een flag. De flags zijn
// triage-heuristieken — de uiteindelijke labelkeuze maak je door de bron-docs
// te lezen.
//
// Usage:
//   npm run audit:labels

import { createClient } from '@supabase/supabase-js';
import { SOURCE_EXPECTED_TYPES } from '../lib/v0/server/eval';

const LOW_SCORE_MAX = 3.0;
const HIGH_SCORE_MIN = 4.0;
// Aandeel runs waarin minstens één ideal-doc werd opgehaald. Onder deze grens
// "mist" de bot het label structureel.
const RECALL_HIT_FLOOR = 0.5;

// Vraagtypes waar een bron HOORT te komen — alleen daar is een ontbrekend label
// of een echte miss betekenisvol. Geïmporteerd uit eval.ts zodat de label-doctor,
// audit:retrieval én de productie-gate dezelfde canonieke set delen (geen drift).

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

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

type RunRow = {
  question_id: string;
  score_correctness: number | null;
  score_completeness: number | null;
  score_grounding: number | null;
  retrieved_filenames: string[] | null;
};

type QRow = {
  id: string;
  organization_id: string;
  slug: string;
  question: string;
  question_type: string;
  ideal_source_filenames: string[] | null;
};

// Flag-volgorde = prioriteit (hoog → laag). Stale en echte misses eerst.
type Flag = 'STALE' | 'ECHTE_MISS?' | 'TE_STRENG?' | 'UNLABELED?' | 'CHECK' | 'OK';
const FLAG_ORDER: Flag[] = ['STALE', 'ECHTE_MISS?', 'TE_STRENG?', 'UNLABELED?', 'CHECK', 'OK'];

function avgScore(r: RunRow): number | null {
  const { score_correctness: c, score_completeness: p, score_grounding: g } = r;
  if (c === null || p === null || g === null) return null;
  return (c + p + g) / 3;
}

async function main(): Promise<void> {
  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Alle live eval_questions (alle orgs) — de set die echt geëvalueerd wordt.
  const { data: qRows, error: qErr } = await sb
    .from('eval_questions')
    .select('id, organization_id, slug, question, question_type, ideal_source_filenames');
  if (qErr) fail(`eval_questions select: ${qErr.message}`);
  const questions = (qRows ?? []) as QRow[];
  if (questions.length === 0) fail('Geen eval_questions in DB. Run eerst `npm run eval:seed`.');

  // 2. Live corpus per org — de filenames die de bot kan ophalen. Hiertegen
  //    checken we of een ideal-label nog bestaat (stale-detectie).
  const { data: docRows, error: docErr } = await sb
    .from('documents')
    .select('organization_id, filename')
    .is('deleted_at', null);
  if (docErr) fail(`documents select: ${docErr.message}`);
  const corpusByOrg = new Map<string, Set<string>>();
  for (const d of docRows ?? []) {
    const orgId = d.organization_id as string;
    if (!corpusByOrg.has(orgId)) corpusByOrg.set(orgId, new Set());
    corpusByOrg.get(orgId)!.add(d.filename as string);
  }

  // 3. Alle eval_runs — voor de empirische "wat haalt de bot op?"-frequentie en
  //    de gemiddelde score per vraag. Alle versies, want meer data = beter
  //    triage-signaal (dit is diagnostiek, geen gate).
  //    ⚠ supabase-js capt .select() stil op 1000 rijen. eval_runs is groter
  //    (dev-org alleen al heeft tientallen runs × versies), dus pagineren we —
  //    anders zien niet-dev orgs er ten onrechte uit als n=0 (truncatie).
  const PAGE = 1000;
  const allRuns: RunRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: runErr } = await sb
      .from('eval_runs')
      .select('question_id, score_correctness, score_completeness, score_grounding, retrieved_filenames')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (runErr) fail(`eval_runs select: ${runErr.message}`);
    if (!page || page.length === 0) break;
    allRuns.push(...(page as RunRow[]));
    if (page.length < PAGE) break;
  }
  const runsByQ = new Map<string, RunRow[]>();
  for (const r of allRuns) {
    if (!runsByQ.has(r.question_id)) runsByQ.set(r.question_id, []);
    runsByQ.get(r.question_id)!.push(r);
  }

  type Diagnosed = {
    q: QRow;
    flag: Flag;
    nRuns: number;
    avg: number | null;
    ideal: string[];
    stale: string[];
    topRetrieved: Array<{ file: string; count: number }>;
    recallHitRate: number | null;
  };
  const diagnosed: Diagnosed[] = [];

  for (const q of questions) {
    const ideal = q.ideal_source_filenames ?? [];
    const corpus = corpusByOrg.get(q.organization_id) ?? new Set<string>();
    const idealSet = new Set(ideal);
    const stale = ideal.filter((f) => !corpus.has(f));

    const runs = runsByQ.get(q.id) ?? [];
    const scores = runs.map(avgScore).filter((s): s is number => s !== null);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    // Frequentie van opgehaalde filenames over alle runs.
    const freq = new Map<string, number>();
    let hitRuns = 0;
    for (const r of runs) {
      const retrieved = r.retrieved_filenames ?? [];
      for (const f of new Set(retrieved)) freq.set(f, (freq.get(f) ?? 0) + 1);
      if (idealSet.size > 0 && retrieved.some((f) => idealSet.has(f))) hitRuns++;
    }
    const topRetrieved = [...freq.entries()]
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    const recallHitRate = idealSet.size > 0 && runs.length > 0 ? hitRuns / runs.length : null;

    const sourceExpected = SOURCE_EXPECTED_TYPES.has(q.question_type);

    let flag: Flag;
    if (ideal.length === 0) {
      flag = sourceExpected ? 'UNLABELED?' : 'OK';
    } else if (stale.length > 0) {
      flag = 'STALE';
    } else if (recallHitRate === null) {
      flag = 'CHECK'; // labels bestaan maar geen runs om tegen te ijken
    } else if (recallHitRate >= RECALL_HIT_FLOOR) {
      flag = 'OK';
    } else if (avg !== null && avg >= HIGH_SCORE_MIN) {
      flag = 'TE_STRENG?'; // goede antwoorden ondanks gemiste ideal → label te smal
    } else if (avg !== null && avg <= LOW_SCORE_MAX) {
      // Een echte retrieval-gap telt alléén voor bron-verwachte types. Bij
      // adversariële types (planted_fact/out_of_corpus/false_premise) is recall=0
      // het correcte gedrag — de bot hóórt de "ideal" niet te gebruiken — dus een
      // lage score daar is geen retrieval-miss. Die routen we naar CHECK i.p.v.
      // het ECHTE_MISS?-budget te vervuilen (vgl. audit:retrieval/SOURCE_EXPECTED_TYPES).
      flag = sourceExpected ? 'ECHTE_MISS?' : 'CHECK';
    } else {
      flag = 'CHECK';
    }

    diagnosed.push({ q, flag, nRuns: runs.length, avg, ideal, stale, topRetrieved, recallHitRate });
  }

  // 4. Output — gegroepeerd per org, gesorteerd op flag-prioriteit.
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Eval Label-Doctor — ideal_source_filenames QA');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Live eval_questions: ${questions.length}  (over ${corpusByOrg.size} orgs met corpus)`);
  console.log('');
  console.log('Flags:');
  console.log('  STALE       ideal-label bestaat niet in het live corpus (kapot)');
  console.log('  ECHTE_MISS? lage score + bot haalde nooit de ideal op → retrieval-gap');
  console.log('  TE_STRENG?  hoge score maar ideal zelden opgehaald → label te smal, verbreden?');
  console.log('  UNLABELED?  bron-verwacht type zonder label → label toevoegen?');
  console.log('  CHECK       gemengd / geen runs → handmatig bekijken');
  console.log('  OK          bot haalt de ideal meestal op');
  console.log('');

  const flagCounts = new Map<Flag, number>();
  const orderedOrgs = [...corpusByOrg.keys(), ...new Set(questions.map((q) => q.organization_id))]
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => orgSlug(a).localeCompare(orgSlug(b)));

  for (const orgId of orderedOrgs) {
    const rows = diagnosed
      .filter((d) => d.q.organization_id === orgId)
      .sort(
        (a, b) =>
          FLAG_ORDER.indexOf(a.flag) - FLAG_ORDER.indexOf(b.flag) ||
          (a.avg ?? 99) - (b.avg ?? 99),
      );
    if (rows.length === 0) continue;
    const corpusSize = (corpusByOrg.get(orgId) ?? new Set()).size;
    console.log('───────────────────────────────────────────────────────────');
    console.log(`${orgSlug(orgId)}  (${rows.length} vragen, corpus=${corpusSize} docs)`);
    console.log('───────────────────────────────────────────────────────────');
    for (const d of rows) {
      flagCounts.set(d.flag, (flagCounts.get(d.flag) ?? 0) + 1);
      if (d.flag === 'OK') continue; // OK's niet uitspugen — focus op actie
      const qShort = d.q.question.length > 52 ? d.q.question.slice(0, 49) + '…' : d.q.question;
      const avgStr = d.avg === null ? ' n/a' : d.avg.toFixed(2);
      const hitStr = d.recallHitRate === null ? '' : ` hit=${Math.round(d.recallHitRate * 100)}%`;
      console.log(
        `  [${d.flag.padEnd(11)}] ${d.q.question_type.padEnd(9)} avg=${avgStr} n=${d.nRuns}${hitStr}  ${d.q.slug}`,
      );
      console.log(`      Q:         ${qShort}`);
      console.log(`      ideal:     ${JSON.stringify(d.ideal)}${d.stale.length ? `   ⚠ STALE: ${JSON.stringify(d.stale)}` : ''}`);
      console.log(
        `      retrieved: ${d.topRetrieved.map((t) => `${t.file}(${t.count})`).join(', ') || '(geen)'}`,
      );
    }
    console.log('');
  }

  // 5. Samenvatting.
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Samenvatting per flag:');
  for (const f of FLAG_ORDER) {
    const c = flagCounts.get(f) ?? 0;
    if (c > 0) console.log(`  ${f.padEnd(12)} ${c}`);
  }
  const actionable = FLAG_ORDER.filter((f) => f !== 'OK').reduce(
    (sum, f) => sum + (flagCounts.get(f) ?? 0),
    0,
  );
  console.log('');
  console.log(`→ ${actionable} vragen vragen om aandacht (niet-OK). Lees de bron-docs en cureer de labels.`);
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
