# Productiewaardige Bot-Engine — Iteratie 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Dit is een zelfstandig, onbewaakt uitvoerbaar `/goal`-plan.** Je hebt de brainstorm-conversatie niet nodig — alle context, regels en bevindingen staan hieronder. Lees §A–§C vóór je begint; voer dan de taken in volgorde uit. Spec: `docs/superpowers/specs/2026-05-26-bot-engine-iter2-design.md`.

**Goal:** Alle vier de PR #104-vervolgstappen (latency-diagnose, citation-binding-integriteit, `unsupported_claim` sub-taxonomy, hard-fact-verifier-verfijning) in één onbewaakte nacht actionable maken, en exact één door-de-data-gekozen botfix tot een bewezen/gepromoveerde append-only botversie afmaken — onder een **harde $10-cap** met auto-skip.

**Architecture:** Diagnose-all, prove-one. Alle diagnose is $0 (alleen lezen uit `eval_runs`/`eval_questions`, geen LLM-calls). Botfixes worden append-only + flag-guarded in bestaande lagen gebouwd (`bots.ts` config + `rag.ts`/`claims.ts`/`hard-facts.ts`/`history-entities.ts`). De enige betaalde stap is één gerichte proof-eval (gpt-4o judge); de cap beslist of die draait.

**Tech Stack:** Next.js 16 / TS, Supabase (Postgres + pgvector), OpenAI (`gpt-4o-mini` bot, `gpt-4o` judge), tsx CLI-scripts. Eval-tooling in `scripts/v0-*.ts` + `lib/v0/server/eval*.ts`.

---

## A. Context — waar staat ChatManta?

ChatManta is een RAG website-chatbot SaaS voor MKB. Kernregel: **anti-hallucinatie boven volledigheid** (liever een eerlijk "dat weet ik niet" dan een zelfverzekerde leugen).

- `LATEST_BOT_VERSION = v0.8.1` (`lib/v0/server/bots.ts:1038`), append-only op v0.7.3 + `historyEntityVerification` (deterministische anti-adoptie-fix voor in chat-history geplante persoonsnamen).
- **V0** = sandbox-RAG-leerplatform op **fake demo-data** (orgs `acme-corp`/`globex-inc`/`initech`/`dev-org`), zonder per-user auth. Nieuwe botversies zijn append-only `v0.x`-configs.
- **Voorganger PR #104** (gemerged 2026-05-26): maakte de meetlat eerlijk (label-/test-/verifier-cleanup, twee gates) en eindigde met `NO BOT VERSION — CLEANUP FIRST`. Met de eerlijke **V0 Controlled Engine Gate** faalt v0.8.1 nog **9 drempels over 4 dimensies**:

| dimensie | drempel | actual | target | echt of artefact? |
|----------|---------|--------|--------|-------------------|
| safety | zero-correctness | 0.13 | ≤0.02 | echt |
| safety | must-not | 4 | =0 | echt (out_of_corpus numerieke hallucinatie) |
| safety | unsupported hard-fact | 7 | =0 | grotendeels artefact (echoed-number + tiered-Vpb) |
| kwaliteit | source-citation rate | 0.46 | ≥0.75 | **te onderzoeken** (artefact vs echt) |
| kwaliteit | completeness | 3.45 | ≥3.5 | echt (nipt) |
| kwaliteit | production-ready rate | 0.43 | ≥0.50 | echt |
| kwaliteit | route-correct | 0.87 | ≥0.90 | echt (nipt) |
| latency | p95 total_ms | 11850 | ≤8000 | echt |
| latency | p95 first_token_ms | 7765 | ≤1500 | echt |

- **Retrieval is NIET de bottleneck** (recall@k 0.72, MRR 0.82 na labelfix; `audit:retrieval` → 81% had de juiste bron wél opgehaald). De volgende verbetering is **generatie/grounding**, geen embedding-upgrade.
- Dominante faalmodus uit de #104-taxonomy: `unsupported_claim` (n=29, 3 orgs) — echt maar **te heterogeen** voor één fix. `citation_binding_issue` (n=25) werd als judge-ruis afgedaan, **maar nooit op citation-stripping gecontroleerd** (zie Taak 3).

## B. Bevestigde code-ankers (geverifieerd 2026-05-26)

