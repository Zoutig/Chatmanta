# Wat v0.8 nodig heeft om productiewaardig te zijn

> **Status:** brainstorm-/analyse-document (mei 2026). Geen bouwopdracht — dit beschrijft *wat* ik zou toevoegen/veranderen en *waarom*, gegrond in de huidige code (`lib/v0/server/eval.ts`, `scripts/v0-eval-*.ts`, `eval-fixtures/seed-questions*.json`, `bots.ts`). Beslissingen aan het eind zijn voor Sebastiaan.
>
> **Vertrekpunt:** LATEST = v0.7.3 (output-clarity). Doel volgens de opdracht: een v0.8 die *productiewaardig* is, *niet meer hallucineert*, en *door alle tests heen komt*.

---

## 0. TL;DR

De opdracht bevat een verborgen paradox: **"door alle tests heen komen" is met de huidige eval niet te bewíjzen.** De judge-noise is 0.3–0.85 punt, dus de violations op precies de buckets die ertoe doen (out_of_corpus, planted_fact) zijn statistisch grotendeels ruis. Tegelijk staat er al een productie-gate in de code (`PRODUCTION_THRESHOLDS`) met `minAvgCorrectness: 4.0` / `minAvgGrounding: 4.0` — gelabeld *"STARTWAARDEN, nog kalibreren"* — terwijl de bot ~2.85–3.53 scoort. **De lat bestaat al; de bot haalt 'm niet, en we kunnen op dit moment niet hard maken hóe ver eraf.**

Daarom is v0.8 in de kern een **meet-release**: maak de meetlat betrouwbaar (noise-floor, hard-fact-signaal, dunne buckets, één heldere gate), draai LATEST erdoorheen, en je weet voor het eerst exact wat "productiewaardig" nog kost. De échte kwaliteits-/anti-halluc-ingreep (retrieval-plafond, weiger-bucket-gate) wordt dan een **bewijsbare** v0.9 in plaats van een gok binnen de ruisband.

Twee lagen:
- **Laag 1 (v0.8) — meetbaarheids-fundament.** 5 gerichte toevoegingen aan de eval. Raakt de bot niet.
- **Laag 2 (v0.9+) — de echte kwaliteitssprong.** Nu meetbaar tegen de Laag-1-baseline.

---

## 1. De kern-paradox: "door alle tests heen" is nu niet te bewijzen

Drie keiharde lessen uit de eigen eval-historie maken het doel in zijn huidige vorm onmeetbaar:

1. **Judge-noise 0.3–0.85 punt.** v0.6 is op identieke config gemeten op 3.15 / 3.30 / 3.48. factual zwaaide 2.85 → 3.42 → 3.53 tussen runs. Elke delta < ~0.3 op overall is ruis.
2. **De kritieke buckets zijn te dun.** Echte corpus-tellingen (4 fixture-bestanden, 88 cases): `planted_fact` 5, `out_of_corpus` 10, `multi_hop` 4, `typo` 0. Bij n=5 met 0.3+ noise is een "violation meer of minder" betekenisloos.
3. **Prompt-tuning beweegt de weiger-buckets niet.** De v0.7.3 carve-out bewoog `out_of_corpus` −0.10 en `planted_fact` −0.28 (binnen noise). De codebase concludeert zelf: hiervoor is een retrieval/verifier-ingreep nodig, geen prompt-regel.

> **Gevolg:** als we nu een v0.8 "anti-halluc-fix" bouwen en die "scoort beter", weten we niet of dat de fix is of de ruis. We moeten éérst de meetlat betrouwbaar maken. Anders herhalen we de verworpen-v0.7-saga (een fix die binnen de noise-band lag en als NO-GO eindigde).

---

## 2. Wat er AL is (en dus NIET opnieuw gebouwd hoeft)

Belangrijke correctie op de deep-dive-docs — de infra is verder dan die suggereren:

| Component | Status in code | Locatie |
|---|---|---|
| **Binaire must-not-check** | ✅ Deterministisch (`checkMustNot`), niet door judge; runner exit-code 1 bij élke violation | `eval.ts:726`, `v0-eval-run.ts:402-429` |
| **Pairwise judge** | ✅ Bestaat: `runPairwiseJudge` + tabel `eval_pairwise_runs` + winrate-aggregatie (≥55%-drempel, per-org <45%-warning) | `eval.ts:608`, `v0-eval-report.ts:337-406` |
| **Multi-run support** | ⚠️ `--runs=N` (tot 20) bestaat, maar variantie wordt **niet berekend** — alleen "kennisgeving" + CSV voor handmatige Excel-analyse | `v0-eval-run.ts:78`, `v0-eval-report.ts:236,850` |
| **Productie-gate** | ⚠️ `PRODUCTION_THRESHOLDS` bestaat (14 drempels) + exit-1 voor kandidaat-versies, maar **ongekalibreerde startwaarden** | `v0-eval-report.ts:43-58,643-772` |
| **9-dimensie judge** | ✅ correctness/completeness/grounding + production_ready/answer_length/source_citation_binding/tone_match/route/meta_talk | `eval.ts:107-134,208-274` |
| **Hard-fact verificatie** | ⚠️ Draait in **runtime** (`hardFactSupport` in `extras`), maar wordt **niet naar `eval_runs` geschreven** en is **niet gegate** in de eval | `rag.ts:~1015`, ontbreekt in `EvalRunRow` |

**Conclusie:** v0.8 hoeft geen eval-pipeline from scratch. Het is een gerichte aanvulling op 5 punten.

---

## 3. Laag 1 — Meetbaarheids-fundament (dit IS v0.8)

Vijf toevoegingen. Geen enkele raakt de bot — daarom blijft v0.7.3 byte-identiek de gemeten kandidaat.

### 3.1 Noise-floor formaliseren *(de kern-fix)*
**Probleem:** noise is nu anekdotisch ("0.3–0.85"). Daardoor kan geen enkele delta "significant" of "ruis" genoemd worden.
**Toevoeging:**
- Draai LATEST N keer (zie §8 voor budget-keuze) en bereken per metric **std + 95% CI** uit de bestaande multi-run-data (die zit al in de CSV; alleen niet geaggregeerd).
- Rapporteer per metric én per question_type een **gemeten ruisband**.
- Voeg aan het report een **significantie-verdict** toe: een delta tussen twee versies telt alleen als hij de gemeten ruisband overschrijdt. Anders "binnen noise".
- Sla het als een herbruikbare `noise-baseline` op (analoog aan de bestaande memory `v05-noise-baseline`), zodat niet elke PR opnieuw N× hoeft.

**Raakvlak code:** `v0-eval-report.ts` (nieuwe aggregatie-sectie; data is er al via `allLatestVariance`). Geen migratie nodig.

### 3.2 Hard-facts als eval-signaal + binaire gate
**Probleem:** het meest schadelijke hallucinatie-type (verkeerde prijs/datum/aantal) wordt in de runtime al gedetecteerd (`hardFactSupport`), maar **verdwijnt** in de eval — het staat niet in `eval_runs` en telt niet mee in de gate.
**Toevoeging:**
- Migratie: kolommen `hard_fact_supported (bool)` + `missing_hard_facts (jsonb)` op `eval_runs` (parallel aan wat `query_log` al heeft via 0022).
- `runEvalRow` schrijft `response.extras.hardFactSupport` mee.
- Promoveer "ongegronde hard-fact op een factual/planted_fact-case" tot **binaire gate-conditie** naast `must_not_violation`. Dit is het ruis-vríje anti-halluc-signaal dat de productie-claim direct ondersteunt — geen subjectieve 0-5 judge nodig.

**Raakvlak code:** nieuwe migratie `00NN_eval_hard_facts.sql` (check hoogste nummer eerst — nu t/m 0024), `eval.ts` (`EvalRunRow` + insert), `v0-eval-run.ts`/`v0-eval-report.ts` (gate + telling).

### 3.3 Corpus-uitbreiding op dunne/kritieke buckets
**Probleem:** de buckets die de productie-claim dragen zijn te dun voor statistiek.
**Toevoeging (prioriteit = anti-halluc-relevantie):**

| Bucket | Nu | Doel | Waarom |
|---|---|---|---|
| `out_of_corpus` | 10 | ~20 | Kern van "hallucineert niet" — moet de meeste power hebben |
| `planted_fact` | 5 | ~15 | Injection/geheugen-aanval; nu te dun om te vertrouwen |
| `multi_hop` | 4 | ~12 | Consistent zwak (2.33–2.75), nooit fatsoenlijk gemeten |
| `false_premise` | 11 | ~15 | Aanvullen tot robuust |
| `typo` | 0 | ~8 | Bestaat als type maar leeg — robuustheids-gat |

