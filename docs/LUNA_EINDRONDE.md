# Luna-eindronde vóór de launch (okt 2026)

Datum start: 2026-10-11 · branch `feat/seb/luna-eindronde` · basis: v0.14d2 (LATEST, live in V0 en V1)

**Vraag (Seb):** één laatste, overzichtelijke ronde om tot de beste botversie te komen vóór de
launch (week van 12 okt). Vooral kijken naar de instructies/prompt, en naar varianten met en zonder
voorbewerking, inclusief "alles in één prompt". Budget: $10 OpenAI voor evals.

**Beslisregel (Seb, 2026-10-11): kwaliteit eerst.** Een kandidaat wint alleen als de kwaliteit
minstens gelijk is aan de referentie én de hard-eval (prod-gate) JA geeft. Snelheid, kosten en
eenvoud beslissen alleen bij een gelijkspel.

## Opzet

Alle kandidaten draaien **zonder hybrid search** (= V1-gedrag; V1 is wat er gelauncht wordt).
Rondes na elkaar, niet alles door elkaar: elke ronde beantwoordt één vraag.

| ronde | vraag | kandidaten | testset | beoordeling |
|---|---|---|---|---|
| 1 | Welke opzet van de voorbewerking? | v0.15r (referentie = V1 live), v0.15f (lui), v0.15g (f + berichtsoort in de antwoordprompt), v0.15h (alles in één prompt) | dev-set (40) + routing-set r15 (28) × 2 runs, interleaved, latency gemeten | Claude-jury (geblindeerd, gewogen foutscore, $0) |
| 2 | Welke instructies? | winnaar ronde 1 met: huidige prompt, opgeschoonde prompt, minimale prompt, huidige prompt zonder denkstap | stress-sets x6+x7 (65) + dev-set (40) × 2 runs | Claude-jury |
| 3 | Gerichte reparaties | alleen als ronde 2 een duidelijk faalpatroon laat zien: losse instructie-blokjes bovenop de winnaar | gerichte subset | Claude-jury |
| 4 | Eindtoets | finalist vs referentie | holdout2 (120) + r15 × 2 runs, hard-eval, V1-eval | Claude-jury + hard-eval-gate |

Waarom de instructie-blokjes uit de brainstorm (deels antwoorden, rekenen in stappen, voorbeelden
weg) niet als vaste ronde: ze zitten al in de huidige prompt of worden al meegenomen door de
opgeschoonde/minimale variant. Een blokje testen we alleen nog als de data er een reden voor geeft.

## Kandidaten ronde 1

- **v0.15r** — v0.14d2 zonder hybrid: voorbewerking loopt parallel met zoeken; bij nul treffers
  opnieuw zoeken met de herschreven vraag.
- **v0.15f** — geen voorbewerking vooraf; begroetingen/bedankjes deterministisch; voorbewerking
  alleen lui bij nul treffers of bij een vervolgvraag met een verwijswoord.
- **v0.15g** — f + blok BERICHTSOORT in Luna's antwoordprompt (begroeting/vraag over de assistent →
  kort groeten + waarmee je helpt; off-topic → kort weigeren).
- **v0.15h** — alles in één prompt: nooit een LLM-voorbewerking. Vervolgvragen zoeken ook op
  "vorige vraag + huidige vraag" (deterministisch); nul treffers → vaste fallback (`noLlmPreprocess`).

## Resultaten

### Ronde 1 — opzet (2026-10-12)

dev-set 40 + routing-set r15 28, × 2 runs, interleaved (544 antwoorden, $0,91). Jury: 12 geblindeerde
Claude-subagents, rubric `eval-out/r15/jury-rubric.md` (+ `verkeerde_route`). Gewogen foutscore per
100 antwoorden (ernstig ×3, licht ×1, toon ×0,25; kritiek = veto). Lager = beter.

