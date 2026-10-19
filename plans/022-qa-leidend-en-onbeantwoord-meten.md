# 022 — Q&A leidend in V1 en "onbeantwoord" eerlijk meten

**Status:** PLAN (19 okt 2026), niets gebouwd. Per fase akkoord van Sebastiaan.
**Bron:** het nachtonderzoek van 19 okt (onderwerpen "onbeantwoorde vragen → kennisbank" en "kennisbankquiz",
plus de completeness-critic), daarna in de bron nagelopen tegen `main` @ `5fa22b4`. Regelnummers hieronder
komen uit die eigen reads.
**Waarom apart:** deze vijf punten raken het RAG-gedrag van V1-productie, `query_log` (datamodel) of het
kostenbeleid. Ze vallen dus onder "plan voorleggen" of "eerst eval-bewijs" (AGENTS.md, hard rule 8), en
daarom zijn ze vannacht niet gebouwd.

---

## 0. Samenvatting en aanbeveling

**Het probleem in één alinea.** Als een klant in het dashboard een Q&A opslaat ("vraag X = antwoord Y"),
belooft het dashboard dat de chatbot dat antwoord voortaan geeft. In V1-productie klopt dat maar half. De Q&A
wordt alleen als gewone tekst in de kennisbank gezet, en het taalmodel herformuleert hem, of verliest hem van
een oudere websitepagina die iets anders zegt. Twee mechanismen die precies dit oplossen bestaan al in de
gedeelde RAG-engine en staan in V0 en in de publieke demo aan, maar V1 zet ze niet aan:
1. de **Q&A-snelweg** (*fast-path*): lijkt de vraag sterk genoeg op een Q&A, dan gaat het letterlijke antwoord
   direct terug, zonder zoeken en zonder taalmodel (gratis en snel);
2. de promptregel **"Q&A is leidend"**: bij tegenstrijdige bronnen volgt het model de Q&A.

Daarnaast telt het dashboard "onbeantwoord" te smal: alleen harde fallbacks, terwijl de vaste
weiger-teksten van de engine en zachte weigeringen ontbreken. Tegelijk telt het te breed, want de eigen
testvragen van de klant tellen mee als bezoekersvragen.

> **Begrippen.** *Fallback* = het vaste antwoord "daar heb ik geen informatie over", zonder LLM-call.
> *Eval* = een meetronde waarin we de bot een vaste set vragen stellen en de antwoorden laten beoordelen.
> Dat kost geld, want de bot en de beoordelaar draaien op betaalde API's. *Migratie* = een
> SQL-bestand dat de databasestructuur wijzigt (bijvoorbeeld een kolom toevoegen). *Answer-cache* = opgeslagen
> antwoorden die de bot hergebruikt bij dezelfde vraag; na een gedragswijziging moet je die legen ("purgen"),
> anders blijft de bot oude antwoorden geven. *Jaccard* = een simpele overlapmaat tussen twee woordenlijsten
> (0 = niets gemeen, 1 = dezelfde woorden).

**Aanbeveling (zelf gekozen, niet vastgelegd): bouw in deze volgorde, en begin met fase A en B.**

| Volgorde | Fase | Wat | Waarom eerst/later |
|---|---|---|---|
| 1 | **A** | PII uit Q&A-vragen + prefill niet meer via de URL (item 4) | AVG-gat, geen eval, geen migratie, klein. Laaghangend fruit. |
| 2 | **B** | Q&A-snelweg + "Q&A is leidend" aan in V1 (item 1) | Grootste productwaarde: de belofte in het dashboard wordt waar. Eén eval van ±$10-30. |
| 3 | **C** | Eén migratie op `query_log`: `channel` + `answer_outcome` (items 2 en 3) | Eén prod-gate voor twee kolommen. Vóór D, want D leest ze. |
| 4 | **D** | Dashboards lezen `channel` en `answer_outcome` (items 2 en 3) | Maakt de tellers eerlijk. Geen eval. |
| 5 | **E** | Zachte weigeringen meetellen (item 2, deel 2) | Pas nadat de herkenning op echte data gevalideerd is (bekende landmijn). |
| 6 | **F** | Kostenbeleid buiten de chat (item 5) | Klein, en vooral een besluit. Zie hieronder: het meeste telt al mee. |

**De reden in één zin:** fase B levert het meeste op (elke Q&A van een klant werkt dan echt) en kan zonder
migratie, en fase A is een AVG-fix van een paar uur. De meetverbeteringen (C-E) horen bij elkaar en krijgen
één migratie, zodat Sebastiaan maar één keer een prod-wijziging hoeft goed te keuren.

**Correctie op het nachtonderzoek (zelf nagelopen).** De critic schreef dat "testchat" en "Toon wat de bot nu
antwoordt" buiten het EUR-dagbudget vallen. Dat klopt niet. Beide lopen via `askV1`, die eerst
`checkOrgChatGates` draait (`app/v1/app/actions.ts:52-57`) en daarna de kosten logt in `query_log.cost_eur`
(`app/v1/app/actions.ts:143-153`), en dat is precies de kolom die het budget optelt
(`lib/v1/limits/usage-limits.ts:99-120`). Buiten het budget vallen alleen de quiz (bewust,
`app/v1/admin/quiz/actions.ts:7-9`), de embeddings van ingest/crawl en de embeddings van de FAQ-cron. Een
admin-testchat bestaat in V1 nog niet (in `app/v1/admin/**` is geen `askV1`- of chat-aanroep te vinden).

---

## 1. Besluiten die Sebastiaan moet nemen

Per besluit staat mijn aanbeveling erbij, met de reden.