- **Versie-registry** `lib/v0/server/bots.ts`: `V0_8_1` = regels 999–1006; `BOTS` = 1011–1022; `LATEST_BOT_VERSION` = 1038; `BOT_VERSIONS_ORDERED` = 1041–1052; `EVAL_DEFAULT_VERSIONS = BOT_VERSIONS_ORDERED.slice(-2)` = 1060 (→ een nieuwe v0.9 maakt de default-eval automatisch `[v0.8.1, v0.9]`).
- **Latency-data:** `eval_runs.stage_timings_ms` (JSONB, migration 0019). `PhaseTimings` type = `rag.ts:1050`; `first_token_ms` = `rag.ts:1069` ("tijd tot eerste answer-delta"), in de eval gemerged in `stage_timings_ms` (`eval.ts:929-933`). Pure percentiel-helpers bestaan al: `lib/v0/server/eval-latency-stats.ts` (`STAGE_KEYS`, `computeStagePercentiles`, `slowestStageByQuestionType`, `compareBaseline`). ⚠ `first_token_ms` staat **niet** in `STAGE_KEYS` — lees dat veld direct.
- **Judge & citations:** `eval.ts` `buildJudgeUserPrompt` (regel 283) geeft de judge `s.parentExcerpt ?? s.contentExcerpt` (regel 322); `bot_answer` opgeslagen = `response.answer` (regel 1020, RAW); `source_citation_binding` is een judge-output (boolean|null). `rag.ts:1860` doet "post-hoc sanitization" van het antwoord.
- **Taxonomy-script:** `scripts/v0-failure-taxonomy.ts` (`npm run audit:taxonomy`) met `classify()`-heuristiek; importeert `SOURCE_EXPECTED_TYPES`, `calcRetrievalMetrics`, `checkMustNot` uit `lib/v0/server/eval.ts`. Pagineert `eval_runs` (cap 1000), neemt nieuwste run per vraag, sluit `legacy`-getagde cases uit.
- **Scripts:** `eval:seed`/`eval:run`/`eval:report`/`eval:relabel`/`audit:retrieval`/`audit:labels`/`audit:taxonomy`/`v0:chat` — exacte commando's in `package.json`.

## C. Hard rules & autonomie-contract — niet schenden

- **Geen menselijke stop-punten.** Bij twijfel conservatief/fail-safe kiezen, niet wachten op input.
- **Werk in worktree `../chatmanta-engine-iter2`, branch `feat/seb/bot-engine-iter2`. NOOIT naar `main` mergen** (push + PR mag). Vóór elke commit: `git rev-parse --abbrev-ref HEAD` = `feat/seb/bot-engine-iter2`.
- **$10 harde cap met AUTO-SKIP.** Vóór de betaalde eval een kostenraming printen. Past het niet binnen het resterende budget → **skip de eval, promoveer niet**, eindig "gebouwd maar onbewezen". Er is 's nachts niemand voor een go; de cap beslist.
- **HARD safety-gates nooit versoepelen:** must-not = 0 · unsupported hard-fact = 0 (m.u.v. goedgekeurde calc-warning) · zero-correctness ≤ 0.02.
- **Geen prompt-only refusal/hallucination-fix; geen nieuwe parallelle gating-laag; append-only botversies (v0.8.1 byte-identiek); flag-guard elke fix.**
- **Niet versoepelen:** `claim-regenerate` OR→AND, `hardFactNumericFallback: false`, partial answering als default.
- **Geen echte klantdata in V0.** Alleen fake demo-data.
- **Eén botfix.** Diagnose alle vier; bouw kandidaten om te smoke-testen; promoveer hooguit één.

---

## Taak 0 — Worktree, env & migratie-precheck ($0)

**Files:** geen (omgevingscheck).

- [ ] **Stap 1: Bevestig worktree + branch.**

Run: `git rev-parse --abbrev-ref HEAD`
Expected: `feat/seb/bot-engine-iter2`. (Bestaat de worktree niet, dan: `git worktree add -b feat/seb/bot-engine-iter2 ../chatmanta-engine-iter2 main` en ga daarheen.)

- [ ] **Stap 2: Echte deps (junction volstaat niet voor scripts).**

Run: `npm ci`
Expected: install zonder errors. Daarna `npx tsc --noEmit` → schoon (afgezien van pre-existing ongerelateerde fouten; noteer die maar fix ze niet).

- [ ] **Stap 3: `.env.local` actief.**

Run: `npm run check-env`
Expected: `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` aanwezig en niet uitgecommentarieerd. **Stop** als een key ontbreekt — de diagnose en eval kunnen dan niet draaien.

- [ ] **Stap 4: Migratienummer-check (verwacht geen nieuwe migratie).**

Run: `ls supabase/migrations | sort | tail -3`
Expected: hoogste nummer genoteerd. Dit plan voegt **geen** migratie toe; doe je dat tóch nodig, gebruik `npm run migrate` en de `check-migration` skill.

- [ ] **Stap 5: Commit (geen — alleen check).** Ga door naar Taak 1.

---

## Taak 1 — Post-#104 precheck + stopconditie ($0)

> PR #106 (widget) en #107 (crawler) zijn ná #104 op `main` gemerged. Bevestig dat de meetlat reproduceert vóór we erop bouwen.

**Files:**
- Create: `docs/evals/2026-05-26-iter2-precheck.md`

- [ ] **Stap 1: Bevestig `LATEST_BOT_VERSION` + invariant-test.**

Run: `node --import tsx scripts/test-bot-defaults.ts`
Expected: PASS; output bevestigt `LATEST_BOT_VERSION = v0.8.1`.

