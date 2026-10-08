# Launch-ready-onderzoek — rapport (nacht 6 → 7 okt 2026)

Spec: `docs/superpowers/specs/2026-10-07-launch-ready-onderzoek-design.md` · volledig logboek: `docs/NACHT_LOG_2026-10-07.md` · branch `feat/seb/launch-ready-onderzoek` (gepusht, niet gemerged).

## 1. Samenvatting

**Aanbeveling: promoveer `v0.13x6` naar LATEST** (V1 draait hem dan automatisch als `v0.13x6v`, want V1 zet hybrid uit). Hij haalt de kritieke fouten van v0.12e vrijwel helemaal weg. Op de brede screening en de stress-sets halveert hij ongeveer het gewogen foutgetal, zonder dat de latency of kosten merkbaar stijgen.

| meting (zelfde jury, gepaard per vraag) | v0.12e (nu LATEST) | finalist-lijn | verschil |
|---|---|---|---|
| **Screening 64 vragen ×2 — finalist x6v** | 8 kritiek · 9 ernstig · 39,1/100 | **1 kritiek · 4 ernstig · 24,2/100** | −38%, gepaard 22/8 (p=0,016) |
| Screening 64 vragen ×2 (x4/x4v, eerdere jury) | 4 kritiek · 10 ernstig · 39,1/100 | x4: 1 · 5 · 22,7 · x4v: 0 · 3 · 23,4 | −42%, gepaard 19/6 (p=0,015) |
| Hard-eval (63 cases, prod-gate) | JA (6 okt) | **x6v JA · x6 JA**; AQ 95% / 100%, robuustheid 100%, 0 catastrofaal | gelijk of beter |
| Stress-ronde 2 (25 faalwijze-vragen ×4) | 72,8/100 | x4/x4v: **24,5** | −66%, gepaard 35/13 (p=0,002) |
| Stress-ronde 3 (strenge persoons-regels) | 10 kritiek · 23 ernstig · 91,5 | x5v: **2** · 13 · 51,9 | gepaard 34/6 (p<0,001) |
| Persoons-probe (9 vragen ×4) | **10 kritiek** · 68,8 | x6v: **1 kritiek** · 69,4 | −90% kritiek |
| Dronten "ja, we komen" (verzonnen werkgebied) | 4/4 runs | 0/4 | weg |
| "Geen vaste (setup)prijs"-verzinsel | 4-6 per ronde | 0 | weg |
| V1-eval (V1-prod seed-org, 15 cases) | 15/15 | x6v: **15/15** | gelijk |
| TTFT p90 / totaal p95 | 3,4 s / 5,0 s | 3,2 s / 4,7-5,4 s | gelijk; thinking-schema kost ~+0,4 s totaal |
| Kosten per antwoord | $0,0012 | $0,0011 | gelijk |

Daarnaast vond ik vier **productie-bugs** buiten de prompt, waarvan er twee al gefixt zijn op de branch (§7). En de **crawl-cleaner** (ingest-opschoning) halveerde de fouten op een echte gecrawlde klantsite: 58 → 25 per 100 antwoorden.

**Eerlijk over wat nog niet af is:**
- ~~De holdout-run is gestopt~~ → **holdout alsnog gedraaid op 8 okt, zie §11.** Uitkomst: x6/x6v houden stand op 143 nooit-geziene vragen (kritiek 8-9 → 2-3).
- De Sol-ronde is niet gedraaid. Na de holdout-jury voegt die weinig toe.
- De hard-eval van x6/x6v is gedraaid: prod-gate **JA voor beide**. Wel heb ik daarvoor één refusal-regex in de meetlat gerepareerd; het origineel is bewaard. Zie §5.
- De hard-eval-x6v liet twee echte fouten zien:
  - De bot voegde de tarieven voor "kleine" en "middelgrote" bv samen tot één te lage range.
  - Zonder hybrid miste hij de eigen-risico-pagina, waar x6 mét hybrid die wel vond.

## 2. Meetlat

Ik telde fouten per antwoord, gewogen naar ernst: kritiek = veto, ernstig ×3, licht ×1, toon ×0,25.
- **Jury:** een geblindeerde Claude-jury per vraag (subagents, $0). Die beoordeelt tegen de volledige bronnen die de bot zag. Per vraag beoordeelt één jurylid álle varianten.
- **Verificatie:** naast de jury tel ik ook deterministisch, met regex-tellers.
- **Les van vannacht:** de ernst-labels verschillen per jurylid (Dronten-ja is bij de één "kritiek", bij de ander "ernstig"). v0.12e scoorde in drie runs 55, 32 en 39 per 100. Daarom vergelijk ik alleen binnen één jury-run, gepaard per vraag. Absolute getallen tussen runs zijn niet vergelijkbaar.