| # | Besluit | Aanbeveling | Reden |
|---|---|---|---|
| B1 | Was het weglaten van `manualQAItems` in V1 bewust? | **Nee, behandelen als vergeten.** Aanzetten (fase B). | Het kernel-plan van 25 juni noemt het veld wél als input (`docs/superpowers/plans/2026-06-25-v1-pr1a-kernel-graduatie.md:197`), maar er is nooit een V1-aanroeper aan gekoppeld. Ik vond nergens een besluit om het weg te laten. De commentaarregel in de demo ("In echt V1 wordt een Q&A ge-ingest en vindt de RAG-pipeline hem", `lib/voorbeeld/qa-match.ts:2-3`) beschrijft hoe het nu werkt, niet waarom. |
| B2 | Snelweg ook in een lopend gesprek (als er al eerdere berichten zijn)? | **Nee, alleen bij de eerste vraag van een gesprek.** "Q&A is leidend" geldt wel altijd. | De snelweg kijkt alleen naar de losse vraag, niet naar het gesprek ervoor (`lib/rag/run-rag-query.ts:1534-1535`). Een korte vervolgvraag kan dan op een Q&A matchen die over iets anders ging. In een gesprek vangt de promptregel het al af. |
| B3 | Snelweg alleen met woordovereenkomst (Jaccard, gratis) of ook met een kleine classifier zoals de demo (gpt-4o-mini, ~$0,0001 per vraag, +0,3-0,6 s)? | **Eerst alleen Jaccard.** De classifier later, als een eval laat zien dat er veel parafrases gemist worden. | Jaccard kost niets en geeft geen extra wachttijd. Een gemiste match valt gewoon terug op de normale route, waar "Q&A is leidend" helpt. De classifier zou elke vraag van elke org met Q&A trager maken. |
| B4 | Aanzetten voor alle V1-orgs tegelijk, of per org een schakelaar? | **Voor iedereen tegelijk, met één constante in `app/v1/app/rag-config.ts`.** | Er zijn weinig orgs in de soft-launch. Terugdraaien kan dan door één regel om te zetten. Een schakelaar per org vraagt een migratie, en die is hier niet nodig. |
| B5 | Tellen dashboard-tests mee voor de **vragenlimieten** (250/dag, 2000/mnd) en het **EUR-vangnet**? | **Ja, beide blijven alles tellen.** Alleen de *statistieken* (onbeantwoord, top-vragen, FAQ, recap, status "live") tellen dan nog uitsluitend het widgetkanaal. | Limieten en budget zijn een kostenrem, en een test kost net zoveel als een bezoekersvraag. Statistieken moeten juist laten zien wat bezoekers doen. |
| B6 | Bestaande `query_log`-rijen terug labelen (*backfill*) als dashboard-test? | **Ja, met de vuistregel `ip_hash is null` vanaf de eerste rij die wél een `ip_hash` heeft**, plus de demo-org als `demo`. | `askV1` logt altijd `ipHash: null` (`app/v1/app/actions.ts:151`). De widgetroute zet hem bijna altijd (`app/api/v1/chat/route.ts:180`). Vóór migratie V1-0007 had geen enkele rij een `ip_hash`, daarom de ondergrens. De fout in de vuistregel blijft klein en eenmalig. |
| B7 | Mag fase E een **read-only** steekproef van `query_log`-antwoordteksten op V1-prod lezen om de weigerherkenning te valideren? | **Ja, maar alleen als tellingen via SQL, plus maximaal 100 geredigeerde antwoorden die Sebastiaan zelf labelt.** Niets naar de Claude-API-judge. | Plan 016 zegt: echte bezoekersgesprekken pas na de soft-launch naar Anthropic (E6). Zo blijft dat principe overeind, en toch meten we op echte data. |
| B8 | Kosten van quiz, ingest en crawl in het **EUR-dagbudget** (item 5)? | **Nee. Wel zichtbaar maken per org in de admin (maandkosten).** | Het dagbudget is een rem op *bezoekers*verkeer. Telt een hercrawl of quiz van de eigenaar mee, dan kan die de widget voor bezoekers dichtzetten ("daglimiet bereikt"), en dat is precies verkeerd. De bedragen zijn ook klein: een quiz kost < $0,03 (recon-meting), een crawl van 50 pagina's ruwweg $0,01-0,02 aan embeddings. De echte rem hoort per actie (cooldown + plafond per run), zie fase F. |
| B9 | Q&A-vraag altijd server-side door `redactPii`, of alleen als hij uit bezoekerstekst komt? | **Altijd op de vraag, nooit op het antwoord.** | De server weet niet betrouwbaar waar de tekst vandaan komt (de client kan dat vervalsen). Een eigenaar die zijn eigen nummer in een *vraag* zet, verliest niets, want het antwoord blijft ongemoeid. |
| B10 | Snelweg in V1 met een strengere matcher (geen snelweg bij ontkenning of ander vraagwoord), of de gedeelde matcher zoals hij is? | **Strenger, als opt-in parameter die alleen V1 aanzet** (§3.1). | De huidige matcher geeft "Kan ik niet pinnen?" een score van 1,0 tegen "Kan ik pinnen?", en de snelweg heeft geen LLM-controle. Opt-in houdt V0 en de demo byte-identiek. Een gemiste snelweg kost niets, want de promptregel vangt hem op. |

---

## 2. Huidige situatie (met bewijs)

### 2.1 Item 1: Q&A-snelweg en "Q&A is leidend" staan uit in V1

- De engine heeft de input `manualQAItems?: ManualQA[]` (`lib/rag/run-rag-query.ts:1361`).
- **Snelweg**: `lib/rag/run-rag-query.ts:1534-1571`. Dit is het allereerste pad, vóór de voorbewerking, de
  cache en de embeddings. Bij een match met `findMatchingManualQA` (Jaccard ≥ 0,6, `lib/rag/manual-qa.ts:92`,
  `99-118`) volgt `answer-done` met het letterlijke antwoord, de bron "Handmatige Q&A", `totalCostUsd: 0`, en
  dan `return`.
- **"Q&A is leidend"**: `lib/rag/run-rag-query.ts:2679-2682`. Die regel wordt alleen voor de prompt gezet als
  `manualQAItems.length > 0`. Orgs zonder Q&A houden dus een byte-identieke prompt.
- **V1 geeft niets door.**
  - Het widgetpad `prepareV1WidgetChat` roept `runRagQuery` aan zonder `manualQAItems`
    (`app/v1/app/widget-chat.ts:147-168`).
  - `askV1` (dashboard-testchat en "Toon wat de bot nu antwoordt") doet hetzelfde
    (`app/v1/app/actions.ts:80-100`).
- **Wel doorgegeven:**
  - V0 (`app/api/v0/chat/route.ts:358-404`, en de V0-testpagina `app/v0/klantendashboard/test/actions.ts:74`);
  - de publieke demo (`app/api/voorbeeld/chat/route.ts:186-201`, via `lib/voorbeeld/qa-match.ts:68-110`:
    eerst Jaccard, daarna gpt-4o-mini, en de kosten tellen mee voor het dagbudget). De demo gedraagt zich voor
    Q&A dus beter dan het product.
- V1-Q&A staat in de tabel `org_qa_items`, met org en chatbot NOT NULL, RLS met alleen een SELECT-policy en
  zonder unieke vraag (`supabase/migrations-v1/0013_v1_qa_items.sql:26-61`). Bij opslaan gaat hij ook als
  document `metadata.origin='manual_qa'` de kennisbank in, en wordt de cache gepurged
  (`app/v1/app/kennisbank/qa/qa-actions.ts:128-143`, `175-179`).
- **Valkuil in de snelweg: linkbeleid.** De klant-fallbacktekst wordt bewust van markdown-links ontdaan
  (`lib/rag/run-rag-query.ts:1392-1399`), maar het snelweg-antwoord (`1534-1571`) gaat niet door de
  link-sanitizer. Een `[tekst](url)` die de klant in een Q&A-antwoord typt, zou zo ongefilterd naar de widget
  gaan. Dat raakt hard rule 9 (geen bronlinks in V1, Linkknoppen alleen via `sanitizeLinksOnRequest`).
- **Cache:** de snelweg zit vóór de cache, dus een Q&A wint altijd van een gecachet antwoord. De promptregel
  verandert de prompt voor orgs met Q&A, dus hun bestaande cache-antwoorden zijn gemaakt zonder die regel.
  Gecachet worden alleen echte antwoorden (`lib/rag/run-rag-query.ts:3499-3522`, volgens het nachtonderzoek).

### 2.2 Item 2: wat telt als "onbeantwoord"

- Klanttellers kijken alleen naar `kind='fallback'`:
  - de sidebar telt rijen in 30 dagen (`lib/v1/dashboard/shell-counts.ts:43-49`);
  - het overzicht doet een maandscan (`lib/v1/dashboard/metrics.ts:116-123`).
- `gap_kind` wordt al gelogd (`lib/rag/log-query.ts:154-157`; kolom en index in
  `supabase/migrations-v1/0002_v1_rag_core.sql:164,183-184`). De enige lezer is de admin-pagina
  bot-prestaties (`lib/v1/admin/bot-performance.ts:218-221`). LATEST v0.15 erft `knowledgeGapLogging` via
  spread (`lib/v0/server/bots.ts:1904-1905`).