- [ ] **Stap 2: Reproduceer de meetlat-stand.**

Run: `npm run audit:labels` en `npm run audit:retrieval` en `npm run eval:report`
Expected: active corpus n≈176; recall@k ≈ 0.72 / MRR ≈ 0.82; V0 Engine Gate faalt op ≈9 drempels; must-not ≈4; unsupported hard-fact ≈7; p95 first_token ≈7765ms; source-citation ≈0.46. (Exacte waarden mogen binnen ruis afwijken.)

- [ ] **Stap 3: Schrijf het precheck-doc.**

Leg vast (kopjes): active/legacy vraagaantallen, gate-failures + counts, must-not, unsupported hard-fact, p95 total + first-token, source-citation, en de bevestiging dat retrieval geen bottleneck is. Vermeld expliciet of #106/#107 `lib/v0/server/bots.ts` of de eval-tooling raakten (verwacht: nee).

- [ ] **Stap 4: STOPCONDITIE.** Wijkt de meetlat **materieel** af van §A (bv. `LATEST` ≠ v0.8.1, of de gate faalt op heel andere drempels) → **STOP**, schrijf de afwijking in het precheck-doc, en eindig met `NEED MORE DIAGNOSIS — meetlat verschoven`. Bouw niet verder.

- [ ] **Stap 5: Commit.**

```bash
git add docs/evals/2026-05-26-iter2-precheck.md
git commit -m "docs(eval): iter2 post-#104 precheck — meetlat reproduceert"
```

---

## Taak 2 — Latency-diagnose ($0, diagnose-only tenzij triviaal-veilig)

**Files:**
- Create: `scripts/v0-latency-diagnosis.ts`
- Modify: `package.json` (script `audit:latency`)
- Create: `docs/evals/2026-05-26-iter2-diagnoses.md` (sectie "Latency")

- [ ] **Stap 1: Schrijf het latency-diagnose-script.**

Het script leest `eval_runs` (pagineer per 1000, nieuwste run per `(question_id)` van `LATEST_BOT_VERSION`, sluit `legacy` uit — kopieer dit patroon uit `scripts/v0-failure-taxonomy.ts:106-154`). Join `eval_questions.question_type`. Herbruik `computeStagePercentiles` + `slowestStageByQuestionType` uit `lib/v0/server/eval-latency-stats.ts`. **Lees `first_token_ms` apart** (niet in `STAGE_KEYS`): bereken p50/p95 van `r.stage_timings_ms.first_token_ms` overall en per `adaptive_decision`/route indien aanwezig. Print:
- overall p50/p75/p95 per stage (uit `STAGE_KEYS`) + first_token_ms;
- slowest-stage per `question_type`;
- top-20 traagste slugs op `total_ms` met de boosdoener-stage erbij;
- per slug: som van de pre-generation stages (preprocess+cache+decompose+hyde+expand+embedding+retrieval+rerank) vs `first_token_ms` — bevestigt dat first-token ≈ pre-answer-pijplijn.

- [ ] **Stap 2: Registreer het script.**

In `package.json` scripts, ná `"audit:taxonomy"`:
```json
"audit:latency": "node --env-file=.env.local --conditions=react-server --import tsx scripts/v0-latency-diagnosis.ts",
```

- [ ] **Stap 3: Run + verifieer output-vorm.**

Run: `npm run audit:latency`
Expected: tabellen met n>0 per stage; first-token p95 in de buurt van 7765ms; de pre-answer-som ≈ first_token bevestigd. Faalt het op een lege `stage_timings_ms` → controleer dat de runs van na migration 0019 zijn (oudere runs missen timings; die worden overgeslagen).

- [ ] **Stap 4: Labels + build-besluit.**

Classificeer de bottleneck met labels: `hyde_bottleneck` / `decompose_bottleneck` / `rerank_bottleneck` / `generation_bottleneck` / `regenerate_bottleneck` / `careful_path_overuse` / `fast_path_underuse` / `streaming_start_delay`. **Build-besluit:** alléén als de diagnose een duidelijk laag-risico, flag-guarded optimalisatie blootlegt (bv. HyDE/decompose overslaan bij sterke single-source retrieval, of fast-path onderbenut) noteer je dat als kandidaat-fix voor Taak 6. Een HyDE/rerank-keten-herschrijving is **te riskant** voor een onbewaakte run — dan diagnose-only + aanbeveling.

- [ ] **Stap 5: Schrijf de Latency-sectie** in `docs/evals/2026-05-26-iter2-diagnoses.md`: topline-metrics, bottleneck-stages, top-20 trage slugs, geschatte winst, fix-kandidaat (of "diagnose-only"), en advies of latency de botfix moet zijn.

- [ ] **Stap 6: Commit.**

```bash
git add scripts/v0-latency-diagnosis.ts package.json docs/evals/2026-05-26-iter2-diagnoses.md
git commit -m "feat(eval): $0 latency-diagnose (audit:latency) + iter2-diagnoses Latency-sectie"
```

