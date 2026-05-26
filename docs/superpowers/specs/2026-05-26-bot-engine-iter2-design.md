# Design: Productiewaardige Bot-Engine — Iteratie 2 (overnight `/goal`-run)

**Datum:** 2026-05-26
**Auteur:** Claude Code (brainstorm met Sebastiaan)
**Status:** design — goedgekeurd, plan-document volgt via writing-plans
**Branch / worktree:** `feat/seb/bot-engine-iter2` in `../chatmanta-engine-iter2`
**Voorganger:** PR #104 (`feat(eval): meetlat-cleanup`) — gemerged 2026-05-26, eindstatus `NO BOT VERSION — CLEANUP FIRST`.

---

## 1. Probleem & doel

PR #104 maakte de meetlat eerlijk en liet zien dat v0.8.1 de **V0 Controlled Engine Gate** nog faalt
op **9 drempels over 4 onafhankelijke dimensies** (safety, kwaliteit, retrieval/citatie, latency).
De BESLISGATE besloot conservatief géén botfix te bouwen: de dominante faalmodus (`unsupported_claim`,
n=29) was te heterogeen voor één fix.

PR #104 liet vier vervolgstappen achter (§5 van het sessieverslag). **Doel van deze iteratie:** alle vier
in één onbewaakte nacht zó ver brengen dat ze actionable zijn, en **exact één** door-de-data-gekozen botfix
helemaal tot een bewezen/gepromoveerde botversie afmaken — onder een **harde $10-cap**.

**Scope:** V0 bot-engine op fake/demo-data (acme-corp, globex-inc, initech, dev-org). **Buiten scope:**
V1-auth/multi-tenancy, billing, echte klant-onboarding, retrieval/embedding-upgrades (retrieval is bewezen
níet de bottleneck — recall@k 0.72 na labelfix).

## 2. Strategie

**"Diagnose-all, prove-one."** Met één eval-budget (~$5–8 per proof-eval) kan precies één botfix worden
bewezen en gepromoveerd — wat tegelijk de hard rule *"één botfix per sessie"* respecteert. Daarom:

1. **$0-fase voor alle vier:** latency-diagnose, citation-binding integriteitscheck, `unsupported_claim`
   sub-taxonomy, hard-fact-verifier-verfijning — plus bouw + smoke van de levensvatbare botfix-kandidaten.
2. **De data kiest** aan het eind de hoogste-leverage botfix (§6 beslisgate-criteria).
3. **De ene betaalde eval** gaat naar die kandidaat, vs v0.8.1.
4. **Promotie alleen bij gate-PASS** + geen promoveer-niet-trigger. Anders: gebouwd-maar-onbewezen.

## 3. Autonomie-contract (bindend, overgenomen van PR #104, aangescherpt voor onbewaakte $10-run)

- **Geen menselijke stop-punten.** Bij twijfel een conservatieve, fail-safe keuze maken — niet wachten op input.
- **Vaste zichtbare worktree** `../chatmanta-engine-iter2`, branch `feat/seb/bot-engine-iter2`.
  **NOOIT naar `main` mergen** (push + PR mag wel).