- Elke nieuwe weiger-case krijgt scherpe `must_not_contain` + `expected_kind: fallback`, zodat de **binaire gate** tanden krijgt (niet alleen de judge-score).
- Spreiding over de 4 bestaande demo-orgs (acme/globex/initech + DEV), zodat het geen single-org-artefact wordt.
- Seed is idempotent (upsert op `(organization_id, slug)`), dus puur JSON toevoegen + `npm run eval:seed`.

**Raakvlak code:** alleen `eval-fixtures/seed-questions*.json` (data, geen logica).

### 3.4 Pairwise als primair kwaliteitssignaal
**Probleem:** pairwise bestaat maar is secundair; het report leunt op absolute 0-5 scores die het meest driften.
**Toevoeging:**
- Maak het report-verdict **pairwise-first**: "wint v0.X van LATEST?" als hoofdsignaal (robuust tegen judge-drift), absolute scores als diagnose.
- Voeg **per-question_type pairwise-breakdown** toe (nu alleen overall + per-org) — zodat je ziet of een fix de weiger-buckets wint zonder de factual-buckets te verliezen.

**Raakvlak code:** `v0-eval-report.ts` (aggregatie bestaat al via `eval_pairwise_runs`; alleen presentatie/slicing uitbreiden).

### 3.5 Eén unified "productie-gate"-verdict + herijking
**Probleem:** `PRODUCTION_THRESHOLDS` zijn ongekalibreerde startwaarden (`minAvgCorrectness 4.0` terwijl de bot ~3.3 haalt) → de gate is nu "altijd rood" en daarmee informatieloos.
**Toevoeging:**
- **Stap 0 van v0.8:** draai v0.7.3 door de bestaande gate en publiceer de werkelijke afstand per drempel. Dit is de eerste eerlijke "hoe ver van productie"-meting.
- Herijk de drempels op basis van de gemeten noise-floor: een drempel hoort net boven de ruisband te liggen, niet op een aspiratiegetal.
- Combineer alles tot **één PASS/FAIL-verdict** met heldere sub-redenen:
  1. `must_not_violations == 0` (binair, hard)
  2. `unsupported_hard_facts == 0` op factual/planted (binair, hard — §3.2)
  3. pairwise: niet slechter dan LATEST buiten de ruisband (relatief)
  4. absolute drempels: gehaald óf binnen herijkte band (diagnostisch)

**Raakvlak code:** `v0-eval-report.ts` (`PRODUCTION_THRESHOLDS` + gate-logica).

---

## 4. Laag 2 — De echte kwaliteitssprong (v0.9+, nu bewijsbaar)

Dit maakt de *bot* productiewaardig. Pas zinvol ná Laag 1, want pas dan meetbaar. Hier niet uitgebouwd — alleen de richting, zodat v0.8 de juiste meetpunten alvast bevat.

- **4.1 Retrieval-plafond doorbreken.** `text-embedding-3-small` haalt max ~0.66 similarity op NL — dat plafond zit ónder elke anti-halluc-threshold. Upgrade naar `text-embedding-3-large` (3072d) of een cross-encoder reranker; vereist re-ingest + herkalibratie van álle thresholds. Grootste enkele retrieval-lever en valt de weiger-buckets bij de bron aan (betere scheiding relevant/irrelevant = strakkere weiger-gate).
- **4.2 Anti-halluc hard-gate voor weiger-buckets.** Categorische regel: "geen chunk boven X sim → weiger zonder enige detail-generatie" (code-gate, geen prompt). Plus context-aware `(bedrag, valuta)`-tuples i.p.v. losse getallen in de hard-fact-verifier. Dit is wat de codebase zelf aanwijst als de échte oplossing voor out_of_corpus/planted_fact.
- **4.3 (optioneel) Latency.** Het fast-pad triggert nooit (0 cases) door de `gap ≥ 0.08`-eis + composite-splitsing. Versoepelen of een single-chunk-fast-rule. Lagere prioriteit dan anti-halluc.

> **Model-switch naar Claude Haiku 4.5** is bewust géén v0.8/v0.9-onderwerp: dat is de facto de V1-start en revalideert de hele prompt-stack + corpus. Pas oppakken als Sebastiaan expliciet "we starten V1" zegt (AGENTS.md hard rule).