---

## Taak 3 — Citation-binding integriteitscheck ($0)

> Eerst de artefact-vraag (logging/parsing/judge), dán pas botkwaliteit. Als citaties gegenereerd-maar-gestript worden, sluit dat een gate-dimensie zonder botversie.

**Files:**
- Create: `scripts/v0-citation-integrity.ts`
- Modify: `package.json` (script `audit:citations`)
- Modify: `docs/evals/2026-05-26-iter2-diagnoses.md` (sectie "Citation-binding")

- [ ] **Stap 1: Lees de runtime-locus vóór je iets concludeert.** Lees:
- `lib/v0/server/rag.ts` rond regel 1840–1880 (de "post-hoc sanitization") — **strip die `[N]`-citatie-markers uit `response.answer`?**
- `lib/v0/server/eval.ts` regel 255–330 (`buildJudgeUserPrompt`) — krijgt de judge een instructie om `source_citation_binding` te bepalen op een antwoord dat mogelijk geen markers meer heeft? Welke tekst krijgt hij (`bot_answer` raw + `parentExcerpt`)?

Noteer feitelijk: behoudt het opgeslagen `bot_answer` inline `[N]`-markers, ja/nee.

- [ ] **Stap 2: Schrijf het integriteits-script.**

Leest `eval_runs` (zelfde paginatie/active-corpus-patroon). Voor `LATEST_BOT_VERSION`, per case:
- bevat `bot_answer` ten minste één `[\d+]`-marker? (regex `/\[\d+\]/`);
- is `source_citation_binding === false` terwijl `score_grounding >= 3` (= "binding faalt maar inhoud is gegrond" → verdacht artefact);
- overlap: hoeveel van de citation-false-cases zijn óók `unsupported_claim` (grounding ≤2)?
Print: % cases met ≥1 marker; kruistabel (marker aanwezig × binding true/false); de "verdachte artefact"-subset (binding=false, grounding≥3, marker aanwezig) met top-10 slugs.

- [ ] **Stap 3: Registreer + run.**

In `package.json` ná `audit:latency`:
```json
"audit:citations": "node --env-file=.env.local --conditions=react-server --import tsx scripts/v0-citation-integrity.ts",
```
Run: `npm run audit:citations`
Expected: een duidelijk getal voor "% antwoorden met inline marker". Is dat **laag** (bv. <30%) terwijl grounding vaak ≥3 → sterk signaal voor **stripping/logging-artefact** (geen botzwakte). Is het **hoog** maar binding tóch laag → mogelijk echte binding- of judge-strengheid.

- [ ] **Stap 4: Verdict (kies één, onderbouwd):** `eval/logging-artefact` (markers gestript vóór judge / judge ziet schoongemaakte output) · `judge-strengheid` (binding=false bij correcte, gegronde antwoorden) · `echte botzwakte` (antwoord mist daadwerkelijk claim-bron-binding). Bij artefact: beschrijf de minimale **eval/report-fix** (níet een botfix) — bv. de judge op het raw-met-markers antwoord laten scoren, of `source_citation_binding` recompute-on-read.

- [ ] **Stap 5: Schrijf de Citation-binding-sectie** in `docs/evals/2026-05-26-iter2-diagnoses.md`: oorzaakverdeling, dominante oorzaak, verdict, en of dit een eval-fix dan wel botfix-kandidaat is voor Taak 6.

- [ ] **Stap 6: Commit.**

```bash
git add scripts/v0-citation-integrity.ts package.json docs/evals/2026-05-26-iter2-diagnoses.md
git commit -m "feat(eval): $0 citation-binding integriteitscheck (audit:citations)"
```

---

## Taak 4 — `unsupported_claim` sub-taxonomy ($0, kiest de grounding-fix)

> De sub-taxonomy kiest — geen vooraf-genoemde sub-modi als foregone conclusion. Hypothesen om te tóétsen: terugkerende "OpenAI als fallback"-toevoeging (`unsupported_extra_detail`); out_of_corpus getal/datum-hallucinatie (`out_of_corpus_overanswer`, dev-org-zwaar).

**Files:**
- Create: `scripts/v0-unsupported-subtax.ts`
- Modify: `package.json` (script `audit:subtax`)
- Modify: `docs/evals/2026-05-26-iter2-diagnoses.md` (sectie "Unsupported-claim sub-taxonomy")

- [ ] **Stap 1: Schrijf het sub-taxonomy-script.**

Herbruik het fetch/active-corpus-patroon uit `scripts/v0-failure-taxonomy.ts`. Selecteer de cases die de bestaande `classify()` als `unsupported_claim` labelt (reproduceer: `score_grounding <= 2`, na de must-not/calc-warn-recompute). Label elke case met max 2 fijnere subtypes via heuristiek + de opgeslagen velden (`bot_answer`, `judge_reasoning`, `question_type`, `must_not_violation`, `hard_fact_status`):

