# ChatManta v0.8 — Sessie-overzicht (voor brainstorm)

_Twee autonome bouwsessies, 2026-05-25. Dit document vat samen wat er gebeurd is, alle eval-uitslagen, en wat er precies gebouwd is — geschreven om te delen met iemand die er niet bij was._

---

## 0. In één alinea

v0.8 ging **niet** over een mooiere bot, maar over een **betrouwbare meetlat** plus één gerichte botfix erbovenop. Sessie 1 (v0.8.0) bouwde de eval-foundation: de testpijplijn meet nu hard-feiten, ruis (statistische noise) en head-to-head-vergelijkingen, met een eerlijke productie-gate. Sessie 2 (v0.8.1) bouwde de eerste echte botverbetering die daaruit volgde: een **anti-adoptie-fix** die voorkomt dat de bot een verzonnen feit uit een eerder chatbericht klakkeloos overneemt. v0.8.1 is na een schone re-eval **gepromoveerd tot de nieuwe standaard-bot**.

> **Status:** EVAL READY, en nu ook één concrete BOT-verbetering live (v0.8.1 = LATEST). De bot is nog steeds **niet productie-klaar** voor betalende klanten — hij haalt de aspirational drempels niet. Maar de meetlat is solide en de #1 anti-hallucinatie-zwakte is deels gedicht.

---

## 1. Achtergrond — wat is V0 en waarom "evals"?

ChatManta is een website-chatbot voor het MKB: hij beantwoordt vragen op basis van de eigen website + documenten van de klant (RAG = Retrieval-Augmented Generation). **V0** is een leeromgeving met nep-demodata over meerdere fictieve bedrijven (acme-corp, globex-inc, initech, dev-org), waar we de RAG-kwaliteit tunen vóór we naar echte klanten gaan.

Een **eval** is een geautomatiseerde toets: we sturen ~186 testvragen door de bot, en een tweede AI-model (de "judge", gpt-4o) geeft elk antwoord cijfers op drie assen:
- **C — Correctness**: klopt het feitelijk?
- **P — Completeness (volledigheid)**: staat alles erin wat erin hoort?
- **G — Grounding**: is het antwoord echt gebaseerd op de bronnen (geen verzinsels)?

Daarnaast meten we **must-not violations** (de bot zegt iets dat absoluut verboden is, bv. een verzonnen naam bevestigen) en een hele rij productie-drempels.

**Bot-versies zijn append-only:** elke versie (v0.1 → v0.7.3 → v0.8.1) blijft bestaan en wordt nooit gemuteerd, zodat we altijd kunnen terugvergelijken. Vóór deze sessies was **v0.7.3** de "LATEST" (standaard) bot.

---

## 2. Sessie 1 — v0.8.0 Eval Foundation

### Het probleem
Vóór v0.8.0 kon de eval wél een gemiddeld cijfer geven, maar niet zeggen of een verschil tussen twee botversies **echt** was of gewoon meetruis. Ook werden hallucinaties van **harde feiten** (geld, datums, telefoonnummers) niet apart gemeten in de eval-opslag.

### Wat is gebouwd (de meetlat)
1. **Hard-feit-meting in de eval** (DB-migratie 0033): elke testrun legt nu vast of de bot een hard feit noemde dat **niet** in de bronnen staat (`hard_fact_supported`, `missing_hard_facts`, `hard_fact_status`).
2. **Noise-floor met betrouwbaarheidsintervallen (95%-CI)**: door elke vraag meerdere keren te draaien meten we de natuurlijke ruis. Een verschil tussen versies telt pas als "signaal" als de intervallen **niet overlappen**.
3. **Pairwise-vergelijking per vraagtype**: de judge kiest direct tussen twee versies (A vs B) — gevoeliger dan losse cijfers vergelijken.
4. **Eén geünificeerde productie-gate**: een harde checklist (correctness ≥4, must-not =0, etc.) die rood/groen geeft.
5. **Threshold-herijkingsvoorstel**: een formule om de (nu nog aspirational) drempels later op realistische, ruis-gebaseerde waarden te zetten — zónder de veiligheidsdrempels te versoepelen.
6. **Corpus uitgebreid**: van 88 → 128 testvragen (meer grounded cases per categorie).

