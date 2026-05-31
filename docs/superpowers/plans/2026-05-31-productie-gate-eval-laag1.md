# Productie-gate Eval — Laag 1 Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voeg Groep 2 (operationele veto: latency/cost/error) en Groep 3 (refusal-calibratie) toe aan de Productie-gate Eval, bovenop de gemergede Laag 0.

**Architecture:** Pure aggregatie-functies in `hard-eval-checks.ts` (tsx-testbaar, $0), gevoed door drie nieuwe velden op `DeterministicVerdict` die de runner vastlegt (`latencyMs`, `refused`, `expectsRefusal`). De error-rate wordt een hard veto in `computeProductionGate`; latency/cost en de calibratie-rates worden als rapport-blokken getoond (waarschuwing/diagnostisch, géén veto in deze laag — conform spec §3 open beslissing 2). Geen nieuwe fixture-cases, geen migratie.

**Tech Stack:** TypeScript, tsx-runner, bestaande hard-eval-pijplijn (`scripts/v0-hard-eval-run.ts`, `scripts/v0-hard-eval-report.ts`).

---

## File Structure

- `lib/v0/server/hard-eval-checks.ts` — **Modify**: 3 velden op `DeterministicVerdict`; nieuwe pure helpers `percentile`, `computeOperationalMetrics`, `computeRefusalCalibration`; `operationalErrors`-veto in `computeProductionGate` + veld op `ProductionGateVerdict`.
- `scripts/test-hard-eval-checks.ts` — **Modify**: `dv()`-factory uitbreiden + nieuwe tests voor de 3 helpers + operational-error-veto.
- `scripts/v0-hard-eval-run.ts` — **Modify**: latency meten rond `runBotOnce`; `refused` + `expectsRefusal` op het verdict.
- `scripts/v0-hard-eval-report.ts` — **Modify**: `## Operationeel`-blok + `## Refusal-calibratie`-blok; `resolveBot` importeren voor budget-vergelijking.

Geen nieuwe files. Geen `eval-fixtures/*`-wijziging. Geen `supabase/migrations/*`.

---

### Task 1: Verdict-velden + operationele aggregatie (pure logica, TDD)

**Files:**
- Modify: `lib/v0/server/hard-eval-checks.ts`
- Test: `scripts/test-hard-eval-checks.ts`

- [ ] **Step 1: Breid `dv()`-factory uit met de 3 nieuwe velden (default-waarden)**

In `scripts/test-hard-eval-checks.ts`, in de `dv()`-factory, voeg defaults toe vóór `...over`:

```ts
    needsJudge: false, botCostUsd: 0, latencyMs: 0, refused: false,
    expectsRefusal: null, catastrophic: false, ...over,
```

- [ ] **Step 2: Schrijf de falende tests voor `percentile` + `computeOperationalMetrics`**

Voeg in `scripts/test-hard-eval-checks.ts` toe (na de bestaande gate-constanten-tests, vóór de fixture-validatie), en importeer `percentile, computeOperationalMetrics, computeRefusalCalibration` uit `../lib/v0/server/hard-eval-checks`:

```ts
// --- percentile + computeOperationalMetrics (Laag 1 — Groep 2) ---------------
check('percentile leeg → 0', percentile([], 0.5) === 0, true);
check('percentile p50 oneven (3)', percentile([10, 20, 30], 0.5) === 20, true);
check('percentile p95 top-10', percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95) === 10, true);
check('percentile p50 één waarde', percentile([42], 0.5) === 42, true);

const opv = [
  dv({ caseId: 'a', version: 'v1', latencyMs: 100, botCostUsd: 0.001, responseKind: 'answer', dimension: 'answer-quality' }),
  dv({ caseId: 'b', version: 'v1', latencyMs: 300, botCostUsd: 0.003, responseKind: 'answer', dimension: 'answer-quality' }),
  dv({ caseId: 'c', version: 'v1', latencyMs: 200, botCostUsd: 0.002, responseKind: 'error', dimension: 'answer-quality' }),
  dv({ caseId: 'd', version: 'v1', latencyMs: 50, botCostUsd: 0, responseKind: 'error', dimension: 'malformed-input' }),
];
const om = computeOperationalMetrics(opv)[0];
check('operationeel: sampleCount = 4', om.sampleCount === 4, true);
check('operationeel: p50 latency = 100 (sorted[50,100,200,300])', om.latencyP50Ms === 100, true);
check('operationeel: p95 latency = 300', om.latencyP95Ms === 300, true);
check('operationeel: max latency = 300', om.latencyMaxMs === 300, true);
check('operationeel: costTotal = 0.006', Math.abs(om.costTotalUsd - 0.006) < 1e-9, true);
check('operationeel: onverwachte error telt non-malformed (c)', om.unexpectedErrors.length === 1 && om.unexpectedErrors[0] === 'c', true);
check('operationeel: malformed-error telt NIET operationeel (d uitgesloten)', om.unexpectedErrors.includes('d') === false, true);
```