- **Wat `gap_kind` níet onderscheidt:**
  - `low_grounding` betekent soms "vervangen door een vaste weigertekst" en soms "opnieuw gegenereerd, met een
    prima antwoord":
    - de deterministische hard-fact-weigering staat in `lib/rag/run-rag-query.ts:3204-3243`;
    - de weigering bij een overgenomen naam uit eerdere berichten in `3157-3185`;
    - de LLM-regenerate die ook `low_grounding` of `low_confidence` krijgt in `3340-3357`.
  - Het onderscheid zit alleen in `extras.deterministicHardFactRefusal` en `extras.adoptedHistoryEntities`, en
    die komen niet in een kolom terecht.
  - `kind` blijft in al deze gevallen `answer`, dus de klant ziet deze weigeringen nooit als onbeantwoord.
- **Off-topic** (`gap_kind='off_topic'`, `kind='fallback'`, `lib/rag/run-rag-query.ts:2376-2386`) telt nu
  wél mee als onbeantwoord, terwijl je die juist níet via de kennisbank moet oplossen.
- **Zachte weigeringen** ("dat staat niet in mijn informatie", binnen een gewoon antwoord) hebben geen signaal.
  Herkenners bestaan alleen voor evals (`looksLikeRefusal`, `looksLikeHardRefusal`, `isRefusalForCalibration`
  in `lib/rag/hard-eval-checks.ts:152-182`). Landmijn: de over-refusal-maat bleek onbetrouwbaar
  (vals-positief op een contact-CTA), dus zo'n herkenner eerst op echte data valideren.

### 2.3 Item 3: dashboard-testvragen tellen als bezoekersvragen

- `askV1` logt naar `query_log` met `ipHash: null` en zonder kanaalveld (`app/v1/app/actions.ts:139-153`).
  `logRagQuery` kent geen kanaal (`lib/rag/log-query.ts:31-83`, `91-104`).
- Lezers die daardoor vervuild raken:
  - de onbeantwoord-, top- en verhoudingsscan in `lib/v1/dashboard/metrics.ts:116-123`;
  - de FAQ-snapshot in `lib/v1/dashboard/faq.ts:273-294` (filtert alleen op `from_cache`);
  - de sidebar-teller in `shell-counts.ts:43-49`;
  - de chatbotstatus "live" bij "ooit verkeer", waardoor één test de bot al "live" maakt
    (`shell-counts.ts:84-106`);
  - de admin-tellers in `lib/v1/admin/overview.ts:266-274` en de maandrecap naar de klant in
    `lib/v1/admin/recap.ts:169-290`.
- De limieten en het budget tellen ook alles mee (`lib/v1/limits/chat-gates.ts:102-135`). Volgens B5 is dat
  gewenst.
- Kanaal afleiden uit `ip_hash is null` is broos: `hashIp` geeft `null` als er geen IP is
  (`lib/observability/hash-ip.ts:9-10`). Als blijvende oplossing deugt het dus niet, als eenmalige backfill
  wel (B6).

### 2.4 Item 4: PII in Q&A-vragen en in de URL

- De vraag van een bezoeker gaat letterlijk in de URL:
  - `qaHref()` in `app/v1/app/gesprekken/_conversation/format.ts:31-34`, gebruikt in
    `conversation-view.tsx:36` en `conversation-actions.tsx:61`;
  - de overzichtskaart in `app/v1/app/page.tsx:60` en `245-247`.
- De kennisbankpagina leest `prefillQuestion` uit de URL (`app/v1/app/kennisbank/page.tsx:22-27`) en
  `qa-tab.tsx` vult het formulier ermee (`app/v1/app/kennisbank/qa/qa-tab.tsx:42-55`). Een telefoonnummer of
  e-mailadres van de bezoeker belandt zo in de browsergeschiedenis en in de request-logs van Vercel.
- `upsertQAItemAction` redigeert niets en zet de vraag óók in de bestandsnaam van het document:
  `qa-<40 tekens>.txt` (`app/v1/app/kennisbank/qa/qa-actions.ts:98-99`, `130-137`).
- Het quizpad redigeert wél (`app/v1/app/quiz/actions.ts:98-103`), met `redactPii`
  (`lib/observability/redact.ts:10-26`). Die vangt e-mail, IBAN, telefoon en BSN, maar **geen namen**.
- De Q&A-kopie in de kennisbank valt buiten elke retentie: V1 kent nog geen retentie voor chatinhoud
  (`lib/v1/observability/retention.ts:5-9`).

### 2.5 Item 5: welke AI-kosten vallen buiten het dagbudget

| Kostenpost | Telt nu mee in het EUR-dagbudget? | Bewijs |
|---|---|---|
| Widgetchat | ja | `app/api/v1/chat/route.ts:180-190` |
| Dashboard-testchat en "Toon wat de bot nu antwoordt" | **ja** (gate + `cost_eur`) | `app/v1/app/actions.ts:52-57,143-153`; `current-bot-answer.tsx:38` |
| Demo, inclusief de Q&A-classifier | ja (demo-org) | `app/api/voorbeeld/chat/route.ts:186-188,242-250` |
| Quizgeneratie (gpt-4o-mini/4o + embeddings) | nee, bewust | `app/v1/admin/quiz/actions.ts:7-9`; kosten in `v1_quiz.*_cost_usd` (`lib/v1/quiz/data.ts:311-312`) |
| Ingest/crawl-embeddings | nee, nergens per org opgeslagen | `lib/rag/ingest.ts:135-136` geeft `costUsd` terug; `lib/v1/crawler/processCrawl.ts:157-163` telt op, maar slaat niet op |
| FAQ-snapshot-cron (embeddings) | nee; staat in `klant_faq_snapshot.embed_cost_usd` | `lib/v1/dashboard/faq.ts:302-311,335` |
| Admin-testchat | bestaat nog niet | in `app/v1/admin/**` geen chat-aanroep |

De admin-gebruikspagina toont al de totale OpenAI-kosten op accountniveau (`app/v1/admin/usage/page.tsx:12`).
Wat ontbreekt is de verdeling per org.

### 2.6 Wat er vannacht al gebouwd wordt

De nacht-worktrees (`chatmanta-nacht-*`) stonden bij het schrijven nog allemaal op `5fa22b4` en hadden geen
wijzigingen. Het nachtonderzoek markeerde wel als "vannacht bouwbaar": de cache-purge na een quizantwoord, het
uitfilteren van off-topic, een gedeelde helper voor "onbeantwoord", eerst-ingest-dan-uitzetten bij Q&A, en het
verbergen van Q&A-documenten. **Check bij de start van fase D** of de nachtbouw (`feat/seb/snelle-verbeteringen`)
die helper geleverd heeft. Zo ja, dan bouwt D daarop voort. Zo nee, dan maakt D hem zelf. Twee
"onbeantwoord"-definities naast elkaar is precies het probleem dat we oplossen.

---

## 3. Ontwerp

### 3.1 Fase B: Q&A in V1 (item 1)

**Aan- en uitzetten, op één plek** in `app/v1/app/rag-config.ts`, naast `V1_OVERRIDES`:

```ts
/** V1-Q&A-gedrag (plan 022). 'off' = zoals vóór 022 (alleen als kennisbank-chunk). */
export const V1_MANUAL_QA: {
  mode: 'off' | 'authority-only' | 'fastpath+authority';
  fastPathFirstTurnOnly: boolean; // B2
} = { mode: 'fastpath+authority', fastPathFirstTurnOnly: true };
```

Bewust **geen** veld in `RagConfig`/`BotConfig`: het is V1-bedrading en geen botversie. V0-versies blijven
daardoor onaangeroerd (append-only-regel).

**Kleine engine-uitbreiding** (`lib/rag/run-rag-query.ts`): één optionele input `manualQAFastPath?: boolean`,
standaard `true`. Met `false` slaat de engine stap 0 (`1534-1571`) over, maar zet hij de promptregel wel
(`2679-2682`). Standaard `true` betekent dat V0 en de demo byte-identiek blijven. Dit is nodig voor de modus
`authority-only` (eval-arm, en de eerste uitrolstap als de eval twijfelachtig is) en voor B2.

**Laden:** één nieuwe helper `loadActiveV1QAItems(client, orgId, chatbotId)` (bijvoorbeeld in
`lib/v1/dashboard/qa.ts` of naast `qa-actions.ts`):
- `select id, question, answer, category, active, updated_at, ingested_document_id from org_qa_items where
  organization_id=… and chatbot_id=… and active=true order by updated_at desc limit 200`. De index
  `org_qa_items_org_chatbot_created_idx` (0013:44-45) dekt org+chatbot.
- Mappen naar `ManualQA` (`lib/rag/types.ts:536-546`).
- Fail-open: bij een DB-fout `[]`, dus hetzelfde gedrag als nu.
- **Linkbeleid in de wrapper, niet in de engine:** `answer` gaat altijd door `stripMarkdownLinks`
  (`lib/rag/source-links.ts:86-89`). Een Q&A-antwoord krijgt in V1 dus nooit een klikbare link, ook niet bij
  Linkknoppen. Wie een link wil, krijgt die via het normale pad met de sanitizer. Hard rule 9 blijft zo
  ongemoeid. *Kale URL's (nagelopen bij de review):* de widget-renderer maakt alleen markdown-links klikbaar
  (`INLINE_RE` en `loneLink` in `lib/widget/render-markdown-lite.tsx:161-165,236-269`). Een kale URL blijft
  platte tekst, dus strippen is niet nodig. Dit is wel een **harde voorwaarde in de DoD van B1**: een
  unit-test bewijst dat een Q&A-antwoord met een markdown-link én met een kale URL na loader + render geen
  `<a>` en geen linkknop oplevert, ook met `linkButtons: true` (org met `link_buttons_enabled`). Gaat de
  renderer later kale URL's linken, dan breekt deze test.

**Snelweg-guard tegen valse matches (V1-only, opt-in).** De matcher haalt `niet` en alle vraagwoorden
(`wat/wie/waar/wanneer/hoe/waarom/welke/welk`) als stopwoord weg (`lib/rag/manual-qa.ts:31-39`). Daardoor
scoort "Kan ik niet pinnen?" tegen de Q&A "Kan ik pinnen?" een Jaccard van 1,0, en "Waar kan ik parkeren?"
tegen "Wanneer kan ik parkeren?" ook. Zonder LLM-controle krijgt de bezoeker dan letterlijk het verkeerde
antwoord. De oplossing:
- `findMatchingManualQA` krijgt een optionele parameter `options?: { strict?: boolean }`, standaard uit. V0 en
  de demo blijven zo byte-identiek. Het gedeelde matcher-gedrag verandert dus niet stil.
- Met `strict: true` geldt: **geen snelweg** als een ontkenning (`niet`, `geen`, `nooit`, `zonder`, en voor
  Engels `not`, `no`, `never`) in precies één van de twee teksten staat, of als de vraagwoorden van de twee
  teksten verschillen. De Jaccard-drempel zelf blijft 0,6.
- De engine krijgt daarvoor naast `manualQAFastPath` één optionele input `manualQAStrictMatch?: boolean`
  (standaard `false`). V1 zet hem altijd op `true`.
- Een gemiste snelweg is geen fout: de vraag gaat dan de normale route, waar "Q&A is leidend" de Q&A in de
  prompt nog steeds laat winnen.

**Aanroepen:**
- `prepareV1WidgetChat` laadt de items in de bestaande `Promise.all` (`app/v1/app/widget-chat.ts:107-111`). Het
  eval-pad gaat door dezelfde functie, dus de eval meet automatisch wat productie doet.
- `askV1` doet hetzelfde onder de session-client (RLS SELECT), zodat preview en widget gelijk blijven. Ze delen
  de cache, zie het commentaar in `actions.ts:59-60`.
- Doorgeven: `manualQAItems: mode === 'off' ? undefined : items` en
  `manualQAFastPath: mode === 'fastpath+authority' && (!fastPathFirstTurnOnly || history.length === 0)`.

**Taal:** komt een vraag deterministisch niet-NL binnen (`detectLanguage`, `lib/rag/hard-eval-checks.ts`,
al geïmporteerd in `run-rag-query.ts:44`) terwijl de org `primaryLanguage='nl'` heeft, dan geen snelweg.
Anders krijgt een Engelstalige bezoeker een letterlijk Nederlands antwoord. De promptregel blijft wel gelden.

**Telemetrie:** een snelweg-hit heeft `sources[0].filename` = "Handmatige Q&A…" en `totalCostUsd=0`. Fase C
maakt dat expliciet: `answer_outcome='qa_direct'`.

**Kosten van de feature zelf:** $0 per vraag (Jaccard), één extra geïndexeerde SELECT per beurt. Bij een hit
**bespaart** het juist de LLM- en embed-kosten van die vraag.

**AVG en SA-1:** geen nieuwe data. `orgId`/`chatbotId` komen uit de gesigneerde slug (widget) of de sessie
(askV1), nooit van de client. De Q&A-vraag zelf gaat niet naar de bezoeker, alleen het antwoord. Wel staat
`contentExcerpt: qa.question` in `sources` (`run-rag-query.ts:1557-1561`), en dat kan in de transcriptie
belanden. Fase A redigeert de vraag al bij opslaan.

**Cache-purge na de uitrol:** voor elke V1-chatbot met ≥1 actieve Q&A eenmalig `purgeAnswerCache(svc, org,
chatbot)` (`lib/rag/ingest.ts:200-223`; die bumpt ook de epoch). Dat gaat via een klein script
`scripts/v1-purge-answer-cache.ts` met `--dry-run` (toont alleen het aantal per org) en daarna `--apply`.
Het is een prod-write, dus eerst akkoord in de chat. Orgs zonder Q&A hoeven niet, want hun prompt is
byte-identiek. Het script gebruikt `getV1ServiceRoleClient` (net als `scripts/v1-reindex.ts`), want
`answer_cache` is onder RLS alleen leesbaar.
- **Timing:** tussen de productie-deploy en de purge serveren orgs met Q&A nog gecachete antwoorden die
  zonder de regel "Q&A is leidend" gemaakt zijn. Daarom is "`--apply` direct na de groene productie-deploy"
  een vaste stap in de merge-checklist van B3 (akkoord voor die prod-write vóór de merge vragen, zodat er geen
  wachttijd zit tussen deploy en purge). De snelweg zelf zit vóór de cache, dus directe Q&A-treffers werken
  al meteen.