- **$10 harde cap met AUTO-SKIP.** Vóór élke betaalde stap een kostenraming printen (# vragen · # versies ·
  # runs · # bot-calls · # judge-calls · # pairwise-calls · USD-range). Past het niet binnen het resterende
  budget → **skip de eval, promoveer niet**, eindig met "gebouwd maar onbewezen". *Er is 's nachts niemand om
  een go te geven; de cap beslist — dit is bewust anders dan een attended run.*
- **HARD safety-gates nooit versoepelen:** must-not = 0 · unsupported hard-fact = 0 (m.u.v. expliciet
  goedgekeurde calc-warning §E.6 uit het #104-plan) · zero-correctness ≤ 0.02.
- **Geen prompt-only refusal/hallucination-fix.** Consolideren in bestaande verify/regenerate/template-laag.
- **Geen nieuwe parallelle gating-laag** naast `decideRagStrategy` / `reclassifyAfterZeroHits` /
  `detectInjection` / threshold-filter / cascade / hard-fact-verifier / claim-verification / regenerate.
- **Append-only botversies.** Nieuwe versie = `{ ...V0_8_1 }`, flag-guarded; v0.8.1 blíjft byte-identiek.
- **Niet versoepelen:** `claim-regenerate` OR→AND, `hardFactNumericFallback: false`, partial answering als default.
- **Promotie alleen bij V0 Engine Gate PASS.**

## 4. Fasen

### Fase 0 — Worktree, env & precheck ($0)
- Worktree + branch (gedaan). `.env.local`-check: `OPENAI_API_KEY` + Supabase service-role actief
  (niet uitgecommentarieerd). Werkende deps (`npm ci` in de worktree — junction volstaat niet voor een echte run).
- **Migratienummer-check** (verwacht: geen migratie). `ls supabase/migrations | sort | tail -3` + open-PR-check.

### Fase 0.5 — Post-#104 precheck + stopconditie ($0) *(insight uit het externe plan)*
Bevestig dat de meetlat reproduceert vóór we erop bouwen. **Relevant:** PR #106 (widget) en #107 (crawler)
zijn ná #104 op `main` gemerged — bevestig dat ze `bots.ts`/eval-tooling niet hebben verstoord.
- `node --import tsx scripts/test-bot-defaults.ts` → PASS, `LATEST_BOT_VERSION = v0.8.1`.
- `npm run audit:labels` · `npm run audit:retrieval` · `npm run eval:report` → de 9-fail gate-stand
  (active corpus n≈176) reproduceert binnen ruis.
- **Stopconditie:** wijkt de meetlat materieel af van het #104-verslag → STOP en rapporteer; niet bouwen op
  een verschoven meetlat.
- Output: kort `docs/evals/2026-05-2X-iter2-precheck.md`.

### Fase 1 — Latency-diagnose ($0, diagnose-only tenzij triviaal-veilig)
Lees `eval_runs.stage_timings_ms` + `total_ms`/`first_token_ms`/`adaptive_decision`/`route`/`skippedPhases`.
- Slices: overall p50/p75/p95 per stage (preprocess, embed, retrieve, HyDE, decompose, rerank, answer-gen,
  claim-verify, hard-fact-verify, regenerate, followups); per `question_type`; per adaptive path
  (fast/standard/careful); top-20 traagste slugs met boosdoener-stage.
- Diagnose-labels incl. `streaming_start_delay`, `careful_path_overuse`, `fast_path_underuse`,
  `hyde_bottleneck`, `rerank_bottleneck`, `regenerate_bottleneck`.
- **Build-besluit:** alléén als de diagnose een duidelijk laag-risico, flag-guarded optimalisatie blootlegt
  (bv. een redundante/parallelliseerbare call of fast-path-onderbenutting) → bouw die als append-only
  kandidaat-config. Anders **diagnose-only + concrete aanbeveling** — geen risicovolle HyDE/rerank-keten-
  herschrijving in een onbewaakte nacht.

### Fase 2 — Citation-binding integriteitscheck ($0) *(kerninsight uit het externe plan)*
PR #104 verklaarde `citation_binding_issue` (n=25) als judge-ruis — maar checkte nooit of citaties
**gegenereerd-maar-gestript** worden vóór de judge ze ziet. Eerst dáárop:
1. Worden inline `[1]`-citaties wél geproduceerd maar door widget/parser gestript vóór logging?
2. Meet de judge op het **ruwe** antwoord of op de **opgeschoonde** output?
3. Geeft `bot_sources[].excerpt` de judge genoeg om een claim te binden?
4. Overlapt lage citation-binding met `unsupported_claim`?
- **Eerst artefact-vraag (eval/logging/parser), dán pas botkwaliteit.** Als het (deels) een logging/parsing-
  artefact is: dat is een bijna-gratis pad om een hele gate-dimensie te sluiten **zonder botversie**.
- Output: oorzaakverdeling + dominante oorzaak + advies (eval/report-fix vs botfix vs target splitsen).

### Fase 3 — `unsupported_claim` sub-taxonomy + bouw kandidaten ($0) *(rigueur uit het externe plan)*
**De sub-taxonomy kiest — geen vooraf-genoemde sub-modi als foregone conclusion.** Splits de 29
`unsupported_claim`-cases in concrete subtypes (max 2 labels/case): `out_of_corpus_overanswer`,
`unsupported_extra_detail`, `history_adoption_residue`, `surrounding_context_overuse`,
`multi_hop_synthesis_error`, `fallback_overfill`, `regenerate_drift`, `hard_fact_misclassification`,
`judge_artifact`, `eval_label_issue`, `source_gap`, `unknown`.
- Hypothesen om te toetsen (níet te bevestigen): terugkerende "OpenAI als fallback"-toevoeging
  (`unsupported_extra_detail`); out_of_corpus getal/datum-hallucinatie (`out_of_corpus_overanswer`, dev-org-zwaar).
- **§E.5-verificatie:** voor het dominante subtype ≥5 cases handmatig (question + bot_answer + judge_reasoning
  + excerpt). Markeer false positives. Als de final-context ontbreekt voor matched-span-vs-surrounding diagnose:
  kleine $0 dev-run-instrumentatie of runtime lezen — niet blind beslissen.
- Bouw de levensvatbare kandidaat-fix(es) als **append-only, flag-guarded** config in de bestaande
  regenerate/verify-laag; smoke-test elk (~$0.01).

### Fase 4 — Hard-fact-verifier-verfijning ($0, continuatie van #104)
**Continuatie, geen nieuw onderzoek:** #104 labelde `epdm` al als calc-warn en identificeerde
echoed-question-number als de artefact-klasse. Hier: verfijn de verifier zodat hij artefacten scheidt van
echte hallucinatie — `question_echo_number` / `negated_number` / valid-`calculation_required` (strikte §E.6-
voorwaarden) — **verfijnen, niet versoepelen**. Meetlat-werk, recompute-on-read, géén botversie. Valideer op
opgeslagen runs dat echte hallucinaties gevlagd blíjven.

### Fase 5 — Beslisgate: welke fix krijgt de ene eval? ($0)
Decision-memo. De data kiest één botfix die voldoet aan **ÁLLE** criteria (anders: geen botfix):
≥8 echte cases · ≥2 orgs · niet primair eval/judge/label-artefact · één kleine wijziging in één bestaande laag
verklaart ≥60% van de bucket · geen nieuwe parallelle gate · regressierisico's helder · evalplan vooraf.
- Kandidaten die kunnen winnen: de gekozen grounding-subtype-fix · citation-binding (alléén als het een
  echte botfix is, geen artefact) · latency (alléén als er een triviaal-veilige fix bleek) · hard-fact-runtime
  (alléén als echt-dominant). Print kostenraming.

### Fase 6 — Proof-eval (≤ resterend budget; auto-skip)
`eval:seed && eval:run` (2 nieuwste = v0.8.1 + kandidaat) + gerichte `--runs=3` op het effectgebied indien
betaalbaar. Safety-buckets meelopen (planted_fact/out_of_corpus/false_premise/hard-fact-risk). Pairwise op
target-bucket. **Auto-skip** zodra de raming het resterende budget overschrijdt.

### Fase 7 — Promotie of vasthouden ($0)
Promoveer-niet-triggers (enumeratie): must-not stijgt · unsupported hard-fact stijgt (buiten artefact/warning)
· zero-correctness stijgt · factual daalt buiten ruis · andere org regredieert · safety-bucket verslechtert ·
verbetering alleen small-n/judge-ruis · p95 explodeert (tenzij niet-latency-fix met bewuste trade-off) ·
gate faalt op harde safety.
- **PASS + geen trigger** → `LATEST_BOT_VERSION` verschuiven + `test-bot-defaults.ts` ophogen + tsc/test PASS.
- **Anders** → vasthouden; v0.8.1 blijft LATEST; resterende blockers documenteren.
- **Niet-gekozen kandidaat-configs blijven niet als losse stubs in `bots.ts`.** Alleen de gekozen/gepromoveerde
  (of, bij FAIL, géén) config blijft; de exacte diffs van niet-gekozen fixes worden vastgelegd in het
  analyse-doc als "ready-to-apply" voor de volgende nacht. `bots.ts` houdt max één nieuwe versie.

### Fase 8 — PR ($0)
`graphify update .` (output gitignored) · branch verifiëren · `.github/pull_request_template.md` volledig ·
`git push -u origin feat/seb/bot-engine-iter2` · `gh pr create --fill`. **Nooit mergen.**

## 5. Deliverables

**Lean — geen 7-doc-sprawl** (project-regel "minimaal eerst"). Geconsolideerd in 2–3 docs:
1. `docs/evals/2026-05-2X-iter2-precheck.md` (kort).
2. `docs/evals/2026-05-2X-iter2-diagnoses.md` — latency + citation-binding + unsupported sub-taxonomy +
   hard-fact-artefact, plus de beslisgate-memo. (Eén doc, secties per fase.)
3. (bij botfix) `docs/evals/2026-05-2X-v0.9-analysis.md` — eval-resultaten + gate + promotie-verdict.
4. (bij botfix) nieuwe append-only versie in `lib/v0/server/bots.ts`.

## 6. Eindstatus (één van)
`PROMOTED — V0 engine-gate gehaald (controlled-test-candidate)` · `BOT VERSION CANDIDATE — needs iteration` ·
`NO BOT VERSION — built but unproven (budget-skip)` · `NO BOT VERSION — eval/infra artefact found` ·
`NEED MORE DIAGNOSIS`. **Altijd** opgeleverd: latency-report, citation-binding-verdict, sub-taxonomy,
verfijnde verifier, en de niet-gekozen fix als ready-to-apply patch.

## 7. Bewust verworpen (uit het externe plan)
- **7-doc exhaustieve output / 5 losse deep-dive-fasen** — over-scoped voor een $10-één-eval-run; geconsolideerd.
- **"Stop en vraag go bij budget-overschrijding"** — fout voor een onbewaakte run; de cap beslist (auto-skip).
- **Hard-fact als nieuw onderzoek** — het is een continuatie van #104's uitgestelde verfijning.

## 8. Open beslissing (buiten dit spec)
Of deze run **vannacht autonoom draait** (scheduled/loop, billable, opent zelf een PR) dan wel **puur het
plan-document** is dat Sebastiaan later met `/goal` start — vereist een expliciete go vóór billable uitvoering.
