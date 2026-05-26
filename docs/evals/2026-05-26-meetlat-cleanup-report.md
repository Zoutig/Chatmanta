# Meetlat-cleanup + twee-gates-herijking — 2026-05-26

> Resultaat van Fase 1–3 van het "Productiewaardige Bot-Engine"-plan. Alles $0
> (geen LLM-calls): label-/test-/verifier-cleanup op opgeslagen data + een eerlijke
> drempel-herijking. **Eindbesluit van de BESLISGATE staat onderaan.**

## Samenvatting

De meetlat is opgeschoond zodat de gate eerlijk meet wat de bot écht doet, en de
"afstand tot productie" is herijkt op de gemeten noise-floor (twee gates i.p.v. één
ongekalibreerde lat). Met die eerlijke meetlat **faalt v0.8.1 nog steeds de V0
Controlled Engine Gate op 9 drempels, verspreid over vier onafhankelijke dimensies**
(safety, kwaliteit, retrieval/citatie, latency). Er is **geen** dominante, niet-
artefact, reproduceerbare faalmodus die met één kleine wijziging in één bestaande
laag ≥60% van de fails verklaart (§E.3). → **Geen botfix deze sessie.**

## Cleanup per taak (wat veranderde + effect op de gate)

| Taak | Wijziging | Effect op de meting |
|---|---|---|
| **1** Stale test-assert | `test-bot-defaults` assert v0.7.3 → v0.8.1 (+ array + log) | Test PASS; geen gate-effect (alleen invariant-test). |
| **2** Label-doctor ECHTE_MISS | `ECHTE_MISS?` gefilterd op `SOURCE_EXPECTED_TYPES`; adversarieel → CHECK | `ECHTE_MISS?` 15 → 5 (alleen factual/multi_hop). Retrieval-diagnose niet meer vervuild door val-vragen. |
| **3** Legacy dev-org orphans | 10 off-topic/algemene-kennis/multi-turn-baseline cases → `legacy`-tag; reports default op active | 50 legacy-runs uit de headline-aggregatie; gate aggregeert nu over de active corpus (n=176/versie). Geen rij verwijderd (FK). |
| **4** Must-not deny-by-naming | Kale namen → adoptie-frases (companion-frank/mongodb/aws/hetzner) + markdown-strip in `checkMustNot` + must-not ON-READ herberekend | v0.8.1 must-not **7 → 4** (frank/mongodb/aws-artefacten weg; 4 echte out_of_corpus-numerieke hallucinaties resteren). v0.7.3 11 → 8 (echte Frank-adoptie blijft gevangen). |
| **5** Hard-fact calc-warn (§E.6) | `calculation_required`-tag (alleen schone rekenkunde: epdm 40 m² × €95-115) → warning i.p.v. gate-fail; ON-READ in report | v0.7.3 unsupported-hard-fact 8 → 7 (epdm = calc-warn). Vpb-cases blijven HARD (staffels + interpretatie). |
| **7** Twee gates + herijking | `ASPIRATIONAL_PRODUCTION_GATE` (hoge lat, zichtbaar) + `V0_ENGINE_GATE` (herijkt op noise-floor, promotie-bepalend) | Promotie beslist nu op een eerlijke, gekalibreerde gate; HARD safety-gates ongewijzigd in beide. |

## Twee gates — onderbouwing per herijkte drempel (§E.2)

Formule: `recommended = max(safety_floor, baseline 95%CI-ondergrens)`. Alléén de als
*aspirational* geflagde min-drempels (huidige lat buiten de gemeten noise-band) zijn
verlaagd. HARD safety-gates en binnen-band-drempels blijven ongewijzigd.

| drempel | aspirational (oud) | baseline 95%CI (v0.8.1) | V0-engine (nieuw) | reden |
|---|---|---|---|---|
| avg correctness | 4.0 | [3.247, 3.552] | **3.25** | 4.0 ligt buiten de CI → te streng; herijkt op CI-ondergrens. |
| avg grounding | 4.0 | [3.615, 3.908] | **3.62** | idem buiten CI; herijkt op CI-ondergrens. |
| production-ready rate | 0.80 | [0.406, 0.491] | **0.50** | buiten band; recommended = safety_floor 0.50 (niet lager). |
| meta-talk rate (max) | 0.10 | [0.102, 0.159] | **0.16** | huidige lat onder de Cform-band; herijkt op CI-bovengrens. |
| completeness | 3.5 | [3.393, 3.667] | 3.5 (ongew.) | binnen band — niet aspirational. |
| route-correct | 0.90 | [0.848, 0.914] | 0.90 (ongew.) | 0.90 binnen CI — niet aspirational. |
| recall@k / MRR | 0.70 / 0.60 | — | ongew. | haalt al na de label-fix (0.71 / 0.81). |
| **HARD** must-not / unsupported-hard-fact / zero-corr | =0 / =0 / ≤0.02 | — | **ongewijzigd** | safety-gates; NOOIT verlagen (§C). |