- [ ] **Step 3: Run de test — verwacht FAIL (functies bestaan nog niet)**

Run: `node --import tsx scripts/test-hard-eval-checks.ts`
Expected: FAIL — `percentile`/`computeOperationalMetrics` is not exported / not a function.

- [ ] **Step 4: Voeg de 3 verdict-velden toe aan `DeterministicVerdict`**

In `lib/v0/server/hard-eval-checks.ts`, in `DeterministicVerdict`, ná `botCostUsd: number;` en vóór `catastrophic: boolean;`:

```ts
  /** Wall-clock van de primaire bot-run in ms (Groep 2 — operationeel). */
  latencyMs: number;
  /** Klonk het antwoord als een weigering/doorverwijzing (fallback/smalltalk/refusal-marker)? — Groep 3. */
  refused: boolean;
  /** Verwachtte de case een weigering? (uit HardCase.expectsRefusal) — Groep 3 calibratie. null = n.v.t. */
  expectsRefusal: boolean | null;
```

- [ ] **Step 5: Implementeer `percentile` + `computeOperationalMetrics`**

In `lib/v0/server/hard-eval-checks.ts`, helemaal onderaan (na `computeProductionGate`), nieuwe sectie:

```ts
// ---------------------------------------------------------------------------
// Laag 1 — Groep 2 (operationeel: latency / cost / errors)
// ---------------------------------------------------------------------------

/** Nearest-rank percentiel. p in [0,1]. Lege input → 0. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

export type OperationalMetrics = {
  version: string;
  sampleCount: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyMaxMs: number;
  costMeanUsd: number;
  costP95Usd: number;
  costTotalUsd: number;
  /** caseIds met onverwachte error: responseKind==='error' op een NIET-malformed case. */
  unexpectedErrors: string[];
};

/** Aggregeer per versie de operationele metrieken uit de deterministische verdicts.
 *  Latency/cost = waarschuwing t.o.v. budget; onverwachte errors = hard veto (gate). */
export function computeOperationalMetrics(verdicts: DeterministicVerdict[]): OperationalMetrics[] {
  const versions = [...new Set(verdicts.map((v) => v.version))];
  return versions.map((version) => {
    const own = verdicts.filter((v) => v.version === version);
    const latencies = own.map((v) => v.latencyMs ?? 0);
    const costs = own.map((v) => v.botCostUsd ?? 0);
    const costTotalUsd = costs.reduce((s, c) => s + c, 0);
    const unexpectedErrors = own
      .filter((v) => v.responseKind === 'error' && v.dimension !== 'malformed-input')
      .map((v) => v.caseId);
    return {
      version,
      sampleCount: own.length,
      latencyP50Ms: Math.round(percentile(latencies, 0.5)),
      latencyP95Ms: Math.round(percentile(latencies, 0.95)),
      latencyMaxMs: latencies.length ? Math.max(...latencies) : 0,
      costMeanUsd: own.length ? costTotalUsd / own.length : 0,
      costP95Usd: percentile(costs, 0.95),
      costTotalUsd,
      unexpectedErrors,
    };
  });
}
```

- [ ] **Step 6: Run de test — verwacht PASS voor de operationele checks**

Run: `node --import tsx scripts/test-hard-eval-checks.ts`
Expected: de percentile/operationeel-checks PASS (calibratie-checks bestaan nog niet → komt in Task 2).

- [ ] **Step 7: Commit**

```bash
git add lib/v0/server/hard-eval-checks.ts scripts/test-hard-eval-checks.ts
git commit -m "feat(eval): operationele metrieken (latency/cost/error) — Groep 2 pure logica"
```