- **FAQ-pre-cache (nagelopen bij de review):** de landmijn "answer_cache is ook de opslag van de FAQ-pre-cache"
  geldt alleen voor **V0** (`precacheTopN` in `lib/v0/server/faq-snapshot.ts`, aangeroepen uit
  `app/actions/faq.ts`). De V1-FAQ-snapshot (`lib/v1/dashboard/faq.ts`) schrijft niets naar `answer_cache`. De
  purge laat in V1 dus geen FAQ-antwoorden wegvallen, en een cron-trigger na de purge is niet nodig.

### 3.2 Fase C: één migratie op `query_log` (items 2 en 3)

Het nummer kies je met `/check-migration`. Het laatste is V1-0037; andere plannen van vannacht (bijvoorbeeld de
koppeling van contactverzoeken aan een gesprek) kunnen 0038 ook claimen.

```sql
-- 00NN_v1_query_log_channel_outcome.sql
-- Kanaal (wie stelde de vraag) + uitkomst (kreeg de bezoeker echt antwoord) op query_log.
-- Geen nieuwe tabel → bestaande RLS (SELECT org-leden, writes service-role) dekt de kolommen.
alter table public.query_log
  add column if not exists channel text not null default 'widget',
  add column if not exists answer_outcome text,
  add column if not exists outcome_rule_version smallint;

alter table public.query_log
  add constraint query_log_channel_chk
    check (channel in ('widget','dashboard_test','admin_test','demo')) not valid,
  add constraint query_log_answer_outcome_chk
    check (answer_outcome is null or answer_outcome in (
      'answered','qa_direct','fallback','off_topic','refused_grounding','soft_refusal','smalltalk'
    )) not valid;
alter table public.query_log validate constraint query_log_channel_chk;
alter table public.query_log validate constraint query_log_answer_outcome_chk;

-- Dashboards filteren voortaan op channel='widget' binnen org+chatbot+tijd.
create index if not exists query_log_org_chatbot_channel_idx
  on public.query_log (organization_id, chatbot_id, channel, created_at desc);

-- Backfill (B6): askV1 logde altijd ip_hash=null; vóór 0007 had niemand een ip_hash.
update public.query_log set channel = 'dashboard_test'
 where ip_hash is null
   and created_at >= (select min(created_at) from public.query_log where ip_hash is not null);
update public.query_log set channel = 'demo'
 where organization_id = (select id from public.organizations where slug = 'voorbeeld-duinhoeve');
```

- *Waarom `not null default 'widget'`:* een kolom met een constante default toevoegen is in Postgres alleen een
  metadata-wijziging, zonder herschrijven van de tabel. Het risico "nieuwe aanroeper vergeet het kanaal" dekken
  we in TypeScript af: `channel` wordt een **verplicht** argument van `logRagQuery`, dus een vergeten
  aanroeper geeft een compileerfout.
- *Waarom `not valid` + `validate`:* zo blokkeert de controle de tabel niet lang. Bij de huidige omvang maakt
  het weinig uit, maar het is de nette vorm.
- *Hard rules:* geen nieuwe tabel, dus regels 2 en 3 zijn al gedekt. Het kanaal wordt **altijd server-side
  bepaald** (de widgetroute zet `'widget'`, askV1 `'dashboard_test'`, de demoroute `'demo'`), nooit uit de
  request-body. Er gaan geen secrets of PII in de nieuwe kolommen (rule 7/10).
- De slug van de demo-org staat al publiek in de code (`lib/voorbeeld/constants.ts:4`), dus hij mag in de
  migratie.

**`answer_outcome` berekenen**, in `logRagQuery` (`lib/rag/log-query.ts`) als pure functie
`deriveAnswerOutcome(response)` met unit-tests:

| Volgorde | Voorwaarde | outcome |
|---|---|---|
| 1 | `kind='smalltalk'` | `smalltalk` |
| 2 | `kind='fallback'` en (`gapKind='off_topic'` of `reason` begint met `OFF_TOPIC`) | `off_topic` |
| 3 | `kind='fallback'` | `fallback` |
| 4 | snelweg-hit (nieuw `extras.manualQAHit=true`, gezet in `run-rag-query.ts:1550-1567`) | `qa_direct` |
| 5 | `gapKind='off_topic'` op een answer (code-guard, `3373-3384`) | `off_topic` |
| 6 | `extras.deterministicHardFactRefusal` of `extras.adoptedHistoryEntities?.length` | `refused_grounding` |
| 7 | (fase E, na validatie) herkenner zegt zachte weigering | `soft_refusal` |
| 8 | anders | `answered` |

`outcome_rule_version` = 1 tot fase E, daarna 2. Zo kun je oude en nieuwe tellingen uit elkaar houden.
Punt 4 vraagt één extra veld in `extras` van het snelweg-antwoord. Dat verandert geen gedrag, het is alleen
telemetrie.

*Open punt voor fase 0:* bij een cache-hit ontbreken de extras-vlaggen misschien. Dan valt een gecachete
deterministische weigering terug op `answered`. Fase 0 checkt of vervangende teksten gecachet worden. Zo ja,
dan als fallback de vaste weigertekst herkennen (die staat letterlijk in `3206-3207`).

### 3.3 Fase D: lezers (items 2 en 3)

Eén gedeelde definitie in een nieuwe helper (of in de helper van de nachtbouw, zie §2.6):

> **Onbeantwoord** = `channel='widget'` én `answer_outcome in ('fallback','refused_grounding')` (later ook
> `'soft_refusal'`). `off_topic` telt **niet** mee. Voor rijen zonder `answer_outcome` (van vóór de migratie)
> geldt `kind='fallback' and coalesce(gap_kind,'') <> 'off_topic'`.

Wat er per lezer verandert:
- `metrics.ts`, `shell-counts.ts` (onbeantwoord-teller én de "live"-status), `faq.ts` (snapshot) en
  `recap.ts` (rapport voor de klant) filteren op `channel='widget'`.
- `overview.ts` en `bot-performance.ts` (admin) krijgen de keuze widget / alles, met widget als standaard.
- Kosten en limieten (`usage-limits.ts`) blijven ongefilterd (B5).
- De demo-kopie in `app/voorbeeld/(dashboard)` gebruikt dezelfde lib-functies. Werkt de demo-org met
  `channel='demo'`, dan moet de demo `'demo'` lezen, anders worden de demo-tellers leeg. *Die check hoort in
  de DoD van fase D.*

### 3.4 Fase E: zachte weigeringen (item 2, deel 2)

1. Fase 0 en 0-bis (zonder kosten, B7): een SQL-telling op V1-prod (`kind='answer'`, laatste 30 dagen,
   `channel='widget'`) van hoe vaak de kandidaat-herkenner raakt. Daarna maximaal 100 treffers en 100
   niet-treffers geredigeerd (`redactPii`) exporteren naar een lokaal, gitignored bestand. Sebastiaan labelt
   ze: "weigering ja/nee".
2. De herkenner wordt de eval-functie `isRefusalForCalibration(answer, 'answer')`
   (`hard-eval-checks.ts:176-182`): een harde weigermarker, of een zachte marker plus een niet-substantieel
   antwoord (< 240 tekens). Hij wordt dan **niet** gekopieerd maar gedeeld, en blijft een pure functie.
