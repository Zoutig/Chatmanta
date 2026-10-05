# Luna-pipeline-onderzoek — resultaten

Spec: `docs/superpowers/specs/2026-10-05-luna-pipeline-onderzoek-design.md`
Plan: `docs/superpowers/plans/2026-10-05-luna-pipeline-onderzoek.md`

## Diagnose prod-ready

Gemeten op 2026-10-05 ($0, alleen `eval_runs`-reads), alle rijen per versie (186 per versie, judge gpt-4o):

| versie | rijen | null `production_ready` | null `answer_length_appropriate` | `judge_parse_error` |
|---|---|---|---|---|
| v0.10 | 186 | 0 | 0 | 0 |
| v0.11 | 186 | 0 | 0 | 0 |
| v0.11b | 186 | 0 | 0 | 0 |

Conclusie: de velden staan in de database **niet** leeg en er is geen judge-parse- of `max_tokens`-afkapprobleem (0 parse-errors). De eerdere indruk van "lege" velden komt dus niet uit `eval_runs`; mogelijk uit een ander oppervlak (bv. hard-eval-tabel of rapportweergave) of een eerdere run. Niet verder uitgezocht.

Wel een inhoudelijk signaal: de lengte-oordelen verschillen sterk per model (bot_kind = answer):

| versie | answers | too_curt | too_verbose | production_ready = true |
|---|---|---|---|---|
| v0.10 (4o-mini) | 175 | 20 | 4 | 73 |
| v0.11 (Luna) | 176 | 57 | 0 | 64 |
| v0.11b (Luna) | 176 | 60 | 0 | 63 |

Luna-antwoorden worden dus ~3x vaker als `too_curt` beoordeeld. Dat drukt production_ready en past bij de gelijke C (3,19). Besluit: production_ready blijft advisory; `too_curt`-percentage wordt als beknoptheidsmaat meegenomen. Voor Sol (reasoning uit) wordt `maxTokens` 1500 gezet als voorzorg, niet als fix.

## Dev-set

Samengesteld op 2026-10-05 ($0, alleen DB-reads) met `scripts/v0-dev-set-select.mts` -> `eval-fixtures/dev-set-luna.json` (veld `slugsCsv` voor `--slugs=`). Selectie op basis van de nieuwste v0.11b-run (judge gpt-4o) per vraag.

| categorie | aantal |
|---|---|
| multiTurn | 8 |
| nonAnswer (smalltalk/fallback) | 6 |
| hardFact | 8 |
| multiPart | 8 |
| answer | 10 |
| totaal | 40 |

- Grounding <= 1 bij v0.11b: alle 17 aanwezige slugs zitten in de set.
- `too_curt` bij v0.11b: 11 slugs in de set (doel ~6; G<=1 had voorrang, de rest komt incidenteel mee).
- Multi-turn: niet < 8 (22 beschikbaar), geen tekort.
- nonAnswer is gebaseerd op `eval_questions.expected_kind` (smalltalk/fallback), niet op wat de bot deed; `answer` = `expected_kind` 'answer' of null. Er bestaan 26 nonAnswer-vragen (7 smalltalk, 19 fallback); in de set zitten 6: 1 smalltalk + 5 fallback (G<=1-voorrang trok vooral fallback-vragen binnen). Wil je meer smalltalk-routingdekking, dan is dat een bewuste swap.
- Correctie op een eerdere versie van dit stuk: `expected_kind` bestaat wel; de eerste versie nam ten onrechte aan dat de kolom ontbrak (de select was niet echt geprobeerd).
