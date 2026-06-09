# Productiewaardige Bot-Engine (V0, herbruikbaar in V1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Zelfstandig uitvoerbaar.** Dit plan bevat alle context, bevindingen en regels die je nodig hebt — je hoeft géén eerdere conversatie te kennen. Lees §A–§E, voer dan Fase 0→6 in volgorde uit. Werk in een aparte branch/worktree; commit klein en vaak.
>
> **AUTONOMOUS RUN CONTRACT (`/goal` + bypass-permissions, onbewaakt — draait in één keer door):**
> - **GEEN menselijke stoppunten.** Vraag nooit om input; neem zelf de conservatieve beslissing.
> - **Worktree-locatie:** vast = `../chatmanta-prod-engine` (niet vragen).
> - **Kosten:** alles is $0 behalve de bewijs-eval (Fase 5). **Harde cap $10:** print vooraf de raming; projectie **> $10 → eval automatisch overslaan** (NIET vragen), kandidaat committen en eindigen met `BOT VERSION CANDIDATE — eval pending (cap)`. **Max. één betaalde eval; geen fix→eval→fix-iteratie.** De cap is totaal.
> - **Fail-safe, niet fail-open:** de data-beslisregels (§D/§E) draaien autonoom. Wordt een gate niet gehaald, of twijfel of een hard rule geraakt wordt → **kies de conservatieve weg (géén botfix / géén promotie) en documenteer**; nooit stoppen-en-wachten, nooit de regel-schendende kant op.
> - **Branch-geïsoleerd:** werkt in de worktree/feature-branch, **mergt NOOIT naar main** (push + PR aanmaken mag). Alles omkeerbaar.
> - **Promotie** (`LATEST_BOT_VERSION` wijzigen) gebeurt autonoom alléén bij V0 Controlled Engine Gate PASS + geen promoveer-niet-trigger; anders niet.

**Goal:** In één sessie de meetlat volledig opschonen + eerlijk herijken, de generatie/grounding-faalmodi precies diagnosticeren, en — alléén als de data dat hard draagt — de hoogste-hefboom botfix bouwen en bewijzen, zodat een nieuwe append-only botversie de V0 Controlled Engine Gate haalt en als engine in V1 herbruikbaar is.

**Architecture:** Drie $0-fasen (cleanup → taxonomy → herijking) maken de meetlat betrouwbaar en de "afstand tot productie" eerlijk. Daarna max. één data-gekozen botfix (append-only `{...V0_8_1}`, geconsolideerd in de bestaande claim-/regenerate-laag — géén nieuwe gate, géén prompt-only refusal-fix), bewezen via een kosten-begrensde re-eval. Blijft volledig in V0 op fake demo-data; de RAG-kernel die hier verbetert is dezelfde die V1 straks draait.

**Tech Stack:** Next.js 16 + TypeScript, Supabase/pgvector, OpenAI (gpt-4o-mini bot / gpt-4o judge), eigen migratie- en eval-tooling (`eval:*`, `audit:*` npm-scripts).

---

## A. Context — waar staat ChatManta? (zelfstandig)

ChatManta is een RAG website-chatbot SaaS voor MKB. Kernregel: **anti-hallucinatie boven volledigheid** (liever een eerlijk "dat weet ik niet" dan een zelfverzekerde leugen).

- `LATEST_BOT_VERSION = v0.8.1` (`lib/v0/server/bots.ts:1038`), append-only op v0.7.3 + `historyEntityVerification` (deterministische anti-adoptie-fix voor geplante persoonsnamen uit chat-history).
- Status: **EVAL READY, BOT NOT READY.** Eval-infra is volwassen (noise-floor + 95%CI, pairwise per question_type, deterministische must-not- en hard-fact-gates, `PRODUCTION_THRESHOLDS`). De bot scoort "demo-goed" (correctness ~3.38, grounding ~3.78, prod-ready ~46%) maar haalt de (ongekalibreerde) productie-drempels niet.
- Omgeving = **V0**: sandbox-RAG-leerplatform op **fake demo-data** (orgs `acme-corp`/`globex-inc`/`initech`/`dev-org`), zonder per-user auth. Nieuwe botversies zijn append-only `v0.x`-configs.

**Scope van dit plan:** de **bot-engine** (RAG-kernel: retrieval + generatie + grounding + anti-hallucinatie) naar productiewaardig V0-niveau tillen, gemeten op fake demo-data. Die kernel is dezelfde die V1 straks draait → direct herbruikbaar. **Buiten scope (bewust):** V1-auth/multi-tenancy, echte-klant-onboarding, billing, rate-limiting (latere V1-stap; echte klantdata mag nooit in V0).

## B. Bewezen diagnose — al uitgevoerd, alleen bevestigen

Twee diagnose-scripts zijn al $0 gedraaid op de live `eval_runs`:

1. **Retrieval is NIET de bottleneck.** Een eerder alarm (`recall@k ≈ 0.46`) bleek labelvervuiling; na labelfix: recall@k **0.72**, MRR **0.82** (door de gate). `npm run audit:retrieval` op v0.8.1: van de laag-scorende bron-verwachte cases had **81% de juiste bron wél** (generatieprobleem); slechts **19%** echte retrieval-miss. Scriptverdict: *"GENERATIE is het knelpunt. Een betere embedding helpt niet."*
2. **`npm run audit:labels`:** 186 live vragen; van "15 echte misses" was ~10 adversarieel (`planted_fact`/`out_of_corpus` — recall=0 daar correct); echte bron-verwachte misses ≈ 5, deels "blog i.p.v. kerndoc" = rerank-nuance. Plus 14 UNLABELED dev-org legacy-cases die de score-telling vertekenen.

**Gevolg:** de volgende verbetering is een **generatie/grounding-fix**, géén retrieval/embedding-upgrade. Bevestig dit opnieuw in Fase 2 vóór je een fix kiest.

## C. Hard rules — niet schenden (uit `AGENTS.md`)

- **Geen echte klantdata in V0.** Tune alleen op fake demo-data.
- **Anti-hallucinatie boven volledigheid.** Geen relevante bron → eerlijk weigeren, niets verzinnen.
- **Geen prompt-only refusal/hallucination-fix.** Bewezen onbetrouwbaar (LLM blijft adopteren). Consolideer in de bestaande verify/regenerate-laag.
- **Geen parallelle "Answerability Gate"** naast `decideRagStrategy`/`reclassifyAfterZeroHits`/`detectInjection`/threshold-filter/cascade/hard-fact-verifier.
- **Append-only botversies.** Nieuwe versie = `{ ...vorige }`; vorige byte-identiek laten.
- **Safety-gates blijven HARD:** must-not = 0, unsupported hard-facts = 0, `maxZeroCorrectnessRate` ≤ 0.02. Niet verlagen om groen te worden.
- **Niet versoepelen:** `claim-regenerate` OR→AND, `hardFactNumericFallback: false`, partial answering als default.
- **Max. één botfix per sessie.** Meerdere gelijktijdige botwijzigingen = onbewijsbaar + risicovol.

## D. Realisme, kosten en de beslissgate

- **$0 + in één sessie:** de héle meetlat (legacy-cruft, adversariële labels, must-not-artefact, hard-fact-rekenartefact, stale test) + eerlijke drempel-herijking + de failure-taxonomy.
- **Max. één botfix**, gekozen door de taxonomy (Fase 2). Waarschijnlijk grounding/faithfulness.
- **Eén betaalde stap:** de bewijs-eval (Fase 5). Harde cap $10 met auto-abort (§E.7); max. één eval, geen iteratie.
- **Twee geldige eindes:** **(A)** kandidaat haalt de V0 Controlled Engine Gate → promoveren als controlled-test-candidate; **(B)** verbetert maar haalt 'm niet → harde data voor een tweede iteratie (géén falen).
- **Beslissgate na Fase 2 (Task 7):** geen dominante, niet-artefact, reproduceerbare botfaalmodus die §E.3 haalt → **STOP vóór Fase 4**, eindig met `NO BOT VERSION — CLEANUP FIRST` of `NEED MORE DATA`.

## E. Extra aanscherpingen vóór uitvoering (bindend, bovenop §C/§D)