---

## 5. Definitie van "productiewaardig" — concrete acceptance criteria

Voorstel voor de gate-definitie waar v0.8 op richt (herijkt op de gemeten noise-floor):

- **Anti-hallucinatie (hard, binair):** 0 must-not-violations én 0 ongegronde hard-facts op factual/planted_fact, over N runs op het uitgebreide corpus.
- **Grounding:** gemiddelde ≥ (gemeten LATEST-baseline + niet onder de ondergrens van de ruisband).
- **Geen regressie:** pairwise niet-slechter dan LATEST buiten de ruisband, op géén enkele question_type-bucket.
- **Route-correctheid:** `route_correct`-rate ≥ 0.90 (bestaande drempel, lijkt haalbaar).
- **Latency/cost:** binnen de bestaande per-versie `evalBudgetMs`/`evalBudgetUsd`.

De exacte getallen voor correctness/completeness/grounding worden **uit de eerste noise-floor-run afgeleid**, niet vooraf verzonnen — dat is juist het punt van Laag 1.

---

## 6. Wat NIET in v0.8 zit (scope-discipline)

- Geen bot-/prompt-/pipeline-wijziging (anders kun je de meetlat niet zuiver tegen de oude baseline ijken).
- Geen embedding-upgrade (dat is Laag 2 — eerst meetbaar maken).
- Geen model-switch / Anthropic (V1-territorium).
- Geen V1 auth/multi-tenancy.
- Geen cache-herontwerp (cache-hit ≈ 0% is bekend, lage prioriteit).

---

## 7. Voorgestelde volgorde

1. **Stap 0 — nulmeting.** Draai v0.7.3 door de bestaande `PRODUCTION_THRESHOLDS`-gate → publiceer de werkelijke afstand. (Geen code; 1 run.)
2. **§3.1 Noise-floor** formaliseren (report-aggregatie + verdict).
3. **§3.2 Hard-facts** in `eval_runs` + binaire gate (migratie + writer).
4. **§3.3 Corpus** aanvullen (alleen JSON + seed).
5. **§3.4 Pairwise-first** report + per-bucket.
6. **§3.5 Unified gate** + herijking op de noise-floor.
7. **Baseline-rapport v0.8** = de officiële "dit is waar we staan" + de gate waar v0.9 doorheen moet.

Stappen 2–6 zijn grotendeels onafhankelijk en kunnen in losse kleine PR's.

---

## 8. Open beslissingen voor jou

1. **Scope-bevestiging:** akkoord dat v0.8 een *pure meet-release* is (bot blijft v0.7.3), en de echte anti-halluc-fix v0.9 wordt? Alternatief: één kleine bot-tweak meebundelen — maar dan meet je bot + meetlat tegelijk (methodologisch zwakker).
2. **Noise-floor-budget:** hoeveel judge-runs? Opties: (a) 10× op de kritieke buckets + 3× op de rest — meeste power per euro; (b) 5× op alle 88 cases — uniform; (c) 3× op alles — goedkoopst, ruwste CI.
3. **Corpus-omvang:** akkoord met de doel-aantallen in §3.3, of wil je een andere prioriteit (bv. multi_hop bewust laten zitten)?
4. **Naamgeving:** "v0.8" voor een release die de bot niet verandert — oké, of liever iets als "eval-v2 / meet-fundament" en het label v0.8 reserveren voor de eerste kwaliteits-bot?

---

## 9. Risico's

- **Verwachtingsmanagement:** v0.8 maakt de *claim* productiewaardig-meetbaar, niet de *bot* productiewaardig. Als "v0.8" in het hoofd "de bot is af" betekent, botst dat — vandaar beslissing §8.4.
- **Noise-floor-kosten:** N× LATEST kost judge-budget (gpt-4o). Mitigatie: optie 8.2(a) verspilt geen calls op smalltalk (altijd 5.0).
- **Gate te streng na herijking:** als de herijkte drempels alsnog onhaalbaar zijn, blijft de gate rood en blokkeert v0.9-iteratie. Mitigatie: drempel = "niet onder ruisband-ondergrens", niet "perfect".
- **Corpus-bias:** zelf-geschreven adversariële cases kunnen de bot's bekende zwaktes over- of onderrepresenteren. Mitigatie: spreid over 4 orgs + laat de gold_answers door een tweede paar ogen.