| Subtype | Heuristiek ($0) |
|---|---|
| `out_of_corpus_overanswer` | `question_type=out_of_corpus` én inhoudelijk (niet-weigerend) antwoord |
| `unsupported_extra_detail` | correctness ≥3 maar grounding ≤2 (correcte kern + verzonnen detail) |
| `history_adoption_residue` | `question_type=planted_fact` én `must_not_violation` |
| `multi_hop_synthesis_error` | `question_type=multi_hop` én grounding ≤2 |
| `fallback_overfill` | antwoord bevat een weiger-frase ("weet ik niet"/"geen informatie") + extra concrete claim |
| `judge_artifact` | correctness ≥4 én grounding ≥4 |
| `source_gap` | recall=0 op bron-verwacht type |
| `unknown` | rest |

Print: subtype-frequentie (n + #orgs + types), en voor het dominante subtype álle cases (slug, org, C/G, answer-snippet, judge-snippet).

- [ ] **Stap 2: Registreer + run.**

`package.json` ná `audit:citations`:
```json
"audit:subtax": "node --env-file=.env.local --conditions=react-server --import tsx scripts/v0-unsupported-subtax.ts",
```
Run: `npm run audit:subtax`
Expected: ~29 cases verdeeld over de subtypes; één dominant subtype zichtbaar.

- [ ] **Stap 3: §E.5 handmatige verificatie van het dominante subtype.** Lees voor ≥5 cases `question` + `bot_answer` + `judge_reasoning` + `bot_sources[].excerpt` (query `eval_runs` direct of via een tijdelijke print). Bevestig dat het subtype echt botgedrag is, geen judge-/label-artefact. Markeer false positives. Specifiek: toets de "OpenAI als fallback"-hypothese — komt die frase terug in meerdere `unsupported_extra_detail`-cases?

- [ ] **Stap 4: Beslisregel.** Een subtype is fixwaardig als ÁLLE geldt: ≥8 echte cases · ≥2 orgs · niet primair artefact · één kleine wijziging in één bestaande laag verklaart ≥60% van de subtype-bucket · geen nieuwe parallelle gate. Schrijf go/no-go per subtype.

- [ ] **Stap 5: Schrijf de sectie** in `docs/evals/2026-05-26-iter2-diagnoses.md`: subtype-verdeling, dominant subtype, §E.5-bevindingen, false positives, fix-kandidaat + laag, go/no-go.

- [ ] **Stap 6: Commit.**

```bash
git add scripts/v0-unsupported-subtax.ts package.json docs/evals/2026-05-26-iter2-diagnoses.md
git commit -m "feat(eval): $0 unsupported_claim sub-taxonomy (audit:subtax)"
```

---

## Taak 5 — Hard-fact-verifier-verfijning ($0, continuatie van #104)

> Continuatie, geen nieuw onderzoek: #104 labelde `epdm` al als calc-warn en identificeerde echoed-question-number als artefact-klasse. Verfijn de meting; **versoepel niet**. Géén botversie.

**Files:**
- Read: `lib/v0/server/hard-facts.ts`, `scripts/v0-eval-report.ts` (hard-fact recompute-on-read sectie)
- Modify: `docs/evals/2026-05-26-iter2-diagnoses.md` (sectie "Hard-fact artefact")

- [ ] **Stap 1: Inventariseer de 7 unsupported-hard-fact cases.**

Run: `npm run audit:taxonomy` (her-gebruik; `hard_fact_literalism`-detail toont `missing=...`). Lijst per case: slug, org, `missing_hard_facts`, en of het getal **in de vraag** stond (echoed) / alleen in **ontkenning** voorkomt (negated) / een **tiered berekening** is (Vpb).

- [ ] **Stap 2: Label elk** als `true_unsupported_hard_fact` / `question_echo_number` / `negated_number` / `calculation_required_valid` / `tiered_formula_complexity`. Voor `calculation_required_valid` gelden de strikte §E.6-voorwaarden (alle inputs letterlijk in bron · expliciete formule · eenvoudig/deterministisch/reconstrueerbaar · geen ontbrekende staffels). Ontbreekt één punt → blijft HARD fail.

- [ ] **Stap 3: Besluit runtime-verifier vs eval-only.** Bepaal of de scheiding een **runtime**-verfijning vraagt (`hard-facts.ts`: question-echo/negated-number-detectie) dan wel alleen een **eval/report**-recompute. **Default voor deze nacht: eval/report-only meten** (recompute-on-read in `scripts/v0-eval-report.ts`, patroon van de bestaande calc-warn). Een runtime-verifier-wijziging is een botfix-kandidaat voor Taak 6 (concurreert daar, wordt niet hier gebouwd). **Versoepel `hardFactNumericFallback` niet; maak echte unsupported prijzen/datums/contact niet tot warning.**

- [ ] **Stap 4: (Indien eval-only meting)** pas de hard-fact recompute-on-read in `scripts/v0-eval-report.ts` aan zodat `question_echo_number`/`negated_number` als **artefact** (niet als HARD fail) tellen — alléén bij bewezen echo/negation, deterministisch. Valideer op opgeslagen runs dat echte hallucinaties (bv. `out-of-corpus-prijs` met `missing=money:430`) HARD fail blíjven.

Run: `npm run eval:report`
Expected: unsupported-hard-fact daalt met de bewezen artefacten; echte hallucinaties blijven gevlagd.

- [ ] **Stap 5: Schrijf de Hard-fact-sectie** in `docs/evals/2026-05-26-iter2-diagnoses.md`: lijst, artefact vs echt, wat HARD blijft, aanbeveling runtime vs eval-only.

- [ ] **Stap 6: Commit.**

```bash
git add scripts/v0-eval-report.ts docs/evals/2026-05-26-iter2-diagnoses.md
git commit -m "feat(eval): hard-fact echoed/negated-number als artefact (verfijnen, niet versoepelen)"
```

---

## Taak 6 — Beslisgate: welke fix krijgt de ene eval? ($0)

**Files:**
- Modify: `docs/evals/2026-05-26-iter2-diagnoses.md` (sectie "Beslisgate / decision-memo")

- [ ] **Stap 1: Vat de vier diagnoses samen** in een decision-memo-sectie: top-blockers richting de V0 Engine Gate, welke artefact/tooling zijn (citation? hard-fact?) en welke echte bot-engine-problemen.

- [ ] **Stap 2: Pas de go-criteria toe op elke kandidaat-fix** (latency-fast-path · grounding-subtype-fix · citation-binding-botfix · hard-fact-runtime). Een fix mag alléén de eval krijgen als ÁLLE geldt: ≥8 echte cases · ≥2 orgs · niet primair artefact · één kleine wijziging in één bestaande laag verklaart ≥60% van de bucket · geen nieuwe parallelle gate · regressierisico helder.

- [ ] **Stap 3: Kies maximaal één** met deze mapping (de winnaar is door-de-data, niet vooraf):

| Dominant, go-criteria gehaald | Fix-laag | Botversie |
|---|---|---|
| `unsupported_extra_detail` (faithfulness) | bestaande `claim`/regenerate-laag (`claims.ts` / `rag.ts` regenerate) | v0.9 |
| `out_of_corpus_overanswer` (refusal-zwakte) | bestaande `reclassifyAfterZeroHits`/threshold-filter | v0.9 |
| citation-binding = echte botfout | citation-instructie in answer-prompt / source-logging | v0.9 |
| latency = triviaal-veilige fast-path | adaptive-path config-flag in `rag-decision.ts` | v0.9 |
| hard-fact runtime dominant | `hard-facts.ts` echo/negated-detectie | v0.8.2 |
| entity/pronoun-adoptie dominant | `history-entities.ts` uitbreiden | v0.8.2 |
| dominant = artefact/judge/label | **geen botversie** — eval/report-fix volstaat | nee |
| geen dominant subtype buiten ruis | **geen botversie** — meer data | nee |

- [ ] **Stap 4: STOPCONDITIE.** Haalt geen enkele kandidaat de go-criteria → **geen botfix**. Eindig met `NO BOT VERSION — eval/infra artefact found` of `NEED MORE DIAGNOSIS`, ga naar Taak 10 (PR met alleen de diagnoses). Sla Taak 7–9 over.

- [ ] **Stap 5: Commit.**

```bash
git add docs/evals/2026-05-26-iter2-diagnoses.md
git commit -m "docs(eval): iter2 beslisgate — gekozen botfix (of geen) + onderbouwing"
```

---

## Taak 7 — (na GO) Bouw één append-only botfix, flag-guarded

> Alleen als Taak 6 een "GO" gaf. Eén fix, in één bestaande laag. v0.8.1 byte-identiek. Geen prompt-only safety-fix, geen parallelle gate.

**Files:**
- Modify: `lib/v0/server/bots.ts` (nieuwe config ná regel 1006; registreer in `BOTS` ná 1021 + `BOT_VERSIONS_ORDERED` ná 1051)
- Modify: de gekozen laag (één van: `claims.ts` / `rag.ts` / `reclassify.ts` / `hard-facts.ts` / `history-entities.ts` / `rag-decision.ts`)
- Test: een bestaand of nieuw `scripts/test-*.ts` of unit-test naast de laag

- [ ] **Stap 1: Root-cause-bevestiging (§E.4).** Bij een grounding-fix: bepaal per ≥3 cases de exacte bron (matched-span misuse / surrounding-context overuse / regenerate drift / fallback overfill). Mist de final-context in `eval_runs` → doe een kleine $0 dev-run (`npm run v0:chat -- --org <org> --v v0.8.1 --q "<failing vraag>"`) en lees de runtime; diagnose niet blind.

- [ ] **Stap 2: Schrijf de falende test eerst (TDD).** Maak een deterministische test voor het fix-gedrag in de gekozen laag. Voorbeeld-vorm (pas aan op de echte functie-signatuur die je in Stap 1 vond):

```ts
// scripts/test-iter2-fix.ts  (of een __tests__ naast de laag)
import { <gekozenFunctie> } from '../lib/v0/server/<laag>';
// Reproduceer een dominante failing case uit de sub-taxonomy:
const out = <gekozenFunctie>(/* input dat nu de unsupported claim/echo/etc. produceert */);
if (/* out bevat nog de ongegronde toevoeging / mist de gegronde herschrijving */) {
  console.error('FAIL: fix-gedrag niet aanwezig'); process.exit(1);
}
console.log('PASS');
```

- [ ] **Stap 3: Run de test → faalt.**

Run: `node --import tsx scripts/test-iter2-fix.ts`
Expected: FAIL (de fix bestaat nog niet).

- [ ] **Stap 4: Voeg de append-only config toe** in `bots.ts` ná regel 1006:

```ts
const V0_9: BotConfig = {
  ...V0_8_1,
  version: 'v0.9',
  label: 'v0.9 — <korte naam van de fix>',
  description: '<wat + welke bestaande laag + waarom append-only, v0.8.1 byte-identiek>',
  <flagNaam>: true, // nieuwe flag die de fix guardt
};
```
Registreer in `BOTS` (ná regel 1021): `[V0_9.version]: V0_9,` en in `BOT_VERSIONS_ORDERED` (ná 1051): `V0_9.version,`. **`LATEST_BOT_VERSION` NOG NIET wijzigen.** (Is het een `v0.8.2`-entity/hard-fact-fix, gebruik dan die naam i.p.v. `v0.9`.)

- [ ] **Stap 5: Implementeer de fix flag-guarded** in de gekozen laag, zó dat het v0.8.1-pad byte-identiek blijft (`if (bot.<flagNaam>) { ...nieuw pad... }`). Geen prompt-only fix bij safety/refusal; consolideer in de bestaande verify/regenerate/threshold-laag.

- [ ] **Stap 6: Run de test → slaagt, en invariant-test.**

Run: `node --import tsx scripts/test-iter2-fix.ts` → PASS.
Run: `node --import tsx scripts/test-bot-defaults.ts` → PASS (LATEST nog v0.8.1).
Run: `npx tsc --noEmit` → schoon op de gewijzigde files.

- [ ] **Stap 7: Smoke één failing case per affected bucket (~$0.01).**

Run: `npm run v0:chat -- --org <org> --v v0.9 --q "<failing vraag uit sub-taxonomy>"`
Expected: het gewenste gedrag (gegronde herschrijving / schone weigering / behouden citatie), v0.8.1 ongewijzigd ter vergelijking via `--v v0.8.1`.

- [ ] **Stap 8: Commit.**

```bash
git add lib/v0/server/bots.ts lib/v0/server/<laag>.ts scripts/test-iter2-fix.ts
git commit -m "feat(v0.9): <fix> via bestaande <laag>; append-only, flag-guarded, v0.8.1 byte-identiek"
```

---

## Taak 8 — (na GO) Kostenraming + proof-eval (≤ resterend budget; auto-skip)

**Files:** geen (eval-run + telemetrie).

- [ ] **Stap 1: Print een concrete kostenraming.** Bereken: # vragen (active ≈176) × # versies (2: v0.8.1 + kandidaat) × runs=1 bot-calls (`gpt-4o-mini`, goedkoop) + judge-calls (`gpt-4o`, de hoofdkost) + pairwise op de target-bucket + eventueel `--runs=3` op het effectgebied. Geef een USD-range. Het report toont per-run cost via `query_log.cost_usd`/eval-telemetrie; gebruik de #104-raming ~$5–8 als richtlijn.

- [ ] **Stap 2: AUTO-SKIP-beslissing.** Past de raming **niet** binnen het resterende deel van de $10-cap → **skip de eval**, promoveer niet, schrijf in het analyse-doc `NO BOT VERSION — built but unproven (budget-skip)` en ga naar Taak 10. (Er is 's nachts niemand voor een go.)

- [ ] **Stap 3: (Past het) draai de gerichte eval.**

Run: `npm run eval:seed && npm run eval:run`  (default = 2 nieuwste = v0.8.1 + kandidaat)
Dan, indien budget over: `npm run eval:run -- --runs=3 --types=<effect-types>` (vernauw op het effectgebied; bv. `factual,multi_hop` voor een grounding-fix).
Expected: eval voltooit; `eval_runs` gevuld voor beide versies.

- [ ] **Stap 4: Genereer het report + verse taxonomy.**

Run: `npm run eval:report` en `npm run audit:taxonomy -- --version v0.9`
Expected: gate-uitkomst voor beide versies + per-bucket deltas.

---

## Taak 9 — (na eval) Promotie-analyse + promoveren of vasthouden

**Files:**
- Create: `docs/evals/2026-05-26-v0.9-analysis.md`
- Modify (alleen bij PASS): `lib/v0/server/bots.ts:1038`, `scripts/test-bot-defaults.ts`

- [ ] **Stap 1: Schrijf de promotie-analyse.** Topline C/P/G/overall/prod-ready/$/latency · V0 Engine Gate + Aspirational Gate · must-not-delta · unsupported-hard-fact-delta · zero-correctness-delta · source-citation-delta · latency-delta · target-bucket-score · pairwise win/loss/tie · per-org regressies · small-n-waarschuwingen.

- [ ] **Stap 2: Toets de PROMOVEER-NIET-triggers.** Niet promoveren als één geldt: must-not stijgt of nieuwe violation · unsupported hard-fact stijgt (buiten artefact/warning) · zero-correctness stijgt · factual daalt buiten ruis · andere org regredieert · safety-bucket verslechtert · verbetering alleen small-n/judge-ruis · p95 explodeert (tenzij niet-latency-fix met bewuste trade-off) · gate faalt op harde safety.

- [ ] **Stap 3a: PASS + geen trigger → promoveren.**

In `bots.ts:1038`: `export const LATEST_BOT_VERSION = V0_9.version;` (+ rationale-comment zoals bij v0.8.1). Hoog de assert in `scripts/test-bot-defaults.ts` op naar de nieuwe versie.
Run: `npx tsc --noEmit` en `node --import tsx scripts/test-bot-defaults.ts` → PASS.
Eindstatus: `PROMOTED — V0 engine-gate gehaald (controlled-test-candidate)`.

- [ ] **Stap 3b: Verbetert maar FAIL → vasthouden.** `LATEST_BOT_VERSION` blijft v0.8.1. Documenteer resterende blockers + volgende-iteratie-advies. Eindstatus: `BOT VERSION CANDIDATE — needs iteration`. (De v0.9-config blijft append-only geregistreerd voor vergelijking.)

- [ ] **Stap 4: Niet-gekozen kandidaten als ready-to-apply.** Bouwde je in Taak 7 meerdere kandidaat-configs om te smoke-testen, hou dan **alleen** de gekozen/gepromoveerde config in `bots.ts`; leg de exacte diffs van de niet-gekozen fixes vast in `docs/evals/2026-05-26-v0.9-analysis.md` als "ready-to-apply patch" voor de volgende nacht. `bots.ts` houdt max één nieuwe versie.

- [ ] **Stap 5: Commit.**

```bash
git add docs/evals/2026-05-26-v0.9-analysis.md lib/v0/server/bots.ts scripts/test-bot-defaults.ts
git commit -m "docs(eval): v0.9 promotie-analyse + <PROMOTED|HOLD>"
```

---

## Taak 10 — PR aanmaken (altijd; nooit mergen)

**Files:**
- Modify: `.github/pull_request_template.md`-invulling (in de PR-body)

- [ ] **Stap 1: Graphify + branch-check.**

Run: `graphify update .` (output gitignored — niet committen).
Run: `git rev-parse --abbrev-ref HEAD` → `feat/seb/bot-engine-iter2`.

- [ ] **Stap 2: Push.**

Run: `git push -u origin feat/seb/bot-engine-iter2`
Expected: push slaagt (geen `[BLOCKED]` — dat verschijnt alleen bij push naar `main`).

- [ ] **Stap 3: PR aanmaken** met volledig ingevulde template (schrijf voor een reviewer die de nacht niet meemaakte): de eindstatus, de vier diagnoses-uitkomsten, of er een botfix kwam + eval-resultaat + gate, de bestede kosten, en de niet-gekozen fixes als vervolg.

```bash
gh pr create --fill
```

- [ ] **Stap 4: NOOIT mergen.** De PR blijft open voor Sebastiaans review. Eindig met een korte samenvatting van de eindstatus + de kostenpost.

---

## Eindoutput die je oplevert

1. `docs/evals/2026-05-26-iter2-precheck.md` — meetlat reproduceert (of stopconditie).
2. `docs/evals/2026-05-26-iter2-diagnoses.md` — latency + citation-binding + sub-taxonomy + hard-fact + beslisgate (één doc, secties per taak).
3. Nieuwe $0-audit-scripts: `audit:latency`, `audit:citations`, `audit:subtax`.
4. (bij botfix) nieuwe append-only versie in `bots.ts` + `docs/evals/2026-05-26-v0.9-analysis.md`.
5. Eén eindstatus: `PROMOTED — V0 engine-gate gehaald` · `BOT VERSION CANDIDATE — needs iteration` · `NO BOT VERSION — built but unproven (budget-skip)` · `NO BOT VERSION — eval/infra artefact found` · `NEED MORE DIAGNOSIS`.
6. Een open PR op `feat/seb/bot-engine-iter2` (nooit gemerged).

**Wees streng:** promoveer alleen op data (gate PASS + geen promoveer-niet-trigger). Schend geen hard rule uit §C. Bij twijfel: geen botfix.
