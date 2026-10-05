# Onderzoek: RAG-pipeline herontwerpen rond gpt-6-luna — design

**Datum:** 2026-10-05 · **Branch:** `feat/seb/luna-test` · **Status:** design goedgekeurd, wacht op spec-review

## Aanleiding

Eval 2026-10-05 (186 vragen, judge gpt-4o, runs=1):

| | v0.10 (4o-mini) | v0.11 (alles Luna) | v0.11b (Luna alleen antwoord) |
|---|---|---|---|
| G (grounding) / G≤1 | 3,76 / 33 | 4,16 / 21 | 4,16 / 17 |
| C (volledigheid) | 3,19 | 3,19 | 3,19 |
| TTFT mediaan | 4,1 s | 5,2 s | 4,4 s |
| Botkosten / 1000 vragen | $1,07 | $0,69 | $0,76 |

Conclusie: Luna wordt het antwoordmodel. ~3,7 s van de TTFT zit in sequentiële
LLM-hulpstappen vóór het eerste token (pre-process 1,3 s → decompose 1,2 s →
HyDE (selectief) → retrieve → rerank 1,2 s). Verify/regenerate/cascade/follow-ups
lopen ná het eerste token (kosten totale tijd, geen TTFT).

## Doel en succescriterium

**Doel:** TTFT zo laag mogelijk **zonder meetbaar kwaliteitsverlies** t.o.v. v0.11b
(gekozen optie C — geen harde ms-grens).

**Beslisregel (in volgorde):**
1. Geen nieuw *bevestigd* veiligheidsveto in de hard-eval (hard).
2. C en G niet significant slechter dan v0.11b (gepaarde vergelijking per vraag).
3. Routing-correctheid en multi-turn-resolutie niet slechter.
4. Dan wint de laagste TTFT (mediaan én p90); gelijkspel → kortste antwoorden; daarna kosten.

## Scope: twee sporen

- **Spoor 1 (nu):** v0.11b-instelling (chatModel `gpt-6-luna`, auxModel `gpt-4o-mini`)
  naar V1 via `V1_RAG_DEFAULTS` — V1 gebruikt dezelfde engine (`lib/rag/run-rag-query.ts`),
  dus een config-wijziging. Gevalideerd met `npm run v1:eval` + Claude-judge.
- **Spoor 2 (onderzoek):** pipeline-herontwerp als V0-bot-versies (`v0.12*`).
  Winnaar gaat daarna als config naar V1.

Let op: engine-wijzigingen zijn gedeeld met V1. Nieuw gedrag komt altijd achter een
`RagConfig`-vlag met default = huidig gedrag, zodat V1 niet ongemerkt meeverandert.

## Uitgangspunt over reasoning

Reasoning-tokens worden vóór het eerste token gegenereerd → reasoning in de
streaming-antwoordstap verhoogt TTFT. Luna's winst zit in *minder scaffolding nodig*,
niet in meer nadenken. Reasoning (`low`) is alleen kandidaat in niet-streamende
stappen of als aparte kwaliteits-tier, en wordt dan apart gemeten.

## Hypotheses en varianten

| Variant | Wat | Hypothese |
|---|---|---|
| v0.11b | referentie | — |
| v0.12a "lean" | Geen LLM-stappen vóór het antwoord: embed → retrieve → Luna. Deterministische vangrails blijven. | Luna heeft rewrite/decompose/rerank niet nodig. |
| v0.12b "fused" | Eén Luna-call vooraf met structured output (route smalltalk/off-topic/search, herschreven query, sub-queries, HyDE-ja/nee); geen LLM-rerank; Luna krijgt 10-15 chunks i.p.v. 5. | Eén ronde i.p.v. 2-3, kwaliteit behouden. |
| v0.12c (optioneel) | Beste van a/b + parallelle retrieval (plain + HyDE/sub-queries tegelijk). | Wachttijd overlapt i.p.v. stapelt. |