Sets:
- **Screening:** 64 vragen. Dat zijn de dev-set (40), de probe-set en 12 vragen van een gecrawlde "onbekende klant" (Autorijschool Veenstra).
- **Stress-sets:** 25 vragen die precies de bekende faalwijzen raken, ×4 runs.
- **Holdout:** 143 nieuwe vragen. Die staan in de DB maar zijn nog niet gemeten.
- **Hard-eval:** 63 cases.
- **V1-eval:** 15 cases.

## 3. Wat er misging bij v0.12e (foutenkaart)

Bron: `eval-out/launch/foutenkaart.md`, op basis van 111 Sol-afkeuringen, de hard-eval, alle eerdere jury's en een nieuwe basismeting. De kritieke fouten kwamen uit een handvol oorzaken:
1. **"Geen vaste prijs"-verzinsel.** De v0.12e-prompt gaf letterlijk het template *"Daar hebben we geen vaste prijs/regeling voor"* voor niet-weten. Luna maakte daar bedrijfsbeleid van ("geen vaste setupprijs").
2. **Verzonnen werkgebied.** Het promptvoorbeeld *"werkgebied Flevoland → Lelystad? ja"* gaf een stellige "ja" voor Dronten, Emmeloord en Lelystad.
3. **Premisse via de vervolgstap.** Antwoorden als "bel Linda om te vragen of Jan tijd heeft" behandelen een niet-bestaande medewerker toch als echt.
4. **Te stellige persoons-ontkenning.** "Er werkt geen Sophie" terwijl het overzicht onvolledig is. De oude prompt duwde de bot hier zelf naartoe.
5. **Meetlat- en corpusruis.** Er stonden twee vreemde sites in de ChatManta-KB (een catering-demo en een hoveniers-testfixture), en veel verouderde gold-labels.

## 4. Kandidaten (brainstorm met 5 lenzen → 6 bundels)

Volledige matrix in `eval-out/launch/brainstorm.md`.

| kandidaat | wat | resultaat alleen |
|---|---|---|
| v0.13a / a2 prompt-hygiëne | geen afwezigheid verzinnen, geo-drieslag, STIJL v5 (aanvulling uit dezelfde bron), telling niet als kop | alle kritiek weg, maar meer meta-praat → a2 repareert dat |
| v0.13b rekenbewuste verifier | getallen uit de vraag en getoonde rekenstappen tellen als gegrond | "unsupported" van 14 naar 3 rijen; geen onnodige regenerate meer |
| v0.13c premisse-check | deterministische CONTROLE-regel na de vraag (namen/nummers niet in de context) + history-template zonder meta-zin | minder zwakke correcties |
| v0.13d context-precisie | inhouds-dedup (≥70% overlap) + bron-titels in de context | neutraal op de sandbox; bedoeld voor gecrawlde sites |
| v0.13e thinking-checklist | deelvragen / bron / premisse / reken / aanvulling | minder te_kort; +0,4 s |
| v0.13f klacht-modus | no-toezegging-directive na een gedetecteerde klacht | verzekering tegen het klacht-veto |
| crawl-cleaner (ingest) | homoglyfen, data-URI's, verminkte prijzen, formulierresidu, site-brede boilerplate-dedup | holdout-klant 58 → 25 per 100 |

Afgevallen:
- **Few-shot:** risico dat voorbeeldnamen in echte antwoorden lekken.
- **Reasoning low:** +0,8 s; de checklist doet hetzelfde goedkoper.
- **Feitenblad per org:** risico op valse volledigheid.
- **Kop-pad-reindex:** bewaard voor later.
- **Hybrid-fusie-fix:** alleen relevant voor V0.

## 5. Combineren: hoe de finalist ontstond

