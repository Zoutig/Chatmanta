# Luna-pipeline-onderzoek (zuinige route) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bepalen welke LLM-hulpstappen vóór het eerste token weg kunnen nu Luna het antwoord genereert (doel: laagste TTFT zonder meetbaar kwaliteitsverlies t.o.v. v0.11b), Sol als judge invoeren, en v0.11b-instelling naar V1 brengen — binnen ~$3-4 OpenAI-spend.

**Architecture:** Nieuwe gedrag komt uitsluitend als V0-bot-versies (config in `lib/v0/server/bots.ts`) en opt-in vlaggen/args; defaults blijven byte-identiek (V0 én V1 delen `lib/rag/run-rag-query.ts`). Goedkoop itereren via een dev-set van ~40 vragen in een nieuwe `--no-judge`-modus (antwoorden naar JSON, Claude-judge $0); Sol-judge alleen voor de eindvergelijking v0.11b ↔ finalist.

**Tech Stack:** TypeScript, Node `node:test` (via `npm run test:unit`, auto-discovery van `__tests__`-mappen), OpenAI SDK (Chat Completions), Supabase (`eval_runs`, `eval_questions`), tsx-scripts.

**Spec:** `docs/superpowers/specs/2026-10-05-luna-pipeline-onderzoek-design.md`

**Werkmap:** worktree `C:\Users\solys\Documents\Code\chatmanta-luna-test`, branch `feat/seb/luna-test`. Gebruik relatieve paden. Vóór elke commit: `git rev-parse --abbrev-ref HEAD` moet `feat/seb/luna-test` geven.

**Billable-regel:** stappen gemarkeerd 💰 pas uitvoeren na expliciet akkoord van Sebastiaan in de chat (noem de geschatte kosten). Nooit `bots.ts` editen terwijl een eval-run loopt.

**Bestandsencoding:** repo-bestanden zijn CRLF. Edit-tool werkt; bij scripted patches CRLF normaliseren.

---

## File Structure

| Bestand | Rol | Taak |
|---|---|---|
| `lib/v0/server/eval-judge-model.ts` (nieuw) | Resolveert judge-model uit `--judge-model=`/env, default `gpt-4o` | 2 |
| `lib/v0/server/__tests__/eval-judge-model.test.ts` (nieuw) | Unit-tests resolver | 2 |
| `lib/v0/server/eval.ts` | Judge gebruikt resolver + `openaiChatParams` + `costForModelUsd`; `runEvalRow` krijgt `skipJudge` | 2, 5 |
| `scripts/v0-eval-run.ts` | Args `--judge-model=`, `--no-judge`, `--out=`, `--interleave` | 2, 5 |
| `scripts/v0-eval-report.ts` | Arg `--judge-model=` filtert rijen | 3 |
| `lib/v0/server/eval-jobs.ts` (nieuw) + test | Pure job-ordering (version-major vs interleaved) | 5 |
| `eval-fixtures/dev-set-luna.json` (nieuw) | ~40 slugs, per categorie | 6 |
| `scripts/v0-dev-set-select.ts` (nieuw) | $0 selectie-hulp uit `eval_questions` | 6 |
| `lib/v0/server/bots.ts` | Varianten v0.12a1/a2/a3 | 7 |
| `app/v1/app/rag-config.ts` | V1_OVERRIDES: Luna voor antwoord, 4o-mini aux | 4 |
| `lib/ai/llm.ts` | `openaiChatParams` + optionele `service_tier` via env | 10 |
| `docs/LUNA_ONDERZOEK_RESULTATEN.md` (nieuw) | Resultaten + besluit | 9, 11 |

---

### Task 1: Diagnose lege `production_ready`/`answer_length_appropriate` ($0)

Spec-eis: prod-ready is advisory tot verklaard is waarom deze velden leeg staan.

**Files:**
- Create (tijdelijk, niet committen): `_diag.ts` in worktree-root

- [ ] **Step 1: Tel nulls per versie**