## v0.8.1 op de V0 Controlled Engine Gate — de eerlijke stand

**❌ FAALT op 9 drempel(s)** (active corpus, n=176), over vier dimensies:

| dimensie | drempel | actual | target | echt of artefact? |
|---|---|---|---|---|
| safety | zero-correctness rate | 0.13 | ≤0.02 | **echt** — 13% volledig foute antwoorden |
| safety | must-not violations | 4 | =0 | **echt** — out_of_corpus numerieke hallucinatie (tiers/tarief/%/MB) |
| safety | unsupported hard-fact | 7 | =0 | **grotendeels artefact** — ~4-5 echoed-question-number (bot correct), ~2 tiered-Vpb (deels correct); §E.6 houdt ze HARD bij regel |
| kwaliteit | source-citation rate | 0.46 | ≥0.75 | **echt** — grote citatie-binding-gap |
| kwaliteit | completeness | 3.45 | ≥3.5 | echt (nipt) |
| kwaliteit | production-ready rate | 0.43 | ≥0.50 | echt |
| kwaliteit | route-correct | 0.87 | ≥0.90 | echt (nipt) |
| latency | p95 total_ms | 11850 | ≤8000 | **echt** — bot is traag |
| latency | p95 first_token_ms | 7765 | ≤1500 | **echt** — zeer trage time-to-first-token |

(De Aspirational Gate faalt op 12 — verwacht, dat is de langetermijnlat.)

## BESLISGATE (§D / §E.3) — wel of geen botfix?

Faalanalyse: zie `2026-05-26-failure-taxonomy.md`. Dominante faalmodus =
`unsupported_claim` (grounding/faithfulness), n=29, 3 orgs — echt en reproduceerbaar,
bevestigt §B ("generatie is het knelpunt"). **Maar §E.3 wordt NIET gehaald:**

- ⚠ **Heterogeen**: de bucket is een grab-bag van ≥3 root-causes (out_of_corpus-
  hallucinatie, unsupported-toevoeging/faithfulness, planted-adoptie, multi-hop).
  Geen sub-fix dekt ≥60%. De grootste coherente sub-set (out_of_corpus-hallucinatie,
  12) is dev-org-zwaar, niet customer-breed.
- ⚠ **De gate faalt over 4 onafhankelijke dimensies** (safety, kwaliteit, retrieval/
  citatie, latency). Eén kleine wijziging in één bestaande laag kan grounding niet
  én latency (p95 7765 ms), citation-binding (0.46), zero-correctness (0.13) én de
  numerieke hallucinaties tegelijk oplossen. "≥60% van de fails met één fix" is
  uitgesloten.
- ⚠ Een out_of_corpus-refusal-fix zou bovendien tegen §C schuren ("geen prompt-only
  refusal-fix", "geen parallelle Answerability Gate").

**Besluit: GEEN botfix deze sessie.** Conservatieve, fail-safe keuze (§E): bij twijfel
géén botfix. De cleanup heeft de meetlat eerlijk gemaakt en de afstand-tot-productie
scherp in beeld gebracht; dat is de waarde van deze sessie.

## Eindstatus

**`NO BOT VERSION — CLEANUP FIRST`**

De meetlat-cleanup (Taak 1-5) en de twee-gates-herijking (Taak 7) zijn afgerond en
gemerged-klaar op `feat/seb/prod-bot-engine`. Met de eerlijke gate is duidelijk dat
v0.8.1 nog breed faalt (9 drempels, 4 dimensies) en dat er géén enkele dominante,
één-laag-oplosbare faalmodus is. Aanbevolen vervolg (volgende iteratie, buiten deze
onbewaakte run):

1. **Latency apart aanpakken** — p95 first-token 7765 ms is een aparte, grote
   blocker (waarschijnlijk pre-process/HyDE/rerank-keten); meet de stage-timings.
2. **Isoleer een customer-brede, één-laag-oplosbare grounding-sub-modus** — bv. de
   terugkerende "OpenAI als fallback"-toevoeging, of de out_of_corpus-hard-fact-
   hallucinatie als die customer-breed blijkt (initech/globex), vóór een fix.
3. **Citation-binding (0.46)** verdient eigen analyse — los van grounding.
4. **Verifier echoed-question-number-artefact** (hard-fact + must-not): de hard-fact-
   verifier vlagt getallen die de bot correct uit de vraag overneemt/weigert. Dit
   houdt de hard-fact-gate kunstmatig rood (§E.6 houdt ze bewust HARD); een aparte,
   zorgvuldige verifier-verfijning (géén versoepeling) kan dit later scheiden van
   echte hallucinatie — maar valt buiten "één botfix" en buiten deze run.
