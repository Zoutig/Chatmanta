# 019 — Contactaanbod in het gesprek: de bot biedt zelf contact aan, de lead komt met context binnen

**Status:** PLAN (19 okt 2026), nog niets gebouwd. Fase 0 is een ops-handeling met akkoord, fase 2 en 3
raken datamodel en auth, dus elk met een eigen go van Sebastiaan.
**Bron:** het onderzoek van 19 okt naar contactverzoeken in V1 (recon + completeness-critic + security-rapport).
Alle claims hieronder zijn opnieuw in de code nagelezen op `main` @ `5fa22b4`.
**Bouwt voort op:** de nachtbranch `feat/seb/contactverzoeken-beter` (worktree `chatmanta-nacht-contact`).
Die pakt de **consent-tekst** (bedrijfsnaam, bewaartermijn, privacylink), **Sentry bij een mislukte
notificatiemail** en **tests op de contact-route** op. Dit plan doet die dingen dus niet opnieuw. Op het
moment van schrijven stond er op die branch nog geen commit: controleer bij de start van fase 1 wat er
gemerged is en rebase daarop.

---

## Samenvatting en aanbeveling

**Het probleem in één zin:** contactverzoeken bestaan in V1, maar de bot biedt ze nooit zelf aan. Een
bezoeker ziet alleen een vaste knop "Liever persoonlijk contact?" onder elk gesprek. Bij de momenten waarop
een mens echt nodig is (de bot weet het antwoord niet, de chatbot is gepauzeerd, de limiet is op, of de
bezoeker typt "bel me terug") gebeurt er niets extra's. Komt er toch een lead binnen, dan weet de ondernemer
niet waar het gesprek over ging. En de privacyverklaring belooft "na 90 dagen verwijderd", terwijl de
opruimtaak (cron) op V1 niet draait.

**Aanbeveling: bouw het in vier kleine stappen en begin met de verwijdering (fase 0). Die stap kost geen
code, alleen het aanzetten van een pinger, en moet eerst.** Reden: alles wat daarna komt zorgt voor méér
leads. Elke lead die binnenkomt terwijl de 90-dagen-belofte niet wordt nagekomen, is een AVG-overtreding
die je publiek belooft niet te doen. Daarna:

1. **Fase 1:** de server beslist met vaste regels, zonder extra AI-aanroep (*deterministisch*: dezelfde
   invoer geeft altijd dezelfde uitkomst, gratis en testbaar), wanneer de widget het contactaanbod
   opvallend onder een antwoord zet.
2. **Fase 2:** de lead koppelen aan het gesprek, de pagina en de taal, en vastleggen welke
   toestemmingstekst de bezoeker zag. Dat vraagt een migratie (*migratie*: een genummerd SQL-bestand dat
   de databasestructuur aanpast).
3. **Fase 3:** alleen owner/admin mag het verzamelen aanzetten en exporteren.

Analogie: nu hangt er een bel bij de voordeur, maar niemand zegt "loop gerust even naar de balie" als de
receptionist het antwoord niet weet. En wie wél aanbelt, laat geen briefje achter waar het over ging.