```ts
// _diag.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
for (const v of ['v0.10', 'v0.11', 'v0.11b']) {
  const { data, error } = await sb.from('eval_runs')
    .select('production_ready, answer_length_appropriate, judge_parse_error, judge_reasoning')
    .eq('bot_version', v);
  if (error) throw error;
  const n = data.length;
  const nullLen = data.filter((r) => r.answer_length_appropriate === null).length;
  const nullPr = data.filter((r) => r.production_ready === null).length;
  const parseErr = data.filter((r) => r.judge_parse_error).length;
  console.log(v, { n, nullLen, nullPr, parseErr, sample: data.find((r) => r.judge_parse_error)?.judge_reasoning?.slice(0, 200) });
}
```

Run: `node --env-file=.env.local --import tsx _diag.ts` (controleer eerst de exacte env-namen in `.env.local`; gebruik dezelfde als `scripts/v0-eval-report.ts`).
Expected: per versie aantallen. Als `parseErr` ≈ `nullLen`: judge-JSON incompleet (vermoedelijk afkap op `JUDGE_MAX_TOKENS = 900` of ontbrekend veld).

- [ ] **Step 2: Conclusie vastleggen**

Verwijder `_diag.ts`. Schrijf de bevinding (1 alinea + getallen) in `docs/LUNA_ONDERZOEK_RESULTATEN.md` onder `## Diagnose prod-ready`. Als de oorzaak `max_tokens`-afkap is: Task 2 zet voor Sol `maxTokens` op 1500 (reasoning uit, dus output = alleen JSON). Geen andere fix in dit plan — prod-ready blijft advisory.

- [ ] **Step 3: Commit**

```bash
git add docs/LUNA_ONDERZOEK_RESULTATEN.md
git commit -F <msgfile>   # "docs(eval): diagnose lege prod-ready-velden" + Co-Authored-By-regel
```

---

### Task 2: Judge-model instelbaar (Sol-ready)

**Files:**
- Create: `lib/v0/server/eval-judge-model.ts`
- Create: `lib/v0/server/__tests__/eval-judge-model.test.ts`
- Modify: `lib/v0/server/eval.ts` (r.33 `JUDGE_MODEL`, r.45-46 tarieven, r.440-444 en r.628-632 calls, r.946 en r.1021 `judge_model`)
- Modify: `scripts/v0-eval-run.ts` (r.37 `JUDGE_MODEL`, r.306)

- [ ] **Step 1: Failing test**

```ts
// lib/v0/server/__tests__/eval-judge-model.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveJudgeModel } from '../eval-judge-model';

test('resolveJudgeModel — default gpt-4o', () => {
  assert.equal(resolveJudgeModel([], {}), 'gpt-4o');
});
test('resolveJudgeModel — CLI wint van env', () => {
  assert.equal(resolveJudgeModel(['--judge-model=gpt-6-sol'], { EVAL_JUDGE_MODEL: 'gpt-4o' }), 'gpt-6-sol');
});
test('resolveJudgeModel — env als geen CLI', () => {
  assert.equal(resolveJudgeModel([], { EVAL_JUDGE_MODEL: 'gpt-6-sol' }), 'gpt-6-sol');
});
test('resolveJudgeModel — onbekend model faalt hard (geen stille $0-kosten)', () => {
  assert.throws(() => resolveJudgeModel(['--judge-model=gpt-9'], {}), /onbekend judge-model/);
});
```

- [ ] **Step 2: Run, verwacht FAIL**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '../eval-judge-model'`.

- [ ] **Step 3: Implementatie**

```ts
// lib/v0/server/eval-judge-model.ts
// Judge-model voor de V0-eval. Default gpt-4o (historische baseline). Override via
// `--judge-model=<id>` of env EVAL_JUDGE_MODEL. Alleen modellen met een tarief in
// MODEL_COSTS_USD — anders zou judge-cost stil 0 loggen.
import { MODEL_COSTS_USD } from '@/lib/ai/llm';

export const DEFAULT_JUDGE_MODEL = 'gpt-4o';

export function resolveJudgeModel(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): string {
  const cli = argv.map((a) => a.match(/^--judge-model=(.+)$/)?.[1]).find(Boolean);
  const model = cli ?? env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
  if (!(model in MODEL_COSTS_USD)) {
    throw new Error(`onbekend judge-model "${model}" — voeg het eerst toe aan MODEL_COSTS_USD`);
  }
  return model;
}