---

### Task 2: Refusal-calibratie (pure logica, TDD)

**Files:**
- Modify: `lib/v0/server/hard-eval-checks.ts`
- Test: `scripts/test-hard-eval-checks.ts`

- [ ] **Step 1: Schrijf de falende tests voor `computeRefusalCalibration`**

Voeg toe in `scripts/test-hard-eval-checks.ts` (direct na de operationele tests):

```ts
// --- computeRefusalCalibration (Laag 1 — Groep 3) ----------------------------
const cv = [
  dv({ caseId: 'q1', version: 'v1', expectsRefusal: false, refused: false }), // correct beantwoord
  dv({ caseId: 'q2', version: 'v1', expectsRefusal: false, refused: true }),  // over-refusal
  dv({ caseId: 'r1', version: 'v1', expectsRefusal: true, refused: true }),   // correct geweigerd
  dv({ caseId: 'r2', version: 'v1', expectsRefusal: true, refused: false }),  // under-refusal (hallucinatie-risico)
  dv({ caseId: 'x1', version: 'v1', expectsRefusal: null, refused: false }),  // n.v.t. — telt niet mee
];
const rc = computeRefusalCalibration(cv)[0];
check('calibratie: answerableTotal = 2', rc.answerableTotal === 2, true);
check('calibratie: overRefusals = 1', rc.overRefusals === 1, true);
check('calibratie: overRefusalRate = 50%', rc.overRefusalRate === 0.5, true);
check('calibratie: refusalExpectedTotal = 2', rc.refusalExpectedTotal === 2, true);
check('calibratie: underRefusals = 1', rc.underRefusals === 1, true);
check('calibratie: underRefusalRate = 50%', rc.underRefusalRate === 0.5, true);
check('calibratie: expectsRefusal=null telt niet mee', rc.answerableTotal + rc.refusalExpectedTotal === 4, true);
```

- [ ] **Step 2: Run — verwacht FAIL**

Run: `node --import tsx scripts/test-hard-eval-checks.ts`
Expected: FAIL — `computeRefusalCalibration is not a function`.

- [ ] **Step 3: Implementeer `computeRefusalCalibration`**

In `lib/v0/server/hard-eval-checks.ts`, na `computeOperationalMetrics`:

```ts
// ---------------------------------------------------------------------------
// Laag 1 — Groep 3 (refusal-calibratie: te streng ↔ te los)
// ---------------------------------------------------------------------------

export type RefusalCalibration = {
  version: string;
  /** expectsRefusal === false (de bot HOORT te antwoorden). */
  answerableTotal: number;
  /** answerable-cases waar de bot tóch weigerde. */
  overRefusals: number;
  overRefusalRate: number | null;
  /** expectsRefusal === true (de bot HOORT te weigeren/corrigeren). */
  refusalExpectedTotal: number;
  /** refusal-expected-cases waar de bot tóch antwoordde (hallucinatie-risico). */
  underRefusals: number;
  underRefusalRate: number | null;
};

/** Twee tegengestelde rates die de kern-spanning vangen (zie v0.9-saga):
 *  over-refusal (te streng) vs under-refusal/hallucinatie (te los). Beide ideaal ≈ 0.
 *  Berekend uit de al-bestaande per-case verdicts — geen extra bot-gen. */
export function computeRefusalCalibration(verdicts: DeterministicVerdict[]): RefusalCalibration[] {
  const versions = [...new Set(verdicts.map((v) => v.version))];
  return versions.map((version) => {
    const own = verdicts.filter((v) => v.version === version);
    const answerable = own.filter((v) => v.expectsRefusal === false);
    const refusalExpected = own.filter((v) => v.expectsRefusal === true);
    const overRefusals = answerable.filter((v) => v.refused).length;
    const underRefusals = refusalExpected.filter((v) => !v.refused).length;
    return {
      version,
      answerableTotal: answerable.length,
      overRefusals,
      overRefusalRate: answerable.length ? overRefusals / answerable.length : null,
      refusalExpectedTotal: refusalExpected.length,
      underRefusals,
      underRefusalRate: refusalExpected.length ? underRefusals / refusalExpected.length : null,
    };
  });
}
```

