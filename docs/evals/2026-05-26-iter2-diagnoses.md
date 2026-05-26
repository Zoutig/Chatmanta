# Iter2 — Diagnoses (latency · citation-binding · unsupported-claim sub-taxonomy · hard-fact · beslisgate)

**Datum:** 2026-05-26 · **Branch:** `feat/seb/bot-engine-iter2` · **Versie:** `v0.8.1` (LATEST)
**Methode:** $0 — alleen lezen uit `eval_runs`/`eval_questions`, geen LLM-calls. Active corpus n=176 (legacy uit). Nieuwste run per vraag.

> Eén doc, secties per diagnose-taak. De beslisgate (Taak 6) onderaan kiest max één botfix voor de betaalde eval.

---

## 1. Latency-diagnose (Taak 2) — `npm run audit:latency`

**Verdict: diagnose-only + aanbeveling. Geen botfix-kandidaat voor een onbewaakte nacht.**

n met `stage_timings_ms` = 168 (8 zonder timings, 10 legacy uit). p95 hier ligt iets boven de gate-p95 (report gebruikt n_runs=3 noise-floor; dit is nieuwste-run-per-vraag, inclusief enkele cold-start-outliers).

### Topline (p95, ms)
| stage | p50 | p75 | p95 |
|-------|-----|-----|-----|
| preprocess_ms | 964 | 1196 | 2196 |
| decompose_ms | 745 | 922 | 1747 |
| rerank_ms | 782 | 952 | 2366 |
| embedding_ms | 154 | 193 | 340 |
| retrieval_ms | 199 | 232 | 288 |
| generation_ms | 2682 | 3513 | **6530** |
| verify_ms | 232 | 285 | 436 |
| hyde_ms (n=3) | 1997 | — | 3490 |
| cascade_ms (n=3) | 2198 | — | 2275 |
| **total_ms** | 6393 | 7607 | **13180** |
| **first_token_ms** | 3805 | 4676 | **8586** |

### Bottleneck-labels
- **`generation_bottleneck`** (primair): `generation_ms` is in élke question_type de traagste stage (34–55% van total; p50 2682, p95 6530). Dit is de `gpt-4o-mini` answer-call — onvermijdelijke LLM-tijd, niet triviaal te knippen zonder model-/output-wijziging.
- **`streaming_start_delay`: WEERLEGD.** mediaan(first_token − som(pre-answer-stages)) = +503ms → first-token-latency ≈ de pre-answer-pijplijn, geen losse streaming-startvertraging. De first_token-gate-fail (7765/8586 > 1500) is dus geen streaming-bug maar de som van preprocess+decompose+rerank+embed+retrieval die vóór de eerste token draaien.
- **Pre-answer-pijplijn**: preprocess (p50 964) + decompose (745) + rerank (782) zijn de drie grootste pre-token-kosten. Alle drie zijn kandidaat om conditioneel over te slaan bij simpele single-source factual queries.
- **`hyde_bottleneck` / careful-cascade: niet dominant.** HyDE en cascade vuren elk maar n=3 (alleen op prompt_injection + edge-cases) → geen brede latency-driver.

### Waarom géén botfix vannacht
1. **De winst zit in conditioneel skippen van preprocess/decompose/rerank** (fast-path), maar **of fast-path onderbenut is, is NIET te bewijzen uit `eval_runs`**: `adaptive_decision` (het fast/standard/careful-pad) staat alleen op `query_log` (migration 0023), niet op `eval_runs`. Zonder die kolom kan ik path-misclassificatie niet meten.
2. Een pre-answer-pijplijn-herschrijving (preprocess/decompose/rerank gaten) raakt de retrieval-kwaliteit en valt precies in de "te riskant voor onbewaakt"-categorie die het plan uitsluit. generation_ms — de grootste stage — is sowieso niet via een flag te halveren.
3. De gate-blockers met de meeste hefboom richting klant-bereidheid zijn de **safety/grounding-dimensies** (zero-correctness, must-not, unsupported-claim), niet latency. Latency is een UX-prioriteit voor een áparte, bewaakte iteratie.

