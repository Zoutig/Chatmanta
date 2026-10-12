// Plan 016 fase 2: bouwt testset-versie <set> (E1 veiligheid + E2 kwaliteit) uit de eval-
// corpora. BILLABLE (Anthropic). Hervatbaar: elke stap schrijft z'n werkbestand en wordt
// overgeslagen als dat al bestaat. Alles staat BUITEN de repo:
//   ~/.chatmanta/eval-private/testsets/<set>/work/…   tussenresultaten
//   ~/.chatmanta/eval-private/testsets/<set>/{e1,e2}-{tune,toets}.jsonl + MANIFEST.json
// De toetsset is verzegeld: dit script print daarvan alleen aantallen, nooit vragen.
//
// Stappen per corpus: questions (doc-blind, Opus+Sonnet, prompt A→tune / B→toets) → label
// (Opus, KB in gecachete system prompt, letterlijke bronzinnen) → e1 (Opus, per dimensie)
// → xcheck (Sonnet beantwoordt blind uit de KB) → assemble (spans controleren, dedupe,
// splitsen, bevriezen).
//
// Run: node --env-file=.env.local --conditions=react-server --import tsx scripts/evals-build-testset.ts \
//        --set=ts1 [--corpus=acme-corp] [--until=label|e1|xcheck] [--cap=25]

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EVAL_CORPORA, evalPrivateRoot, loadEvalKb, type EvalCorpus, type KbDoc } from '../lib/evals/eval-orgs';
import { anthropicTransport, judge, type Effort, type JudgeCall } from '../lib/evals/judge-client';
import { runJudgeBatch } from '../lib/evals/batch';
import { assertRunAllowed, RunBudget } from '../lib/evals/ledger';
import { sha256 } from '../lib/evals/text';
import {
  QUESTION_PROMPTS, QUESTION_SCHEMA, questionUserPrompt, type GeneratedQuestion,
  LABEL_SCHEMA, LABEL_SYSTEM_PREFIX, labelUserPrompt, renderKb, type LabelItem,
  XCHECK_SCHEMA, XCHECK_SYSTEM_PREFIX, type XcheckItem,
  E1_DIMENSIONS, E1_SCHEMA, E1_SYSTEM_PREFIX, e1UserPrompt, type E1Dimension, type E1Generated,
} from '../lib/evals/gen/prompts';
import {
  assertDisjoint, isNearDuplicate, locateQuote, questionHash, seededShuffle,
  type TestCase, type TestFact, type Answerability,
} from '../lib/evals/gen/testset';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const SET = arg('set') ?? 'ts1';
const ONLY = arg('corpus');
const UNTIL = arg('until');
const CAP = Number(arg('cap') ?? '25');
const OPUS = 'claude-opus-5-5';
const SONNET = 'claude-sonnet-5-5';

// Omvang (plan 016 §3): E2 300 toets + 150 tune, E1 ±200 toets + ±60 tune. Overgenereren
// omdat spans/kruiscontrole/dedupe een deel laten afvallen.
// Pilot acme (12 okt): 100% geldige spans, 98% kruismodel-eens → weinig uitval; acme liep
// nog op 48/75, de rest op 40/64. assemble() trekt per corpus gelijk af op E2_CAP.
const E2_TUNE_PER_CORPUS = 40; // prompt A, alleen niet-holdout-corpora
const E2_TOETS_PER_CORPUS = 64; // prompt B, alle corpora
const E2_CAP = { toets: 60, tune: 38 };
const PER_CALL = 12;
const LABEL_BATCH = 10;
const E1_PER_DIMENSION = 4;
const E1_CONTROLS = 21;
const E1_TUNE_SHARE = 0.28;
const TARGET = { e2Toets: 300, e2Tune: 150, e1Toets: 200, e1Tune: 60 };

const root = join(evalPrivateRoot(), 'testsets', SET);
const work = join(root, 'work');
mkdirSync(work, { recursive: true });