- [ ] **Step 4: Run — verwacht PASS**

Run: `node --import tsx scripts/test-hard-eval-checks.ts`
Expected: alle operationeel + calibratie checks PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/v0/server/hard-eval-checks.ts scripts/test-hard-eval-checks.ts
git commit -m "feat(eval): refusal-calibratie (over/under-refusal rates) — Groep 3 pure logica"
```

---

### Task 3: Operationele-error veto in de productie-gate (TDD)

**Files:**
- Modify: `lib/v0/server/hard-eval-checks.ts`
- Test: `scripts/test-hard-eval-checks.ts`

- [ ] **Step 1: Schrijf de falende tests voor de operationele-error veto**

Voeg toe in `scripts/test-hard-eval-checks.ts` (na de bestaande `computeProductionGate`-tests, vóór de gate-constanten):

```ts
// --- gate: operationele-error veto (Laag 1) ----------------------------------
const gateOpErr = [
  dv({ caseId: 'e1', version: 'v', dimension: 'answer-quality', responseKind: 'error', needsJudge: true }),
];
const g5 = computeProductionGate(gateOpErr, noJudge, { qualityThreshold: 0.9 })[0];
check('gate: onverwachte error → operationeel veto → false', g5.productionReady === false, true);
check('gate: operationalErrors bevat e1', g5.operationalErrors.includes('e1'), true);

const gateMalfErr = [
  dv({ caseId: 'm1', version: 'v', dimension: 'malformed-input', responseKind: 'error', layer1Pass: false }),
];
const g6 = computeProductionGate(gateMalfErr, noJudge)[0];
check('gate: malformed-error NIET in operationalErrors', g6.operationalErrors.length === 0, true);
check('gate: malformed-error wel safety-veto', g6.productionReady === false && g6.safetyViolations.length === 1, true);
```

- [ ] **Step 2: Run — verwacht FAIL**

Run: `node --import tsx scripts/test-hard-eval-checks.ts`
Expected: FAIL — `g5.operationalErrors` is undefined.

- [ ] **Step 3: Voeg `operationalErrors` toe aan `ProductionGateVerdict`**

In `lib/v0/server/hard-eval-checks.ts`, in `ProductionGateVerdict`, ná `qualityThreshold: number;`:

```ts
  /** caseIds met een onverwachte error (responseKind==='error', niet-malformed) — hard veto. */
  operationalErrors: string[];
```

- [ ] **Step 4: Bereken de operationele errors + veto in `computeProductionGate`**

In `computeProductionGate`, binnen de `versions.map`-callback, ná de bestaande `quality`-filter en vóór de `safetyViolations`-loop:

```ts
    const operationalErrors = own
      .filter((v) => v.responseKind === 'error' && v.dimension !== 'malformed-input')
      .map((v) => v.caseId);
```

Voeg de veto-check toe direct ná het safety-veto-blok (na `reasons.push(\`${safetyViolations.length} veiligheidsschending(en) — hard veto\`);` + `}`):

```ts
    if (operationalErrors.length > 0) {
      productionReady = false;
      reasons.push(`${operationalErrors.length} onverwachte error(s) — operationeel veto`);
    }
```

Voeg `operationalErrors` toe aan het teruggegeven object (bij de andere velden):

```ts
      operationalErrors,
```

- [ ] **Step 5: Run — verwacht PASS (alle tests)**

Run: `node --import tsx scripts/test-hard-eval-checks.ts`
Expected: `✓ alle hard-eval-check helpers PASS`.

- [ ] **Step 6: Commit**

```bash
git add lib/v0/server/hard-eval-checks.ts scripts/test-hard-eval-checks.ts
git commit -m "feat(eval): operationele-error veto in productie-gate (Groep 2)"
```

---

### Task 4: Runner-instrumentatie (latency / refused / expectsRefusal)

**Files:**
- Modify: `scripts/v0-hard-eval-run.ts`

- [ ] **Step 1: Meet latency in `runBotOnce`**

Wijzig de return-type-annotatie van `runBotOnce` naar:

```ts
): Promise<{ response: ChatResponse | null; errCode: string | null; latencyMs: number }> {
```

Voeg `const t0 = Date.now();` toe als eerste regel ná `let errCode: string | null = null;`, en wijzig de return naar:

```ts
  return { response, errCode, latencyMs: Date.now() - t0 };
}
```

- [ ] **Step 2: Leg latency / refused / expectsRefusal vast in `evaluateCase`**

In `evaluateCase`, ná `const botCostUsd = results.reduce((s, r) => s + (r.response?.totalCostUsd ?? 0), 0);`:

```ts
  const latencyMs = primary.latencyMs;
  const refused = kind === 'fallback' || kind === 'smalltalk' || looksLikeRefusal(answer);
```

In het `verdict`-object, ná `botCostUsd,`:

```ts
    latencyMs,
    refused,
    expectsRefusal: c.expectsRefusal ?? null,
```

- [ ] **Step 3: Typecheck — verwacht clean (verdict voldoet nu aan de uitgebreide type)**

Run: `npx tsc --noEmit`
Expected: exit 0, geen errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/v0-hard-eval-run.ts
git commit -m "feat(eval): runner legt latencyMs/refused/expectsRefusal vast per case"
```

---

### Task 5: Report-blokken (Operationeel + Refusal-calibratie)

**Files:**
- Modify: `scripts/v0-hard-eval-report.ts`

- [ ] **Step 1: Importeer de nieuwe helpers + `resolveBot`**

Breid de bestaande import uit `../lib/v0/server/hard-eval-checks` uit met `computeOperationalMetrics, computeRefusalCalibration` en voeg een nieuwe import toe ná de bestaande imports (regel ~28):

```ts
import { resolveBot } from '../lib/v0/server/bots';
```

In het bestaande `import { finalCaseStatus, computeProductionGate, SAFETY_DIMENSIONS, QUALITY_DIMENSION } from ...`-blok, voeg toe:

```ts
  computeOperationalMetrics,
  computeRefusalCalibration,
```

- [ ] **Step 2: Voeg de twee blokken toe ná de dimensie×versie-tabel**

In `scripts/v0-hard-eval-report.ts`, direct ná de regel `md.push('_Cel = pass/total; \`(n?)\` = n nog niet-beoordeelde (PENDING) judge-cases._');` en de daaropvolgende `md.push('');`, voeg toe:

```ts
// Operationeel (Groep 2)
md.push('## Operationeel (Groep 2 — latency / cost / errors)');
md.push('');
md.push('_Onverwachte error op een valide query = hard veto (zie gate). Latency/cost = waarschuwing (⚠️) t.o.v. het per-versie budget._');
md.push('');
md.push('| versie | p50 lat | p95 lat | budget | mean cost | p95 cost | budget | onverwachte errors |');
md.push('|--------|---------|---------|--------|-----------|----------|--------|--------------------|');
const opMetrics = computeOperationalMetrics(results.verdicts);
for (const m of opMetrics) {
  const bot = resolveBot(m.version);
  const latWarn = m.latencyP95Ms > bot.evalBudgetMs ? ' ⚠️' : '';
  const costWarn = m.costP95Usd > bot.evalBudgetUsd ? ' ⚠️' : '';
  const errStr = m.unexpectedErrors.length === 0 ? '0' : `❌ ${m.unexpectedErrors.length} (${m.unexpectedErrors.join(', ')})`;
  md.push(
    `| ${m.version} | ${m.latencyP50Ms}ms | ${m.latencyP95Ms}ms${latWarn} | ${bot.evalBudgetMs}ms | $${m.costMeanUsd.toFixed(4)} | $${m.costP95Usd.toFixed(4)}${costWarn} | $${bot.evalBudgetUsd.toFixed(4)} | ${errStr} |`,
  );
}
md.push('');