### Aanbeveling (toekomstige attended-iteratie)
Voeg `adaptive_decision` (of minimaal `path`) toe aan de eval-snapshot zodat fast/standard/careful-verdeling meetbaar wordt; meet dan of factual/typo/out_of_corpus onnodig decompose+rerank draaien. Dán pas een flag-guarded fast-path bouwen, met latency-regressie-gate. **Nu: diagnose-only.**

### Outlier-noot
`werkgebied-heerlen-bridge-out` (56795ms, rerank 50408ms) en `globex-mh-bekken-wachttijd` (33478ms, rerank 20475ms) zijn cold-start/timeout-outliers, geen representatief gedrag — ze verklaren waarom de nieuwste-run-p95 (13180) boven de noise-floor-p95 (11850) ligt.

---

## 2. Citation-binding integriteitscheck (Taak 3) — `npm run audit:citations`

**Verdict: `eval/logging-artefact` (dominant) + grounding-overlap. GEEN botfix-kandidaat. Eval/report-fix optioneel.**

### Runtime-locus (gelezen vóór conclusie)
- **De answer-prompt vráágt wél citaties** (`bots.ts:434/515/652`: "CITATIES (inline): plaats na elk feit een verwijzing tussen vierkante haken `[1]`"), en `citationStyle:'inline'`. → `feature-niet-gebouwd` is **uitgesloten**.
- **Markers worden NIET gestript** uit de opgeslagen `bot_answer`: de RAG-antwoordextractie (`rag.ts:656`) haalt het `<answer>`-blok en strip alleen `<thinking>`/`<confidence>`; de post-hoc sanitization (`rag.ts:1860-1948`) is het out-of-corpus-fallback-pad (opening/closing-framing) en raakt `[N]` niet. `claims.ts` strip citaties alléén intern voor embedding/lengte, niet de output. → De judge ziet de ruwe `response.answer` mét markers.
- **`source_citation_binding` meet GEEN markers.** De judge-instructie (`eval.ts` system-prompt regel 8): "voor élke niet-triviale feit-bewering — is er een chunk in BOT_SOURCES die die claim ondersteunt? … Als zelfs één numerieke claim niet in sources te vinden is: **false**." De judge ziet daarbij alleen `parentExcerpt ?? contentExcerpt` (~800 char, afgekapt) — niet het volledige brondocument.

### Meting
- inline-marker-rate: **64%** (112/176) — de bot citeert in de meeste antwoorden.
- binding-rate: **46%** (64/138 bindbaar; gate ≥75% ✗).
- Kruistabel: marker-aanwezig×binding=true 49 · marker-aanwezig×binding=false 62 · geen-marker×true 15 · geen-marker×false 12 → markers en binding correleren níet (markers aanwezig maar tóch false in 62 cases).
- **Verdacht artefact (binding=false ÉN grounding≥3): 54%** (40/74) van de false-cases. Voorbeelden: `initech-vpb-tarief-200k` C=5 G=3, `planted-fact-hetzner` C=5 G=4, `rls-uitleg` C=3 G=3 — correcte, gegronde antwoorden die binding=false kregen.
- Overlap met unsupported_claim (binding=false ÉN grounding≤2): **46%** (34/74) — dáár is het dezelfde grounding-zwakte (Taak 4), geen losse binding-dimensie.

### Verdict + waarom géén botfix
De binding-gate-fail (0.46) is **geen citation-botzwakte**: de bot emitteert markers (64%) en die worden niet gestript. De 74 false-cases splitsen ~54/46 in (a) **judge-strengheid/excerpt-afkapping** (correcte gegronde antwoorden, binding=false omdat één claim buiten het afgekapte ~800-char-excerpt valt of de judge "één onvindbaar getal = false" toepast) en (b) **dezelfde grounding-zwakte** als de unsupported_claim-bucket. → Een aparte citation-botfix zou ~54% niet-bestaande "fout" proberen te repareren en ~46% dupliceren met de grounding-fix.

**Optionele eval/report-fix (geen botfix, niet vannacht gebouwd):** geef de judge een langer/volledig bron-excerpt voor de binding-beoordeling, óf behandel `source-citation rate` als meet-artefact i.p.v. promotie-drempel (hij meet niet wat de naam suggereert). Dit sluit een gate-dimensie via de meetlat, niet via de bot. Vastgelegd als aanbeveling; de grounding-helft wordt door Taak 4/6 opgepakt.