/** Eén keer per proces geresolved (eval.ts + runner lezen dezelfde waarde). */
export const JUDGE_MODEL = resolveJudgeModel(process.argv.slice(2), process.env);
```

In `lib/v0/server/eval.ts`:
- Vervang `const JUDGE_MODEL = 'gpt-4o';` door `import { JUDGE_MODEL } from './eval-judge-model';` (bovenaan bij de imports) en verwijder de constante.
- Voeg import toe: `import { costForModelUsd, openaiChatParams } from '@/lib/ai/llm';`
- Verwijder `JUDGE_INPUT_PER_M_USD` / `JUDGE_OUTPUT_PER_M_USD` (r.45-46).
- Absolute judge-call (r.440-444) wordt:

```ts
    const resp = await openai().chat.completions.create({
      model: JUDGE_MODEL,
      ...openaiChatParams(JUDGE_MODEL, {
        temperature: JUDGE_TEMPERATURE,
        maxTokens: JUDGE_MODEL.startsWith('gpt-6') ? 1500 : JUDGE_MAX_TOKENS,
      }),
      response_format: { type: 'json_object' },
```

- Pairwise-call (r.628-632) idem met `PAIRWISE_JUDGE_MAX_TOKENS` (geen 1500-uitzondering nodig).
- Beide kostberekeningen (r.466-468 en r.655-657) worden `const costUsd = costForModelUsd(JUDGE_MODEL, inputTokens, outputTokens);`

In `scripts/v0-eval-run.ts`: vervang `const JUDGE_MODEL = 'gpt-4o';` door `import { JUDGE_MODEL } from '../lib/v0/server/eval-judge-model';` en voeg een logregel toe na `console.log(\`  concurrency ...\`)`:

```ts
  console.log(`  judge        : ${JUDGE_MODEL}`);
```

- [ ] **Step 4: Tests + typecheck**

Run: `npm run test:unit && npm run typecheck`
Expected: alle tests PASS (incl. 4 nieuwe), tsc zonder output.

- [ ] **Step 5: Sol-judge-smoke (💰 ~$0,01, vraag akkoord — mag gebundeld met Task 4)**

Run: `npm run eval:run -- --versions=v0.11b --slugs=<één bestaande answer-slug> --no-pairwise --judge-model=gpt-6-sol`
Expected: 1 rij, `judge_parse_error=false`, C/P/G gevuld. Verwijder daarna die ene rij niet — Task 3 filtert op judge.

- [ ] **Step 6: Commit** — `feat(eval): judge-model instelbaar (--judge-model / EVAL_JUDGE_MODEL), GPT-6-params + tarieven via MODEL_COSTS_USD`

---

### Task 3: Report filtert op judge-model

**Files:**
- Modify: `scripts/v0-eval-report.ts` (query rond r.100-117)

- [ ] **Step 1: Implementatie**

Na de bestaande `parseListArg`/argv-afhandeling bovenin (of, als die ontbreekt, direct boven de query):

```ts
const judgeModelFilter = process.argv
  .slice(2)
  .map((a) => a.match(/^--judge-model=(.+)$/)?.[1])
  .find(Boolean) ?? null;
```

Zoek de query-builder `sb.from('eval_runs').select(...)` en voeg vóór de `await`-afronding toe (als de builder in een variabele staat; anders de keten aanpassen):

```ts
let runQuery = sb.from('eval_runs').select(/* bestaande kolommen ongewijzigd */);
if (judgeModelFilter) runQuery = runQuery.eq('judge_model', judgeModelFilter);
const { data: runRows, error: runErr } = await runQuery /* + bestaande .order/.range ongewijzigd */;
```

Pas de kopregel aan zodat het filter zichtbaar is:

```ts
lines.push(`Snapshot van de meest-recente runs per (vraag × versie). Judge: ${judgeModelFilter ?? latestRuns[0]?.judge_model ?? 'unknown'}${judgeModelFilter ? ' (gefilterd)' : ''}.`);
```

- [ ] **Step 2: Verifieer ($0)**

Run: `npm run eval:report -- --judge-model=gpt-4o` en `npm run eval:report -- --judge-model=gpt-6-sol`
Expected: eerste toont v0.10/v0.11/v0.11b met gpt-4o; tweede alleen de smoke-rij uit Task 2.

- [ ] **Step 3: Commit** — `feat(eval): eval:report --judge-model filter`

---

### Task 4: Spoor 1 — V1 op Luna voor het antwoord

**Files:**
- Modify: `app/v1/app/rag-config.ts` (`V1_OVERRIDES`, r.16-34)

- [ ] **Step 1: Override toevoegen**

Binnen `const V1_OVERRIDES = { ... }`, direct na `label: 'V1',`-blok (bij de andere modelloze velden):

```ts
  // Luna voor de antwoord-generatie, hulpstappen op gpt-4o-mini (= v0.11b-instelling;
  // eval 2026-10-05: grounding G 3,76→4,16, botkosten −29%, TTFT ≈ gelijk). Zie
  // docs/superpowers/specs/2026-10-05-luna-pipeline-onderzoek-design.md.
  chatModel: 'gpt-6-luna',
  auxModel: 'gpt-4o-mini',
```

- [ ] **Step 2: Typecheck + unit**

Run: `npm run typecheck && npm run test:unit` → groen.

- [ ] **Step 3: V1-eval (💰 < $0,10, vraag akkoord)**

Run: `npm run v1:eval` (vereist `V1_SEED_ORG_ID` + V1-Supabase-env in `.env.local`; ontbreekt het → stop en meld, niet gokken).
Expected: `answers.json` geschreven, deterministische safety-checks groen. Laat de eval-runner-agent (of jijzelf) de antwoorden bron-gegrond beoordelen ($0) en noteer in `docs/LUNA_ONDERZOEK_RESULTATEN.md` onder `## Spoor 1 — V1`.

- [ ] **Step 4: Commit** — `feat(v1): antwoord-generatie op gpt-6-luna, hulpstappen gpt-4o-mini (v0.11b-instelling)`

---

### Task 5: `--no-judge`, `--out`, `--interleave` in eval:run

**Files:**
- Create: `lib/v0/server/eval-jobs.ts`
- Create: `lib/v0/server/__tests__/eval-jobs.test.ts`
- Modify: `lib/v0/server/eval.ts` (`runEvalRow` args r.820-828; judge-aanroep r.982)
- Modify: `scripts/v0-eval-run.ts` (args r.73-85, job-bouw r.166-173, insert r.226-231, pairwise)

- [ ] **Step 1: Failing test voor job-ordering**

```ts
// lib/v0/server/__tests__/eval-jobs.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildJobs } from '../eval-jobs';

const qs = [{ id: 'q1' }, { id: 'q2' }];
test('buildJobs — default version-major (huidig gedrag)', () => {
  const j = buildJobs(qs, ['a', 'b'], 1, false).map((x) => `${x.question.id}@${x.botVersion}`);
  assert.deepEqual(j, ['q1@a', 'q2@a', 'q1@b', 'q2@b']);
});
test('buildJobs — interleave wisselt versies per vraag', () => {
  const j = buildJobs(qs, ['a', 'b'], 1, true).map((x) => `${x.question.id}@${x.botVersion}`);
  assert.deepEqual(j, ['q1@a', 'q1@b', 'q2@a', 'q2@b']);
});
test('buildJobs — runs vermenigvuldigt, interleave per run', () => {
  const j = buildJobs([{ id: 'q1' }], ['a', 'b'], 2, true).map((x) => `${x.botVersion}#${x.runIndex}`);
  assert.deepEqual(j, ['a#0', 'b#0', 'a#1', 'b#1']);
});
```

- [ ] **Step 2: Run, verwacht FAIL** — `npm run test:unit` → module ontbreekt.

- [ ] **Step 3: Implementatie**

```ts
// lib/v0/server/eval-jobs.ts
// Pure job-ordering voor eval:run. Interleave = per vraag alle versies direct na
// elkaar, zodat OpenAI-latency-schommelingen over de dag beide versies gelijk
// raken (eerlijke TTFT-vergelijking).
export type EvalJob<Q> = { question: Q; botVersion: string; runIndex: number };

export function buildJobs<Q>(
  questions: readonly Q[],
  versions: readonly string[],
  runs: number,
  interleave: boolean,
): EvalJob<Q>[] {
  const jobs: EvalJob<Q>[] = [];
  if (interleave) {
    for (let r = 0; r < runs; r++)
      for (const q of questions)
        for (const v of versions) jobs.push({ question: q, botVersion: v, runIndex: r });
    return jobs;
  }
  for (const v of versions)
    for (const q of questions)
      for (let r = 0; r < runs; r++) jobs.push({ question: q, botVersion: v, runIndex: r });
  return jobs;
}
```

In `lib/v0/server/eval.ts` → `runEvalRow` args uitbreiden:

```ts
  /** true = sla de LLM-judge over (scores null, judge_cost 0). Voor goedkope
      dev-set-runs waarvan de antwoorden apart door Claude ($0) beoordeeld worden. */
  skipJudge?: boolean;
```

En r.982 vervangen door:

```ts
  const judge: JudgeScores = args.skipJudge
    ? {
        ...EMPTY_JUDGE_FAIL,
        reasoning: 'skipJudge — beoordeling extern (Claude)',
        parseError: false,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
      }
    : await runJudge({ question, response, organizationId });
```

(Controleer dat `JudgeScores` de velden van `EMPTY_JUDGE_FAIL` + `reasoning/parseError/inputTokens/outputTokens/costUsd/latencyMs` heeft — zo niet, pas de spread aan op het echte type; `npm run typecheck` vangt het.)

In `scripts/v0-eval-run.ts`:

```ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildJobs } from '../lib/v0/server/eval-jobs';
// ...bij de andere args:
const noJudge = process.argv.includes('--no-judge');
const interleave = process.argv.includes('--interleave');
const outPath = parseStringArg('out');
if (noJudge && !outPath) fail('--no-judge vereist --out=<pad.json> (antwoorden gaan niet naar eval_runs)');
```

Vervang de job-bouw-lus door `const jobs = buildJobs(questions, versions, runsCount, interleave);` (type `Job` = `EvalJob<EvalQuestion>`).

Geef `skipJudge: noJudge` mee aan `runEvalRow`. Vervang het insert-blok door:

```ts
      if (noJudge) {
        devRows.push(row);
      } else {
        const { error: insErr } = await sb.from('eval_runs').insert(row);
        if (insErr) {
          console.error(`  ✗ ${tag} — insert: ${insErr.message}`);
          failed++;
          return null;
        }
      }