3. **Poort:** precisie ≥ 90% op de labels (van wat hij "weigering" noemt, is ≥ 90% het echt). Haalt hij dat
   niet, dan blijft `soft_refusal` uit en tonen we hem hoogstens in de admin als "twijfelachtig".
4. Pas na de poort: `outcome_rule_version=2`, en `soft_refusal` gaat mee in "onbeantwoord".

### 3.5 Fase A: PII en prefill (item 4)

- **Redactie bij opslaan:** `upsertQAItemAction` doet `q = redactPii(input.question)` vóór alles. Dat geldt
  voor de vraag in de DB, in de chunktekst en in de bestandsnaam (`qa-actions.ts:98-99,132-134`). Het
  antwoord blijft ongemoeid (B9). Hetzelfde geldt voor het toggle-pad (`qa-actions.ts:268-291`), dat ook
  ingest.
- **Prefill via id in plaats van tekst:**
  - nieuwe parameters `?tab=qa&fromQuery=<query_log-uuid>` (overzichtskaart) en `?fromMessage=<thread_message-uuid>`
    (gesprekspaneel);
  - de server-page leest de rij onder de **session-client** (RLS) én met een expliciete
    `.eq('organization_id', orgId).eq('chatbot_id', chatbotId)`. Dat is de SA-1-objectcheck: een id van een
    andere org levert niets op;
  - de UUID wordt eerst gevalideerd, en de gevonden vraag gaat door `redactPii` vóór hij in het formulier komt.
- De overzichtskaart groepeert op vraagtekst (`metrics.ts:307-309`). Neem per groep de **nieuwste** `query_log.id`
  mee in het resultaat, zodat de link een id heeft.
- **Waarschuwing in de UI:** komt het formulier uit een bezoekersvraag, dan één regel boven het vraagveld: "Deze
  vraag komt van een bezoeker. Haal namen en andere persoonsgegevens weg." Namen vangt `redactPii` niet, dus
  de klant blijft hier de laatste controle.
- **Overgang:** `prefillQuestion` wordt één release lang nog gelezen, maar dan geredigeerd. Daarna gaat hij
  weg. `qaHref()` wordt `qaHrefFromMessage(id)`.
- **Demo:** `app/voorbeeld/(dashboard)/kennisbank` heeft een eigen kopie met alleen fictieve data. Daar
  verandert niets, maar dit gaat als bewuste uitzondering in de PR, zodat de kopieën niet ongemerkt uit elkaar
  groeien.
- **Bestaande rijen:** de redactie bij opslaan geldt alleen voor nieuwe opslagen. Bestaande `org_qa_items`-vragen,
  hun kennisbank-chunks ("Vraag: …") en de bestandsnamen `qa-<40 tekens>.txt` kunnen al PII bevatten. Na fase B
  gaat de vraag bovendien als `sources[].contentExcerpt` mee de transcriptie in. Daarom:
  - fase 0 (f): een read-only telling op V1-prod van het aantal actieve en inactieve Q&A-vragen waarvan
    `redactPii(question) !== question`. Alleen het aantal, geen inhoud;
  - is dat aantal > 0, dan een eenmalig script `scripts/v1-redact-qa-questions.ts` (via
    `getV1ServiceRoleClient`) met `--dry-run` (aantal per org) en `--apply`. Dat redigeert de vraag, ingest het
    Q&A-document opnieuw (nieuwe chunktekst en bestandsnaam, oude document weg) en purget de cache van die
    chatbot. Het is een prod-write, dus eerst akkoord in de chat. Het moet klaar zijn vóór B3 live gaat.
- *Wat dit niet oplost:* PII die al in browsergeschiedenis en Vercel-logs staat (die verloopt vanzelf met de
  logretentie van Vercel), namen in vragen, en het ontbreken van een retentietermijn voor Q&A-tekst. Dat laatste
  is klantcontent die de eigenaar zelf beheert (verwijderen kan in het dashboard). Een retentieregel hoort bij
  de algemene V1-retentie voor chatinhoud (`lib/v1/observability/retention.ts:5-9`), niet in dit plan.

### 3.6 Fase F: kosten buiten de chat (item 5)

Uitgaand van B8 (niet in het dagbudget):
1. **Zichtbaarheid (S, geen migratie):** de admin-usage-tab per org (`app/v1/admin/organizations/[id]/_tabs/usage-tab.tsx`)
   toont "Overige AI-kosten deze maand": de som van `v1_quiz.analyse_cost_usd + generation_cost_usd` en
   `klant_faq_snapshot.embed_cost_usd`. Ingest- en crawlkosten worden nu nergens per org bewaard. Dat blijft
   bewust zo tot er een betalende klant is: het gaat om centen, en het account-totaal staat al op de
   usage-pagina.
2. **Regel voor nieuwe AI-acties** (in `docs/AGENT_LANDMIJNEN.md`):
   - *door de bezoeker of klant uitgelokt* gaat via `checkOrgChatGates` + `logRagQuery` met het juiste
     `channel`;
   - *door de eigenaar of admin uitgelokt* krijgt een eigen cooldown en een USD-plafond per run, en logt zijn
     kosten in de eigen tabel. Voor de geplande websitescan-quiz stelt het nachtonderzoek een plafond van
     $0,25 per run voor.
3. **Een admin-testchat**, als die er komt, gebruikt het `askV1`-patroon met `channel='admin_test'`, telt mee in
   het EUR-vangnet, maar *niet* in de vragenlimieten van de klant. Dat laatste vraagt één `.neq('channel','admin_test')`
   in `countQuestionsSince` (`usage-limits.ts:199+`), en kan pas ná fase C.

*Als Sebastiaan B8 andersom beslist* (wél in het dagbudget): komt er een tabel `v1_org_spend_event`
(organization_id NOT NULL + FK, `source` CHECK, `cost_usd`/`cost_eur`, RLS aan met alleen een SELECT voor
Jorion-admins en writes via service-role, in dezelfde migratie). `sumQueryLogCostEurSince` telt die tabel dan
mee. Grootte M. Ik raad het af om de reden bij B8.

---

## 4. Fasering

| Fase | Inhoud | Grootte | Gate | Kosten |
|---|---|---|---|---|
| **0** | Verificaties (geen code): (a) ~~linkt de V1-widget kale URL's?~~ beantwoord bij de review: nee (§3.1), wordt een DoD-test van B1; (b) worden vervangende weigerteksten gecachet? (c) hoeveel actieve Q&A per V1-org (read-only telling)? (d) heeft de nachtbouw een "onbeantwoord"-helper? (e) erft LATEST `knowledgeGapLogging=true`? (f) hoeveel bestaande Q&A-vragen bevatten PII (read-only telling, §3.5)? | S | akkoord voor de prod-leesacties (c) en (f) | $0 |
| **A** | PII-redactie Q&A-vraag + prefill via id + UI-waarschuwing (§3.5); zo nodig het redactiescript voor bestaande rijen | S/M (±6 bestanden) | geen (geen datamodel en geen RAG). Het script = akkoord in de chat (prod-write). "Plan voorleggen" bij twijfel over de demo-kopie | $0 |
| **B1** | Engine-opties `manualQAFastPath` + `manualQAStrictMatch`, strikte matcher-guard (opt-in), loader, `V1_MANUAL_QA`, wrapper-aanroepen, link-strip, taalcheck; unit-tests | M | plan voorleggen (raakt V1-RAG) | $0 |
| **B2** | Eval (§5.1) op V1-eval-orgs | M | **akkoord in de chat** (billable) | raming $10-30, harde cap $40 |
| **B3** | Merge + cache-purge-script (dry-run vóór de merge, apply direct na de groene prod-deploy) | S | **akkoord in de chat** (merge + prod-write, samen gevraagd) | $0 |
| **C** | Migratie `channel` + `answer_outcome` + backfill; `logRagQuery` met verplicht `channel`; `deriveAnswerOutcome` + tests; `extras.manualQAHit` | M | **plan voorleggen** (datamodel) → daarna zelf `npm run migrate:v1` | $0 |
| **D** | Lezers op de gedeelde definitie (§3.3); demo-check; admin-keuze widget/alles | M | geen | $0 |
| **E** | Validatie zachte weigering (B7) → zo nodig `outcome_rule_version=2` | S/M | akkoord voor de prod-leesactie | $0 API |
| **F** | Overige AI-kosten in de usage-tab + landmijn-regel (§3.6) | S | geen | $0 |