| versie | kritiek | ernstig | licht | gewogen/100 | gepaard vs r (beter/slechter) | routefouten | zichtbare TTFT p50 1e vraag / vervolg | $/antw |
|---|---|---|---|---|---|---|---|---|
| **v0.15r** (V1 live) | 0 | 5 | 24 | **28,7** | — | 0 | 1,91 / 3,28 s | 0,00178 |
| v0.15f (lui) | 1 | 5 | 31 | 34,0 | 10 / 18 (p=0,19) | 3 | 1,87 / 2,07 s | 0,00164 |
| v0.15g (f + berichtsoort) | 0 | 9 | 32 | 43,4 | 8 / 17 (p=0,11) | 0 | 1,84 / 2,21 s | 0,00168 |
| v0.15h (één prompt) | 0 | 13 | 40 | 58,1 | 11 / 27 (**p=0,01**) | 2 | 1,89 / 1,87 s | 0,00159 |

- **h valt af.** Zonder herschrijving vindt een Engelse vraag ("Do you work on weekends?", "30% ruling?")
  niets in een Nederlandse kennisbank → vaste Nederlandse fallback terwijl het antwoord er staat; "Goedemorgen,
  wie ben jij?" krijgt "Daar heb ik geen informatie over". De voorbewerking vangt dus echte gevallen op.
- **f** mist de open begroeting ("Hoi, wat kan je voor mij doen?" → hele dienstencatalogus, 3×). Eén kritiek
  (rugpijn: "bel 112" waar de bron "huisarts" zegt) is een promptkwestie die in elke versie kan optreden.
- **g** lost de routefouten van f op (0), maar scoort niet beter dan r; de extra ernstige fouten zitten vooral
  in ChatManta-eigen vragen (prijs-tiers, rate-limits, Dronten) en wisselen per run — ruis-niveau, maar wel de
  verkeerde kant op.
- **r (de huidige opzet) blijft de beste opzet**: geen routefouten, laagste foutscore. Nadeel: vervolgvragen
  ~1 s trager (3,3 s) omdat hij daar eerst herschrijft.

Conclusie ronde 1 (beslisregel kwaliteit eerst): **de voorbewerking blijft.** Ronde 2 test de prompt-varianten;
de finale combineert een eventuele promptwinnaar met de r-opzet.

### Ronde 2 — instructies (2026-10-12)

Stress-sets x6 (25) + x7 (40) + dev-set (40) = 89 unieke vragen × 2 runs (890 antwoorden, $1,52). Promptvarianten
op de g-opzet (de prompt-invloed is los van de opzet), plus de referentie r op dezelfde vragen.

| versie | prompt | kritiek | ernstig | licht | gewogen/100 | gepaard vs r (beter/slechter) | zichtbare TTFT p50 | $/antw |
|---|---|---|---|---|---|---|---|---|
| **v0.15r** | huidig (x7), opzet r | 2 | 4 | 44 | **31,5** | — | 1,97 s | 0,00198 |
| v0.15g | huidig + berichtsoort | 2 | 8 | 51 | 42,1 | 20 / 28 (p=0,31) | 1,88 s | 0,00182 |
| v0.15gt | huidig zonder denkstap | **5** | 8 | 41 | 36,5 | 18 / 24 (p=0,44) | **1,51 s** | 0,00172 |
| v0.15go | opgeschoond (5 principes, minder voorbeelden) | 2 | 11 | 52 | 47,9 | 18 / 36 (**p=0,02**) | 1,96 s | 0,00161 |
| v0.15gm | minimaal (6 kernregels) | 0 | 23 | 63 | 74,2 | 18 / 52 (**p<0,001**) | 1,90 s | 0,00139 |

- **De lange prompt verdient zijn plek.** Minimaal is duidelijk slechter: Luna zet valse aannames minder stellig
  recht ("kan niet bevestigen of we X aanbieden"), mist feiten die er wél staan en weigert vaker onterecht.
  Opgeschoond (zelfde regels, minder voorbeelden) is ook significant slechter: de concrete voorbeelden doen ertoe.
- **Zonder denkstap** is 0,4 s sneller en even goed op gewogen score, maar met de meeste kritieke fouten
  (o.a. "loopgroep bieden we niet aan" terwijl dat nergens staat, een valse "geen voorrijkosten"-premisse
  overgenomen). Kwaliteit eerst → afgewezen.
- **r blijft ook hier het best** (tweede onafhankelijke meting na ronde 1): de huidige opzet mét voorbewerking
  en de huidige prompt.