```

met `const devRows: EvalRunRow[] = [];` vóór de `withConcurrency`-aanroep, en ná de absolute-eval-lus:

```ts
  if (noJudge && outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(devRows, null, 2));
    console.log(`  → ${devRows.length} antwoorden geschreven naar ${outPath} (geen DB-writes)`);
  }
```

Forceer pairwise uit bij `--no-judge`: waar `skipPairwise` gebruikt wordt, gebruik `skipPairwise || noJudge`. Voeg logregels toe: `judge: OFF (--no-judge)` en `volgorde: interleaved`.

- [ ] **Step 4: Tests + typecheck** — `npm run test:unit && npm run typecheck` → groen.

- [ ] **Step 5: Droogtest (💰 ~$0,002, mag gebundeld met Task 8-akkoord)**

Run: `npm run eval:run -- --versions=v0.10,v0.11b --slugs=<1 slug> --no-judge --interleave --out=eval-out/dev/smoke.json`
Expected: 2 rijen in JSON, `judge_cost_usd: 0`, `stage_timings_ms.first_token_ms` gevuld, géén nieuwe rijen in `eval_runs`.

- [ ] **Step 6: Commit** — `feat(eval): --no-judge/--out/--interleave voor goedkope dev-set-runs`

---

### Task 6: Dev-set samenstellen ($0)

**Files:**
- Create: `scripts/v0-dev-set-select.ts`
- Create: `eval-fixtures/dev-set-luna.json`

- [ ] **Step 1: Selectiescript**

```ts
// scripts/v0-dev-set-select.ts — $0, alleen DB-read. Print kandidaat-slugs per categorie.
// Run: node --env-file=.env.local --import tsx scripts/v0-dev-set-select.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data, error } = await sb
  .from('eval_questions')
  .select('slug, question, expected_kind, conversation_history, must_not_contain');