**Volgorde en afhankelijkheden.** A en B kunnen parallel, in aparte worktrees. C moet vóór D, E en het
admin-testchat-deel van F. Plan 013 (prompt-injectiegrens) wijzigt dezelfde `userPrompt`-regel
(`run-rag-query.ts:2702`). Wie als tweede landt, rebaset, en de eval van 013 moet dan mét Q&A-orgs draaien.

**Definition of Done per fase** (bovenop AGENTS.md: typecheck, build, PR-template):
- A: Playwright opent het overzicht, klikt op "Antwoord geven", ziet in de URL geen vraagtekst en ziet het
  formulier gevuld met `[telefoon]` op de plek van het nummer.
- B: unit-tests op de loader (fail-open, link-strip), op de render (Q&A-antwoord met markdown-link en met kale
  URL geeft geen `<a>` en geen linkknop, ook met `linkButtons: true`), op de strikte guard (negatie, ander
  vraagwoord; zonder `strict` byte-identiek aan nu) en op de snelweg-beslissing (eerste beurt, taal). Eval
  groen volgens §5.1. Na de merge een rooktest via de echte widget op een testorg: een Q&A-vraag geeft het
  letterlijke antwoord.
- C: `npm run migrate:v1:status` schoon, en een SQL-check dat elke nieuwe rij het juiste kanaal heeft
  (dashboard-test → `dashboard_test`).
- D: de tellers van een testorg vóór en na één dashboard-test zijn gelijk.

---

## 5. Eval-plan, risico en kosten per item

### 5.1 Item 1 (Q&A in V1): de enige echte eval

| Laag | Wat | Hoe | Kosten |
|---|---|---|---|
| E-QA-0 | **Matcher-fixture** (deterministisch) | ±80 vraagparen in een unit-test: bijna-letterlijk (moet matchen), ander onderwerp met dezelfde woordvorm (kat/hond, pinnen/geldautomaat: mag níet), negatie ("kan ik níet pinnen"), ander vraagwoord met dezelfde rest ("waar" tegen "wanneer kan ik parkeren"), korte vervolgvragen, Engels. Draait met `strict: true` (zoals V1) én tegen een lijst van 200 Q&A-items (het V1-maximum van de loader), niet alleen tegen losse paren. Poort: **0 valse matches** op de categorieën "ander onderwerp", "negatie" en "ander vraagwoord". Gemiste parafrases zijn toegestaan. | $0 |
| E-QA-1 | **Conflict-set** | Op 2 fictieve V1-eval-orgs (`lib/evals/eval-orgs.ts`) per org 15 Q&A zetten, waarvan ±8 in strijd met de gecrawlde tekst (andere openingstijd of prijs). 40 vragen die de Q&A *parafraseren* (dus geen Jaccard-match, alleen de promptregel telt) + 20 direct. Drie armen: `off` / `authority-only` / `fastpath+authority`, 2 runs. Scoring **deterministisch**: komt het Q&A-feit (bedrag, tijd) als string in het antwoord voor, en het oude feit niet? Alleen twijfelgevallen gaan naar de judge. | bot ≈ 360 Luna-calls ≈ $1; judge ≤ 40 calls ≈ $2-4 |
| E-QA-2 | **Regressie** (de promptregel verandert de prompt voor elke vraag van een org met Q&A) | ±100 gewone vragen (E2-tune-split van plan 016) + ±40 veiligheidscases (E1) op dezelfde eval-orgs mét Q&A. Arm `off` tegen `fastpath+authority`, 1 run, Opus 5.5-judge via Batches, beslisregel en non-inferioriteit volgens plan 016 §4. | ≈ 280 judge-calls ≈ $8-20 |

**Slaagcriterium:** E-QA-0 is groen. In E-QA-1 volgt `fastpath+authority` het Q&A-feit in ≥ 90% van de
gevallen, en is hij aantoonbaar beter dan `off` (gepaarde toets per vraag). In E-QA-2 is er geen
veiligheidsregressie en is hij niet slechter dan `off` op kwaliteit.
**Plan B:** is E-QA-1 goed maar E-QA-2 twijfelachtig, dan eerst uitrollen met `mode: 'authority-only'`. Is
E-QA-1 voor `authority-only` alleen marginaal, dan eerst de snelweg (die verandert de prompt niet).
**Kosten totaal:** raming **$10-30**, cap $40. Het Anthropic-budget wordt gedeeld met andere sessies
($100/maand, plan 016), dus vóór de run de ledger (`lib/evals/ledger.ts`) checken.
**Cache:** het eval-pad zet de cache altijd uit (`widget-chat.ts:139-147`). Een `v0:clear-cache` is dus niet
nodig. Wel na de merge de V1-purge uit §3.1.

**Risico's van item 1:**
- *Valse match*: een bezoeker krijgt een letterlijk antwoord op een net andere vraag. De drempel 0,6 is in V0
  afgesteld op lijsten van minder dan 20 items (`lib/rag/manual-qa.ts:10-19`). V1 laadt er tot 200, en hoe
  langer de lijst, hoe groter de kans dat één item toevallig de drempel haalt. Afgedekt door de strikte guard
  (§3.1), door E-QA-0 tegen een lijst van 200 items, en door B2 (alleen bij de eerste beurt). De drempel blijft
  0,6, maar E-QA-0 is wél de kalibratie voor V1. Faalt de poort, dan gaat de drempel omhoog (met dat
  fixture-bewijs, hard rule 8), niet de poort omlaag.
- *Linklek*: afgedekt door de link-strip in de wrapper (§3.1).
- *Verouderde of foute Q&A van de klant wint nu altijd*: dat is precies het beloofde gedrag, maar het betekent
  ook dat een tikfout in een Q&A letterlijk naar de bezoeker gaat. Accepteren: het is de inhoud van de klant.
- *Geen vervolgvraag-knoppen bij een snelweg-antwoord* (de engine stopt vóór de follow-ups). Accepteren.
- *Gedrag van V1-productie verandert in één keer*: terugdraaien met één regel (`mode: 'off'`) en een redeploy.

### 5.2 Item 2 (zachte weigeringen en vervangingen meetellen)

- **Eval:** geen LLM-eval nodig, want het botgedrag verandert niet. Wel validatie van de herkenner (§3.4,
  precisie ≥ 90% op ±200 handmatige labels) en unit-tests op `deriveAnswerOutcome` voor alle takken van de
  tabel in §3.2.