Per stap gemeten op de stress-set, met één jury over alle versies.
- **x1** = a2 + premisse-check → 75 (v0.12e 90)
- **x2** = + verifier + dedup + klacht → 58
- **x3** = + checklist → 52, 0 kritiek
- **x4** = x3 + vergelijkingsregel ("Pijnacker vs Zoetermeer" werd 4/4 geweigerd) + premisse-check alleen op namen/nummers (de €250.000 uit een rekenvraag werd als "onbevestigd" gemeld) + klacht-directive v2 (bood "gratis proefles" aan als oplossing) → 24,5
- **x5** = x4 + voorzichtige persoons-ontkenning + verbod op placeholders. Luna schreef in x3/x4 soms **`<PRIVATE_PERSON>`** in plaats van "Stephanie" (3 van ~8 keer). Dat kwam niet uit onze code; het werd getriggerd door het thinking-schema. Na de fix 0 van 16.
- **x6** = x5 + premisse-directive v2. De CONTROLE-regel zei nog "zeg stellig dat het niet klopt", ook bij personen. Dat botste met de promptregel.

**Screening-check x6v** (64 vragen ×2, één jury samen met v0.12e en x4v):

| versie | kritiek | ernstig | gewogen/100 | gepaard t.o.v. v0.12e |
|---|---|---|---|---|
| v0.12e | 8 | 9 | 39,1 | — |
| x4v | 6 | 5 | 27,3 | 23/13 (p=0,13) |
| **x6v** | **1** | **4** | **24,2** | **22/8 (p=0,016)** |

- De resterende kritieke fout van x6v: één van de twee runs bij de "therapeut Frank"-vraag eindigde met "vraag of er vrijdag plek is bij uw therapeut".
- Placeholders (`<PRIVATE_PERSON>`): x6v 0 van 128 en 0 van 16 in de probe; x4v had er nog 1.

**Hard-eval** (`eval-out/hard/20261007-015240-report.md`; judge via eval-runner, $0):

| versie | Laag-1 | catastrofaal | AQ | robuustheid | over/under-refusal | prod-gate |
|---|---|---|---|---|---|---|
| x6v (V1-gedrag) | 124/126 → 126/126 na regex-fix | 0 | 95% | 100% | 0% / 0% | **JA** |
| x6 (V0, hybrid) | idem | 0 | 100% | 100% | 0% / 0% | **JA** |

- Het enige veto (ot-acme-ander-bedrijf-01) was een meetfout. De regex herkende "Ik kan je niet helpen met openingstijden van een supermarkt" niet als weigering.
  - Ik heb de marker toegevoegd (`lib/rag/hard-eval-checks.ts`) en de twee rijen herscoord.
  - Het originele resultaat staat in `-results.orig.json`.
- De klacht-case: PASS, er werden geen vergoedingscategorieën genoemd.
- Premisse-adopties: 0.
- p95-latency-waarschuwing: 7,9 s (x6v). Dat is één uitschieter.

## 6. Aanbeveling (gerangschikt)

1. **Nu doen (launch-blokkerend, kosten ≈ 0):**
   - **Promoveer v0.13x6 naar LATEST.** Dat is één regel in `bots.ts`. Purge daarna de V1-answer_cache, want die keyt op 'v1.0'.
   - **Merge de twee productie-fixes** (multi-turn-cache, `<confidence>`-lek).
   - Draai vóór de merge de holdout-run (§9) als laatste controle.
2. **Vóór de eerste echte klant (1 dag werk):**
   - **Crawl-cleaner in het V1-crawlpad.** Al gebouwd op de branch, commit 06fae6b: `cleanCrawlPages` in `lib/v1/crawler/processCrawl.ts`.
   - Waarom: een echte site bestond voor ~60% uit ruis, met homoglyfen ("rijbеwijs") en verminkte prijzen ("€5 **9,-**"). V1 sloeg dat ongefilterd op.
   - Dit raakt het ingest-pad, dus lees eerst de diff voordat je merget. Bestaande bronnen hebben daarna een re-crawl nodig.
3. **Kort daarna:**
   - Een fallback-tekst voor on-topic vragen zonder treffers. Nu krijgt de V1-h2-vraag "wat kost een bruiloftstaart?" de off-topic-tekst.
   - Een assistent-beurt-validatie in de widget-API (§7).
4. **Later:** kop-pad-chunking (contextuele chunk-koppen, vereist een reindex), een feitenblad per org, en hybrid search in V1 (V0-fusiebug eerst).

## 7. Productie-bevindingen buiten de antwoordlaag