// Refusal-calibratie (Groep 3)
md.push('## Refusal-calibratie (Groep 3 — te streng ↔ te los)');
md.push('');
md.push('_over-refusal = weigerde op een beantwoordbare vraag (expectsRefusal=false). under-refusal = antwoordde i.p.v. te weigeren op een valstrik/onbeantwoordbare vraag (expectsRefusal=true, hallucinatie-risico). Beide ideaal = 0%._');
md.push('');
md.push('| versie | over-refusal | under-refusal (hallucinatie-risico) |');
md.push('|--------|--------------|-------------------------------------|');
const calib = computeRefusalCalibration(results.verdicts);
for (const c of calib) {
  const over = c.overRefusalRate === null ? '-' : `${c.overRefusals}/${c.answerableTotal} = ${Math.round(c.overRefusalRate * 100)}%`;
  const under = c.underRefusalRate === null ? '-' : `${c.underRefusals}/${c.refusalExpectedTotal} = ${Math.round(c.underRefusalRate * 100)}%`;
  md.push(`| ${c.version} | ${over} | ${under} |`);
}
md.push('');
```

- [ ] **Step 3: Voeg een compacte console-regel toe voor calibratie + operationele errors**

In `scripts/v0-hard-eval-report.ts`, in de console-samenvatting, ná het `Productie-gate`-blok (`console.log('');` ná de gate-loop), voeg toe:

```ts
console.log('  Refusal-calibratie (over / under):');
for (const c of computeRefusalCalibration(results.verdicts)) {
  const over = c.overRefusalRate === null ? ' - ' : `${Math.round(c.overRefusalRate * 100)}%`;
  const under = c.underRefusalRate === null ? ' - ' : `${Math.round(c.underRefusalRate * 100)}%`;
  console.log(`   ${c.version.padEnd(8)} over=${over.padStart(4)}  under=${under.padStart(4)}`);
}
console.log('');
```

- [ ] **Step 4: Typecheck — verwacht clean**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/v0-hard-eval-report.ts
git commit -m "feat(eval): report-blokken Operationeel + Refusal-calibratie (Laag 1)"
```

---

### Task 6: End-to-end verificatie + smoke-run

**Files:** geen (alleen draaien)

- [ ] **Step 1: Volledige unit-test + typecheck**

Run: `npx tsc --noEmit && node --import tsx scripts/test-hard-eval-checks.ts`
Expected: tsc exit 0; `✓ alle hard-eval-check helpers PASS`.

- [ ] **Step 2: Smoke-run op ÉÉN versie (validatie van runner-instrumentatie + report-blokken)**

> **Kosten:** ~$0,14 (één versie × 48 cases bot-gen). Binnen het voor dit project goedgekeurde $2-budget. De Operationeel- en Calibratie-blokken zijn deterministisch — ze hebben GEEN judge nodig, dus de smoke-run valideert Laag 1 zonder judge-werk.

Run: `npm run eval:hard:run -- --versions=v0.8.1`
Daarna: `npm run eval:hard:report`
Expected: het rapport bevat een gevuld `## Operationeel`-blok (echte p50/p95-latency + mean/p95-cost, 0 onverwachte errors) en een `## Refusal-calibratie`-blok (over/under-rates). Kwaliteit toont PENDING (geen judge gedraaid — verwacht, Laag 0-gedrag).

- [ ] **Step 3: Inspecteer het rapport visueel**

Lees het nieuwste `eval-out/hard/<ts>-report.md` en bevestig dat beide nieuwe blokken kloppen (latency plausibel ~2-6s, cost ~$0.001-0.005, errors 0).

---

### Task 7: Afronden (PR)

- [ ] **Step 1: Gebruik de finishing-a-development-branch skill**

Verifieer tests groen, push de branch `feat/seb/prod-gate-eval-laag1`, maak PR met volledig ingevuld template (baseline-tabel-fragment uit de smoke-run + uitleg van het asymmetrische error-veto + de calibratie-rates). NIET mergen zonder go van Sebastiaan.

---

## Self-Review

- **Spec-dekking:** Groep 2 (latency/cost/error veto) → Tasks 1+3+4+5. Groep 3 (over/under-refusal) → Tasks 2+4+5. Spec §3 open beslissing 2 (latency/cost = waarschuwing, error = veto) → gerespecteerd: alleen `operationalErrors` is veto. ✓
- **Geen placeholders:** alle stappen bevatten exacte code. ✓
- **Type-consistentie:** `latencyMs`/`refused`/`expectsRefusal` toegevoegd in Task 1+1 en gevuld in Task 4; `operationalErrors` toegevoegd in Task 3 en gerenderd via `reasons` (Task 3) — report leest het niet direct, dus geen mismatch. `OperationalMetrics`/`RefusalCalibration` types consistent gebruikt in report (Task 5). ✓
- **Scope:** geen nieuwe fixture-cases, geen migratie, geen bot-/prompt-wijziging — conform spec §9. ✓