- **Kosten:** $0 API. Ongeveer 1 uur labelwerk van Sebastiaan.
- **Risico:** het onbeantwoord-getal van de klant stijgt zichtbaar zodra `refused_grounding` meetelt (de bot
  "lijkt slechter"). Zet dat in de release-notitie: "we tellen nu eerlijker". Vals-positieven van de herkenner
  vervuilen de werklijst, en daarvoor is de poort.
- **Volgorde:** C (kolom + deterministische takken) → D (lezen) → E (zachte herkenner).

### 5.3 Item 3 (kanaal-kolom)

- **Eval:** geen. Tests: unit (verplicht argument, mapping per aanroeper), plus een SQL-controle na de migratie.
  `v1:test-org-isolation` hoeft niet te wijzigen (geen nieuwe tabel), maar draai hem wel.
- **Kosten:** $0.
- **Risico's:**
  - *backfill mislabelt* een paar widgetrijen zonder IP als test. Klein en eenmalig (B6);
  - *demo-tellers worden leeg* als de demo `'widget'` blijft lezen (§3.3);
  - *een vergeten nieuwe aanroeper* van `logRagQuery` wordt afgedekt door het verplichte argument.
- **Volgorde:** C → D.

### 5.4 Item 4 (PII)

- **Eval:** geen (de Q&A-chunk verandert alleen bij PII in de vraag).
- **Tests:** unit op de redactie in `upsertQAItemAction` (vraag geredigeerd, antwoord niet), plus Playwright
  (§4 DoD).
- **Kosten:** $0.
- **Risico's:**
  - *verlies van informatie*: een eigenaar die bewust een nummer in een vraag zet ("Is 020-… jullie nummer?")
    ziet `[telefoon]`. Acceptabel, want het antwoord blijft intact;
  - *SA-1 bij de id-prefill*: de expliciete org- en chatbotfilter onder de session-client is verplicht, niet
    optioneel;
  - *oude links*: één release overgang.
- **Volgorde:** als eerste (fase A).

### 5.5 Item 5 (kosten)

- **Eval:** geen.
- **Kosten:** $0.
- **Risico:** bij de aanbevolen keuze B8 geen nieuw risico. De keuze "wél in het dagbudget" heeft het risico dat
  een eigenaar met een hercrawl zijn eigen widget dichtzet. Daarom raad ik die af.
- **Volgorde:** als laatste (F). Het admin-testchat-deel kan pas na C.

---

## 6. Risico's (overkoepelend)

1. **Twee definities van "onbeantwoord"** als de nachtbouw een eigen helper levert en D er een tweede naast
   zet. Mitigatie: §2.6. D begint met een grep en breidt de bestaande helper uit.
2. **Migratienummer-botsing** met andere plannen van vannacht. Mitigatie: `/check-migration` vlak vóór het
   aanmaken (die checkt ook open PR's).
3. **Plan 013 en 022 raken dezelfde promptregel.** Mitigatie: de volgorde afspreken. De eval van wie als
   tweede landt draait met Q&A-orgs.
4. **De eval meet op fictieve orgs**, terwijl echte Q&A's korter en rommeliger zijn. Mitigatie: na de uitrol
   twee weken `answer_outcome='qa_direct'` per org volgen (dat kan pas na C), en bij verrassingen de modus
   terugzetten.
5. **De publieke repo:** fixtures en eval-Q&A's alleen met fictieve bedrijven (zoals de bestaande
   eval-orgs). Geen echte klantvragen in de testset; die horen in x8 en blijven gitignored.

---

## 7. Open vragen

1. Hoeveel actieve Q&A hebben de V1-orgs nu? Dat bepaalt hoeveel caches B3 moet purgen en hoe zichtbaar de
   wijziging is (read-only telling in fase 0, B7-achtig akkoord).
2. Moet `fastPathFirstTurnOnly` later per org instelbaar zijn, of is één globale keuze genoeg? (Mijn
   verwachting: globaal is genoeg.)
3. Wil Sebastiaan dat een snelweg-antwoord de *toon en lengte* van de chatbotinstellingen volgt? Dat vraagt een
   LLM-herformulering, en dan is het geen gratis snelweg meer. Mijn advies: nee, letterlijk is de belofte.
4. Hoort de admin-keuze "widget / alles" in bot-prestaties ook `dashboard_test` als apart filter te tonen
   (handig bij support)?
5. Moet de demo-org (`channel='demo'`) in de admin-overzichten meetellen bij "totaal verkeer", of apart?
6. Na fase E: moet `soft_refusal` ook in de quiz als gap-bron dienen (het quiz-onderzoek stelt
   "vragengeschiedenis als extra gap-bron" voor)? Dat is een apart plan.

---

## Review verwerkt (19 okt 2026)

Elke bevinding is zelf nagelopen in de code op `5fa22b4`.

| # | Bevinding | Oordeel | Wat er veranderd is |
|---|---|---|---|
| 1 | Matcher haalt `niet` en vraagwoorden weg → valse snelweg-match; drempel 0,6 is afgesteld op < 20 items, V1 laadt er 200 | **Terecht** (`lib/rag/manual-qa.ts:31-39`: "Kan ik niet pinnen?" en "Kan ik pinnen?" worden allebei `{ik, pinnen}`, Jaccard 1,0) | Strikte guard als opt-in (`strict`, `manualQAStrictMatch`, alleen V1 aan) in §3.1; nieuw besluit B10; E-QA-0-poort geldt nu ook voor negatie en ander vraagwoord, en draait tegen een lijst van 200 items; de zin "niets herkalibreren" vervangen door "E-QA-0 is de V1-kalibratie". |
| 2 | Kale URL's in een Q&A-antwoord hangen af van een open fase-0-check | **Deels terecht.** De check is nu gedaan: de widget-renderer linkt alleen markdown-links (`lib/widget/render-markdown-lite.tsx:161-165,236-269`), dus kale URL's worden geen link. Het risico is er nu niet, maar de borging ontbrak. | Fase 0 (a) is afgevinkt; de render-unit-test (markdown-link + kale URL, ook met `linkButtons: true`) is een harde DoD-eis van B1. Kale URL's strippen is niet nodig. |
| 3 | PII-redactie geldt alleen voor nieuwe opslagen; bestaande rijen, chunks en bestandsnamen houden PII | **Terecht** | Fase 0 (f): read-only telling; bij > 0 een eenmalig redactiescript (dry-run/apply, V1-service-role-wrapper, akkoord in de chat, opnieuw ingesten + purge), klaar vóór B3. Retentie voor Q&A-tekst blijft bewust buiten dit plan (klantcontent, hoort bij de algemene V1-retentie). |
| 4a | Purge wist ook de FAQ-pre-cache | **Verworpen voor V1.** De pre-cache in `answer_cache` is V0-only (`precacheTopN` in `lib/v0/server/faq-snapshot.ts`). `lib/v1/dashboard/faq.ts` schrijft niets naar `answer_cache`. | Alleen een toelichting in §3.1, zodat een volgende lezer niet dezelfde vraag stelt. Geen cron-trigger. |
| 4b | Venster tussen deploy en purge met oude cache-antwoorden | **Terecht** | `--apply` direct na de groene prod-deploy is een vaste stap in de B3-checklist; akkoord voor merge en purge wordt samen gevraagd; het script gebruikt `getV1ServiceRoleClient`. |