| bevinding | status |
|---|---|
| **Answer-cache negeert de gespreksgeschiedenis** (V0 én V1): een vervolgvraag ("en wat kost dat?") kon het antwoord uit een ánder gesprek krijgen | **gefixt** (062cb53): cache overslaan bij gebruikers-history |
| **`<confidence>0.99</confidence>` zichtbaar in het antwoord** bij `<answer>` zonder `</answer>` | **gefixt** (43cce4f) |
| Luna schrijft soms `<PRIVATE_PERSON>` i.p.v. een naam (getriggerd door het thinking-schema) | opgelost in de x5/x6-prompt; overweeg een deterministische guard |
| History wordt vroeg op 4 beurten afgekapt i.p.v. de bedoelde 8 | open |
| Client-meegestuurde `assistant`-beurten worden geaccepteerd (een "eerdere bot-uitspraak" is te vervalsen) | open, raakt de widget-API → jouw beslissing |
| V0-hybrid-fusie: treffers die alleen via keyword binnenkomen krijgen similarity 0 en vallen weg | open, alleen V0 |
| V1 slaat Firecrawl-markdown ongefilterd op | crawl-cleaner gebouwd (`lib/rag/clean-crawl.ts`) en ingehaakt in het V1-crawlpad (06fae6b); wacht op jouw review |
| Hard-eval-refusal-regex miste "Ik kan je niet helpen met …" → vals veiligheidsveto | gefixt (meetlat) |
| V1 heeft geen hybrid search; in de hard-eval vond x6 (mét hybrid) de eigen-risico-pagina wél en x6v niet | open: V1-hybrid-RPC is een V2-kandidaat (eerst de V0-fusiebug) |

## 8. Data-wijzigingen en terugdraaien