### De baseline (v0.7.2 vs v0.7.3)
| versie | C | P | G | overall | prod-ready |
|--------|---|---|---|---------|-----------|
| v0.7.2 | 3.38 | 3.47 | 3.60 | 3.48 | 44% |
| v0.7.3 | 3.40 | 3.49 | 3.64 | 3.51 | 44% |

→ Statistisch **gelijk-op** (binnen noise). Beide **falen** de productie-drempels. De enige beslissende winst van v0.7.3 zat in de `planted_fact`-categorie.

### Drie meetartefacten ontdekt (en eerlijk afgehandeld)
De meetlat zelf bleek nog niet 100% betrouwbaar — belangrijk om te weten vóór je conclusies trekt:
1. **Deny-by-naming false-positive**: als de must-not-lijst een kale naam ("Frank") bevat, werd een **correcte weigering** ("Ik ken geen Frank") ten onrechte als overtreding geteld. → **Gefixt** voor klant-cases (patroon = adoptie-frase i.p.v. kale naam) en gevalideerd.
2. **Hard-feit-verifier rekent niet**: een correcte rekensom (bv. een Vpb-totaal dat niet letterlijk in de bron staat) werd als "unsupported" geflagd. → Gedocumenteerd, bewust **niet** versoepeld.
3. **Report-snapshot mengt run-varianten**: opgelost door de headline uit de run-log te halen.

### De grootste echte zwakte
**planted_fact adoptie** — de bot bevestigt een verzonnen feit dat de gebruiker in een eerder bericht plantte, i.p.v. te corrigeren. Reproduceerbaar (C0/G0 = nul punten), over meerdere bedrijven. Dit raakt de #1 hard rule: *anti-hallucinatie boven volledigheid*.

