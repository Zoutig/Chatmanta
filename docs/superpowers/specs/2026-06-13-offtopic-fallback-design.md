# Off-topic-fallback voor de klant-bot — design

**Datum:** 2026-06-13
**Branch:** `feat/seb/offtopic-fallback`
**Status:** ontwerp, wacht op review

## 1. Probleem

Een bezoeker vroeg in gesprek `59bfbff0-…` (dakwerk-demo-org, v0.10) "Wat is 2+2".
Verwacht: een fallback dat de bot alleen helpt met vragen over het bedrijf.
Werkelijk: een wollig weiger-antwoord ("Ik kan dat specifieke gegeven niet
terugvinden … voor exacte bedragen, datums of cijfers kunt u contact opnemen") **en**
het gesprek staat in het dashboard als "Beantwoord".

### Root cause (twee samenlopende oorzaken)

1. **HyDE-ontsnapping.** De pre-processor (gpt-4o-mini, draait al bij élk bericht)
   kent maar twee uitkomsten: `smalltalk` / `search`. "2+2" werd `search`. Retrieval
   was zwak (top1Sim 0.13 < drempel 0.4), waarna **HyDE** een nepdocument verzon
   ("volgens de financiële richtlijnen … 2+2=4") en zwakke chunks nét boven de drempel
   tilde. Daardoor werd het zero-hits-pad overgeslagen en belandde de query in het
   antwoord-pad, waar de `hardFactDeterministicRefusal`-gate 'm verving door een
   weiger-template — maar met `kind:'answer'` (= "Beantwoord" in het dashboard).
2. **Algemene kennis stond AAN.** v0.10 erft `generalKnowledgeEnabled: true` (van
   v0.5; geen latere versie reset het) en de klant-widget stuurt geen toggle mee →
   `generalKnowledgeActive = true`. In die modus weigert de bot niet bij zero-hits,
   maar laat een her-classificatie kiezen tussen *algemeen beantwoorden* (met
   disclaimer) of *off-topic weigeren*. Voor een klant-support-bot wil Sebastiaan dat
   off-topic geweigerd wordt, niet beantwoord.

## 2. Doel / niet-doel

**Doel:** de klant-bot beantwoordt alleen vragen die in zijn kennisbank te gronden
zijn. Vragen die overduidelijk niets met het bedrijf te maken hebben (rekensommen,
weer, trivia, code, andere bedrijven) krijgen een nette off-topic-fallback:
*"Ik help met vragen rondom {bedrijf}. Wat wil je weten?"* — met **minimale kans dat
een échte klantvraag onterecht geweigerd wordt.**

**Niet-doel (aparte PR):**
- De algemene dashboard-label/metric-sync met de eval-`isRealRefusal`-definitie voor
  ín-scope `kind:'answer'`-weigeringen (de `deterministicHardFactRefusal`-case). Off-
  topic lost zich hier vanzelf op (wordt `kind:'fallback'` → "Onbeantwoord").
- RAG-tuning buiten off-topic-routing (thresholds, rerank, cascade).
- Per-org instelbaarheid van algemene kennis via de widget (zie §9).

## 3. Ontwerp

Twee samenhangende ingrepen, beide flag-/config-gated op v0.10:

1. **Algemene kennis UIT op v0.10** → off-topic wordt geweigerd i.p.v. beantwoord.
2. **Pre-processor krijgt een derde uitkomst `off_topic`** → vangt off-topic vóór
   retrieval, onderdrukt HyDE (de ontsnapping), en geeft de nette off-topic-tekst.
   Behandeld als *zacht* signaal met **corpus-veto**: nooit een weigering op zichzelf.

### 3.1 Algemene kennis uit op v0.10

`generalKnowledgeEnabled: false` op de `V0_10`-config. Gevolg:
`generalKnowledgeActive` is altijd false voor v0.10 → de her-classificatie-tak draait
niet meer → een vraag zonder treffer in de kennisbank wordt geweigerd. Dit geldt
consistent voor widget, admintool én de eval-paden (die de bot-config gebruiken), zodat
de eval-poort (§6) het echte klant-gedrag meet.

### 3.2 Pre-processor: derde actie `off_topic`

- v0.10 krijgt een **eigen** `preProcessSystem` (override; v0.10 erft 'm nu via de
  spread-keten van v0.5 — die mag NIET gewijzigd worden, anders schuiven oude eval-
  baselines). De nieuwe prompt = de v0.5-prompt + een derde actie `off_topic`:
  - Classificeer als `off_topic` **alleen** als de vraag overduidelijk buiten het
    vakgebied van `{{COMPANY}}` valt (rekensommen, weer, sport, trivia,
    programmeren/code, andere met naam genoemde bedrijven/producten).
  - **Bij twijfel → `search`.** Liever onnodig doorzoeken dan een echte klantvraag
    weigeren.
  - Begroetingen/dank/afscheid blijven `smalltalk`.
  - **History-bewust:** is er al gespreks-historie, wees extra terughoudend — een
    vervolgvraag als "en de prijs?" is nooit `off_topic`.
- `parsePreProcessOutput` krijgt een tak voor `ACTION: off_topic` → `{ kind: 'off_topic' }`.
- `PreProcessResult` breidt uit met `{ kind: 'off_topic' } & PreProcessTokens`.
- Malformed output blijft default `search` (fail-open richting beantwoorden).

### 3.3 Laag 1 — twee signalen moeten het eens zijn (false-positive-rem)

`off_topic` leidt **niet** direct tot een weigering. In beide orchestrators
(`runRagQuery` = eval-pad, `runRagQueryStreaming` = prod/widget-pad), na
`preProcessInput`:

```
offTopicSuspected = bot.preProcessOffTopicDetection === true && pp.kind === 'off_topic'
```

Bij `offTopicSuspected`:
1. Geen rewrite: retrieval draait op de **originele vraag**.
2. **HyDE geforceerd uit** voor deze query (de fabricatie-rescue is precies wat het
   off-topic-signaal anders ondermijnt). `runRagQuery` heeft sowieso geen HyDE; in
   `runRagQueryStreaming` wordt `hydeModeActual` op `'off'` gezet.
3. Bestaande drempel-gate:
   - **Kennisbank vindt tóch chunks boven de drempel** → classifier zat ernaast →
     **gewoon doorgaan met het antwoord-pad.** De bot beantwoordt de vraag.
   - **Retrieval leeg** → beide signalen eens → **off-topic-fallback** (§3.4).

**Garantie:** een vraag met echte treffers in de kennisbank wordt altijd beantwoord,
ongeacht wat de classifier zei. De classifier kan hooguit de *bewoording* van een
fallback veranderen, nooit een goed-gedekte vraag weigeren.

### 3.4 Hergebruik bestaande off-topic-fallback

Bij `offTopicSuspected` + lege retrieval emit de orchestrator de **bestaande**
`OFF_TOPIC_REFUSAL`-tekst (nu alleen bereikbaar via de — nu uitgeschakelde —
reclassify-tak):

```
kind: 'fallback'
gapKind: 'off_topic'   (als bot.knowledgeGapLogging aan)
answer: `Ik help met vragen rondom ${persona.offTopicScope}. Wat wil je weten?`
```

Concreet: bovenaan de `aboveThreshold.length === 0`-blokken (beide orchestrators) komt
een `offTopicSuspected`-tak die de off-topic-tekst kiest i.p.v. de generieke
`FALLBACK_MESSAGE`. Geen nieuwe response-shape, geen nieuwe `kind`.

### 3.5 Flag-gating + versie

- Nieuw veld op `BotConfig`: `preProcessOffTopicDetection: boolean` (default `false`,
  via de V0_1-basis). **Aan op v0.10**; uit op oudere versies → geen mutatie van oude
  eval-snapshots, instant terug te draaien.
- Beide ingrepen (algemene-kennis-uit + off_topic) gaan **in-place op v0.10** (precedent:
  bron-links-fix op v0.9.1), eval-gepoort (§6).
- Oude versies: hun prompt emit nooit `ACTION: off_topic` en hun flag staat uit, dus
  hun gedrag is byte-identiek. Defensief: als `pp.kind === 'off_topic'` tóch binnenkomt
  met de flag uit, behandelen we het als `search` (origineel als query).

### 3.6 Label/metric

Lost zichzelf op voor de off-topic-case: het wordt een echte `kind:'fallback'`, dus het
gesprek toont vanzelf "Onbeantwoord" en telt mee in de Behulpzaam-ratio. Geen wijziging
in `conversations.ts` nodig.

## 4. Te wijzigen files

- `lib/v0/server/bots.ts`
  - `BotConfig`: veld `preProcessOffTopicDetection`.
  - V0_1-basis: `preProcessOffTopicDetection: false`.
  - V0_10: `generalKnowledgeEnabled: false`, `preProcessOffTopicDetection: true`, en
    `preProcessSystem: V0_10_PREPROCESS_SYSTEM` (nieuwe const = v0.5-prompt + off_topic).
- `lib/v0/server/rag.ts`
  - `PreProcessResult` union + `parsePreProcessOutput` (off_topic-tak).
  - `runRagQuery`: off_topic-branch (geen rewrite) + off-topic-tekst op de
    `aboveThreshold.length === 0`-fallback.
  - `runRagQueryStreaming`: off_topic-branch + `hydeModeActual='off'` + off-topic-tekst
    bovenaan de `aboveThreshold.length === 0`-tak.
- `eval-fixtures/seed-questions*.json` — off-topic-cases toevoegen (zie §6).
- Geen migratie (puur config/logica).

## 5. Drempels & tunables

- Off-topic-bevestiging gebruikt de bestaande antwoord-drempel (`aboveThreshold`,
  ~0.4): leeg = bevestigd off-topic. Geen nieuwe drempel in deze versie.
- Alles achter `preProcessOffTopicDetection` + de v0.10-config → 0 effect op andere
  versies.

## 6. Testplan — eval-regressie (gratis hard-eval)

Doel: bevestigen dat off-topic correct weigert, dat geen in-scope vraag omklapt naar een
onterechte weigering, én dat de algemene-kennis-uit-wijziging geen in-scope antwoorden
breekt.

1. **Hard-eval (`eval:hard:run`, gratis: deterministisch + Claude-judge)** op v0.10
   vóór en ná de wijziging (expliciet `--versions=v0.10`; cache wissen vooraf met
   `v0-clear-org-cache.mjs <slug> --apply` per org).
   - In-scope set mag **niet** dalen (geen nieuwe over-refusals).
   - Out-of-corpus / off-topic cases (bv. `acme-out-of-corpus-*`) moeten nu een echt
     refusal-event geven.
2. **Nieuwe off-topic-cases** in de seed-fixtures met `expectsRefusal: true`: "2+2",
   weer, een vraag over een ander bedrijf, een code-vraag.
3. **Over-refusal-controle:** een paar randgevallen die *lijken* op off-topic maar
   in-scope zijn (bv. een prijs/rekenvraag die wél over het bedrijf gaat) moeten
   beantwoord blijven — de kerncheck tegen false positives.
4. Optioneel handmatig: `v0:chat` (worktree heeft `.env.local`) op "Wat is 2+2" →
   verwacht de off-topic-fallback met `kind:'fallback'`.

Acceptatie: off-topic-cases → refusal; **0 regressie** op de in-scope set; de
randgeval-in-scope-vragen blijven beantwoord.

## 7. Risico's & mitigaties

- **False positive (kern-zorg):** in-scope vraag → off_topic genoemd.
  → Laag 1 corpus-veto: goed-gedekte vraag wordt altijd beantwoord. Voorzichtige prompt
  + history-regel. Eval-poort §6 punt 3.
- **HyDE-uit kost een legitieme rescue:** een zwak-gedekte in-scope vraag die de
  classifier tóch off_topic noemt verliest de HyDE-boost en valt terug.
  → Conservatieve classifier flag deze zelden; eval vangt regressie. Acceptabel.
- **Algemene-kennis-uit verandert breder gedrag:** de bot stopt met álle niet-gegronde
  algemene/aangrenzende vragen beantwoorden. Voor een klant-support-bot is dat het
  gewenste anti-hallucinatie-gedrag (expliciet door Sebastiaan gekozen), maar het is
  breder dan alleen 2+2 — de eval-poort maakt het effect zichtbaar.
- **Promptwijziging raakt smalltalk/search-balans.** → hard-eval vóór/ná; flag-gated.

## 8. Out of scope

- Dashboard-label/metric-sync voor in-scope `kind:'answer'`-weigeringen (aparte PR).
- Off-topic-bewoording-vloer / tiered fallback-wording.
- HyDE-gedrag buiten de off-topic-suspected query.

## 9. Beslissingen (vastgelegd 2026-06-13)

1. **Algemene kennis:** **UIT op v0.10** voor de klant-bot (off-topic weigeren i.p.v.
   beantwoorden). Vervangt de eerdere "respecteer de toggle"-richting, die achterhaald
   bleek toen v0.10 standaard met algemene kennis AAN draaide.
2. **Versie:** beide ingrepen **in-place op v0.10**.
3. **Copy:** **bestaande** `OFF_TOPIC_REFUSAL`-tekst houden.
4. **Strengheid classifier:** **voorzichtig** ("bij twijfel → search").
5. **Per-org instelbaarheid** van algemene kennis via de widget: **niet nu** (zou
   plumbing van een per-org setting door de widget vergen; out of scope).