const runId = `testset-${SET}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const budget = new RunBudget(runId, `testset ${SET}`, CAP);
const transport = anthropicTransport();

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const writeJson = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 1));

async function pool<T>(items: T[], conc: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

async function call<T>(opts: {
  model: string; effort: Effort; system: string; user: string; schema: Record<string, unknown>;
  maxTokens: number; validate: (d: T) => string[]; what: string;
}): Promise<T> {
  const r = await judge<T>(
    transport,
    { model: opts.model, effort: opts.effort, system: opts.system, user: opts.user, schema: opts.schema, maxTokens: opts.maxTokens, validate: opts.validate },
    (usd, model) => budget.record(model, usd, false),
  );
  if (!r.ok) throw new Error(`${opts.what}: ${r.kind} ${r.detail}`);
  return r.data;
}

/**
 * Veel calls via de Batches-API (−50%); mislukte items daarna één keer synchroon opnieuw.
 * Een item dat dan nog faalt = harde fout (geen stille gaten in de testset).
 */
async function callMany<T>(jobs: { id: string; call: JudgeCall<T>; what: string }[]): Promise<Map<string, T>> {
  const res = await runJudgeBatch(transport.client, jobs.map((j) => ({ id: j.id, call: j.call })), {
    pollMs: 20_000,
    onCost: (usd, model) => budget.record(model, usd, true),
    log: (s) => console.log(`  ${s}`),
  });
  const out = new Map<string, T>();
  for (const j of jobs) {
    const r = res.get(j.id)!;
    if (r.ok) { out.set(j.id, r.data); continue; }
    console.log(`  herhaal ${j.what} (${r.kind})`);
    out.set(j.id, await call<T>({ ...j.call, model: j.call.model ?? OPUS, what: j.what }));
  }
  return out;
}

// ── Overzicht voor de doc-blinde generator ────────────────────────────────────
function overviewFor(docs: KbDoc[]): { overview: string; titles: string[] } {
  const titles = docs.map((d) => d.filename.replace(/\.md$/, '').replace(/^\d+-/, '').replace(/-/g, ' '));
  const home =
    docs.find((d) => /over-ons|over ons|home|^\d+-over/i.test(d.filename)) ??
    docs.find((d) => /\/$|\.nl$/.test(String(d.metadata.source_url ?? ''))) ??
    docs[0];
  return { overview: home.text.slice(0, 1500), titles };
}

// ── Stap 1: vragen ────────────────────────────────────────────────────────────
type QRow = GeneratedQuestion & { qid: string; corpus: string; promptId: 'A' | 'B'; model: string };

async function stepQuestions(c: EvalCorpus, docs: KbDoc[]): Promise<QRow[]> {
  const out = join(work, `q-${c.corpus}.json`);
  if (existsSync(out)) return readJson<QRow[]>(out);
  const { overview, titles } = overviewFor(docs);
  const plan: { promptId: 'A' | 'B'; n: number }[] = [];
  if (c.role !== 'holdout') plan.push({ promptId: 'A', n: E2_TUNE_PER_CORPUS });
  plan.push({ promptId: 'B', n: E2_TOETS_PER_CORPUS });
  const jobs: { promptId: 'A' | 'B'; n: number; model: string; k: number }[] = [];
  for (const p of plan) {
    for (let k = 0, left = p.n; left > 0; k++, left -= PER_CALL) {
      jobs.push({ promptId: p.promptId, n: Math.min(PER_CALL, left), model: k % 2 === 0 ? OPUS : SONNET, k });
    }
  }
  const rows: QRow[] = [];
  await pool(jobs, 4, async (j) => {
    const data = await call<{ questions: GeneratedQuestion[] }>({
      model: j.model, effort: 'medium', system: QUESTION_PROMPTS[j.promptId],
      user: questionUserPrompt(overview, titles, j.n), schema: QUESTION_SCHEMA, maxTokens: 16000,
      validate: (d) => (d.questions.length >= j.n - 2 ? [] : [`${d.questions.length} vragen, verwacht ${j.n}`]),
      what: `vragen ${c.corpus}/${j.promptId}/${j.k}`,
    });
    data.questions.forEach((q, i) =>
      rows.push({ ...q, qid: `${c.corpus}-${j.promptId}${j.k}-${i}`, corpus: c.corpus, promptId: j.promptId, model: j.model }),
    );
  });
  rows.sort((a, b) => a.qid.localeCompare(b.qid));
  writeJson(out, rows);
  console.log(`  vragen: ${rows.length}`);
  return rows;
}

// ── Stap 2: labelen (Opus, KB gecachet) ───────────────────────────────────────
function validateItems(qids: string[]) {
  return (d: { items: { qid: string }[] }) => {
    const got = new Set(d.items.map((x) => x.qid));
    const missing = qids.filter((q) => !got.has(q));
    return missing.length ? [`ontbrekende qids: ${missing.join(',')}`] : [];
  };
}

async function stepLabel(c: EvalCorpus, docs: KbDoc[], qs: { qid: string; priorTurns: string[]; question: string }[], tag: string) {
  const out = join(work, `label-${tag}-${c.corpus}.json`);
  if (existsSync(out)) return readJson<Record<string, LabelItem>>(out);
  const system = LABEL_SYSTEM_PREFIX + renderKb(docs);
  const batches: (typeof qs)[] = [];
  for (let i = 0; i < qs.length; i += LABEL_BATCH) batches.push(qs.slice(i, i + LABEL_BATCH));
  const map: Record<string, LabelItem> = {};
  const res = await callMany<{ items: LabelItem[] }>(batches.map((b, k) => ({
    id: `label-${k}`, what: `label ${c.corpus}/${k}`,
    call: { model: OPUS, effort: 'medium', system, user: labelUserPrompt(b), schema: LABEL_SCHEMA, maxTokens: 32000, validate: validateItems(b.map((x) => x.qid)) },
  })));
  batches.forEach((b, k) => {
    for (const it of res.get(`label-${k}`)!.items) if (b.some((x) => x.qid === it.qid)) map[it.qid] = it;
  });
  writeJson(out, map);
  console.log(`  gelabeld (${tag}): ${Object.keys(map).length}`);
  return map;
}

// ── Stap 3: E1-cases (Opus, KB gecachet) ──────────────────────────────────────
type E1Row = E1Generated & { qid: string; dimension: E1Dimension };

async function stepE1(c: EvalCorpus, docs: KbDoc[]): Promise<E1Row[]> {
  const out = join(work, `e1-${c.corpus}.json`);
  if (existsSync(out)) return readJson<E1Row[]>(out);
  const system = E1_SYSTEM_PREFIX + renderKb(docs);
  const jobs: { dim: E1Dimension; n: number; k: number }[] = [];
  for (const dim of Object.keys(E1_DIMENSIONS) as E1Dimension[]) {
    if (dim === 'controle_beantwoordbaar') {
      for (let k = 0, left = E1_CONTROLS; left > 0; k++, left -= 7) jobs.push({ dim, n: Math.min(7, left), k });
    } else jobs.push({ dim, n: E1_PER_DIMENSION, k: 0 });
  }
  const rows: E1Row[] = [];
  const res = await callMany<{ cases: E1Generated[] }>(jobs.map((j) => ({
    id: `e1-${j.dim}-${j.k}`, what: `e1 ${c.corpus}/${j.dim}`,
    call: {
      model: OPUS, effort: 'medium', system, user: e1UserPrompt(j.dim, j.n), schema: E1_SCHEMA, maxTokens: 32000,
      validate: (d: { cases: E1Generated[] }) => (d.cases.length >= j.n - 1 ? [] : [`${d.cases.length} cases, verwacht ${j.n}`]),
    },
  })));
  for (const j of jobs) {
    res.get(`e1-${j.dim}-${j.k}`)!.cases.forEach((x, i) => rows.push({ ...x, qid: `${c.corpus}-e1-${j.dim}-${j.k}-${i}`, dimension: j.dim }));
  }
  rows.sort((a, b) => a.qid.localeCompare(b.qid));
  writeJson(out, rows);
  console.log(`  e1-cases: ${rows.length}`);
  return rows;
}

// ── Stap 4: kruiscontrole (Sonnet, ziet de sleutel niet) ──────────────────────
async function stepXcheck(c: EvalCorpus, docs: KbDoc[], qs: { qid: string; priorTurns: string[]; question: string }[]) {
  const out = join(work, `xcheck-${c.corpus}.json`);
  if (existsSync(out)) return readJson<Record<string, XcheckItem>>(out);
  const system = XCHECK_SYSTEM_PREFIX + renderKb(docs);
  const batches: (typeof qs)[] = [];
  for (let i = 0; i < qs.length; i += LABEL_BATCH) batches.push(qs.slice(i, i + LABEL_BATCH));
  const map: Record<string, XcheckItem> = {};
  const res = await callMany<{ items: XcheckItem[] }>(batches.map((b, k) => ({
    id: `x-${k}`, what: `xcheck ${c.corpus}/${k}`,
    call: { model: SONNET, effort: 'medium', system, user: labelUserPrompt(b), schema: XCHECK_SCHEMA, maxTokens: 24000, validate: validateItems(b.map((x) => x.qid)) },
  })));
  for (const v of res.values()) for (const it of v.items) map[it.qid] = it;
  writeJson(out, map);
  console.log(`  kruiscontrole: ${Object.keys(map).length}`);
  return map;
}

// ── Stap 5: samenstellen ──────────────────────────────────────────────────────
const yesNo = (a: Answerability) => (a === 'answerable' || a === 'partial' ? 'ja' : a === 'unanswerable' ? 'nee' : 'clarify');

function buildFacts(docs: KbDoc[], label: Pick<LabelItem, 'facts'>, flags: string[]): TestFact[] {
  const facts: TestFact[] = [];
  label.facts.forEach((f, i) => {
    const doc = locateQuote(docs, f.doc, f.quote);
    if (!doc) {
      flags.push(f.required ? 'span_dropped_required' : 'span_dropped_optional');
      return;
    }
    facts.push({
      id: `f${i + 1}`, text: f.text, kind: f.kind, required: f.required,
      source: { doc, quote: f.quote }, ...(f.kind === 'derived' && f.derivation ? { derivation: f.derivation } : {}),
    });
  });
  return facts;
}

function existingQuestions(): string[] {
  const out: string[] = [];
  for (const f of readdirSync('eval-fixtures').filter((x) => x.endsWith('.json'))) {
    try {
      const j = readJson<{ questions?: { question: string }[]; cases?: { question: string }[] }>(join('eval-fixtures', f));
      for (const q of j.questions ?? j.cases ?? []) if (typeof q.question === 'string') out.push(q.question);
    } catch { /* geen vragenbestand */ }
  }
  return out;
}

function assemble(all: { c: EvalCorpus; kbHash: string; docs: KbDoc[]; qs: QRow[]; labels: Record<string, LabelItem>; e1: E1Row[]; e1Labels: Record<string, LabelItem>; xcheck: Record<string, XcheckItem> }[]) {
  const date = new Date().toISOString().slice(0, 10);
  const prior = existingQuestions();
  const seen: string[] = [];
  const cases: TestCase[] = [];
  const dropped: Record<string, number> = {};
  const drop = (why: string) => (dropped[why] = (dropped[why] ?? 0) + 1);

  for (const a of all) {
    // E2
    for (const q of a.qs) {
      const label = a.labels[q.qid];
      if (!label) { drop('e2_geen_label'); continue; }
      if (isNearDuplicate(q.question, [...prior, ...seen])) { drop('e2_duplicaat'); continue; }
      const flags: string[] = [];
      const facts = buildFacts(a.docs, label, flags);
      const answerable = label.answerability === 'answerable' || label.answerability === 'partial';
      if (answerable && !facts.some((f) => f.required)) { drop('e2_geen_geldig_verplicht_feit'); continue; }
      const x = a.xcheck[q.qid];
      if (!x) flags.push('xcheck_ontbreekt');
      else if (yesNo(x.answerability) !== yesNo(label.answerability)) flags.push('xmodel_beantwoordbaarheid');
      seen.push(q.question);
      cases.push({
        id: `${SET}-e2-${q.qid}`, set: 'e2', split: q.promptId === 'A' ? 'tune' : 'toets', corpus: a.c.corpus,
        priorTurns: q.prior_turns ?? [], question: q.question, persona: q.persona, category: q.category,
        answerability: label.answerability, facts,
        expect: { accept: label.accept, mustNotAssert: label.must_not_assert },
        flags,
        provenance: { generatorModel: q.model, promptId: `q${q.promptId}`, labelModel: OPUS, kbHash: a.kbHash, setVersion: SET, verifiedBy: x ? 'span+xmodel' : 'span', date },
      });
    }
    // E1
    const e1Order = seededShuffle(a.e1, Number.parseInt(sha256(a.c.corpus).slice(0, 8), 16));
    const tuneN = a.c.role === 'holdout' ? 0 : Math.round(e1Order.length * E1_TUNE_SHARE);
    e1Order.forEach((g, idx) => {
      if (isNearDuplicate(g.question, [...prior, ...seen])) { drop('e1_duplicaat'); return; }
      const flags: string[] = [];
      const facts = buildFacts(a.docs, g, flags);
      if (g.dimension === 'controle_beantwoordbaar') {
        if (!facts.some((f) => f.required)) { drop('e1_controle_zonder_feit'); return; }
        const x = a.xcheck[g.qid];
        if (x && yesNo(x.answerability) !== 'ja') flags.push('xmodel_beantwoordbaarheid');
      }
      if (g.dimension === 'valse_premisse' && !facts.some((f) => f.required)) { drop('e1_premisse_zonder_feit'); return; }
      seen.push(g.question);
      cases.push({
        id: `${SET}-e1-${g.qid}`, set: 'e1', split: idx < tuneN ? 'tune' : 'toets', corpus: a.c.corpus,
        priorTurns: g.prior_turns ?? [], question: g.question, persona: 'veiligheidscase', category: g.dimension,
        answerability: g.answerability, facts, expect: { accept: g.accept, mustNotAssert: g.must_not_assert },
        flags,
        provenance: { generatorModel: OPUS, promptId: 'e1', labelModel: OPUS, kbHash: a.kbHash, setVersion: SET, verifiedBy: a.xcheck[g.qid] ? 'span+xmodel' : 'span', date },
      });
    });
  }

  // Toets = alleen schone cases (geen enkele vlag); gevlagde toets-kandidaten gaan naar tune.
  for (const c of cases) if (c.split === 'toets' && c.flags.length) c.split = 'tune';
  // Holdout-corpus nooit in tune.
  const holdout = new Set(EVAL_CORPORA.filter((c) => c.role === 'holdout').map((c) => c.corpus));
  const kept = cases.filter((c) => !(c.split === 'tune' && holdout.has(c.corpus)));
  // E2 per corpus gelijk aftoppen (acme is groter gegenereerd), in vaste volgorde.
  const count: Record<string, number> = {};
  const final = kept.filter((c) => {
    if (c.set !== 'e2') return true;
    const k = `${c.corpus}/${c.split}`;
    count[k] = (count[k] ?? 0) + 1;
    if (count[k] > E2_CAP[c.split]) { drop(`e2_${c.split}_boven_cap`); return false; }
    return true;
  });
  const pick = (set: 'e1' | 'e2', split: 'tune' | 'toets') => final.filter((c) => c.set === set && c.split === split);
  const files = { 'e2-tune': pick('e2', 'tune'), 'e2-toets': pick('e2', 'toets'), 'e1-tune': pick('e1', 'tune'), 'e1-toets': pick('e1', 'toets') };
  assertDisjoint([...files['e2-tune'], ...files['e1-tune']], [...files['e2-toets'], ...files['e1-toets']]);

  const manifest: Record<string, unknown> = { setVersion: SET, createdAt: new Date().toISOString(), dropped, files: {} };
  for (const [name, rows] of Object.entries(files)) {
    const body = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    writeFileSync(join(root, `${name}.jsonl`), body);
    const perCorpus: Record<string, number> = {};
    const perCategory: Record<string, number> = {};
    for (const r of rows) {
      perCorpus[r.corpus] = (perCorpus[r.corpus] ?? 0) + 1;
      perCategory[r.category] = (perCategory[r.category] ?? 0) + 1;
    }
    (manifest.files as Record<string, unknown>)[name] = {
      n: rows.length, sha256: sha256(body), perCorpus, perCategory,
      flagged: rows.filter((r) => r.flags.length).length,
    };
  }
  manifest.kbHashes = Object.fromEntries(all.map((a) => [a.c.corpus, a.kbHash]));
  manifest.targets = TARGET;
  writeJson(join(root, 'MANIFEST.json'), manifest);
  return manifest;
}

async function main() {
  assertRunAllowed({ estimateUsd: Math.min(CAP, 22) });
  const corpora = EVAL_CORPORA.filter((c) => !ONLY || c.corpus === ONLY);
  const all = [];
  for (const c of corpora) {
    console.log(`\n▶ ${c.corpus}`);
    const { docs, kbHash } = loadEvalKb(c);
    const qs = await stepQuestions(c, docs);
    const qIn = qs.map((q) => ({ qid: q.qid, priorTurns: q.prior_turns ?? [], question: q.question }));
    const labels = await stepLabel(c, docs, qIn, 'e2');
    if (UNTIL === 'label') continue;
    const e1 = await stepE1(c, docs);
    if (UNTIL === 'e1') continue;
    const controls = e1.filter((x) => x.dimension === 'controle_beantwoordbaar').map((x) => ({ qid: x.qid, priorTurns: x.prior_turns ?? [], question: x.question }));
    const xcheck = await stepXcheck(c, docs, [...qIn, ...controls]);
    all.push({ c, kbHash, docs, qs, labels, e1, e1Labels: {}, xcheck });
    console.log(`  kosten tot nu toe: $${budget.spentUsd.toFixed(2)} (${budget.calls} calls)`);
  }
  console.log(`\nkosten deze run: $${budget.spentUsd.toFixed(2)} over ${budget.calls} calls`);
  if (UNTIL || ONLY) return;
  const m = assemble(all) as { files: Record<string, { n: number; flagged: number; perCorpus: Record<string, number> }>; dropped: Record<string, number> };
  console.log('\nTESTSET', SET);
  for (const [k, v] of Object.entries(m.files)) console.log(`  ${k}: ${v.n} (gevlagd ${v.flagged}) ${JSON.stringify(v.perCorpus)}`);
  console.log('  afgevallen:', JSON.stringify(m.dropped));
  console.log(`→ ${root}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌', e instanceof Error ? e.message : e);
    console.error(`kosten tot de fout: $${budget.spentUsd.toFixed(2)}`);
    process.exit(1);
  });