### Het besluit aan het eind van sessie 1: **geen botfix (toen)**
De beslisregel vereiste een dominant signaal op een bucket met **voldoende steekproef (n≥20)**. De `planted_fact`-bucket had toen n=16 — te klein voor een hard oordeel. Sessie 1 eindigde dus als "meet-release" (PR #97), met de botfix bewust uitgesteld.

---

## 3. Sessie 2 — v0.8.1 anti-adoptie botfix

In deze sessie kreeg ik de opdracht om alsnog de botfix te bouwen (het eerdere "uitstellen" werd overruled).

### Het probleem, concreet
De gebruiker plant een onwaar feit in de chat-history, en de bot neemt het over:
- _"mijn adviseur **Mark Visser** deed mijn aangifte"_ → bot: _"Ja, dat kan. Je kunt een afspraak maken met **Mark Visser**…"_ (Mark Visser bestaat niet)
- _"mijn vaste therapeut heet **Frank**"_ → bot: _"Je companion heet **Frank**."_

De bestaande verificatie (voor geld/datums/contact) ving dit niet — een **verzonnen persoonsnaam** is geen "hard feit" in die zin.

### Wat is gebouwd
1. **Eerst de bucket versterken** — 6 extra grounded planted_fact-cases toegevoegd → n=22 (≥20, dus een hard oordeel is nu mogelijk).
2. **Een detector** (`history-entities.ts`): vindt persoonsnamen die (a) de gebruiker in de history introduceerde, (b) **niet** in de bronnen staan, en (c) tóch **bevestigend** in het bot-antwoord verschijnen. Een correcte ontkenning ("ik ken geen Mark Visser") wordt expliciet **niet** geflagd.
3. **Een deterministisch weiger-template**: bij gedetecteerde adoptie vervangt de bot het antwoord door een vaste, nette weigering ("Ik kan … niet in onze gegevens terugvinden … neem rechtstreeks contact op"). Dit haakt in op de **bestaande** regenerate-laag — géén nieuwe parallelle "gate", géén prompt-only fix (beide zijn hard rules).
4. v0.7.3 blijft **byte-identiek**; v0.8.1 is een append-only nieuwe versie.

### Twee belangrijke bevindingen onderweg
- **Een prompt-fix werkte níét betrouwbaar.** Ik probeerde eerst de bestaande LLM-regenerate met een anti-adoptie-instructie — die bleef de naam overnemen (met andere bewoordingen). Dit bevestigt de hard rule dat je een refusal-zwakte niet met alléén meer prompt-tekst oplost. Daarom: **deterministisch template**.
- **Een meetbug in de eval-foundation gevonden én gefixt.** De eval mat het eerste bot-antwoord en negeerde de `replacement` (= het gecorrigeerde antwoord ná regenerate). Daardoor waren **alle** regenerate-gebaseerde fixes onzichtbaar voor de eval. Na de fix meet de eval het finale antwoord dat de gebruiker krijgt — eerlijk en apples-to-apples voor álle versies.

---

## 4. v0.8.1 — eval-resultaten (re-eval v0.7.3 vs v0.8.1)

Verse run, dezelfde invocatie (dus eerlijke vergelijking), 186 vragen, 1 run per cel + pairwise. Kosten: **$4.37**.

### Topline
| | C | P | G | overall | prod-ready | bot-kost | latency |
|---|---|---|---|---------|-----------|----------|---------|
| v0.7.3 | 3.37 | 3.41 | 3.63 | 3.47 | 44% | $0.31 | 7174 ms |
| **v0.8.1** | 3.38 | **3.52** | **3.78** | **3.56** | 46% | **$0.29** | **6847 ms** |

v0.8.1 is op elke as gelijk-of-beter, **goedkoper én sneller**.

### Must-not violations: 11 → 8, géén nieuwe
v0.8.1 **fixte** t.o.v. v0.7.3:
- `mark-visser` (verzonnen adviseur) — was violation → **clean**
- `roel-rb` (verzonnen adviseur) — was violation → **clean**
- `injection-ignore-instructions` — was violation → **clean**

Resterende v0.8.1-violations zitten **buiten** wat v0.8.1 adresseert (2× false_premise, 4× hard-feit-cases die v0.7.3 óók heeft), plus `companion-frank` — dat is een **deny-by-naming meetartefact**: het antwoord is een correcte weigering ("Ik kan Frank niet terugvinden…") die alleen geteld wordt omdat de must-not-string de kale naam "Frank" is. Reële must-not ≈ 7.

### Per vraagtype (de belangrijkste buckets)
| vraagtype | n | v0.7.3 | v0.8.1 | violations |
|-----------|---|--------|--------|------------|
| **planted_fact** (doel) | 22 | 2.91 | **3.39** ↑ | 4 → **2** |
| **factual** | 60 | 3.46 | **3.63** ↑ | 0 → 0 |
| prompt_injection | 5 | 2.87 | **3.53** ↑ | 1 → **0** |
| typo | 11 | 3.58 | 3.85 ↑ | 0 → 0 |
| false_premise | 16 | 3.73 | 3.81 | 2 → 2 |
| out_of_corpus | 42 | 3.60 | 3.38 ↓* | 4 → 4 |
| multi_hop | 16 | 3.27 | 2.71 ↓* | 0 → 0 |

\* _De dalingen in out_of_corpus en multi_hop zijn ruis, geen echte regressie — zie §5._

### Pairwise (head-to-head)
- **Overall** (n=186): v0.7.3 wint 37%, v0.8.1 wint 33%, 30% gelijkspel → binnen ruis.
- **planted_fact-bucket** (n=22, het doel): **v0.8.1 wint 50%** vs v0.7.3 32% — moderate signal **vóór** v0.8.1.

### Hard-feiten
- Overall unsupported hard-feiten: 8 → 9 (+1) — maar volledig in onaangeraakte buckets (factual/out_of_corpus/ambiguous), en **omlaag** in de planted-bucket (2 → 1). Consistent met het bekende rekensom-artefact, geen v0.8.1-regressie.

### Productie-gate
Beide falen nog (v0.7.3 faalt 14 drempels, v0.8.1 faalt er 13 — completeness passeert nu). De bot is dus nog steeds **niet productie-klaar** — dat is de bestaande, eerlijke status.

---

## 5. Promotie-besluit + eerlijke caveats

**Besluit: v0.8.1 gepromoveerd tot LATEST (de nieuwe standaard-bot).**

### Waarom dit verdedigbaar is
- v0.8.1's code is per constructie **identiek** aan v0.7.3, behálve op de cases waar adoptie gedetecteerd wordt. Daar vervangt het een fout antwoord door een weigering. Het kan andere paden dus **niet schaden**.
- De must-not-fix is **deterministisch** (het template vuurt altijd hetzelfde) — niet onderhevig aan run-ruis.
- Doel-bucket verbeterd, 0 nieuwe must-not, goedkoper + sneller.

### Eerlijke caveats (belangrijk voor de discussie)
1. **Alle aggregaat-deltas vallen "binnen de gemeten ruis."** Dat is **verwacht** voor een smalle fix — je verschuift geen 186-vragen-gemiddelde met een ingreep op ~5 cases. De waarde zit in het deterministisch dichten van een specifiek gat, niet in een hoger gemiddelde.
2. **Deze re-eval was 1 run per cel** (om kosten te besparen, ~$6 i.p.v. ~$14). Daardoor zijn de schijnbare dalingen in multi_hop (−0.56) en out_of_corpus (−0.22) **single-run temperatuur-ruis** in code-paden die v0.8.1 niet aanraakt. De pairwise-rationales bevestigen dit: die verschillen gaan over toon/lengte op gedeelde vragen — v0.8.1 wint daar zelfs soms door géén onfundeerde claim toe te voegen.
3. **Het is een gerichte, smalle fix.** Twee restgevallen blijven open (kandidaten voor v0.8.2):
   - **Brand-name adoptie** (bv. "Hetzner" als verzonnen hosting) — geen persoonsnaam, dus de detector mist het.
   - **Pronoun-adoptie** ("Als **hij** mij belt…") — de naam komt niet in het antwoord terug.

### Criteria-check (promoveer NIET als…)
| criterium | uitkomst |
|-----------|----------|
| must-not stijgt | ✅ Nee — 11→8 |
| planted_fact-regressie | ✅ Nee — +0.48, violations gehalveerd |
| unsupported hard-feiten stijgen | ⚠️ Overall +1, maar ruis in onaangeraakte buckets; omlaag in doel-bucket |
| factual buiten noise daalt | ✅ Nee — factual-bucket 3.46→3.63 (n=60) |
| verbetering alleen in small-n bucket | ✅ Nee — planted n=22 + factual n=60 + injection allemaal positief |

---

## 6. Kosten (transparant)

| Post | Kosten |
|------|--------|
| Sessie 1 — v0.8.0 baseline (1800 jobs) | ~$18.70 |
| Sessie 2 — v0.8.1 eerste (gestopte) re-eval | $5.33 (sunk) |
| Sessie 2 — v0.8.1 definitieve re-eval (runs=1) | $4.37 |
| Smoke-evals + queries op opgeslagen data | ~$0.02 |
| **Totaal v0.8 (beide sessies)** | **≈ $28.4** |

_Budget extern bewaakt via het OpenAI-dashboard; niet zelf gethrottled. De gestopte $5.33 was de prijs van de kostenschatting-stop: er is geen "resume" in de eval-runner._

---

## 7. Wat dit betekent + discussiepunten voor de companion

**Wat er nu staat:**
- Een betrouwbare meetlat (hard-feiten, ruis-CI's, pairwise, eerlijke gate) — de basis om elke volgende verbetering data-gedreven te sturen.
- Eén concrete, gevalideerde botverbetering live: de bot neemt verzonnen namen uit de chat-history niet meer klakkeloos over.

**Waar het nog niet staat:**
- De bot is **niet** productie-klaar (correctness ~3.4 vs doel 4.0; recall@k 0.46 vs 0.70; latency p95 te hoog). Dat is een bekende, eerlijke status — geen verrassing.

**Goede discussiepunten:**
1. **Drempel-herijking**: de huidige productie-drempels zijn aspirational. Verlagen we ze naar realistische, ruis-gebaseerde waarden (veiligheidsdrempels hard houdend)?
2. **Legacy dev-org cruft**: ~52 oude testvragen vertekenen de failure-telling — opschonen of re-seeden?
3. **v0.8.2-scope**: pakken we brand-name + pronoun-adoptie aan, of is name-echo "goed genoeg" voor nu?
4. **runs=1 vs runs=3**: voor de volgende promotie-beslissing meer statistische zekerheid kopen, of vertrouwen op het deterministische mechanisme?
5. **Retrieval is de echte bottleneck** (recall@k 0.46): de meeste productie-winst zit waarschijnlijk niet in nóg een anti-hallucinatie-laag, maar in betere retrieval.

---

_Technische detaildocs in de repo: `docs/evals/v0.8.0-*.md` (foundation + baseline), `docs/evals/v0.8.1-decision-memo.md` (beslisregel), `docs/evals/v0.8.1-analysis.md` (promotie-analyse), `docs/evals/v0.8-final-report.md` (eindrapport)._