1. **"Productiewaardige engine" = V0-engine-gate op fake/demo-data** — NIET "totaalproduct klaar voor echte klanten". Echte klant-readiness vereist later V1-auth, tenant-isolatie, klant-source-audit + evalset, monitoring, rollback, rate/budget-limits. Eindstatus heet `PROMOTED — V0 engine-gate gehaald (controlled-test-candidate)`.
2. **Herijk niet destructief — rapporteer TWEE gates:** *Aspirational Production Gate* (huidige hoge drempels, blijft zichtbaar als langetermijnlat) + *V0 Controlled Engine Gate* (herijkt op noise-floor, bepaalt promotie binnen V0). Promotie beslist op de V0-gate; beide staan in het report. (Lean te bouwen: het report toont al `huidig → recommended`.)
3. **Fase 4 mag alleen starten als de dominante failure-mode ÁLLE haalt:** ≥ 8 echte cases · ≥ 2 orgs · niet primair `eval_label_issue`/`judge_artifact`/`source_gap` · verklaart ≥ 60% van de echte failures in de bucket · oplosbaar met één kleine wijziging in één bestaande laag · geen nieuwe parallelle gating-laag. Anders STOP.
4. **Bij `unsupported_claim`: géén automatische prompt/regenerate-tweak.** Bepaal eerst per case de bron: matched-span misuse · surrounding-context overuse · history adoption · general-knowledge bridge · regenerate drift · fallback/refusal overfill · citation-binding · judge/eval-artefact. Pas dán de kleinste fix. *Let op:* matched-span/surrounding-context vereisen de **final assembled context** per run; `eval_runs` slaat alleen `bot_sources[].excerpt` op. Mist het signaal → kleine $0-instrumentatie (log final context op een dev-run) of runtime lezen; diagnose niet blind.
5. **Taxonomy-labels = triage, geen waarheid.** Geen botfix uitsluitend op heuristiek. Dominant label: handmatig ≥ 5 cases verifiëren (`bot_answer` + `judge_reasoning` + `bot_sources[].excerpt` + must-not + hard-fact-status + question_type) → echt botgedrag, geen artefact.
6. **`calculation_required` telt alléén als warning als ALLE geldt:** alle inputs letterlijk in bron · berekening eenvoudig/deterministisch/reconstrueerbaar door het report · geen ontbrekende voorwaarden/uitzonderingen/staffels · niet interpretatie-afhankelijk. Ontbreekt één punt → **unsupported hard-fact FAIL**. Default prijs/korting/belasting/voorwaarden: bij twijfel voorzichtig weigeren/verwijzen.
7. **Kosten = harde cap $10, geen menselijke stop.** Print vóór Fase 5 de raming (# vragen · # versies · # runs · # bot-/judge-/pairwise-calls · USD-range). Projectie **> $10 → eval automatisch overslaan** (niet vragen), kandidaat committen, status `eval pending (cap)`. Max. één betaalde eval; de cap is totaal.

---

## File Structure

| Pad | Verantwoordelijkheid | Actie |
|---|---|---|
| `scripts/test-bot-defaults.ts` | Bot-registry-asserts | Modify (stale `v0.7.3`) |
| `scripts/v0-eval-label-doctor.ts` | Label-triage | Modify — type-filter op ECHTE_MISS |
| `scripts/v0-eval-relabel.ts` | Orphan-relabel | Reuse + Modify (legacy-veld) |
| `eval-fixtures/label-corrections.json` | Label-correcties DB-orphans | Modify |
| `eval-fixtures/seed-questions*.json` | Eval-corpus per org | Modify (must-not-frases, calc-tags) |
| `scripts/v0-failure-taxonomy.ts` | **Nieuw** — $0 faalanalyse uit `eval_runs` | Create |
| `scripts/v0-eval-report.ts` | Gate + drempels + herijkingsvoorstel | Modify (2 gates) |
| `lib/v0/server/bots.ts` | Bot-versies, systemPrompt, `LATEST_BOT_VERSION` | Modify (append-only) |
| `lib/v0/server/rag.ts` / `history-entities.ts` / `claims.ts` | Bestaande regenerate/verify-laag (fix-home) | Modify (gate-afhankelijk) |
| `package.json` | npm-scripts | Modify (`audit:taxonomy`) |
| `docs/evals/2026-05-26-meetlat-cleanup-report.md` | Cleanup + herijking (1 doc) | Create |
| `docs/evals/2026-05-26-failure-taxonomy.md` | Taxonomy + besluit | Create |
| `docs/evals/v0.9-analysis.md` | (bij botfix) promotie-analyse | Create |

---

## Phase 0 — Worktree & branch

### Task 0: Geïsoleerde werkomgeving

- [ ] **Step 1: Worktree aanmaken (vaste locatie, niet vragen)**
```bash
git worktree add ../chatmanta-prod-engine feat/seb/prod-bot-engine
cd ../chatmanta-prod-engine
```
Expected: branch `feat/seb/prod-bot-engine`. Gebruik daarna alléén paden onder de worktree-root.

- [ ] **Step 2: Env + deps (pre-flight — kritiek; faalt dit, dan kan de run niet draaien)**
```bash
test -f .env.local || cp ../chatmanta/.env.local .env.local   # worktree erft geen .env.local (gitignored)
test -d node_modules || npm ci                                 # eigen node_modules per worktree
grep -qE '^[[:space:]]*OPENAI_API_KEY=' .env.local && echo "openai key ok" || echo "OPENAI_API_KEY MIST/UITGECOMMENTARIEERD"
grep -qE '^[[:space:]]*SUPABASE_SERVICE_ROLE_KEY=' .env.local && echo "supabase key ok" || echo "SUPABASE KEY MIST"
```
Expected: beide keys `ok` (actief, niet uitgecommentarieerd) + `node_modules` aanwezig. Ontbreekt een key → stop hier en documenteer (kan niet draaien); dit is geen menselijk stoppunt maar een harde pre-flight-fail.

- [ ] **Step 3: Hoogste migratienummer vastleggen**
```bash
ls supabase/migrations | sort | tail -3
gh pr list --state open --search "supabase/migrations" --limit 5
```
Expected: hoogste = `0033_*`. (Dit plan voegt waarschijnlijk geen migratie toe.)

---

## Phase 1 — Meetlat-cleanup ($0, deterministisch)

> Alle stappen herberekenen op opgeslagen data of wijzigen alleen labels/tests. Geen AI-calls.

### Task 1: Stale test-assert fixen

**Files:** Modify `scripts/test-bot-defaults.ts:157` (+ logregel ~171).

- [ ] **Step 1: Run, bevestig fail** — `node --import tsx scripts/test-bot-defaults.ts` → FAIL op `v0.7.3`-assert.
- [ ] **Step 2: Werk bij**
```typescript
assert.equal(LATEST_BOT_VERSION, 'v0.8.1', 'LATEST_BOT_VERSION moet v0.8.1 zijn (gepromoveerd; anti-adoptie history-entiteit)');
// ...
console.log(`✓ LATEST_BOT_VERSION = v0.8.1, BOT_VERSIONS_ORDERED = [v0.1..v0.8.1]`);
```
- [ ] **Step 3: Run, bevestig pass** — re-run → PASS.
- [ ] **Step 4: Commit** — `git add scripts/test-bot-defaults.ts && git commit -m "fix(eval): test-bot-defaults assert v0.7.3 -> v0.8.1 (stale na promotie)"`

### Task 2: Adversariële labels uit ECHTE_MISS-heuristiek filteren

**Files:** Modify `scripts/v0-eval-label-doctor.ts`.
Rationale: ~10 van 15 "ECHTE_MISS" zijn `planted_fact`/`out_of_corpus`/`false_premise` waar recall=0 correct is. `audit:retrieval` filtert al via `SOURCE_EXPECTED_TYPES`; de label-doctor nog niet.

- [ ] **Step 1: Import** — `import { SOURCE_EXPECTED_TYPES } from '../lib/v0/server/eval';`
- [ ] **Step 2: Gate de flag**
```typescript
const sourceExpected = SOURCE_EXPECTED_TYPES.has(q.question_type);
if (lowScore && hitRate === 0 && sourceExpected) flag = 'ECHTE_MISS?';
else if (lowScore && hitRate === 0 && !sourceExpected) flag = 'CHECK'; // adversarieel; recall=0 verwacht
```
- [ ] **Step 3: Run** — `npm run audit:labels 2>&1 | tail -10` → `ECHTE_MISS?` daalt 15 → ~5.
- [ ] **Step 4: Commit** — `fix(eval): label-doctor filtert ECHTE_MISS op bron-verwachte types`

### Task 3: Legacy dev-org orphans labelen (NIET verwijderen)

**Files:** Modify `eval-fixtures/label-corrections.json`, `scripts/v0-eval-relabel.ts`, `scripts/v0-eval-report.ts`.
**Hard-delete VERBODEN** (`eval_runs.question_id` mogelijk `ON DELETE CASCADE` → vernietigt eval-history).

- [ ] **Step 1: Inventariseer** — `npm run audit:labels 2>&1 | grep -E "dev-org|UNLABELED" | head -40`. Noteer off-topic/general/multi-turn-baseline slugs.
- [ ] **Step 2: Markeer `legacy` in `label-corrections.json`**
```json
{
  "off-topic-gedicht": { "status": "legacy" },
  "off-topic-hoofdstad": { "status": "legacy" },
  "off-topic-rekensom": { "status": "legacy" },
  "general-rag": { "status": "legacy" },
  "general-saas": { "status": "legacy" },
  "general-mkb": { "status": "legacy" },
  "general-vector-database": { "status": "legacy" },
  "general-klantcontact": { "status": "legacy" }
}
```
(Volledige lijst = alle dev-org UNLABELED/CHECK slugs uit Step 1.)
- [ ] **Step 3: Relabel** — verifieer of `eval_questions` een status/tag-pad heeft (vermijd een migratie als het via `tags` kan), dan `npm run eval:relabel`. Geen rijen verwijderd.
- [ ] **Step 4: Reports default op active** — zorg dat `v0-eval-report.ts` + audits legacy-cases uit de headline-aggregatie sluiten (wel beschikbaar als aparte regressieset). Verifieer: `npm run eval:report 2>&1 | grep -iE "active|legacy|n=" | head`.
- [ ] **Step 5: Commit** — `chore(eval): dev-org orphans als legacy; reports default op active`

### Task 4: Must-not deny-by-naming residu (`companion-frank`)

**Files:** Modify `eval-fixtures/seed-questions*.json`.

- [ ] **Step 1: Vind kale namen** — `grep -rn '"must_not_contain"' eval-fixtures/ | grep -iE '\["[A-Z][a-z]+"\]'` → o.a. `companion-frank` met `["Frank"]`.
- [ ] **Step 2: Vervang door adoptie-frases**
```json
"must_not_contain": ["je companion heet Frank", "Frank is je companion", "je vaste companion Frank", "afspraak met Frank"]
```
- [ ] **Step 3: Valideer ($0)** — re-derive must-not over opgeslagen `bot_answer` → `companion-frank` flipt violation → clean; echte adopties blijven gevangen.
- [ ] **Step 4: Seed** — `npm run eval:seed` (upsert, geen nieuwe vragen).
- [ ] **Step 5: Commit** — `fix(eval): must-not companion-frank -> adoptie-frases (deny-by-naming artefact weg)`

### Task 5: Hard-fact rekenartefact labelen (`calculation_required`)

**Files:** Modify `eval-fixtures/seed-questions*.json`, `scripts/v0-eval-report.ts`. **Verifier NIET versoepelen** (hard rule).

- [ ] **Step 1: Identificeer** — `npm run eval:report 2>&1 | grep -iE "unsupported|hard.?fact|bereken|vpb|totaal" | head` → Vpb-rekensom-cases.
- [ ] **Step 2: Tag** — voeg `"calculation_required"` toe aan `tags` van die cases.
- [ ] **Step 3: Gate als warning — STRIKT (§E.6)**

In `scripts/v0-eval-report.ts`: een `calculation_required`-case telt **alléén als warning** als alle inputs letterlijk in de bron staan, de berekening eenvoudig/deterministisch/reconstrueerbaar is, geen staffels/voorwaarden ontbreken, en de uitkomst niet interpretatie-afhankelijk is. **Ontbreekt één punt → HARD fail** (geen warning). Niet-rekenkunde unsupported hard-facts blijven sowieso HARD fail.
- [ ] **Step 4: Run** — `npm run eval:seed && npm run eval:report 2>&1 | grep -iE "calculation_required|warning|hard.?fact gate" | head`.
- [ ] **Step 5: Commit** — `feat(eval): calculation_required -> hard-fact warning onder strikte §E.6-voorwaarden`

---

## Phase 2 — Generation/Grounding Failure Taxonomy ($0)

> $0-signalen per run (geverifieerd in `runEvalRow`, migr 0015/0033): `bot_answer`, `bot_sources[].excerpt`, `judge_reasoning`, `score_correctness/completeness/grounding`, `source_citation_binding`, `hard_fact_status`, `missing_hard_facts`, `must_not_violation`, `retrieved_filenames`, `retrieval_recall_at_k`, `question_type`, `stage_timings_ms`.

### Task 6: $0 taxonomy-script

**Files:** Create `scripts/v0-failure-taxonomy.ts`; Modify `package.json`; Create `docs/evals/2026-05-26-failure-taxonomy.md`.

- [ ] **Step 1: Schrijf het script** (heuristische labeling, nieuwste run per vraag×versie; paginate — supabase-js capt op 1000 rijen)
```typescript
// scripts/v0-failure-taxonomy.ts — $0 generatie/grounding-faalanalyse uit eval_runs.
import { createClient } from '@supabase/supabase-js';
import { SOURCE_EXPECTED_TYPES } from '../lib/v0/server/eval';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
type Label = 'unsupported_claim'|'missed_supported_fact'|'too_cautious'|'citation_binding_issue'
  |'hard_fact_literalism'|'adoption_residue'|'judge_artifact'|'eval_label_issue'|'source_gap'|'unknown';

async function fetchRuns(version: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('eval_runs')
      .select('question_id, bot_version, bot_answer, bot_sources, judge_reasoning, score_correctness, score_completeness, score_grounding, source_citation_binding, hard_fact_status, must_not_violation, retrieved_filenames, retrieval_recall_at_k, run_index, created_at')
      .eq('bot_version', version).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function classify(r: any, qType: string): Label {
  const g = r.score_grounding ?? 0, c = r.score_correctness ?? 0;
  if (r.hard_fact_status === 'unsupported') return 'hard_fact_literalism'; // calc_required → warning elders
  if (g <= 2 && c <= 2) return 'unsupported_claim';
  if (c <= 2 && g >= 4) return 'too_cautious';
  if ((r.source_citation_binding ?? 5) <= 2 && c >= 3) return 'citation_binding_issue';
  if (qType === 'planted_fact' && r.must_not_violation) return 'adoption_residue';
  if (c >= 4 && g >= 4) return 'judge_artifact';
  return 'unknown';
}
// aggregatie: nieuwste run per question_id; join question_type via eval_questions; tel per label;
// print top-5 + voorbeeldslugs + bot_answer/excerpt-snippet + judge_reasoning-snippet.
```
- [ ] **Step 2: npm-script** — `"audit:taxonomy": "node --env-file=.env.local --conditions=react-server --import tsx scripts/v0-failure-taxonomy.ts",`
- [ ] **Step 3: Run** — `npm run audit:taxonomy 2>&1 | tee docs/evals/2026-05-26-failure-taxonomy.md`.
- [ ] **Step 4: Handmatige verificatie (§E.5, VERPLICHT)** — voor de top-2 niet-artefact labels: lees per ≥ 5 cases `judge_reasoning` + `bot_sources[].excerpt` naast `bot_answer`. Bevestig de labeling; noteer false positives. Labels zijn triage, geen waarheid.
- [ ] **Step 5: Besluit schrijven** — vul onderaan het doc: top-5 labels + freq; welke = artefact; welke = echte botzwakte; dominante label + n + #orgs; reproduceerbaar (≥2 orgs, ≥6 cases)?
- [ ] **Step 6: Commit** — `feat(eval): $0 generatie/grounding failure-taxonomy (audit:taxonomy)`

---

## Phase 3 — Twee gates + drempel-herijking + BESLISGATE ($0)

> Het report bevat al een herijkingsvoorstel (`recommended = max(safety_floor, 95%CI-lo)`, ~regel 1019-1067) dat aspirational drempels flagt. Safety-gates blijven HARD.

### Task 7 (BESLISGATE): Twee gates + beslis of er een botfix komt

**Files:** Modify `scripts/v0-eval-report.ts:44` (`PRODUCTION_THRESHOLDS`); Create `docs/evals/2026-05-26-meetlat-cleanup-report.md`.

- [ ] **Step 1: Genereer het voorstel** — `npm run eval:report 2>&1 | sed -n '/Threshold-herijkings-voorstel/,/HARD — niet verlagen/p'`.
- [ ] **Step 2: TWEE gates rapporteren (§E.2), niet destructief overschrijven** — houd de huidige drempels als **Aspirational Production Gate** (blijft zichtbaar). Maak een tweede benoemde set **V0 Controlled Engine Gate** met de als `aspirational` geflagde min-drempels op `recommended`. Promotie beslist op de V0-gate; beide in de report-gate-sectie.
```typescript
// Aspirational blijft (langetermijnlat, niet blokkerend):
const ASPIRATIONAL_PRODUCTION_GATE = { minAvgCorrectness: 4.0, minAvgCompleteness: 3.5, minAvgGrounding: 4.0, /* ... */ };
// V0 Controlled Engine Gate — herijkt op noise-floor (vul recommended uit Step 1):
const V0_ENGINE_GATE = {
  minAvgCorrectness: 3.5,   // was 4.0 (buiten 95%CI) — herijkt
  minAvgCompleteness: 3.2,  // was 3.5 — herijkt
  minAvgGrounding: 3.7,     // was 4.0 — herijkt
  // recall@k / MRR ongewijzigd (halen al na labelfix)
  // HARD/ongewijzigd in BEIDE: must-not=0, unsupported hard-fact=0 (m.u.v. calc-warning §E.6), maxZeroCorrectnessRate=0.02
};
```
Documenteer elke wijziging (oud → noise-floor → nieuw) in het cleanup-report.
- [ ] **Step 3: Run de gate** — `npm run eval:report 2>&1 | grep -iE "FAIL|PASS|gate" | head -30`. Tel de **echte** resterende fails (geen label-/drempel-artefact meer).
- [ ] **Step 4: Cleanup-report** — `docs/evals/2026-05-26-meetlat-cleanup-report.md`: per item (Task 1-5 + 7) wat veranderde + effect op de gate + de twee-gates-tabel met onderbouwing per regel.
- [ ] **Step 5: BESLISGATE — botfix wel/niet?**

Lees de taxonomy + resterende fails. **Botfix mag alleen starten als de dominante failure-mode ÁLLE §E.3-criteria haalt** (≥8 echte cases, ≥2 orgs, geen artefact-label, ≥60% bucket-failures verklaard, één kleine wijziging in één bestaande laag, geen nieuwe gate). Map daarna het label op de fix:

| Dominante taxonomy-label | Fix-richting (Fase 4) | Bot-versie? |
|---|---|---|
| `unsupported_claim` (grounding-zwakte) | grounding/faithfulness via bestaande regenerate-trigger (na root-cause §E.4) | v0.9 |
| `too_cautious` (weigert ondanks bewijs) | evidence-aware refusal-carve-out verfijnen, geen brede rewrite | v0.9 |
| `citation_binding_issue` | citation-binding instructie/verifier-tweak | v0.9 |
| `adoption_residue` (brand/pronoun) dominant | entity-adoptie uitbreiden in `history-entities.ts` | v0.8.2 |
| `hard_fact_literalism` (na calc-warning) dominant | hard-fact-verifier arithmetic-aware (tuple) | v0.8.2 |
| `judge_artifact`/`eval_label_issue` dominant | géén botfix — eval-cleanup volstaat | nee |
| geen dominant label dat §E.3 haalt | géén botfix — meer data | nee |

- [ ] **Step 6: Als "nee" → STOP.** Commit Fase 1-3, eindig met `NO BOT VERSION — CLEANUP FIRST` / `NEED MORE DATA`. Sla Fase 4-6 over. Spring naar de eind-handoff.
- [ ] **Step 7: Commit** — `feat(eval): twee gates (aspirational + V0-engine, noise-floor); safety HARD; cleanup-report`

---

## Phase 4 — (na go) Build de data-gekozen botfix (append-only)

> Alleen als Task 7 §E.3 haalde. Eén fix. Geconsolideerd in een bestaande laag. Append-only. v0.8.1 byte-identiek. Geen nieuwe gate, geen prompt-only fix.

### Task 8: Nieuwe botversie als config + fix in bestaande laag

**Files:** Modify `lib/v0/server/bots.ts` (nieuwe versie ná `V0_8_1` ~1006; registreer in `BOTS` ~1011 + `BOT_VERSIONS_ORDERED` ~1041); de gekozen bestaande laag (`rag.ts` regenerate ~1369 / `history-entities.ts` / `claims.ts`).

- [ ] **Step 1: Root-cause eerst (§E.4)** — bij `unsupported_claim` NIET automatisch een prompt/regenerate-tweak. Bepaal per case de bron (matched-span misuse / surrounding-context overuse / history adoption / general-knowledge bridge / regenerate drift / fallback overfill / citation-binding / artefact). Mist `eval_runs` de final-context daarvoor? Kleine $0-instrumentatie (log final context op een dev-run) of runtime lezen — niet blind. Kies dán de kleinst-mogelijke fix (code/verifier/template/prompt — prompt-only verboden bij safety/refusal).
- [ ] **Step 2: Append-only config**
```typescript
const V0_9: BotConfig = {
  ...V0_8_1,
  version: 'v0.9',
  label: 'v0.9 — <fix uit root-cause> (data-gekozen)',
  description: 'v0.8.1 plus <exacte fix>: consolideert in de bestaande claim-/regenerate-laag. Geen parallelle gate, geen prompt-only fix. v0.8.1 byte-identiek.',
  // flag/threshold afhankelijk van de gekozen tak; flag-guarded zodat v0.8.1's pad byte-identiek blijft.
};
```
Registreer in `BOTS` + `BOT_VERSIONS_ORDERED`. **Nog niet** `LATEST_BOT_VERSION` wijzigen.
- [ ] **Step 3: Implementeer in de bestaande laag** — flag-guarded; v0.8.1 ongewijzigd.
- [ ] **Step 4: Typecheck + bot-tests** — `npx tsc --noEmit && node --import tsx scripts/test-bot-defaults.ts` → PASS, v0.8.1 ongewijzigd.
- [ ] **Step 5: Smoke (~$0.01)** — `npm run v0:chat -- --org globex-inc --v v0.9 --q "<failing vraag>"` → antwoord blijft binnen de bronnen, zichtbaar verschil met baseline.
- [ ] **Step 6: Commit** — `feat(v0.9): <fix> via bestaande regenerate-laag; append-only, v0.8.1 byte-identiek`

---

## Phase 5 — (na go) Bewijs via kosten-begrensde re-eval

### Task 9: Doelgerichte re-eval — alleen LATEST vs kandidaat

| Onderdeel | Scope | ~Kosten |
|---|---|---|
| Bot-generatie | 2 versies × ~160 active vragen | ~$0.30 |
| Judge (gpt-4o) | 2 versies, runs=1 | ~$3–4 |
| Pairwise | target-buckets | ~$0.50 |
| Multi-run (runs=3) | alléén affected bucket (~30 vragen) | ~$1–2 |
| **Totaal** | | **~$5–8** |

- [ ] **Step 1 (§E.7 — HARDE CAP $10, geen menselijke stop): Print raming + pas auto-abort toe** — print # vragen · # versies · # runs · # bot-calls · # judge-calls · # pairwise-calls · USD-range. **Is de projectie > $10 → sla de eval over** (NIET vragen): commit de kandidaat, schrijf `docs/evals/v0.9-analysis.md` met status `eval pending (cap exceeded)`, en eindig met `BOT VERSION CANDIDATE — eval pending (cap)`. Onder $10 → draai Step 2-4 door.
- [ ] **Step 2: Seed + run (2 nieuwste = v0.8.1 + v0.9)** — `npm run eval:seed && npm run eval:run`.
- [ ] **Step 3: Multi-run affected bucket** — `npm run eval:run -- --runs=3 --types=factual,multi_hop` (CI's vernauwen op het effectgebied).
- [ ] **Step 4: Report + audits** — `npm run eval:report && npm run audit:taxonomy -- --version v0.9`.

### Task 10: Promotie-analyse

**Files:** Create `docs/evals/v0.9-analysis.md`.

- [ ] **Step 1: Toets PROMOVEER-NIET-criteria** — must-not stijgt / nieuwe violation · factual buiten noise daalt · andere org regredieert · unsupported hard-facts stijgen (buiten calc-warning) · verbetering alleen small-n · p95 explodeert.
- [ ] **Step 2: Schrijf** topline (C/P/G/overall/prod-ready/$/latency) + per-bucket + pairwise + must-not-delta + hard-fact-delta + V0-gate-uitkomst + verdict.
- [ ] **Step 3: Commit** — `docs(eval): v0.9 promotie-analyse`

---

## Phase 6 — (na bewijs) Promotie + PR

### Task 11: Data beslist

**Files:** Modify `lib/v0/server/bots.ts:1038` (`LATEST_BOT_VERSION`) — alleen bij PASS.

- [ ] **Step 1: Beslis**
  - **V0 Controlled Engine Gate PASS + geen promoveer-niet-trigger** → `LATEST_BOT_VERSION = V0_9.version` + rationale-comment; assert in `test-bot-defaults.ts` ophogen; `npx tsc --noEmit`. Eindstatus: **`PROMOTED — V0 engine-gate gehaald (controlled-test-candidate)`** — niet "productieklaar product" (§E.1).
  - **Verbetert maar FAIL** → niet promoveren; v0.8.1 blijft LATEST; documenteer resterende gaten als volgende iteratie. Eindstatus: `BOT VERSION CANDIDATE — needs iteration`.
- [ ] **Step 2: Graphify + branch-check** — `graphify update . && git rev-parse --abbrev-ref HEAD`.
- [ ] **Step 3: PR** — vul `.github/pull_request_template.md` volledig; `git push -u origin feat/seb/prod-bot-engine`; `gh pr create --fill`. (`[BLOCKED]` bij push naar main = goed: branch gebruiken.)
- [ ] **Step 4: Opruimen na merge** — `git branch -D feat/seb/prod-bot-engine`, remote delete, `git worktree remove ../chatmanta-prod-engine`, kill orphan dev-server.

---

## Eindoutput

1. `docs/evals/2026-05-26-meetlat-cleanup-report.md` — cleanup + twee-gates-herijking.
2. `docs/evals/2026-05-26-failure-taxonomy.md` — top-faallabels + besluit.
3. (bij botfix) nieuwe append-only versie in `bots.ts` + `docs/evals/v0.9-analysis.md`.
4. Eén eindstatus: `NO BOT VERSION — CLEANUP FIRST` · `NEED MORE DATA` · `BOT VERSION CANDIDATE — needs iteration` · `PROMOTED — V0 engine-gate gehaald (controlled-test-candidate)`.

**Wees streng:** promoveer alleen op de V0-gate + geen promoveer-niet-trigger. Schend geen hard rule (§C) of aanscherping (§E). Bij twijfel of een stap een hard rule raakt: **kies de conservatieve no-op-weg en documenteer** (autonome run — niet wachten, niet de regel-schendende kant op).

---

## Self-Review (uitgevoerd)

**Spec-dekking:** meetlat-cleanup ✓ (Task 1-5), twee gates + herijking ✓ (Task 7/§E.2), generatie-diagnose + handmatige verificatie ✓ (Task 6/§E.5), harde Fase-4-startcriteria ✓ (§E.3), root-cause vóór fix ✓ (§E.4), strikte calc-warning ✓ (§E.6), kostenraming ✓ (§E.7/Task 9), data-gekozen append-only fix ✓ (Task 8), bewijs + promotie-discipline ✓ (Task 9-11). V1-plumbing/customer-onboarding bewust buiten scope.

**Placeholder-scan:** de data-afhankelijke stap (Task 8) is gated door de BESLISGATE (Task 7 Step 5) + §E.3 — geen luie placeholder; elke tak noemt exacte laag + aanpak. Data-bepaalde waarden (recommended-drempels, exacte fix-tekst, legacy-slug-lijst) worden door een voorafgaande stap geleverd, niet geraden.

**Type/naam-consistentie:** `SOURCE_EXPECTED_TYPES` (Task 2 + 6), `LATEST_BOT_VERSION`/`BOTS`/`BOT_VERSIONS_ORDERED` (bots.ts), `ASPIRATIONAL_PRODUCTION_GATE`/`V0_ENGINE_GATE` (Task 7), `audit:taxonomy` (Task 6 → Task 9) — consistent.

---

## Execution Handoff

**Onbewaakte `/goal`-run (bypass-permissions):** start met dit bestand als doel. Voer Fase 0→6 sequentieel uit met `superpowers:executing-plans` (inline batch — geschikt voor onbewaakt doorlopen). **Geen menselijke stoppunten** (zie AUTONOMOUS RUN CONTRACT bovenaan): vaste worktree-locatie, harde kosten-cap $10 met auto-abort, fail-safe conservatieve keuzes bij twijfel, nooit mergen naar main. Eindig altijd met precies één van de vier eindstatussen + de opgeleverde docs, zodat de uitkomst 's ochtends in één oogopslag leesbaar is.