if (error) throw error;
const multiTurn = data.filter((q) => (q.conversation_history ?? []).length > 0);
const nonAnswer = data.filter((q) => q.expected_kind === 'smalltalk' || q.expected_kind === 'fallback');
const hardFact = data.filter((q) => /\b(prijs|kost|tarief|€|euro|datum|telefoon|e-?mail|uur|dagen|percentage|%)\b/i.test(q.question));
const multiPart = data.filter((q) => (q.question.match(/\?/g) ?? []).length > 1 || /\b(en|ook|daarnaast)\b.*\?/i.test(q.question));
for (const [name, set] of Object.entries({ multiTurn, nonAnswer, hardFact, multiPart })) {
  console.log(`\n## ${name} (${set.length})`);
  for (const q of set) console.log(`${q.slug}\t${q.question.slice(0, 90)}`);
}
console.log(`\ntotaal vragen: ${data.length}`);
```

(Controleer env-namen tegen `scripts/v0-eval-report.ts` en pas aan als ze afwijken.)

- [ ] **Step 2: Draaien en kiezen**

Run het script. Kies 40 slugs met quota: multi-turn 8, smalltalk/fallback 6, hard-fact 8, multi-part (decompose-gevoelig) 8, overige answer 10. Neem bij voorkeur de 17 slugs met G≤1 bij v0.11b mee (verdeeld over de categorieën). Zijn er < 8 multi-turn-vragen: noteer het tekort in `docs/LUNA_ONDERZOEK_RESULTATEN.md` (spec: dan ~10 cases toevoegen — aparte vervolgtaak, níet in dit plan om scope klein te houden).

- [ ] **Step 3: Fixture schrijven**

```json
{
  "description": "Luna-pipeline dev-set (2026-10-05) — 40 slugs, gequoteerd per categorie",
  "categories": {
    "multiTurn": ["<slug>", "..."],
    "nonAnswer": ["..."],
    "hardFact": ["..."],
    "multiPart": ["..."],
    "answer": ["..."]
  }
}
```

(Vul met de echte slugs uit Step 2 — geen placeholders committen.) De `--slugs=`-lijst voor eval:run = alle categorieën samengevoegd, komma-gescheiden.

- [ ] **Step 4: Commit** — `chore(eval): Luna dev-set (40 vragen) + selectiescript`

---

### Task 7: Ablatie-varianten als bot-versies (config-only)

Pre-process blijft staan in alle varianten: het doet al routing (smalltalk/off-topic/search) + herschrijven in één call, en zonder routing krijgt "hoi" een fallback. Ablatie richt zich op decompose, HyDE en rerank.

**Files:**
- Modify: `lib/v0/server/bots.ts` (na `V0_11B`, registry, `BOT_VERSIONS_ORDERED`)

- [ ] **Step 1: Varianten toevoegen**

Direct na de `V0_11B`-definitie:

```ts
// v0.12a* — Luna-pipeline-ablatie (spec 2026-10-05). Basis = v0.11b. Elk zet één
// groep LLM-hulpstappen vóór het eerste token uit; pre-process (routing+rewrite)
// blijft. Experimenten, NIET gepromoveerd.
const V0_12A1: BotConfig = {
  ...V0_11B,
  version: 'v0.12a1',
  label: 'v0.12a1 — v0.11b zonder LLM-rerank (experiment)',
  description: 'Ablatie: rerank uit; Luna krijgt meer chunks (8) en selecteert zelf.',
  rerank: 'none',
  finalContextMaxChunks: 8,
};
const V0_12A2: BotConfig = {
  ...V0_11B,
  version: 'v0.12a2',
  label: 'v0.12a2 — v0.11b zonder decompose + HyDE (experiment)',
  description: 'Ablatie: queryDecomposition en HyDE uit.',
  queryDecomposition: false,
  useHyDE: false,
  selectiveHyDE: false,
};
const V0_12A3: BotConfig = {
  ...V0_11B,
  version: 'v0.12a3',
  label: 'v0.12a3 — lean: alleen pre-process vóór het antwoord (experiment)',
  description: 'Ablatie: rerank, decompose en HyDE uit; 8 chunks naar Luna.',
  rerank: 'none',
  finalContextMaxChunks: 8,
  queryDecomposition: false,
  useHyDE: false,
  selectiveHyDE: false,
};
```

Controleer vooraf in `lib/rag/types.ts` (r.224-240) dat `finalContextMaxChunks` en `retrievalTopK` zo heten en dat `retrievalTopK` van v0.11b ≥ 8 is (zie `npx tsx`-print zoals in de sessie); zo niet, zet `retrievalTopK: 10` erbij in a1 en a3.

Registry: voeg `[V0_12A1.version]: V0_12A1, [V0_12A2.version]: V0_12A2, [V0_12A3.version]: V0_12A3,` toe aan `BOTS` en de drie `.version`s achteraan `BOT_VERSIONS_ORDERED`. `LATEST_BOT_VERSION` blijft `V0_10.version`.

- [ ] **Step 2: Typecheck + unit** — groen. Verifieer config met:

```bash
node --conditions=react-server --import tsx -e "import('./lib/v0/server/bots.ts').then(m=>{for(const v of ['v0.12a1','v0.12a2','v0.12a3']){const b=m.BOTS[v];console.log(v,b.chatModel,b.auxModel,b.rerank,b.queryDecomposition,b.useHyDE,b.finalContextMaxChunks)}})"
```

Expected: alle drie `gpt-6-luna gpt-4o-mini`, juiste vlaggen.

- [ ] **Step 3: Commit** — `feat(v0): ablatie-varianten v0.12a1-a3 (Luna-pipeline-onderzoek)`

---

### Task 8: Dev-set-run 💰 (~$0,5, vraag akkoord)

- [ ] **Step 1: Run (bot-only, interleaved, 2 runs)**

```bash
npm run eval:run -- --versions=v0.11b,v0.12a1,v0.12a2,v0.12a3 --slugs=<40 slugs uit dev-set-luna.json> --runs=2 --interleave --no-judge --out=eval-out/dev/luna-ablatie-1.json
```

Expected: 320 rijen in JSON, 0 failed. Geschatte spend: ~$0,3-0,5 (alleen bot).

- [ ] **Step 2: Claude-judge ($0) via eval-runner-agent**

Dispatch `eval-runner` met: het JSON-pad, de spec-beslisregel, opdracht per rij C/P/G (0-5) bron-gegrond te scoren (bron = `bot_sources[].excerpt`), routing-correct (`expected_kind` vs `bot_kind`), en per variant te rapporteren: gemiddelde C/G, G≤1-telling, routing-fouten, gemiddelde woorden, TTFT mediaan/p90 (`stage_timings_ms.first_token_ms`, alleen `bot_kind=answer`), en gepaarde per-vraag beter/slechter/gelijk vs v0.11b per categorie (multi-part!). Geen DB-writes, geen extra billable calls.

- [ ] **Step 3: Besluit vastleggen**

In `docs/LUNA_ONDERZOEK_RESULTATEN.md` onder `## Dev-set ablatie`: tabel + toepassing beslisregel → kies **één finalist**. Gate: verliest v0.12a2/a3 duidelijk op `multiPart` → noteer "fused pre-process (decompose in pre-process-call) nodig" als vervolg-spec; bouw dat níet in dit plan.

