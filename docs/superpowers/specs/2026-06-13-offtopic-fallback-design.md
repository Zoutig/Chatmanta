# Off-topic-fallback via de pre-processor — design

**Datum:** 2026-06-13
**Branch:** `feat/seb/offtopic-fallback`
**Status:** ontwerp, wacht op review

## 1. Probleem

Een bezoeker vroeg in gesprek `59bfbff0-…` (dakwerk-demo-org, v0.10) "Wat is 2+2".
Verwacht gedrag: een fallback dat de bot alleen helpt met vragen over het bedrijf.
Werkelijk gedrag: de bot gaf een wollig weiger-antwoord ("Ik kan dat specifieke
gegeven niet terugvinden … voor exacte bedragen, datums of cijfers kunt u contact
opnemen") **en** het gesprek staat in het dashboard als "Beantwoord".

### Root cause

1. De pre-processor (gpt-4o-mini, draait al bij élk bericht) kent maar twee
   uitkomsten: `smalltalk` of `search`. "2+2" werd `search`.
2. Retrieval was zwak (top1Sim 0.13 < drempel 0.4). **HyDE** verzon vervolgens een
   nepdocument ("volgens de financiële richtlijnen … 2+2=4"), waardoor zwakke chunks
   nét boven de drempel kwamen → het schone *zero-hits*-fallbackpad (én de bestaande
   off-topic-herclassificatie) werd overgeslagen.
3. Het antwoord-LLM produceerde een ongegrond telefoonnummer → de
   `hardFactDeterministicRefusal`-gate verving dat door een weiger-template, maar
   liet `kind: 'answer'` staan (met `gapKind: 'low_grounding'`).
4. Het dashboard (`conversations.ts`) markeert alleen `kind === 'fallback'` als
   "Onbeantwoord". Een weigering met `kind: 'answer'` telt dus als "Beantwoord".

## 2. Doel / niet-doel

**Doel:** vragen die overduidelijk niets met het bedrijf te maken hebben
(rekensommen, weer, trivia, code, andere bedrijven) krijgen een nette off-topic-
fallback: *"Ik help met vragen rondom {bedrijf}. Wat wil je weten?"* — zónder
retrieval/HyDE/antwoord-LLM waar mogelijk, en met **minimale kans dat een échte
klantvraag onterecht geweigerd wordt.**

**Niet-doel (apart traject):**
- De bredere dashboard-labelfout voor `kind:'answer'`-weigeringen die *wel* in scope
  zijn maar ongegrond (de `deterministicHardFactRefusal`-case). Off-topic lost zich
  voor déze melding vanzelf op (wordt `kind:'fallback'`), maar de algemene
  label/metric-sync met de eval-definitie blijft een losse follow-up.
- RAG-tuning buiten off-topic-routing (thresholds, rerank, cascade).

## 3. Ontwerp

Gekozen aanpak (uit de brainstorm): de pre-processor een **derde uitkomst**
`off_topic` geven, en die behandelen als een **zacht signaal** dat nooit op zichzelf
weigert — de kennisbank krijgt een veto.

### 3.1 Pre-processor: derde actie `off_topic`

- Promptsjabloon (`preProcessSystem`) krijgt een derde actie naast `smalltalk` /
  `search`. Voorzichtige instructie:
  - Classificeer als `off_topic` **alleen** als de vraag overduidelijk buiten het
    vakgebied van `{{COMPANY}}` valt (rekensommen, weer, sport, algemene trivia,
    programmeren/code, andere met naam genoemde bedrijven/producten).
  - **Bij twijfel → `search`.** Liever een vraag onnodig doorzoeken dan een echte
    klantvraag weigeren.
  - Begroetingen/dank/afscheid blijven `smalltalk`.
  - **History-bewust:** als er al gespreks-historie is (de bezoeker stelde eerder
    in-scope vragen), wees extra terughoudend — een vervolgvraag als "en de prijs?"
    is nooit `off_topic`.
- `parsePreProcessOutput` krijgt een tak voor `ACTION: off_topic` → returnt
  `{ kind: 'off_topic' }` (geen `query`/`reply` nodig).
- `PreProcessResult` union breidt uit met `{ kind: 'off_topic' } & PreProcessTokens`.
- Malformed output blijft default `search` (ongewijzigd, fail-open richting
  beantwoorden).

### 3.2 Laag 1 — twee signalen moeten het eens zijn (false-positive-rem)

`off_topic` leidt **niet** direct tot een weigering. In de orchestrator
(`runRagQueryStreaming`, en het niet-streaming pad als dat apart is) na
`preProcessInput`:

```
offTopicSuspected = bot.preProcessOffTopicDetection
                 && pp.kind === 'off_topic'
                 && !generalKnowledgeActive
```

Bij `offTopicSuspected`:
1. **HyDE wordt geforceerd uit** voor deze query (de fabricatie-rescue is precies wat
   het off-topic-signaal anders ondermijnt). Retrieval draait op de **originele
   vraag** (geen rewrite).
2. Daarna de bestaande drempel-gate:
   - **Vindt de kennisbank tóch chunks boven de drempel** (`aboveThreshold.length > 0`)
     → de classifier zat ernaast → **gewoon doorgaan met het normale antwoord-pad.**
     De bot beantwoordt de vraag.
   - **Komt retrieval leeg terug** → beide signalen zijn het eens → **off-topic-
     fallback** (zie 3.3).

**Garantie:** een vraag met echte treffers in de kennisbank wordt altijd beantwoord,
ongeacht wat de classifier zei. De classifier kan de *bewoording* van een fallback
veranderen, maar nooit een goed-gedekte vraag weigeren.

### 3.3 Hergebruik bestaande off-topic-fallback

Bij `offTopicSuspected` + lege retrieval emit de orchestrator de **bestaande**
`OFF_TOPIC_REFUSAL` (`rag.ts`, nu alleen bereikbaar via de reclassify-tak):

```
kind: 'fallback'
gapKind: 'off_topic'   (als bot.knowledgeGapLogging aan)
answer: `Ik help met vragen rondom ${persona.offTopicScope}. Wat wil je weten?`
```

Concreet: de zero-hits-fallback-emit-plek(ken) krijgen een `offTopicSuspected`-tak die
de off-topic-tekst kiest i.p.v. de generieke `fallbackMessage`. Geen nieuwe response-
shape, geen nieuwe `kind`.

> Copy-tweak optioneel: de tekst mag scherper naar bijv. *"Ik kan alleen helpen met
> vragen over {scope}. Waar kan ik je mee van dienst zijn?"* — te beslissen in review.

### 3.4 Flag-gating + versie-keuze

- Nieuw veld op `BotConfig`: `preProcessOffTopicDetection: boolean` (default `false`).
- Aan op de **live versie (v0.10)**; uit op alle oudere versies → geen mutatie van
  oude eval-snapshots, en instant terug te draaien.
- **Beslist (§9):** flag **in-place op v0.10** (precedent: bron-links-fix direct op
  v0.9.1). Het is een strikte verbetering van duidelijk-kapot off-topic-gedrag, en de
  eval-poort (§6) bewaakt regressie.

### 3.5 Respect voor `generalKnowledgeEnabled`

Staat de "algemene kennis"-toggle van een org **aan** (de org wíl algemene vragen
beantwoorden), dan negeren we `off_topic` (zie de `!generalKnowledgeActive`-conditie in
3.2) en valt de vraag in het normale pad — anders zouden we de toggle tegenspreken.
Voor de normale klant-bot (toggle uit, de default) → off-topic-fallback. Eén conditie.

### 3.6 Label/metric

Lost zichzelf op voor de off-topic-case: het wordt een echte `kind:'fallback'`, dus het
gesprek toont vanzelf "Onbeantwoord" en telt mee in de Behulpzaam-ratio. Geen wijziging
in `conversations.ts` nodig voor deze melding.

## 4. Drempels & tunables

- **Off-topic-bevestiging** gebruikt de bestaande antwoord-drempel
  (`aboveThreshold`, ~0.4): leeg = bevestigd off-topic. Geen nieuwe drempel nodig in de
  eerste versie. (Optionele verfijning later: een strengere vloer voor de off-topic-
  *bewoording*, en daaronder/erboven de generieke fallback — bewust uit V1-scope
  gehouden voor eenvoud.)
- Alles staat achter `preProcessOffTopicDetection`, dus 0 effect op andere versies.

## 5. Te wijzigen files

- `lib/v0/server/rag.ts` — `PreProcessResult` union, `parsePreProcessOutput`,
  `offTopicSuspected`-afleiding + HyDE-forceer-uit + off-topic-tekst op de
  zero-hits-fallback-emit.
- `lib/v0/server/bots.ts` — `preProcessOffTopicDetection` op `BotConfig` + per-versie
  defaults (aan op v0.10).
- Pre-processor-promptsjabloon (in `bots.ts` of `persona.ts`, waar `preProcessSystem`
  staat) — derde actie + voorzichtige instructie + history-regel.
- `eval-fixtures/seed-questions*.json` — een handvol expliciete off-topic-cases
  toevoegen (zie §6).
- Geen migratie (puur config/logica).

## 6. Testplan — eval-regressie (gratis hard-eval)

Doel: bevestigen dat off-topic nu correct weigert **én** dat geen enkele in-scope vraag
omklapt naar een onterechte weigering.

1. **Hard-eval (`eval:hard:run`, gratis: deterministisch + Claude-judge)** op v0.10
   vóór en ná de wijziging. Vergelijk:
   - De bestaande in-scope set mag **niet** dalen (geen nieuwe over-refusals).
   - De out-of-corpus / off-topic cases (bv. `acme-out-of-corpus-*`) moeten nu een
     echt refusal-event geven.
2. **Nieuwe off-topic-cases** toevoegen aan de seed-fixtures: "2+2", weer, een vraag
   over een ander bedrijf, een code-vraag — met `expectsRefusal: true`.
3. **Over-refusal-controle:** een paar randgevallen die *lijken* op off-topic maar
   in-scope zijn (bv. een prijs/rekenvraag die wél over het bedrijf gaat) moeten
   beantwoord blijven worden — dit is de kerncheck tegen false positives.
4. Cache wissen vóór de run (in-place promptwijziging → stale hits vermijden):
   `v0-clear-org-cache.mjs <slug> --apply` per org.

Acceptatie: off-topic-cases → refusal; **0 regressie** op de in-scope set; de
randgeval-in-scope-vragen blijven beantwoord.

## 7. Risico's & mitigaties

- **False positive (kern-zorg):** in-scope vraag wordt off_topic genoemd.
  → Laag 1 (corpus-veto): goed-gedekte vraag wordt altijd beantwoord. Voorzichtige
  prompt + history-regel. Eval-poort §6 punt 3.
- **HyDE-uit kost een legitieme rescue:** een zwak-gedekte in-scope vraag die de
  classifier tóch off_topic noemt verliest de HyDE-boost en valt terug.
  → Conservatieve classifier flag deze zelden; eval vangt regressie. Acceptabel.
- **Promptwijziging raakt smalltalk/search-balans:** derde optie kan classificatie van
  bestaande gevallen verschuiven.
  → Hard-eval vóór/ná dekt dit; flag-gated zodat terugdraaien triviaal is.

## 8. Out of scope

- Algemene dashboard-label/metric-sync met de eval-`isRealRefusal`-definitie voor
  in-scope `kind:'answer'`-weigeringen (aparte PR).
- Off-topic-bewoording-vloer / tiered fallback-wording.
- Wijzigingen aan HyDE-gedrag buiten de off-topic-suspected query.

## 9. Beslissingen (vastgelegd 2026-06-13)

1. **Versie:** flag **in-place op v0.10**.
2. **Copy:** **bestaande** `OFF_TOPIC_REFUSAL`-tekst houden ("Ik help met vragen
   rondom {scope}. Wat wil je weten?").
3. **`generalKnowledgeEnabled`-respect:** **meenemen** (§3.5) — orgs met de toggle aan
   beantwoorden algemene vragen i.p.v. weigeren.