| wijziging | backup | terugdraaien |
|---|---|---|
| Catering-demosite (knowledge_source `49a5715b…`, 32 pagina's) in dev-org gedeactiveerd | `eval-out/backups/20261007-0110-catering-deactivatie.json` | `UPDATE knowledge_sources SET disabled_at=NULL WHERE id='49a5715b-1951-4d87-a5ef-51760d186084'; UPDATE website_pages SET included=true WHERE knowledge_source_id='49a5715b-1951-4d87-a5ef-51760d186084';` |
| Crawl-eval-fixture "Groene Vingers" (knowledge_source `84d2bdfa…`, 4 pagina's) in dev-org gedeactiveerd | `eval-out/backups/20261007-0135-crawleval-deactivatie.json` | idem met id `84d2bdfa-cbfc-4215-8664-9b9db134e2a3` |
| Nieuwe eval-orgs `…a5` (holdout-klant, ruwe crawl) en `…a6` (opgeschoonde KB): organizations, documents, parent_chunks, document_chunks | n.v.t. (nieuw) | delete documents/chunks/parents + organization per id |
| 195 nieuwe eval_questions (tags `holdout` / `clean-kb`) | n.v.t. | delete where tags @> '{holdout}' of '{clean-kb}' |
| must-not-labels `v061-hardfact-prijs-per-maand` (−"€249") en `v063-hardfact-grounding-rate` (−"85%") | git | git revert + `npm run eval:relabel` |
| Answer-cache van de V0-orgs gewist | — | regenereert vanzelf |

## 9. Wat jij nog moet starten (gestopt door geheugendruk)

```bash
cd C:\Users\solys\Documents\Code\chatmanta-luna-test
# Holdout (143 nieuwe vragen), finalist vs nu: ~$0,35
EVAL_CONCURRENCY=4 npm run eval:run -- --versions=v0.12e,v0.13x6v --slugs=$(cat eval-out/launch/holdout-slugs.txt) --runs=1 --interleave --no-judge --out=eval-out/launch/holdout1.json
# daarna jury: node --env-file=.env.local eval-out/launch/prep-jury.cjs --runs=eval-out/launch/holdout1.json --out=eval-out/launch/jury/holdout --qpb=4  (+ jury-agents, zie jury-multi.txt)
```
Optioneel een Sol-ronde (~$6) op de 186 standaardvragen: `npm run eval:run -- --versions=v0.12e,v0.13x6v --slugs=$(cat eval-out/launch/std-slugs.txt) --judge-model=gpt-6-sol`.

## 10. Spend

OpenAI ≈ **$3,9** van de $20. Dat bestaat uit:
- opgeslagen bot-runs: $2,88
- de gestopte holdout-run: ~$0,85 voor 783 antwoorden die niet bewaard zijn
- hard-eval: $0,15
- V1-eval en embeddings: < $0,02

Sol is niet gebruikt. Alle jury-werk liep via Claude-subagents ($0).

## 11. Holdout-validatie (8 okt 2026)

De nachtelijke holdout-run bleek tóch afgerond (het node-proces liep als wees door; `holdout1.json`, 1144 antwoorden), maar zonder de finalist: x6/x6v bestonden nog niet toen hij startte. Daarom op 8 okt:

1. **x6 + x6v op dezelfde 143 holdout-vragen ×2** (`eval-out/launch/holdout2.json`, $0,61).
2. **Eén geblindeerde jury over vier versies**: v0.12e (= V0 nu) en r1 (= V1 nu) uit `holdout1`, x6 en x6v uit `holdout2`. 1144 antwoorden, 48 batches, 12 Claude-jury-agents, één jurylid per vraag over alle varianten (`eval-out/launch/jury/holdout/`).
3. **Gepaarde latency-probe**: alle 4 versies door elkaar op 40 holdout-vragen, op hetzelfde moment (`latency-probe.json`, $0,17).

| versie | kritiek | ernstig | licht | gewogen/100 | gepaard vs v0.12e b/s/g (p) | gepaard vs r1 (p) |
|---|---|---|---|---|---|---|
| v0.12e (V0 nu) | 8 | 9 | 45 | 26,2 | — | 30/32 (0,90) |
| v0.13r1 (V1 nu) | 9 | 11 | 33 | 24,1 | 32/30 (0,90) | — |
| **v0.13x6** (V0-kandidaat) | **2** | 12 | 33 | 25,3 | 38/25 (0,13) | 35/26 (0,31) |
| **v0.13x6v** (V1-kandidaat) | **3** | 10 | 28 | **21,5** | 40/26 (0,11) | 33/23 (0,23) |

**Lezing:**
- **Kritieke fouten −70%** op nooit-geziene vragen. Dat is precies wat de stress-sets voorspelden. Verdwenen zijn verzonnen beleid ("geen vaste prijs", "geen vooruitbetaalkorting", "shockwave bieden wij niet aan"), procedure-verzinsels en fout overgenomen tarieven.
- De ruil is dezelfde als in de stress-rondes: x6 zegt iets vaker "weet ik niet" waar het antwoord wél in de bron stond (onterechte weigering 0 → 5). Dat is de veilige kant van de afweging, en de licht-fouten dalen ook.
- Het gewogen totaal verschilt niet significant: de meeste holdout-vragen zijn "gewone" vragen waar alle versies goed scoren. De winst zit in de staart, en daar zitten de reputatierisico's.
- Restant kritiek bij x6/x6v (ook bij v0.12e/r1):
  - "vanaf 16 jaar" i.p.v. 16,5: de bot neemt de paginatitel "Rijles vanaf 16 jaar" over.
  - Venlo-reiskosten: de bot gebruikt aardrijkskunde (wereldkennis) om te bepalen of iets binnen 30 minuten ligt.
  - Kandidaten voor een volgende ronde, niet blokkerend.
- 0 placeholder-lekken (`<PRIVATE_PERSON>`) in 572 x6/x6v-antwoorden.
- Must-not-meetlat: 5 van de 6 x6v-treffers bleken substring-vals-alarm in een ontkenning ("…of contant betalen kan", "kan niet bevestigen dat 15% seniorenkorting geldt"). Label `ho-veen-regio-leidschenveen-automaat` gerepareerd (DB + seed).

**Latency** (gepaard, zelfde moment): de TTFT-mediaan is gelijk (~4,0 s voor alle vier; overdag is OpenAI ~1 s trager dan 's nachts). Het gepaarde verschil per vraag is x6v−r1 +0,5 s en x6−v0.12e +0,06 s. De staart is dikker: TTFT p90 5,1 → 5,8 s, totaal p95 7,0 → 8,1 s. De oorzaak zit volledig in `generation` (het thinking-schema schrijft meer tokens vóór het antwoord). Retrieval, preprocess en verify zijn gelijk. Kosten per antwoord zijn gelijk.

**Conclusie: promoveer v0.13x6 naar LATEST.** De holdout bevestigt de stress-sets en de hard-eval. Prijs: ~0,5 s extra in de staart.

## 12. Ronde x7: precisie op de bekende x6-fouten (8 okt 2026, avond)

**Doel:** de fouten die x6 in de holdout nog maakte gericht verhelpen, zonder de x6-winst te verliezen.

**Wat x7 toevoegt aan x6** (prompt `V0_13X7_SYSTEM_PROMPT` + flag `smalltalkToneAware`):
1. **Andere naam:** staat het antwoord er in andere woorden of onder een andere naam, dan geeft de bot het wel (en zegt hoe het heet).
2. **Dienst-premisse:** een dienst die niet in het aanbodoverzicht staat, wordt rechtgezet ("staat niet in ons aanbod / ken ik niet uit ons aanbod" + wat wél past). De bot doet nooit alsof de dienst bestaat.
3. **Titels zijn geen feiten:** getallen en voorwaarden komen uit de lopende tekst, niet uit een kop of URL ("Rijles vanaf 16 jaar" → 16,5 jaar). De bot legt geen beperking op die de tekst niet noemt.
4. **Afstand:** algemene kennis over "duidelijk binnen / ruim buiten" een reistijdgrens mag, maar voorzichtig geformuleerd en met afstemming via contact.
5. **Smalltalk in u-vorm** bij tone `formal` (pre-processor).

**Meting** (nieuwe vragen, geblindeerde Claude-jury, gepaard per vraag):

| meting | x6 / x6v | x7 / x7v | oordeel |
|---|---|---|---|
| Stress-set (40 nieuwe faalwijze-vragen ×4, V1-pad) | 60,5/100 · 1 kritiek · 20 ernstig | **43,4 · 0 · 16** | gepaard 35/11, **p=0,001** |
| Verse holdout2 (120 nieuwe vragen ×2), V1-pad | 23,5 | 23,4 | gelijk (16/19, n.s.) |
| Verse holdout2, V0-pad (hybrid) | 34,6 | 28,8 | gelijk (18/14, n.s.) |
| Hard-eval (prod-gate) | x6v JA (AQ 95%) / x6 JA | **x7v JA / x7 JA (AQ 100%)**, 0 catastrofaal, 0 echte fails | ≥ |
| Latency TTFT p50 | 3,7 s | 3,5 s | gelijk |

Per faalwijze in de stress-set (zwaar = kritiek + ernstig): dienst-premisse 13 → 9 /48, titel-vs-tekst 5 → 3 /28, smalltalk-toon 2 → 0 (gewogen), afstand en andere-naam gelijk.

**Bijvangsten (gefixt):**
- **Taalbug** (`detectLanguage`): de letter "A" in "pakket A" telde als Engels woord → een Nederlandse vraag werd "mixed" → Engelse spiegel-directive → Engels antwoord (3/8 runs, x6v én x7v). "a" uit de EN-markers, NL-markers uitgebreid; test `detect-language.test.ts`.
- **Meetlat:** weigering-marker "ik weet … niet" (vals veto op ot-acme-ander-bedrijf-01; uitzondering voor "ik weet zeker/wel/dat").

**Restpunten (niet opgelost door x7):**
- Dienst-premisse blijft het zwakste punt (9/48 zwaar): "Dat bedrag kan ik je niet noemen" bij een BE-aanhangeropleiding die niet bestaat.
- Retrieval-missers: de bron met het antwoord wordt soms niet opgehaald (eigen-risico zonder hybrid, tarieventabel, "Standard-pakket"). Dit is een zoekprobleem, geen prompt-probleem → retrieval-ronde.
- Testset-onderhoud: `aoc-globex-parkeerkosten-01` test niet wat hij moet testen (het antwoord staat wél in de bronnen).

Vragensets: `eval-fixtures/x7/` (seed met `node --env-file=.env.local eval-fixtures/x7/seed-x7q.cjs --apply`). Kosten x7-ronde: ≈ $2,20 OpenAI; jury en vraaggeneratie via Claude ($0).

## 13. Vervolg: ronde x8 op echte gesprekken

Afgesproken op 8 okt 2026: **zodra de soft-launch echte gesprekken oplevert, volgt ronde x8 op die gesprekken** in plaats van op zelfbedachte vragen. Op 8 okt waren er 0 V1-gesprekken en 1 V0-gesprek.

- **Start-signaal:** ongeveer 2-4 weken echt verkeer in V1 `query_log` (V1-prod) of in V0-widgetverkeer.
- **Aanpak:**
  1. Echte vragen reviewen: fallbacks, `gap_kind`, weigeringen en klachten.
  2. Daaruit een testset + een aparte holdout maken (PII eerst redigeren).
  3. Dezelfde gepaarde jury-methodiek gebruiken als in §11-12.
- **Daarna** (volgorde ter bespreking):
  1. Retrieval V1: hybrid search (eerst de V0-fusiebug), paginapad als chunk-kop, feitenblad per org. Eerst checken tegen de V2-scope.
  2. Widget-API-robuustheid: assistant-beurten van de client valideren, history 4 → 8 beurten.
  3. Latency: het thinking-schema kost ~0,5 s in de staart.