- [ ] **Step 4: Commit** — `docs(eval): dev-set ablatie-resultaten + finalist`

---

### Task 9: Sol-eindvergelijking 💰 (~$3, vraag akkoord)

- [ ] **Step 1: Baseline v0.11b met Sol** (~$1,5)

```bash
npm run eval:run -- --versions=v0.11b --no-pairwise --judge-model=gpt-6-sol
```

- [ ] **Step 2: Finalist met Sol** (~$1,5) — sla over als finalist = v0.11b.

```bash
npm run eval:run -- --versions=<finalist> --no-pairwise --judge-model=gpt-6-sol
npm run eval:hard:run -- --versions=<finalist> --no-multi-run --max-cost=0.3
```

- [ ] **Step 3: Rapport** — `npm run eval:report -- --judge-model=gpt-6-sol` + hard-eval-report; laat eval-runner veto's/grensgevallen met Claude-judge dubbelchecken (cross-family). Noteer in resultatendoc: Sol-scores v0.11b vs gpt-4o-scores v0.11b (herijkingsverschil), finalist vs v0.11b, beslisregel-uitkomst.

- [ ] **Step 4: Commit** — `docs(eval): Sol-eindvergelijking v0.11b vs <finalist>`

---

### Task 10: Priority-tier-meting 💰 (~$0,1, vraag akkoord)