- Terugkerende kritieke fout in álle versies: "Leeuwarden/Maastricht ligt buiten ons vaste werkgebied" terwijl de
  bot geen werkgebied in zijn bronnen had. De prompt zegt nu letterlijk dat hij dat mag zeggen als de CONTEXT
  "daar niets over zegt". → ronde 3.

### Ronde 3 — gerichte reparatie: werkgebied (2026-10-12)

v0.15rw = v0.15r + één zin in GEOGRAFIE: *"Noemt de CONTEXT helemaal geen werkgebied, regio of afstandsgrens,
zeg dan niet of de plaats binnen of buiten jullie werkgebied ligt: zeg dat jullie dat graag even afstemmen en
geef het contact uit de CONTEXT."* Geo-set: 20 werkgebied/afstand-vragen × 4 runs (160 antwoorden).

| versie | kritiek | ernstig | licht | gewogen/100 |
|---|---|---|---|---|
| v0.15r | **4** (Leeuwarden 3×, Maastricht 1×) | 14 | 7 | 61,3 |
| v0.15rw | **0** | 17 | 12 | 78,8 |

De kritieke verzinsels verdwijnen; de ernstige fouten verschuiven (Lelystad beter, Randstad/Dronten slechter)
binnen ruisniveau. Blijvend zwak punt in béide: plaatsen in Flevoland die niet bij naam genoemd staan (Urk,
Emmeloord, Dronten) worden stellig "buiten" genoemd, terwijl Flevoland standaard werkgebied is.

### Ronde 4 — eindtoets (2026-10-12)

holdout2 (120 ongeziene vragen, 5 bedrijven) × 2 runs, interleaved (480 antwoorden):

| versie | kritiek | ernstig | licht | gewogen/100 | gepaard | TTFT p50 | $/antw |
|---|---|---|---|---|---|---|---|
| v0.15r | 2 | 6 | 54 | 30,2 | — | 1,94 s | 0,0021 |
| **v0.15rw** | **0** | **3** | 52 | **25,6** | 22 beter / 17 slechter (p=0,52) | 1,90 s | 0,0021 |

- **Hard-eval (prod-gate):** v0.15r én v0.15rw 63/63, gate JA, 0 catastrofaal, over-/under-refusal 0%
  (`eval-out/hard/20261012-002956-report.md`).
- **V1-eval** (seed-org, echte V1-pad) met v0.15rw: 15/15 (grounded 6/6, eerlijke weigeringen 4/4, isolatie,
  off-topic en injectie 5/5).

## Conclusie

**Winnaar: v0.15 = v0.14d2 + de werkgebied-regel.** Kwaliteit minstens gelijk op ongeziene vragen (0 vs 2 kritiek,
lagere foutscore), het enige terugkerende verzinsel weg, prod-gate JA, zelfde snelheid en kosten.

Wat níet won (en waarom dat goed nieuws is): de huidige opzet mét voorbewerking en de huidige, lange prompt zijn
in twee onafhankelijke rondes het best gebleken. Luna is sterk, maar haalt de kwaliteit uit de concrete regels en
voorbeelden; een kortere prompt of "alles in één prompt" kost aantoonbaar kwaliteit (Engelse vragen, begroetingen,
valse aannames). Snelheidswinst die nog ligt: zonder denkstap −0,4 s en luie voorbewerking −1 s op vervolgvragen,
maar beide met meer fouten — niet doen vóór de launch.

Spend: antwoorden genereren $3,74 + hard-eval $0,43 + V1-eval $0,01 + smoke ≈ **$4,20** (budget $10). Jury en
hard-eval-judge via Claude-subagents ($0).

**Na merge:** V1-answer_cache purgen (key `v1.0` verandert niet bij een config-wijziging) zoals bij #263/#266/#268/#277.

**Open voor later (x8, echte gesprekken):** Flevoland-plaatsen niet bij naam; "kan niet bevestigen" i.p.v. stellig
rechtzetten bij een onbekende medewerker (Mark Visser, Sophie, Geldrop); te korte antwoorden die een tweede nuttig
feit uit dezelfde bron laten liggen (meest voorkomende lichte fout).