Daarna **add-back**: stappen alleen terugzetten voor een foutcategorie die de eval aanwijst.

**Blijft altijd staan (hard rules / deterministisch, geen LLM-tijd):** similarity-threshold,
fallback-pad zonder LLM-call bij geen relevante chunks, hard-fact-gates,
orgId/chatbotId-verplichte vector search.

## Meetkader (aangepast)

**Hoofdmaten:** C (volledigheid t.o.v. gold_facts), G (grounding), G≤1-telling,
hard-eval veto's, TTFT mediaan/p90 (interleaved gemeten).

**Nieuw / expliciet:**
- **Routing-correctheid** — expected-behavior-veld (smalltalk/off-topic/search) expliciet scoren.
- **Multi-turn-resolutie** — eerst checken of de set genoeg vervolgvragen met history heeft; zo niet: ~10 cases toevoegen.
- **Beknoptheid** — woorden per antwoord + `too_verbose`-percentage (beloond bij gelijke C).

**Gedegradeerd:**
- **production_ready** → advisory, tot uitgezocht is waarom `answer_length_appropriate` e.d. leeg in `eval_runs` staan (mogelijke judge-parse/afkap-bug).
- **Regex-checks** (refusal-markers, must-not) → triage; een hit telt pas als fout/veto na LLM/Claude-bevestiging (stijlwissel bevoordeelt anders het oude model).

**Statistiek:** gepaarde per-vraag-vergelijking (beter/slechter/gelijk); verschillen van
1-2 cases = ruis. Dev-set 2 runs.

## Judge: overstap naar gpt-6-sol

Besluit: **Sol wordt de hoofd-judge** (vervangt gpt-4o).
- **Herijking (eenmalig, verplicht):** scores van verschillende judges zijn niet vergelijkbaar. Laat Sol v0.10/v0.11b opnieuw beoordelen → nieuwe baseline; noteer overeenstemming met gpt-4o als sanity-check.
- **Cross-family-controle:** Sol en Luna zijn één familie (risico op mildere beoordeling). De gratis Claude-judge blijft als tweede oordeel op veto's en grensgevallen.
- Sol via `openaiChatParams` (max_completion_tokens; reasoning-effort voor de judge: te bepalen in de herijking — judging streamt niet, dus reasoning kost hier geen TTFT).

## Werkwijze en kosten (schatting)

1. **Judge-overstap + herijking** (Sol op opgeslagen antwoorden v0.10 + v0.11b) — ~$3-4. Nagaan of eval:run bestaande antwoorden kan herjudgen; zo niet, kleine aanpassing.
2. **Dev-set** (~40 lastige vragen: decompose, multi-turn, smalltalk, off-topic, hard facts), Claude-judge, 2 runs per variant — centen per ronde. Snel itereren op v0.12a/b/c.
3. **Volledige run** (186 + hard-eval) alleen voor finalisten — ~$1,5-2 per versie.
4. **Priority-tier-meting** op de winnaar: zelfde pipeline met `service_tier: 'priority'` (≈2× prijs); TTFT + kosten → productbeslissing (duurdere klant-tier). Minder calls × priority versterken elkaar.
5. **Spoor 1 parallel:** V1-config naar v0.11b-instelling + `v1:eval`.

Totale eval-spend verwacht: ~$10-15.

## Buiten scope

- Embedding-model wisselen (re-ingest + threshold-herijking) — apart V2-traject.
- Promotie van `LATEST_BOT_VERSION` — aparte beslissing na dit onderzoek.
- Provider-abstractie `callLLM()` / Claude als botmodel (V2).

## Risico's

- Gedeelde engine: vergeten vlag-default → V1 verandert mee. Mitigatie: elke nieuwe stap achter vlag, default = huidig; V1-eval in elke PR.
- Minder chunks-selectie (geen rerank) kan grounding raken → expliciet gemeten via G≤1.
- Judge-wissel midden in onderzoek → daarom eerst herijken, dan pas varianten.