**Files:**
- Modify: `lib/ai/llm.ts` (`openaiChatParams`)
- Modify: `lib/ai/__tests__/chat-params.test.ts`

- [ ] **Step 1: Failing test**

```ts
test('openaiChatParams — OPENAI_SERVICE_TIER=priority voegt service_tier toe', () => {
  const prev = process.env.OPENAI_SERVICE_TIER;
  process.env.OPENAI_SERVICE_TIER = 'priority';
  try {
    assert.equal(
      (openaiChatParams('gpt-6-luna', { temperature: 0, maxTokens: 10 }) as { service_tier?: string }).service_tier,
      'priority',
    );
  } finally {
    if (prev === undefined) delete process.env.OPENAI_SERVICE_TIER; else process.env.OPENAI_SERVICE_TIER = prev;
  }
});
```

- [ ] **Step 2: FAIL verifiëren** — `npm run test:unit`.

- [ ] **Step 3: Implementatie** — in `openaiChatParams`, vóór beide `return`s een gedeelde extra:

```ts
  // Meet-hefboom (Luna-onderzoek): OPENAI_SERVICE_TIER=priority → snellere, ~2× duurdere
  // verwerking op ALLE calls. Alleen voor metingen; een klant-tier wordt later per org.
  const tier = process.env.OPENAI_SERVICE_TIER === 'priority' ? { service_tier: 'priority' as const } : {};
```