**Wat bewust niet in dit plan staat:** AI-intentieherkenning zoals in V0 (`lib/v0/server/contact-intent.ts`,
een extra gpt-4o-mini-aanroep per antwoord). Die blijft V2, omdat hij geld kost en in de stream-sluiting
wacht. Ook niet: CRM-koppelingen, een bevestigingsmail naar de bezoeker en pakket-gating ("leads alleen in
Groei/Pro").

---

## Besluiten die Sebastiaan moet nemen

| # | Besluit | Opties | Aanbeveling + reden |
|---|---|---|---|
| **B1** | **Scope: is een actief contactaanbod V1?** De docs spreken elkaar tegen (zie §1.6). | (a) ja, de deterministische variant is V1 en de AI-variant blijft V2 · (b) nee, alles V2 | **(a).** Contactverzoeken staan al in V2_SCOPE §2a als "bewust tóch in V1 gebouwd". Het aanbod is de UX van een bestaande V1-feature: geen nieuwe tabel, geen LLM en geen kosten. De zin in `chat/route.ts:2-3` en `V1_STATUS_EN_PLAN.md:75` dateert van vóór migratie 0011 en is verouderd. Bij (a) passen we die twee docs in fase 1 aan. Valt onder hard rule 1, dus jouw expliciete go is nodig. |
| **B2** | **Retentie V1-contactverzoeken (launch-TODO #7c, bewust uitgesteld).** | (A) cron-job.org-pinger op `/api/v1/cron/retention`, eerst `?dryRun=1` · (B) aanroepen vanuit de bestaande Vercel-cron `/api/v0/cron/retention` · (C) de belofte aanpassen ("we verwijderen ze binnenkort automatisch") tot hij draait | **(A).** Het is precies het V1-patroon dat al werkt voor `process-crawls` en `faq-snapshot` (route-kop `app/api/v1/cron/retention/route.ts:6-8`). Er is geen code nodig, en een dryRun laat eerst zien wat er weg zou gaan (nu 0 rijen). (B) vermengt V0 en V1 in één route, en een V0-fout verbergt dan een V1-fout. (C) maakt een al gedane publieke belofte zwakker en lost niets op. Dit is extern en raakt prod: akkoord in de chat, daarna voer ik het zelf uit. |
| **B3** | **Op welke momenten biedt de bot contact aan?** | zie §3.1 (tabel) | Wel bij: geen-informatie-fallback, gepauzeerd, dag-/maandlimiet en contactintentie. **Niet** bij: off-topic-weigering, injectieblokkade en "het is druk" (rate-limit). Contact aanbieden op "wat is de hoofdstad van Frankrijk" voelt als spam, en bij injectie of misbruik wil je geen extra invoerkanaal openen. |
| **B4** | **Blijft de vaste knop "Liever persoonlijk contact?"?** | (a) blijft zoals nu · (b) pas na het 2e antwoord · (c) weg zodra het actieve aanbod er is | **(a) in fase 1.** Minimale wijziging. Na een paar weken echte gesprekken kijken we naar de klikcijfers (die er nu niet zijn: 0 bots hebben het aan). |
| **B5** | **Lead koppelen aan gesprek + host + taal (migratie)?** | ja / nee / alleen gesprek | **Ja, alle drie.** Zonder gesprek weet de ondernemer niet waar het over ging; dat is de grootste klacht die je kunt verwachten. Host en taal zijn gratis (de widget weet ze al). Een volledige pagina-URL valt erbuiten: zie B10. |
| **B6** | **Toestemming aantoonbaar maken.** | (a) alleen een versie-ID + taal opslaan; de tekst per versie staat in de code (en dus in de publieke git-historie) · (b) de volledige gerenderde tekst per rij opslaan | **(a) plus de bedrijfsnaam op dat moment.** Klein, en reproduceerbaar via git. (b) is sterker bewijs maar kopieert dezelfde zin duizenden keren. De server kiest de versie, de client nooit. |
| **B7** | **Rolbeperking.** Wie mag wat? | zie §3.4 | **Owner/admin:** het verzamelen aan/uit zetten, het meldingsadres wijzigen, exporteren en verwijderen. **Member:** lezen en afhandelen (oppakken, notitie). Nu heeft elke org één owner, dus niemand merkt er iets van. Het is wel de juiste grens vóór de eerste klant met een team. Raakt auth: plan voorleggen (dit plan). |
| **B8** | **Chatretentie (threads, thread_messages, query_log).** Daar draait niets voor, ook niet met de pinger aan (`retention.ts:7-9`). | (a) apart plan, nu niets · (b) nu een vaste termijn (bijv. 12 maanden) meebouwen | **(a).** De privacyverklaring belooft voor chats geen 90 dagen, maar "zolang de klant ChatManta gebruikt" (`app/privacy/page.tsx:241-245`). Er is dus geen gebroken belofte. Het staat al als open beslissing 9 in V2_SCOPE (`:158`, `:209`). Eén aandachtspunt door fase 2: een lead verdwijnt na 90 dagen, het gekoppelde gesprek niet, en daar kan de bezoeker zijn telefoonnummer óók getypt hebben. Neem dat mee in dat aparte plan. |
| **B9** | **Privacylink in de consent-tekst.** | chatmanta.nl/privacy · een nieuw veld "privacy-URL" per klant | Volg wat de nachtbranch kiest. Mijn voorkeur: de klant is verwerkingsverantwoordelijke (`app/privacy/page.tsx:229-231`), dus op termijn de URL van de klant, met chatmanta.nl/privacy als fallback. Een nieuw veld is een kleine instellingswijziging (jsonb, geen migratie). |
| **B10** | **Volledige pagina-URL meesturen?** | alleen host (zit al in `?h=`) · host + pad (loader-wijziging) | **Alleen host in fase 2.** Het pad vraagt een wijziging in `public/widget-v1.js`, die op klantsites gecachet staat. Een querystring kan PII bevatten. Pad kan later. |
| **B11** | **Daggrens op de contact-route (§3.3) nu bouwen?** Een grens per org per dag is in feite SA-6 (abuse-limits), en SA-6..14 is V2 (`V2_SCOPE_EN_PRINCIPES.md:186`, status ◐). | (a) ja, als V1-hardening onder SA-6, alleen voor de contact-route · (b) nee, wachten op SA-6 in V2 | **(a).** Het actieve aanbod vergroot het mailbom-oppervlak (security-rapport 19 okt, bevinding 5) nu, niet pas in V2. Het is klein (2 Upstash-calls, bestaande limiter) en raakt geen datamodel. Valt onder hard rule 1, dus jouw expliciete go is nodig. Na het bouwen: de SA-6-statusregel in V2_SCOPE bijwerken ("daggrens contact-route ✅"). Bij (b) gaat fase 1 zonder daggrens en blijft het risico in §5 open staan. |

---

## 1. Context: hoe het nu werkt (geverifieerd)

### 1.1 Aanzetten
- Switch "Contactverzoeken aannemen" in `/v1/app/instellingen` (`app/v1/app/instellingen/settings-form.tsx:563-573`),
  met een AVG-bevestigingsdialoog (`:618-632`). Het vlaggetje staat in `chatbots.settings` (jsonb) en staat standaard uit.
- De beschrijving belooft gedrag dat er niet is: *"Wil een bezoeker contact, dan biedt je chatbot een kort formulier
  aan"* (`:566`) en *"biedt je chatbot na zijn antwoord een kort formulier aan"* (`:624-625`).
- Opslaan: `saveChatbotSettingsAction` met `getSessionOrg` + `requireOrgMember` (`app/v1/app/instellingen/actions.ts:33-34`).
  **Elk lid** mag het, ongeacht rol.
- Momentopname V1-prod (19 okt, read-only): 0 chatbots met de toggle aan, 0 rijen in `contact_requests`.

### 1.2 Widget
- De knop staat er zodra `contactEnabled && messages.length > 0` (`app/embed-v1/[slug]/v1-widget.tsx:385-405`),
  los van wat de bot antwoordde.
- `threadIdRef` bestaat al (`v1-widget.tsx:129`), maar gaat niet mee in `submitContact` (`:214-237`).
  `consentGiven: true` wordt hard meegestuurd (`:220`).
- Het formulier stuurt `subject: null` (`app/embed-v1/_widget/contact-form.tsx:56`). Kolom, mail, kaart en export
  ondersteunen een onderwerp, maar dat wordt nooit gevuld.
- De stream-parser kent `answer-done | smalltalk | fallback | replacement | error` en negeert onbekende `kind`s
  (`v1-widget.tsx:296-322`). Een nieuw event-type is dus achterwaarts veilig.

### 1.3 Chat-route en terminale meldingen
- Gepauzeerd, limiet en injectie komen allemaal als **hetzelfde** `{kind:'fallback'}`-event
  (`app/v1/app/widget-chat.ts:27-33`). De reden (`'paused' | 'gated'`) bestaat server-side wél
  (`widget-chat.ts:50, 102, 115`), maar gaat niet mee naar de client. De client kan dus niet onderscheiden.
- De meldingsteksten verwijzen al naar contact zonder iets aan te bieden: pauze (`widget-chat.ts:35-36`), suspend
  (`lib/v1/limits/chat-gates.ts:87`), maandlimiet (`:113`).
- `gated` is een mengsel: `ORG_SUSPENDED`, `RATE_LIMITED`, `MONTHLY_LIMIT`, `BUDGET_EXHAUSTED` (`chat-gates.ts:83-129`).
  Om rate-limit uit te sluiten (B3) moet de `code` mee naar de route.
- RAG-fallbacks dragen een getypt `gapKind: 'zero_hits' | 'off_topic'` (`lib/rag/run-rag-query.ts:2380-2386, 2415-2420, 2448-2454`)
  zodra `knowledgeGapLogging` aan staat. Dat staat aan sinds v0.6 (`lib/v0/server/bots.ts:587`) en LATEST (v0.15)
  erft het via de spread-keten. **Verifieer dat in fase 1 met een test.** Het `reason`-veld is vrije tekst:
  niet op matchen.

### 1.4 Contact-route en database
- `app/api/v1/contact-request/route.ts`: rate-limit per IP (`:34`), dan token + origin-lock (`:40-44`), dan de org uit de
  gesigneerde slug (`:50-56`), dan rate-limit per org (`:61`), dan de flag fail-closed (`:77-86`), dan
  `validateContactBody`, dan een insert via service-role (`:107-118`) en daarna de mail via `after()`.
- Er zijn alleen limieten per minuut, geen daggrens. Het security-rapport van 19 okt (bevinding 5,
  "mailbom") rekent tot ~14.400 mails per dag vanaf één IP. Een actief aanbod vergroot dat oppervlak.
- `supabase/migrations-v1/0011_v1_contact_requests.sql:22-61`: `organization_id`/`chatbot_id` NOT NULL,
  `consent_given = true` als CHECK, RLS met alleen SELECT voor org-leden, geen kolom voor gesprek, consentversie,
  host of taal. De SELECT-policy filtert niet op `deleted_at`; dat staat al in **plan 012** en hoort daar te blijven.
- Gesprekken: `threads.id` = de door de client gemaakte uuid (`supabase/migrations-v1/0010_v1_conversations.sql:29-41`).
  `appendTurn` maakt de thread pas in `after()` aan, gescoped op org+chatbot (`lib/v1/conversations/write.ts:57-80`).

### 1.5 Retentie
- `runV1ContactRetention` doet een harde delete van rijen met `created_at` ouder dan 90 dagen, over alle orgs heen,
  met cutoff-guard (`lib/v1/observability/retention.ts`). Route: `app/api/v1/cron/retention/route.ts` (Bearer
  `CRON_SECRET`, `?dryRun=1`).
- **Niemand roept hem aan.** `vercel.json` kent alleen de twee V0-crons. Launch-TODO #7c is bewust uitgesteld
  (`docs/V1_LAUNCH_TODO.md:80-83`).
- Kleine bug: faalt de delete, dan logt `runV1ContactRetention` alleen (`console.error`) en geeft de route toch
  `ok: true` terug. Een pinger ziet dan nooit rood.
- De comment op `retention.ts:15-17` zegt dat de widget-consenttekst de 90 dagen "spiegelt". Dat klopt nu niet
  (`lib/v1/widget/widget-strings.ts:84`); de nachtbranch lost dat op.
- Belofte: `app/privacy/page.tsx:236-239` en de dialoog `settings-form.tsx:628-629`.

### 1.6 Scope-tegenstrijdigheid (B1)
- `app/api/v1/chat/route.ts:2-3`: "geen … contact-offer … die zijn V2".
- `docs/V1_STATUS_EN_PLAN.md:75`: "contactverzoeken/lead-capture … allemaal §1.5-V2". Dit staat in de sectie
  "V0-pariteit: bewust BUITEN V1" (`:73`), niet onder "Besliste keuzes" (`:9`), en is geschreven vóór migr 0011.
- `docs/V2_SCOPE_EN_PRINCIPES.md:36`: "Lead capture in widget → ✅ als contactverzoeken" in §2a ("bewust tóch in V1").
- De marketingsite verkoopt het al: `lib/site/pricing.ts:69` ("Contactverzoeken (leads)").
- Bronvolgorde volgens AGENTS.md: code + migraties > Besliste keuzes > V2_SCOPE. De code (0011, route, dashboard)
  zegt "V1". Wat níét beslist is: het *actieve aanbod*. Dat is B1.

### 1.7 V0 als referentie (niet hergebruiken, wel spiegelen)
- `lib/v0/server/contact-offer.ts`: een apart NDJSON-event `{kind:'contact-offer'}`, bewust buiten de
  StreamEvent-union zodat de RAG-engine en de eval-baseline byte-identiek blijven. Dat ontwerp nemen we over.
- V0 zendt het alleen na een `answer` én een positieve LLM-intentie (`app/api/v0/chat/route.ts:474-500`).
  V1 doet het omgekeerde: vaste regels en geen LLM.

---

## 2. Ontwerpprincipes

1. **De server beslist, de client toont.** Alleen de server kent de echte reden (gapKind, gate-code, de flag).
   De client krijgt alleen "toon het aanbod, reden X". Zo lekt er geen interne staat naar de browser.
2. **Geen wijziging in `lib/rag`.** Het aanbod wordt in de route ná de generator-drain bepaald, op basis van
   `finalResponse`. De RAG-engine, de V0-evals en de V1-eval blijven ongewijzigd. Er hoeft dus geen botversie
   bij en geen cache gepurged te worden.
3. **Additief op het widget-contract.** Er komt één nieuw event-type bij, en de contact-POST krijgt optionele
   velden. Een oude tab die het event niet kent, negeert het. Een oude client zonder de nieuwe velden blijft
   werken (de kolommen zijn nullable).
4. **Fail-closed op PII, fail-soft op context.** Staat de flag uit, dan komt er geen aanbod. Is de thread-id
   ongeldig of van een andere tenant, dan wordt hij stil op `null` gezet, zonder de lead te weigeren.
5. **Minimaal eerst.** Geen nieuwe tabel, geen nieuwe library, geen LLM-call.

---

## 3. Ontwerp

### 3.1 Wanneer het aanbod verschijnt (fase 1)

Een pure functie `decideContactOffer()` in `lib/v1/widget/contact-offer.ts` (nieuw, unit-getest):

| Situatie | Bron server-side | Aanbod? | Reden-code |
|---|---|---|---|
| RAG-fallback "daar heb ik geen informatie over" | `finalResponse.kind==='fallback'` + `gapKind==='zero_hits'` (vangnet: `answer === effectieve fallbacktekst`) | ja | `no_answer` |
| Deterministische hard-fact-weigering ("dat specifieke gegeven kan ik niet terugvinden … neem contact op") | `gapKind==='low_grounding'` + `extras.deterministicHardFactRefusal === true` (`run-rag-query.ts:3216-3238`) | ja | `no_answer` |
| Anti-adoptie-weigering ("ik kan X niet in onze gegevens terugvinden … neem contact op") | `gapKind==='low_grounding'` + `extras.adoptedHistoryEntities` niet leeg (`run-rag-query.ts:3157-3176`) | ja | `no_answer` |
| Claim-regenerate (tweede, voorzichtiger LLM-poging) | `gapKind==='low_grounding'` of `'low_confidence'` zonder een van de twee markers hierboven (`:3343-3356`) | **nee** | — (dit is een echt, alleen strenger antwoord; geen "weet het niet". Een aanbod hier zou bij veel gewone antwoorden verschijnen) |
| Off-topic-weigering | `gapKind==='off_topic'` | **nee** | — |
| Chatbot gepauzeerd (klant) | `chat.kind==='terminal' && reason==='paused'` | ja, **alleen voor een tab die al open stond** (zie noot) | `paused` |
| Operator-suspend | gate `ORG_SUSPENDED` | **nee** (account is dicht; geen leads innemen voor een org die niet actief is; de contact-route weigert dan ook, zie §3.3) | — |
| Maand-/daglimiet | gate `MONTHLY_LIMIT` / `BUDGET_EXHAUSTED` | ja | `limit` |
| Druk (rate-limit) | gate `RATE_LIMITED` | **nee** | — |
| Injectie geblokkeerd | `v1InjectionBlock` | **nee** | — |
| Contactintentie in de vraag | `detectContactIntentDeterministic(question)` | ja, **naast** het gewone antwoord | `intent` |
| Gewoon antwoord | — | nee (de vaste knop blijft, B4) | — |

Voorwaarden voor élk aanbod: `contactRequestsEnabled === true` (server-side gelezen, dezelfde
`getChatbotSettings` als de contact-route), en per widget-mount nog niet verzonden (client-side).

**Unit-tests op `decideContactOffer`** dekken elke rij van de tabel, dus ook beide `low_grounding`-weigeringen
(wel aanbod) en de claim-regenerate met `low_grounding`/`low_confidence` (geen aanbod).

**Noot over `paused`.** Bij `is_active=false` of een suspend rendert `load-embed` helemaal geen widget
(`lib/v1/widget/load-embed.ts:41, 52`). Het `paused`-aanbod komt dus alleen bij een bezoeker die de tab al open
had vóór de pauze (`widget-chat.ts:101-103`). Dat is zeldzaam maar goedkoop; we houden het, met die verwachting.

**Settings-read op de terminale paden.** `prepareV1WidgetChat` keert bij `paused` en `gated` terug vóór de
settings-read (`widget-chat.ts:101-116`). Voor die twee paden leest de chat-route `contactRequestsEnabled` daarom
apart (één extra `getChatbotSettings`-call, alleen op die paden). Faalt die read, dan geen aanbod (fail-closed).

**Intentieherkenning zonder LLM.** De functie `detectContactIntentDeterministic(text, locale)` is een
genormaliseerde (lowercase, accenten weg, witruimte samengevoegd) match op een korte lijst NL/EN-frasen:
- NL: `bel me`, `bel mij`, `(terug)bellen`, `teruggebeld`, `offerte`, `prijsopgave`, `afspraak (maken|inplannen)`,
  `contact (met mij )?opnemen`, `neem contact`, `(met )?een (mens|medewerker) spreken`, `iemand spreken`.
- EN: `call me`, `call back`, `quote`, `appointment`, `book a (call|meeting)`, `contact me`, `speak to (a human|someone)`.
- Een **ontkenning** binnen 3 woorden ervoor (`niet`, `geen`, `liever niet`, `don't`, `no`) maakt het `false`.
- Conservatief: bij twijfel geen aanbod. Een mis kost niets, want de vaste knop blijft.
- De vraag wordt alleen in-memory gematcht en niet gelogd. Er komt geen nieuwe opslag van de vraagtekst.
- ~40 testcases in `lib/v1/widget/__tests__/contact-offer.test.ts`, waaronder valse positieven zoals
  "wat is jullie telefoonnummer?" (geen aanbod: daar is een antwoord op), "ik wil niet gebeld worden" (geen aanbod)
  en "kan ik een afspraak maken?" (wel aanbod).

**Wire-vorm** (nieuw NDJSON-event, na het eindevent):
```json
{"kind":"contact-offer","reason":"no_answer"}
```
Meer niet: geen prefill uit de server en geen consent-tekst (die komt al uit `load-embed`, zie de nachtbranch).
- Terminale paden (`ndjsonOnce`, `chat/route.ts:126, 149`) krijgen een variant die twee regels schrijft.
- Komt de whitelist uit het security-rapport (bevinding 2) eerder of tegelijk, dan moet
  `contact-offer` (alleen `kind` + `reason`) in die whitelist.

**Widget.** Bij een `contact-offer`-event zet de client `offerReason` op die assistent-bubbel. Onder díe bubbel
komt een duidelijke CTA (één primaire knop) met een tekst per reden, in nl en en (`widget-strings.ts` +
`widget-strings.test.ts`, taalpariteit):
- `no_answer`: "Dit weet ik niet zeker. Zal iemand van {bedrijf} contact met je opnemen?"
- `paused` / `limit`: "Laat je gegevens achter, dan neemt {bedrijf} contact met je op."
- `intent`: "Wil je dat {bedrijf} contact met je opneemt?"

Klikken opent hetzelfde `ContactForm`, met het **onderwerp voorgevuld met de laatste vraag van de bezoeker**
(bewerkbaar, max 300 tekens, past binnen `contact_requests_subject_len_chk`). Daarmee is de dode
`subject: null`-flow gerepareerd (`contact-form.tsx:56`). Er verschijnt maximaal één actief aanbod tegelijk:
een nieuwer aanbod vervangt het oude.

**Demo `/voorbeeld`.** Die draait via een eigen route (`app/api/voorbeeld/chat`). Of de demo het aanbod ook krijgt,
is een aparte S-taak. Doe het wel, anders loopt de demo achter op het product (critic §B "demo-kopie").

**Docs.** In dezelfde PR: `chat/route.ts:2-3`, `V1_STATUS_EN_PLAN.md:75`, `:77` (pariteit-samenvatting) en `:99`
("Overige §1.5-V2-features: … lead-capture") en de instellingsteksten
(`settings-form.tsx:566, 624`) laten zeggen wat er werkelijk gebeurt.

### 3.2 Lead met context + aantoonbare toestemming (fase 2, migratie)

Nummer via `/check-migration` (laatste op main: `0037_v1_leads_terugbel.sql`; andere nachtbranches kunnen
er ook een claimen). Werktitel: `00NN_v1_contact_requests_context.sql`.

```sql
alter table public.contact_requests
  add column if not exists thread_id            uuid,
  add column if not exists page_host            text,
  add column if not exists locale               text,
  add column if not exists offer_reason         text,
  add column if not exists consent_text_version text,
  add column if not exists consent_org_name     text;

alter table public.contact_requests
  add constraint contact_requests_locale_chk       check (locale is null or locale in ('nl','en')),
  add constraint contact_requests_offer_reason_chk check (offer_reason is null or offer_reason in ('button','no_answer','paused','limit','intent')),
  add constraint contact_requests_page_host_len_chk check (page_host is null or char_length(page_host) <= 253),
  add constraint contact_requests_consent_ver_len_chk check (consent_text_version is null or char_length(consent_text_version) <= 40),
  add constraint contact_requests_consent_org_len_chk check (consent_org_name is null or char_length(consent_org_name) <= 200);

-- Tenant-grens óók in de DB: een lead kan alleen naar een thread van dezelfde org wijzen.
alter table public.threads
  add constraint threads_id_org_uniq unique (id, organization_id);
alter table public.contact_requests
  add constraint contact_requests_thread_fk
  foreign key (thread_id, organization_id) references public.threads (id, organization_id)
  on delete set null (thread_id);
create index if not exists contact_requests_thread_idx on public.contact_requests (thread_id) where thread_id is not null;
```
- **Multi-tenancy (rule 2):** de tabel heeft al `organization_id NOT NULL`. De samengestelde FK maakt een
  cross-tenant-koppeling onmogelijk, ook bij een bug in de app-laag. `on delete set null (thread_id)` vraagt
  PG15 of hoger; controleer de versie van V1-prod vóór het draaien (anders een trigger of alleen een app-check).
- **RLS (rule 3):** er komt geen nieuwe tabel bij, dus er zijn geen nieuwe policies nodig. Kolommen vallen onder
  de bestaande SELECT-policy. Writes blijven service-role-only.
- **Bestaande rijen:** er zijn er 0, en alle kolommen zijn nullable. De migratie is dus veilig en omkeerbaar.
- **Vóór de plan-go van fase 2:** `select version()` op V1-prod (read-only) voor de PG15-voorwaarde, en het
  nummer reserveren via `/check-migration` (lokaal, open PR's én de nachtbranches). Lokaal is `0037` nu de
  laatste, dus de werktitel wordt pas een echt nummer na die check.
- **Kosten van `threads_id_org_uniq`:** een tweede unieke index naast de PK, alleen nodig voor de samengestelde FK.
  Hij wordt alleen bijgewerkt bij een insert in `threads` (één keer per gesprek). De update per beurt
  (`write.ts:164-167`) raakt alleen `message_count`/`last_message_at`, niet `id`/`organization_id`. Verwaarloosbaar.

**Route (`app/api/v1/contact-request/route.ts`).** De body krijgt de optionele velden `threadId`, `locale`,
`offerReason` en `consentVersion`. `validateContactBody` wordt uitgebreid (uuid-regex, enum-check; een
onbekende waarde wordt `null`, niet 400).
- **SA-1 / object-level access (rule 5):** de `threadId` komt van de client. De route doet
  `select id from threads where id=$1 and organization_id=$org and chatbot_id=$bot and deleted_at is null`
  (org en bot uit het token). Komt er geen rij terug, dan wordt het `thread_id = null`. Dit is de
  `requireXxxAccess`-equivalent voor een publiek pad zonder gebruiker. De FK is het tweede slot.
- **Race:** de thread ontstaat in `after()` van de eerste chatbeurt. Een formulier wordt pas seconden later
  verstuurd, maar als de thread toch nog niet bestaat, valt hij terug op `null` (fail-soft).
- `page_host`: uit `?h=` in de iframe-URL (`v1-widget.tsx:103`), server-side genormaliseerd (lowercase, alleen
  hostname-tekens). Het is informatief en niet te vertrouwen, want een bezoeker kan het zelf invullen
  (critic A5). Gebruik het nooit als installatiebewijs.
- `consent_text_version`: de server accepteert alleen versies uit een vaste lijst in de code
  (`CONSENT_TEXT_VERSIONS` naast de consent-strings van de nachtbranch, bijv. `'2026-10-v1'`). Bij een onbekende
  versie geldt de huidige. `consent_org_name` = de `org.name` die de route al ophaalt (`:50-56`). Samen met de
  publieke git-historie kun je zo precies reconstrueren welke zin de bezoeker heeft aangevinkt (B6).
- `consentGiven` blijft verplicht `true` (DB-CHECK). De hard-true in de client (`v1-widget.tsx:220`) wordt
  vervangen door de echte checkbox-waarde, zodat de keten eerlijk is.

**Dashboard.**
- `contact-request-card.tsx`: een link "Bekijk gesprek" → `/v1/app/gesprekken/{thread_id}`. Die pagina leest al
  onder RLS, dus een member van een andere org krijgt 404. Daarnaast host, taal en een labeltje voor de reden
  ("Bot wist het antwoord niet").
- Export (`app/v1/app/contactverzoeken/export/route.ts`): kolommen host, taal, reden en een gesprekslink.
- Notificatiemail (`lib/notifications/contact-request-email.ts`): een regel "Waar ging het over" (het onderwerp)
  en een knop naar het gesprek. Geen extra PII in de onderwerpregel.

### 3.3 Contact-route: daggrens en suspend-check (fase 1)
**Daggrens (alleen bij B11 = a, en als de nachtbranch hem niet al doet).** Een actief aanbod levert meer
formulieren op, dus ook meer misbruikoppervlak. Voeg een daggrens toe via de bestaande Upstash-limiter: per org
(bijv. 50/dag) en per (org, ipHash) (bijv. 3/dag). Boven de grens krijgt de bezoeker een vriendelijke melding en
ontstaat er geen rij. Dit kost per inzending 2 extra Upstash-calls, verwaarloosbaar. De exacte getallen leg ik
vast in de PR, niet hier. Dit is V1-hardening onder SA-6; werk daarna de SA-6-status in V2_SCOPE bij.

**Suspend-check.** De contact-route (`app/api/v1/contact-request/route.ts:50-56`) leest nu alleen `id, name` en
checkt geen suspend. De vaste knop neemt dus leads aan voor een gesuspendeerde org, wat de tabel in §3.1
tegenspreekt. Fix: `suspended_at` mee selecteren en bij een gezette waarde `403` geven (fail-closed), vóór de
insert. Een klant-pauze (`is_active=false`) blijft wél leads aannemen: dat is juist het `paused`-aanbod.

### 3.4 Rolbeperking (fase 3)
- Nieuwe helper `requireOrgRole(orgId, roles: ('owner'|'admin'|'member')[])` in `lib/auth.ts`, naast
  `requireOrgMember` (`lib/auth.ts:38`). Hij leest dezelfde `organization_members`-rij plus `role`
  (CHECK `owner/admin/member` uit migr 0001).
- Toepassen op:
  - `saveChatbotSettingsAction`, alleen als `contactRequestsEnabled` of `notificationEmail` wijzigt
    (`app/v1/app/instellingen/actions.ts:33-34`); andere instellingen blijven voor elk lid;
  - de export-route (`export/route.ts:38`, nu alleen `getSessionOrg`);
  - de verwijderactie in `app/v1/app/contactverzoeken/actions.ts` (de `gateOrg` op `:31-35` krijgt een variant met rol).
- **UI:** de switch is disabled met de hint "Alleen een eigenaar of beheerder kan dit wijzigen". De export-knop
  wordt verborgen voor members. De server-check blijft leidend, de UI is alleen gemak.
- Geen migratie nodig. De Jorion-admin-paden (`/v1/admin`) houden hun eigen `requireJorionAdmin`.
- Test: een member-account in `v1:test-org-isolation` (of een unit-test op de helper met een gemockte client)
  krijgt `AUTH_FORBIDDEN` op toggle, export en verwijderen.

### 3.5 Retentie aanzetten (fase 0, B2-optie A)
1. **Codefix (S, eigen mini-PR):** `runV1ContactRetention` geeft een `error`-veld terug als count of delete faalt.
   De route antwoordt dan `500 {ok:false}`, zodat cron-job.org de job rood kleurt. Er gaat geen PII naar de response.
   Voeg een test toe op het foutpad.
2. **DryRun:** handmatig `GET https://www.chatmanta.nl/api/v1/cron/retention?dryRun=1` met de `CRON_SECRET`-header.
   Verwacht: `candidates: 0`.
3. **Pinger:** een cron-job.org-job, dagelijks 03:30, hetzelfde recept als #7b, zonder dryRun. Zet de foutmelding
   per mail aan.
4. **Docs:** werk `V1_LAUNCH_TODO.md` #7c bij naar "✅ aan sinds …" en corrigeer de comment `retention.ts:15-17`.
   Zet een regel in `docs/AGENT_LANDMIJNEN.md` § E-mail & crons: "V1-crons draaien op cron-job.org, niet in vercel.json".
5. **Buiten de DB:** notificatiemails blijven bij Resend en in de mailbox van de klant staan. Vermeld in de
   privacyverklaring §5 dat de 90 dagen voor ChatManta-opslag gelden, en dat de klant zelf over zijn mailbox gaat.
   Dat is een tekstwijziging; overleg de formulering met de nachtbranch (consent/privacy).

### 3.6 Kosten
- **LLM: $0.** Er komt geen enkele extra AI-aanroep bij. De intentiecheck is een stringmatch.
- **Infra:** +1 kleine thread-lookup per lead (fase 2), +2 Upstash-calls per inzending (daggrens), één cron-call per dag.
- **Resend:** meer mails naarmate er meer leads zijn. Dat is het doel, en de daggrens begrenst het.
- **Geen evals nodig:** `lib/rag` en de botconfig blijven ongewijzigd, dus de answer-cache hoeft niet gepurged te worden.

### 3.7 AVG-samenvatting
| Punt | Waar opgelost |
|---|---|
| 90-dagenbelofte niet nagekomen | fase 0 |
| Consent niet geïnformeerd (wie, hoe lang, link) | nachtbranch |
| Consent niet aantoonbaar | fase 2 (`consent_text_version` + `consent_org_name`) |
| Elk lid kan PII-verzameling aanzetten/exporteren | fase 3 |
| Soft-deleted rijen zichtbaar in RLS | plan 012 (niet hier) |
| Gekoppelde chat blijft langer dan de lead | B8 → apart plan chatretentie |
| Mails buiten de DB | fase 0 stap 5 (privacytekst) |

---

## 4. Fasering

| Fase | Inhoud | Grootte | Gate | Hangt af van |
|---|---|---|---|---|
| **0** | Retentie: foutpad-fix in de route (code, S) + dryRun + cron-job.org-pinger + docs | **S** | B2 + akkoord in de chat (extern/prod) | — |
| **1** | `decideContactOffer` + deterministische intentie + `contact-offer`-event + CTA per reden + onderwerp voorgevuld + nl/en-strings + suspend-check contact-route + daggrens (bij B11) + docs/instellingstekst eerlijk; optioneel demo-route | **M** (~8-10 bestanden, ~400 regels incl. tests) | B1 + B3 + B11 | fase 0 live; nachtbranch gemerged (consent-strings) |
| **2** | Migratie context/consent + route-validatie met thread-check (SA-1) + kaart/export/mail | **M** | plan-go migratie (B5, B6); vooraf PG-versie V1-prod + `/check-migration`; daarna zelf `npm run migrate:v1` | fase 1 (voor `offer_reason`) |
| **3** | `requireOrgRole` + toepassen op toggle/export/verwijderen + UI-hints + test | **S** | plan-go auth (B7) | — (kan parallel met 1/2) |
| **later** | Chatretentie threads/thread_messages/query_log | apart plan (M) | B8 | — |

Per fase de Definition of Done: `npm run verify` + `npm run build` (eerst `.next/` wissen), unit-tests op de
pure functies, en één handmatige rondgang in de widget op een testorg. Doorloop daarbij `no_answer`, `limit`
en `intent` plus de vaste knop (`paused` test je door de chatbot te pauzeren terwijl de tab al open staat; een
nieuwe pagina laadt dan geen widget meer), controleer dat een gesuspendeerde testorg `403` krijgt op de contact-route, controleer de lead in het dashboard en controleer dat de link naar het gesprek klopt.
Daarna een PR met de volledige template.

---

## 5. Risico's

| Risico | Kans | Impact | Mitigatie |
|---|---|---|---|
| Intent-regex geeft valse positieven ("afspraak" in een informatievraag) | middel | laag (een extra knop, geen popup) | conservatieve lijst + ontkenningsfilter + ~40 tests; na 2-4 weken echte gesprekken bijstellen (past bij de x8-ronde op echte gesprekken) |
| `gapKind` ontbreekt op een toekomstige botversie zonder `knowledgeGapLogging` | laag | aanbod verdwijnt stil bij no-answer | vangnet `answer === fallbacktekst` + test die LATEST controleert |
| Stream-whitelist (security bevinding 2) landt zonder `contact-offer` | middel | aanbod verdwijnt stil | in beide PR's expliciet noemen; test die de event-vorm na de whitelist controleert |
| Samengestelde FK faalt op PG-versie (`set null (col)`) | laag | migratie faalt | eerst de versie checken; fallback: gewone FK op `threads(id)` + app-check (die er toch al is) |
| Retentie-pinger verwijdert te veel | zeer laag | onomkeerbaar | cutoff-guard bestaat al + dryRun eerst + `created_at`-filter is de enige selectie (`retention.ts`) |
| Meer leads = meer mail-misbruik | middel | inbox van de klant + domeinreputatie | daggrens in fase 1 |
| Demo en product lopen uiteen | middel | verkoopbelofte klopt niet | demo-route meenemen in fase 1 (S) |
| Overlap met de nachtbranch (consent, Sentry, tests) | middel | dubbel werk/conflict | fase 1 start pas na de merge daarvan, met een rebase |

---

## 6. Open vragen

1. Moet het aanbod bij `no_answer` direct het formulier tonen, of eerst de CTA-knop? (Voorstel: knop. Een
   formulier dat zomaar openklapt voelt opdringerig en kost ruimte op mobiel.)
2. Moet het onderwerp de laatste vraag zijn, of de eerste vraag van het gesprek (`threads.first_question`)?
   (Voorstel: de laatste, omdat die het dichtst bij het contactmoment ligt.)
3. Wil Niels in het admindashboard de leads per klant alleen-lezen zien (adminrapport)? Dan volgt die weergave
   dezelfde 90-dagenlogica en dezelfde rolregels. Dat is een apart plan, maar het moet op deze kolommen aansluiten.
4. Moet "Leads" in het pakket "Start" (`lib/site/pricing.ts:96`, `leads: false`) technisch afgedwongen worden?
   Dat is billing-werk (V2_SCOPE), dus nu niet, maar de site belooft het verschil wel.
5. Een bevestigingsmail naar de bezoeker ("we hebben je verzoek ontvangen"): wel of niet? Het betekent extra
   PII-verwerking en een extra mailstroom. Voorstel: niet in V1.
6. Gaat de 90 dagen ook gelden voor de koppeling? Als een lead verdwijnt, blijft het gesprek staan. Moet de
   verwijdering van een lead het gekoppelde gesprek dan ook anonimiseren? (Hoort bij B8.)

---

## Review verwerkt (19 okt 2026)

Elke bevinding is opnieuw in de code nagelezen.

**Aangepast:**
- **`low_grounding`/`low_confidence` (deels terecht).** Klopt dat er meer "weet het niet"-paden zijn dan `zero_hits`.
  Maar alleen de twee *deterministische* weigeringen (hard-fact-weigering `:3216-3238`, anti-adoptie `:3157-3176`)
  zijn echte "neem contact op"-momenten; die krijgen nu `no_answer`. De claim-regenerate (`:3343-3356`) levert een
  echt, strenger antwoord en krijgt bewust géén aanbod. Dat deel van de bevinding ("daar maakt de bot geen antwoord")
  klopt niet. Alle rijen staan in de tabel en in de unit-tests.
- **Daggrens = SA-6 (terecht).** Nieuw besluit B11, gate van fase 1, plus SA-6-status bijwerken na de bouw.
- **`paused` (terecht).** Noot toegevoegd (alleen open tabs), de handmatige test aangepast, en de aparte
  fail-closed settings-read op de terminale paden staat er nu expliciet in.
- **Suspend (terecht).** De contact-route krijgt een `suspended_at`-check (403). Een klant-pauze blijft leads aannemen.
- **`V1_STATUS_EN_PLAN.md:99` (terecht).** Mee in de doc-correctie, samen met `:77`, die hetzelfde zegt.
- **Migratie-gate (terecht).** PG-versie en `/check-migration` zijn nu een expliciete voorwaarde vóór de plan-go van fase 2.

**Verworpen:**
- **"De extra unieke index wordt bij elke chatbeurt bijgewerkt."** Klopt niet: de update per beurt raakt geen
  geïndexeerde kolom, dus de index kost alleen iets bij de insert (één keer per gesprek). De samengestelde FK blijft.