en spread `...tier` in beide return-objecten; breid het return-type uit met `& { service_tier?: 'priority' }`.

Let op: `costForModelUsd` kent geen priority-tarief → kosten in deze meting zijn onderschat (×~2); noteer dat in het rapport.

- [ ] **Step 4: Tests + typecheck** — groen. Commit: `feat(llm): OPENAI_SERVICE_TIER=priority meet-hefboom`.

- [ ] **Step 5: Meting (TTFT only)**

PowerShell: `$env:OPENAI_SERVICE_TIER='priority'; npm run eval:run -- --versions=<finalist> --slugs=<dev-set answer+hardFact+multiPart slugs> --no-judge --out=eval-out/dev/priority.json; Remove-Item Env:OPENAI_SERVICE_TIER`
Direct daarna zonder env dezelfde run naar `eval-out/dev/standard.json` (zelfde tijdvak). Vergelijk TTFT mediaan/p90.

---

### Task 11: Afronding

- [ ] **Step 1:** `docs/LUNA_ONDERZOEK_RESULTATEN.md` afmaken: samenvatting, finalist, priority-uitkomst, totale spend, open punten (fused pre-process? multi-turn-cases? prod-ready-fix?).
- [ ] **Step 2:** `Remove-Item -Recurse -Force .next` (indien aanwezig), dan `npm run typecheck && npm run build && npm run test:unit` — alle groen.
- [ ] **Step 3:** Commit, `git push -u origin feat/seb/luna-test` en `gh pr create` met volledig ingevulde `.github/pull_request_template.md` — **pas na akkoord van Sebastiaan** (outward-facing). Geen promotie van `LATEST_BOT_VERSION` in deze PR.
