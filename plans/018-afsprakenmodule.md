# 018 — Afsprakenmodule in de chatbot (per klant aan/uit)

**Status:** PLAN (19 okt 2026), niets gebouwd. **Geblokkeerd op besluit B0 hieronder.**
**Grootte totaal:** fase 1 = S/M, fase 2 = M, fase 3 = L/XL (V3).
**Raakt:** widget-API-contract, `chatbots.settings` (jsonb), bij fase 2 een V1-migratie, AVG (bezoekers-PII).

> ⚠️ **Scope-grens (hard rule 1).** `docs/V2_SCOPE_EN_PRINCIPES.md:106-107` zet
> "Reserveringen, afspraken (Cal.com/Calendly/Google Calendar)" onder **V3: action layer**.
> Dit plan wordt dus **pas gebouwd nadat Sebastiaan expliciet besluit (B0) om een deel naar
> voren te halen**. Zonder dat besluit blijft dit document backlog.

---

## 0. Samenvatting en aanbeveling

**Wat is het probleem?** Veel bezoekers van een MKB-site willen niet alleen een antwoord,
ze willen *iets regelen*: "Kan ik donderdag langskomen voor een APK?", "Heeft de kapper
zaterdag plek?". De chatbot kan nu alleen tekst geven plus (als de klant het aanzet) een
passieve knop "Liever persoonlijk contact?". Het moment waarop de bezoeker het meest
gemotiveerd is, laten we liggen.

**Drie manieren om dat op te lossen** (uitgewerkt in §3):

| | Wat de bezoeker ziet | Wie plant echt | Bouwtijd | Risico |
|---|---|---|---|---|
| **A. Doorverwijzen naar de eigen planner** | Knop "Afspraak maken" die de bestaande online agenda van de klant opent (Salonized, Calendly, Onlineafspraken.nl, ...) | De tool die de klant al heeft | S (±2-3 dagen) | Laag |
| **B. Aanvraag met voorkeursmoment** | Kort formulier "wanneer past het je?" (uitbreiding van contactverzoeken); de klant belt/mailt terug om te bevestigen | De ondernemer zelf, handmatig | M (±1 week) | Middel (meer PII) |
| **C. Echte boeking via agenda-API** | Vrije tijden kiezen in de chat, direct bevestigd, mail + annuleerlink | ChatManta, via OAuth op de agenda van de klant | L/XL (4-8 weken + onderhoud) | Hoog |

**Aanbeveling: bouw eerst A als V1.x-feature (per klant aan/uit), daarna eventueel B, en laat C in V3.**

Waarom, in gewone taal:
1. **De klant heeft meestal al een planner.** Een kapper werkt met een salonsysteem, een
   fysiopraktijk plant in het patiëntsysteem (EPD), een garage in een werkplaatsplanner. Die
   tools kennen de echte bezetting (stoel, monteur, brug, behandelkamer). Wij zien alleen een
   Google- of Outlook-agenda: een "vrij" uur daar is bij een garage nog geen vrije brug.
   Optie C zou dus juist bij onze doelgroep vaak *verkeerde* tijden tonen.
2. **A voegt geen nieuwe gevoelige gegevens toe.** De bezoeker typt zijn naam in de planner
   van de klant, niet bij ons. Wij hoeven geen OAuth-sleutels te bewaren en worden geen
   verwerker van afspraakdata.
3. **A past in wat er al is.** Er is al een patroon voor "per klant aan/uit + een knop in de
   widget" (Linkknoppen, migr V1-0031) en al een plek voor URL-instellingen
   (`contactPageUrl` in `chatbots.settings`). Alleen een kleine org-migratie (vlag +
   goedgekeurde URL, patroon 0031).
4. **C maakt de chatbot een "doener".** Dan kan een prompt-injectie (verborgen tekst op een
   website, zie plan 013) niet alleen een raar antwoord geven, maar ook een afspraak in een
   echte agenda zetten. Dat risico hoort pas bij V3, met plan 013 eerst gebouwd.

*Uitleg van twee begrippen:* **OAuth** = de "inloggen met Google"-knop waarmee een klant ons
toestemming geeft om in zijn agenda te kijken; wij krijgen dan een sleutel (token) die we
veilig moeten bewaren, zoals een reservesleutel van iemands huis. **Widget-API-contract** =
de afspraak tussen de widget op de klantsite en onze server over welke gegevens heen en weer
gaan; wijzigingen daaraan moeten achterwaarts compatibel zijn met al geïnstalleerde widgets.

---

## 1. Besluiten die Sebastiaan moet nemen

| # | Besluit | Aanbeveling | Waarom |
|---|---|---|---|
| **B0** | **Halen we (een deel van) afspraken naar voren uit V3?** Zo ja: welk deel. **En: krijgt hard rule 9 (geen bronlinks) een tweede, expliciete uitzondering voor deze knop?** | **Ja, alleen A** als V1.x, **met een vastgelegde rule-9-uitzondering**. B pas na een echte klantvraag. C blijft V3. | A is laag risico, geen nieuwe PII, en je kunt het in een paar dagen aan testklanten laten zien. Maar A zet een externe, níet-gecrawlde URL (bijv. `salonized.com`) in de widget; de enige huidige uitzondering op rule 9 (Linkknoppen) staat alleen URL's van de eigen gecrawlde site toe. Dat is dus een tweede uitzondering, geen "eigen lezing". Vastleggen in `V2_SCOPE_EN_PRINCIPES.md` §2a **én** in de tekst van rule 9 (zie fase 0): "alleen een door de klant ingestelde URL, pas na een admin-vlag, als losse UI-knop, nooit uit LLM-tekst en nooit ín het antwoord". |
| B1 | Wie zet de module aan: de **Jorion-admin** (zoals Linkknoppen) of de **klant zelf** (zoals contactverzoeken)? | **Admin zet de vlag aan én keurt de URL goed; klant vult de URL in. Wijzigt de klant de URL, dan gaat de knop uit tot een admin opnieuw akkoord geeft.** | De klant kan een externe URL laten zien aan al zijn bezoekers. Alleen een admin-vlag is niet genoeg: staat die aan, dan kan een gekaapt klantaccount de URL daarna vrij wijzigen. Daarom bewaren we de door de admin goedgekeurde URL apart (zie §4.1) en toont de widget de knop alleen als de huidige URL gelijk is aan de goedgekeurde. Vergelijk het met een sleutelkluis: de klant mag een nieuwe sleutel aanbieden, maar die gaat pas aan de haak als Jorion hem heeft bekeken. |
| B2 | Mag A de planner **in de widget insluiten** (iframe) of alleen **in een nieuw tabblad openen**? | **Nieuw tabblad** in fase 1. | Insluiten in een iframe binnen ons iframe botst vaak met cookies van derden, CSP-regels van de planner en mobiele schermruimte. Nieuw tabblad werkt met élke planner. |
| B3 | Moet de bot de knop **zelf aanbieden** (intentie: "afspraak", "langskomen", "plek vrij?") of alleen een vaste knop tonen? | **Deterministische trefwoorden + vaste knop.** Geen LLM-intentiecall. | Een LLM-call kost geld en latency; `app/api/v1/chat/route.ts:1-3` noemt LLM-contact-offer expliciet V2. Trefwoorden zijn gratis, testbaar en vallen samen met het contact-intentiewerk dat vannacht gepland is (zie §2.6). |
| B4 | Mag de bot **iets zeggen over beschikbaarheid**? ("Zaterdag is er plek") | **Nee, nooit.** Alleen doorverwijzen. | Anti-hallucinatie (hard rule 8): de bot kent de agenda niet. Een verzonnen "er is plek" is een belofte namens de klant. |
| B5 | (Alleen bij B) Bewaartermijn voor afspraakaanvragen. | **Dezelfde 90 dagen als contactverzoeken**, en eerst de V1-retention-pinger echt aanzetten. | De privacyverklaring belooft al 90 dagen (`app/privacy/page.tsx:238-239`), maar de cron draait nog niet (zie §2.5). Zonder pinger is elke nieuwe PII-stroom een gebroken belofte. |
| B6 | Komt dit in de widget-strings in alle talen (nl/en/de/fr/es) of eerst alleen NL/EN? | **Alle talen die `widget-strings.ts` al heeft.** | Kleine teksten; een halve vertaling in de widget valt meer op dan de moeite. |

---

## 2. Context: hoe het nu werkt (geverifieerd in de code)

### 2.1 Er is geen afsprakenfunctie
- Grep op `afspra|Calendly|Cal.com|booking` in `app/` en `lib/` vindt geen boekingscode. Het
  enige agenda-achtige stuk is de `.ics`-download in het interne leads-dashboard
  (`lib/leads/ics.ts`, plan `docs/superpowers/plans/2026-10-17-leads-dashboard-a.md:1428`), en
  dat is voor Jorion zelf, niet voor bezoekers.
- Scope: `docs/V2_SCOPE_EN_PRINCIPES.md:106-107` (V3 action layer).

### 2.2 Contactverzoeken (de basis voor optie B)
- Toggle `contactRequestsEnabled` + `notificationEmail` in `chatbots.settings` jsonb
  (`app/v1/app/instellingen/settings-config.ts:57-58`, default uit op `:102`); elk org-lid mag
  hem aanzetten (`app/v1/app/instellingen/actions.ts:34`, alleen `requireOrgMember`).
- Widget: passieve knop zodra `messages.length > 0`
  (`app/embed-v1/[slug]/v1-widget.tsx:385-405`). Geen intentiedetectie.
- Route `app/api/v1/contact-request/route.ts`: per-IP rate-limit (`:34`), embed-token +
  origin-lock (`:40-44`), org uit gesigneerde slug (`:50-56`), per-org rate-limit (`:61`),
  feature-flag fail-closed 403 (`:77-86`), validatie `lib/v1/widget/contact-validate.ts`,
  insert via service-role (`:107-118`), mail via `after()`.
- Tabel `supabase/migrations-v1/0011_v1_contact_requests.sql:22-61`: `organization_id NOT NULL`,
  `consent_given = true` als CHECK, RLS alleen SELECT voor org-leden, writes via service-role.
  Geen kolom voor thread, onderwerp-type of voorkeursmoment.
- Prod-stand 19 okt (read-only query uit het onderzoek van vanavond): 0 bots met de toggle aan,
  0 rijen. De leadstroom is dus nog nooit echt gebruikt.

### 2.3 Linkknoppen (het patroon voor optie A)
- `organizations.link_buttons_enabled` (`supabase/migrations-v1/0031_v1_org_link_buttons.sql`),
  alleen te zetten via admin-action `setOrgLinkButtonsAction`
  (`app/v1/admin/organizations/[id]/actions.ts:545-576`). Leesfout → uit
  (`lib/v1/org-flags/link-buttons.ts:13-28`).
- Doorgegeven aan de widget via `lib/v1/widget/load-embed.ts:76-91` (expliciet per veld, nooit
  `settings` spreaden: daar zit ook `notificationEmail` in).
- Links worden in de widget gerenderd met `target="_blank" rel="noopener noreferrer"`
  (`lib/widget/render-markdown-lite.tsx:188-190`). Dat is precies wat A nodig heeft.
- Hard rule 9: Linkknoppen tonen alleen URL's van de eigen gecrawlde site. Een planner-URL
  (bijv. `salonized.com/...` of `calendly.com/...`) is **geen** gecrawlde URL. A loopt dus
  **niet** via `sanitizeLinksOnRequest`, maar wordt een aparte UI-knop met een door de klant
  ingestelde URL. De LLM produceert die URL nooit zelf (zie §4.4). Dit valt **buiten** de
  huidige uitzondering op rule 9 en vraagt dus een expliciet besluit (B0) plus een
  tekstwijziging van rule 9 (fase 0).

### 2.4 URL-instellingen die al bestaan
- `contactPageUrl` staat al in de settings (`settings-config.ts:87`, max 300 tekens op `:288`),
  is invulbaar door klant (`settings-form.tsx:549`) en admin (`admin-settings-form.tsx:238`),
  en wordt door "AI-genereer" uit de website gehaald (`generate-actions.ts:116`).
  Een `appointmentUrl` past daar direct naast.

### 2.5 AVG-randvoorwaarden
- Retentie: `lib/v1/observability/retention.ts` verwijdert alleen `contact_requests` > 90 dagen;
  `app/api/v1/cron/retention/route.ts` wordt nergens gepingd (`vercel.json` bevat alleen V0-crons;
  `docs/V1_LAUNCH_TODO.md:80-83`, bewust uitgesteld). Chat-inhoud in V1 heeft nog geen retentie
  (`retention.ts:6-9`).
- Privacyverklaring: Jorion = verwerker, klant = verwerkingsverantwoordelijke
  (`app/privacy/page.tsx:80-89`); sub-verwerkerslijst op `:269` e.v. moet bij elke nieuwe
  externe partij mee (comment `:10`).

### 2.6 Wat er vannacht al gebouwd wordt (lezen, niet dubbel doen)
- Worktree `chatmanta-nacht-contact` (branch `feat/seb/contactverzoeken-beter`): volgens het
  onderzoek van vanavond staat daar o.a. gepland: contactaanbod bij fallback/weigering
  (client-side), lichte trefwoord-intentie (`lib/v1/widget/contact-intent.ts`, met o.a.
  "afspraak"), consent-tekst met org-naam/bewaartermijn/privacylink en het onderwerp-veld.
  Stand 19 okt (na review): de branch heeft één commit, `546903a` (toestemmingstekst +
  onderwerp voorgevuld). `lib/v1/widget/contact-intent.ts` bestaat daar (nog) niet.
  **Gevolg voor dit plan:** de intentie-trefwoorden voor A horen in *dezelfde* pure module
  (één bron, één testbestand), met een apart resultaat `'appointment'` naast `'contact'`.
  Bouw fase 1 pas ná merge van die branch, anders krijg je twee concurrerende detectoren.
  **Fallback:** komt `contact-intent.ts` er bij die merge niet, dan maakt fase 1 de pure module
  zelf aan onder die naam (met `'contact'` en `'appointment'`), zodat later contactwerk hem
  overneemt in plaats van een tweede detector te bouwen.

### 2.7 Prompt-injectie (plan 013)
- Plan 013 (context als data afbakenen) is **TODO**. De huidige blast-radius van een injectie is
  bewust "alleen tekst" (`plans/013-rag-prompt-injection-boundary.md`, "Why this matters").
  Optie C zou die radius vergroten naar "schrijft in een echte agenda".

### 2.8 Welke agendatools gebruikt de doelgroep? (kort marktbeeld, okt 2026)
Bronnen zijn grotendeels leveranciersmateriaal; dit is een indruk, geen marktonderzoek.

| Branche | Typische tools | Heeft eigen boekpagina-URL? | API voor ons bruikbaar? |
|---|---|---|---|
| Kappers / beauty | Salonized (sinds 2024 van Treatwell, noemt zich marktleider in NL), Treatwell-marktplaats, BarberBooking, Koalendar | Ja | Beperkt/partner-only |
| Garages | Werkplaatsplanners met RDW-koppeling (bijv. Sleutl, GarageOS), dealer-systemen, vaak "bel ons" of een formulier | Soms | Nee, versnipperd |
| Fysio / praktijken | EPD met agenda (Intramed, Spotonmedics, Fysioroadmap); online zelf plannen is nog weinig gangbaar, veel patiënten bellen | Soms (patiëntportaal) | Nee (zorgdata, gesloten) |
| Installateurs / dienstverleners | Vaak géén online agenda: offerte-aanvraag of terugbelverzoek; soms Calendly / Google-afsprakenplanning / Microsoft Bookings voor een adviesgesprek | Soms | Ja (Google/Microsoft/Cal.com) |
| Algemeen | Onlineafspraken.nl (NL, sinds 2003), SimplyBook.me, Calendly, Cal.com, Google Agenda-afsprakenplanning, Microsoft Bookings | Ja | Ja |

Conclusie: **de tools waar wij met een API in kunnen (Google, Microsoft, Cal.com, Calendly) zijn
juist níet de tools van onze kernbranches.** De branchetools hebben bijna allemaal wel een
publieke boekpagina. Dat pleit sterk voor A, en voor B bij bedrijven zonder online agenda
(installateurs, veel garages).

Bronnen: [Treatwell neemt Salonized over](https://www.cosmeticsdesign-europe.com/Article/2024/10/10/treatwell-acquires-salonized-plans-to-expand-b2b-retail-offer),
[Salonized × Treatwell](https://salonized.com/en/features/treatwell),
[BarberBooking-mijlpaal](https://www.emerce.nl/wire/mijlpaal-3000000-online-afspraken-via-barberbooking),
[Onlineafspraken.nl-presentatie](https://cms.onlineafspraken.nl/uploads/Onderwijs-presentatie.pdf),
[Sleutl](https://www.getapp.co.uk/software/2098147/sleutl),
[Koalendar autobedrijven](https://koalendar.com/nl/boekingssysteem-voor/autobedrijven),
[EPD-software fysio NL](https://www.physitrack.com/nl/insights/beste-epd-software-fysiotherapeuten-nederland),
[Intramed vs Spotonmedics](https://pabau.com/nl/blog/intramed-vs-spotonmedics/).

---

## 3. De drie benaderingen vergeleken

### 3.1 Overzicht

| Criterium | A. Doorverwijzen | B. Aanvraag voorkeursmoment | C. Echte boeking via API |
|---|---|---|---|
| **Waarde voor MKB** | Middel-hoog: bezoeker belandt op het juiste moment in de bestaande planner. Werkt voor iedere klant met een boekpagina. | Middel-hoog voor bedrijven **zonder** online agenda (installateur, garage). Lead komt warm binnen met gewenst moment. | Hoog op papier, maar alleen bij klanten die echt in Google/Outlook/Cal.com plannen; bij kapper/fysio/garage vaak verkeerde beschikbaarheid. |
| **Bouwtijd** | S: 2-3 dagen | M: ±1 week (bovenop A) | L/XL: 4-8 weken |
| **Onderhoud** | Bijna nul (een URL) | Laag (zelfde stroom als contactverzoeken) | Hoog: OAuth-refresh, API-wijzigingen per provider, tijdzones, dubbele boekingen, support bij "mijn afspraak staat er niet in" |
| **Security** | Externe URL in widget → alleen `https:`, admin-vlag + klant-URL, geen LLM-gegenereerde URL | Zelfde poorten als contact-request-route (token, origin-lock, rate-limits, honeypot) | OAuth-tokens versleuteld at rest (bijv. pgsodium/Vault of app-side AES-GCM met sleutel in env), minimale scopes, token-intrekking, schrijfactie vanaf een publiek endpoint = misbruik-doel (agenda vol spammen) |
| **AVG** | Geen nieuwe PII bij ons. Bezoeker geeft gegevens aan de planner van de klant (klant = verantwoordelijke, planner = zijn eigen verwerker). | Nieuwe PII-stroom (naam, contact, gewenst moment, evt. reden). Valt onder bestaande verwerkersrol + 90 dagen. Reden kan gezondheidsinfo zijn (fysio!) → **bijzondere persoonsgegevens**, dus vrij tekstveld vermijden of waarschuwen. | Wij verwerken agenda's van de klant (ook afspraken van anderen, bij lees-scope) + bezoekers-PII; nieuwe sub-verwerker (Google/Microsoft/Cal.com) in privacyverklaring en DPA; DPIA-achtige afweging; bewaartermijn van tokens en boekingslog. |
| **Kosten (runtime)** | Nul | Nul extra LLM; één Resend-mail per aanvraag | API's zelf meestal gratis; wel Google OAuth-app-verificatie (gevoelige scope `calendar` → verificatietraject, mogelijk security-assessment), Microsoft app-registratie; Cal.com/Calendly API vraagt soms betaald plan van de klant |
| **Widget-API-contract** | +1 optioneel veld in embed-props (`appointment: {url,label} \| null`). Achterwaarts compatibel. | + nieuwe POST-route of uitbreiding van `/api/v1/contact-request` met `kind` + `preferredSlots` | Nieuwe routes: beschikbaarheid ophalen, slot reserveren (met hold), bevestigen, annuleren via ondertekende link |
| **Datamodel + RLS** | Geen migratie: `appointmentUrl`/`appointmentLabel` in `chatbots.settings`; admin-vlag als org-kolom (migr) **of** in admin-only jsonb | Migratie: kolommen op `contact_requests` (aanbevolen) of eigen tabel; RLS SELECT org-leden, writes service-role | Meerdere tabellen (`calendar_connections` met versleutelde tokens, `appointments`, `appointment_holds`), RLS + strikte service-role-paden, SA-1 op alle dashboard-acties |
| **Prompt-injectie-risico** | Laag: LLM kiest hooguit *of* de knop verschijnt (en zelfs dat doen we deterministisch); URL komt uit settings | Laag: formulier wordt door de bezoeker ingevuld, LLM vult niets in | **Hoog**: een "agent" die tools aanroept kan via geïnjecteerde tekst tot boeken/annuleren worden verleid. Vereist plan 013 + menselijke bevestiging in de UI voor elke actie + geen tool-calls op basis van gecrawlde tekst |

### 3.2 A in detail: doorverwijzen naar de bestaande planner

**Gedrag.**
1. Admin zet per org "Afsprakenknop" aan (B1). Klant vult in Instellingen › Contact een
   *Afspraak-URL* in (+ optioneel knoptekst, default "Afspraak maken").
2. Widget toont de knop als (a) de vlag aan staat, (b) er een geldige URL is, en (c) óf de
   bezoeker trefwoorden gebruikt ("afspraak", "langskomen", "inplannen", "boeken", "reserveren",
   "plek vrij", "appointment", "book" ...), óf de bot een fallback gaf op zo'n vraag.
   Daarnaast een vaste, rustige knop naast "Liever persoonlijk contact?".
3. Klik → nieuw tabblad met de planner-URL, plus `utm_source=chatmanta` (optioneel, B-keuze
   van de klant; sommige planners strippen onbekende parameters niet netjes, dus default uit).
4. De bot zegt nooit "er is plek" (B4). Een vaste antwoordregel kan via de bestaande
   `extraInstructions`-route, maar liever helemaal geen promptwijziging: de knop is UI, de bot
   blijft antwoorden zoals nu.

**URL-validatie** (pure functie, unit-getest, hergebruikt in action én embed-loader):
- Alleen `https:`; geen `javascript:`, `data:`, gebruikersnaam/wachtwoord in de URL, IP-adressen
  of `localhost`; max 300 tekens (zelfde als `contactPageUrl`).
- Geen hard-gecodeerde provider-allowlist (dan sluit je Onlineafspraken.nl, branche-EPD's en
  eigen sites uit), maar wél tonen van de host in de admin-UI zodat de admin ziet wáár hij naar
  verwijst bij het aanzetten.
- Fail-closed: ongeldige URL → knop verborgen, nooit een kapotte link.

**Datamodel.** Twee keuzes, aanbeveling eerst:
- *(aanbevolen)* `organizations.appointments_enabled boolean not null default false` (kleine
  V1-migratie, kopie van het 0031-patroon: geen RLS-wijziging nodig, want members hebben geen
  UPDATE op `organizations`; write via `requireAdminActor`-action op service-role), plus
  `organizations.appointment_url_approved text null` (de door de admin goedgekeurde URL, B1).
  URL + label in `chatbots.settings` jsonb (klant-beheerd): `appointmentUrl` en
  `appointmentLabel` erbij in `V1ChatbotSettings` + defaults, in `ALLOWED_PATCH_FIELDS` en in
  `TEXT_FIELD_MAX` (300 resp. 60) in `settings-config.ts` (die allowlist wordt door
  `sanitizeChatbotPatch` afgedwongen). De vlag en de goedgekeurde URL komen daar **niet** in.
- *(alternatief zonder migratie)* alles in `chatbots.settings`, met de vlag alleen beschrijfbaar
  via de admin-action. Dat kan technisch: `sanitizeChatbotPatch` filtert al op
  `ALLOWED_PATCH_FIELDS`, dus de klant-action schrijft de vlag niet mee zolang je hem daar
  buiten laat. Toch niet aanbevolen: admin-only gegevens horen bij de org (patroon 0031),
  niet tussen klant-instellingen in één jsonb-object waar één vergeten allowlist-regel ze
  klant-beschrijfbaar maakt.

**Widget-API-contract.** `load-embed.ts` krijgt één expliciet veld:
`appointment: { url: string; label: string } | null` (alleen gezet als vlag aan, URL geldig
én URL gelijk aan `appointment_url_approved`).
Oude widgets negeren het veld; nieuwe widgets zonder veld tonen niets. Geen nieuwe route.

**SA-1.** De klant-action (URL opslaan) zit al achter `requireOrgMember` op de eigen
chatbot (`getSessionOrg` + `.eq(org)`); de admin-action achter `requireAdminActor` met de
org-id uit de route-param → `requireXxxAccess(id)`-patroon zoals `setOrgLinkButtonsAction`.

**Telemetrie (optioneel, geen PII).** Klik-teller per chatbot per dag ("x keer op Afspraak
maken geklikt") is de beste verkoop-metric voor de klant. Kan via een bestaand event-patroon
(analytics/heartbeat) of later; niet nodig voor fase 1. Nooit de bezoeker identificeren.

**AVG.** Geen nieuwe PII. Wel één zin in de widget-hulptekst/privacy: "Je gaat naar de
afsprakenpagina van {bedrijf}". De planner is de verwerker van de klant, niet van ons:
geen wijziging in de sub-verwerkerslijst.

### 3.3 B in detail: aanvraag met voorkeursmoment

**Gedrag.** De bezoeker kiest in de widget "Afspraak aanvragen" en vult in: naam, e-mail of
telefoon, 1-3 voorkeursmomenten (dag + dagdeel: ochtend/middag/avond, géén exacte tijden die
op een bevestiging lijken), optioneel een korte keuze uit door de klant ingestelde diensten
("APK", "Knippen", "Intake"). De klant krijgt de bestaande notificatiemail met een duidelijk
label "Afspraakaanvraag" en bevestigt zelf (bellen/mailen). De widget zegt expliciet:
"Dit is een aanvraag. {bedrijf} neemt contact op om het moment te bevestigen."

**Datamodel (aanbevolen: uitbreiden, geen nieuwe tabel).** Migratie op `contact_requests`:
- `kind text not null default 'contact' check (kind in ('contact','appointment'))`
- `preferred_slots jsonb null` met CHECK op vorm/lengte (max 3 items, dag ∈ datum binnen
  60 dagen, dagdeel ∈ enum) of — eenvoudiger en strikter — drie getypeerde kolommen.
- `service_label text null` (max 100, uit de door de klant ingestelde lijst; server valideert
  tegen de settings, nooit vrije tekst van de bezoeker).
- RLS: writes blijven service-role. **In dezelfde migratie** de SELECT-policy
  `contact_requests_select_org_members` (V1-0011) laten filteren op `deleted_at is null`
  (drop + create). Nu ziet een org-lid via de API ook soft-deleted rijen (bekende bevinding uit
  de RLS-sweep van 2026-07-06); fase 2 vergroot juist de PII in die tabel. Retentie dekt de
  rijen automatisch.
- Waarom geen eigen tabel: dashboard, export, badge, notificatie en retentie werken dan meteen
  mee. Een eigen tabel = alles dupliceren.

**Widget-API-contract.** `POST /api/v1/contact-request` krijgt optioneel `kind` +
`preferredSlots` + `serviceLabel`; `validateContactBody` wordt uitgebreid (onbekende kind →
400). Achterwaarts compatibel: oud verzoek zonder `kind` = `'contact'`. Feature-flag per
org (`appointmentRequestsEnabled`) fail-closed 403, zoals `:77-86`.

**AVG.** Nieuwe velden zijn PII (moment + dienst). Bij praktijken kan "dienst" al op een
behandeling wijzen → daarom alleen een door de klant gekozen, neutrale lijst en **geen** vrij
"reden"-veld bij `kind='appointment'` (het bestaande berichtveld mag, met hint "geen medische
details"). Vereist B5 (retention-pinger actief) vóór de eerste klant het aanzet. Consent-tekst
uit het contactwerk van vannacht hergebruiken.

**Kosten.** Geen LLM; één mail per aanvraag via Resend.

### 3.4 C in detail: echte boeking via agenda-API (V3)

**Wat het vraagt** (daarom V3):
- OAuth per klant met Google Calendar (scope minimaal `calendar.events` op één agenda +
  freebusy) en/of Microsoft Graph (`Calendars.ReadWrite`, delegated) en/of Cal.com-API-key.
  Tokens **versleuteld at rest** (envelope-encryptie; sleutel in Vercel-env, nooit `NEXT_PUBLIC_*`,
  hard rule 7), alleen leesbaar via de service-role-wrapper (hard rule 4), rotatie + intrekken
  bij org-delete/suspend.
- Google's verificatie voor gevoelige agenda-scopes (consent-scherm, privacy-URL, mogelijk
  extern security-assessment) — doorlooptijd weken.
- Beschikbaarheidsregels per klant (openingstijden, duur per dienst, buffer, max per dag),
  tijdzones/zomertijd, hold-mechanisme tegen dubbele boekingen (rij met TTL + uniek-constraint),
  bevestigingsmail aan bezoeker (nieuwe mailstroom = extra PII-verwerking), ondertekende
  annuleerlink, ICS-bijlage, no-show-gedrag.
- Misbruik: een publiek endpoint dat in een echte agenda schrijft. Nodig: e-mailverificatie of
  dubbele bevestiging vóór de afspraak definitief is, strengere rate-limits, captcha-achtig
  signaal, dag-cap per org.
- Datamodel: `calendar_connections (provider, encrypted_token, scopes, ...)`, `appointments`,
  `appointment_holds`: **alle drie** met `organization_id NOT NULL` (hard rule 2) + RLS aan +
  policies in dezelfde migratie (hard rule 3), SA-1 op alle dashboard-acties.
- AVG: Google/Microsoft worden sub-verwerker namens ons (privacyverklaring `:269` + DPA met
  elke klant aanpassen); met lees-scope zien we ook afspraken van ándere klanten van de
  ondernemer → dataminimalisatie vereist alleen freebusy, nooit event-inhoud lezen.
- Prompt-injectie: de bot krijgt *acties*. Minimale eisen: plan 013 gebouwd, de LLM mag geen
  tool-call doen op basis van gecrawlde context, elke actie gaat via een UI-bevestiging door de
  bezoeker met deterministische parameters (slot-id uit onze eigen beschikbaarheids-API, nooit
  uit LLM-tekst).

**Eerlijke inschatting:** voor de kernbranches (kapper, garage, fysio) is C minder waardevol
dan het lijkt, omdat hun echte planning in branchesoftware zit (§2.8). C wordt pas interessant
bij een klantgroep die aantoonbaar in Google/Outlook/Cal.com plant (adviseurs, coaches,
installateurs met één planner).

---

## 4. Ontwerp van de aanbevolen route (fase 1 = A)

### 4.1 Bestanden (indicatief)
| Bestand | Wijziging |
|---|---|
| `supabase/migrations-v1/00NN_v1_org_appointments.sql` | `organizations.appointments_enabled` + `appointment_url_approved`. Nummer pas reserveren met `/check-migration` vlak vóór de bouw, ná merge van de contact-branch. Lokaal staat V1 op 0037; 0033 ontbreekt, maar bestaat in geen enkele branch of open PR (gecheckt 19 okt), dus het is een gat, geen botsing. Niet opvullen. |
| `lib/v1/org-flags/appointments.ts` (nieuw) | `getOrgAppointments(client, orgId)` → `{enabled, approvedUrl}`, fout → uit (kopie van `link-buttons.ts`) |
| `lib/v1/widget/appointment-url.ts` (nieuw, puur) + `__tests__` | URL-validatie (§3.2) + normalisatie voor de vergelijking met de goedgekeurde URL |
| `app/v1/app/instellingen/settings-config.ts` | `appointmentUrl`, `appointmentLabel` in `V1ChatbotSettings` + defaults, in `ALLOWED_PATCH_FIELDS` en in `TEXT_FIELD_MAX` (300/60). Vlag en goedgekeurde URL **niet**. |
| `app/v1/app/instellingen/actions.ts` | `saveChatbotSettingsAction`: wijzigt de patch `appointmentUrl`, dan een `audit_logs`-regel (oude → nieuwe host) en een notificatiemail aan de Jorion-admin "URL wacht op akkoord". De knop gaat vanzelf uit, want de URL wijkt af van de goedgekeurde. |
| `app/v1/app/instellingen/settings-form.tsx` | Velden in sectie Contact, alleen zichtbaar als de admin-vlag aan staat (anders uitleg "vraag ChatManta om dit aan te zetten"); status "wacht op akkoord van ChatManta" als URL ≠ goedgekeurd |
| `app/v1/admin/organizations/[id]/actions.ts` + nieuw `appointments-form.tsx` + `_tabs/beheer-tab.tsx` | Admin-toggle + knop "URL goedkeuren" (toont de host), analoog aan Linkknoppen, met audit-log |
| `lib/v1/widget/load-embed.ts` | `appointment: {url,label} \| null` expliciet doorgeven |
| `lib/v1/widget/contact-intent.ts` (uit het contactwerk van vannacht) | Resultaat `'appointment'` + trefwoordenlijst nl/en/de/fr/es + tests |
| `app/embed-v1/[slug]/v1-widget.tsx`, `app/embed-v1/_widget/widget-view.tsx`, `lib/v1/widget/widget-strings.ts` | Knop + contextuele CTA |
| `docs/V2_SCOPE_EN_PRINCIPES.md` §2a | Regel "Afsprakenknop (doorverwijzen), per org, beslissing <datum>" |
| `AGENTS.md` (hard rule 9), `.claude/agents/chatmanta-reviewer.md`, commentaar bij `sourceLinksEnabled` in `app/v1/app/rag-config.ts` | Tweede uitzondering op rule 9 letterlijk vastleggen (fase 0), zodat een reviewer of agent de knop niet als overtreding meldt |

### 4.2 Wat er níet verandert
- Geen wijziging aan `lib/rag/*`, geen nieuwe botversie, geen answer-cache-purge nodig (de
  knop is UI; het antwoord verandert niet). Geen eval nodig. Geen promptwijziging.
- Geen links ín antwoorden: de knop staat los van de bubbel. Rule 9 zelf verandert wél (een
  tweede, smalle uitzondering, zie B0 en fase 0); dat is een besluit, geen interpretatie.

### 4.3 Kosten
Runtime nul. Eén kleine migratie. Geen billable runs.

### 4.4 Security-checklist fase 1
- URL komt alleen uit settings, gevalideerd bij opslaan **én** bij embed-load (defence in depth).
- LLM-uitvoer bepaalt nooit de URL; trefwoord-detectie draait op de *bezoekersvraag*, niet op
  gecrawlde tekst → injectie via een webpagina kan de knop hooguit niet laten verschijnen.
- `rel="noopener noreferrer"` + `target="_blank"` (zoals `render-markdown-lite.tsx:188-190`).
- Isolatie: `v1:test-org-isolation` uitbreiden met "org A ziet de afspraak-URL van org B niet in
  embed-props".

---

## 5. Fasering

| Fase | Inhoud | Grootte | Gate |
|---|---|---|---|
| **0** | Besluit B0-B4 vastleggen; regel in `V2_SCOPE_EN_PRINCIPES.md` §2a; tekst hard rule 9 in `AGENTS.md` + `chatmanta-reviewer.md` + commentaar `sourceLinksEnabled` bijwerken | XS | **Sebastiaan** |
| **1 (V1.x)** | Optie A volgens §4, na merge van `feat/seb/contactverzoeken-beter` | **S/M** (2-3 dagen incl. tests, typecheck, build, Playwright op `/embed-v1/<test-slug>`) | Migratieplan = plan voorleggen (datamodel), daarna zelf `migrate:v1`; merge = akkoord |
| 1b | Kliktelling per dag in het klantdashboard ("Afspraak-kliks") | S | Plan (raakt mogelijk datamodel) |
| **2 (V1.x, op klantvraag)** | Optie B: `kind`/voorkeursmomenten op contactverzoeken | **M** (±1 week) | **B5: retention-pinger eerst live**; migratie + widget-API = plan voorleggen |
| **3 (V3)** | Optie C, eerst één provider (Cal.com-API-key of Google), alleen freebusy + insert, met bezoekersbevestiging | **L/XL** (4-8 weken + Google-verificatie) | Plan 013 gebouwd; DPA/privacy bijgewerkt; nieuwe library/provider = plan; security-review |

Meetpunt om van fase 1 naar 2 of 3 te gaan: na 4-6 weken live kliks per klant bekijken en
vragen in `thread_messages` die "afspraak"-trefwoorden bevatten maar waar de klant geen URL
heeft. Veel van die laatste = signaal voor B.

---

## 6. Risico's

| Risico | Kans | Impact | Mitigatie |
|---|---|---|---|
| Scope-sluip: "nu A, dan snel even C" | Middel | Hoog | B0 expliciet alleen A; C blijft in §3 V3 staan |
| Bot belooft beschikbaarheid ("zaterdag kan") | Middel | Middel | B4; knoptekst "Afspraak maken", nooit "boek nu om 10:00"; bestaande hard-fact-gates ongewijzigd |
| Klant vult verkeerde/kapotte URL in | Middel | Laag | Validatie + host tonen in admin; optionele HEAD-check bij opslaan (let op SSRF: alleen https, geen privé-IP's, of overslaan) |
| Gekaapt klantaccount zet phishing-URL | Laag | Hoog | B1: knop alleen live met de door de admin goedgekeurde URL; een klantwijziging zet hem uit tot nieuw akkoord; audit-log + admin-mail bij elke wijziging (nieuw in `instellingen/actions.ts`, bestaat nu niet) |
| Fase 2 vergroot PII in `contact_requests` terwijl de SELECT-policy soft-deleted rijen toont | Middel | Middel | Policy-fix `deleted_at is null` in de fase-2-migratie (§3.3) |
| Twee intentie-detectoren naast elkaar | Middel | Laag | Eén module (`contact-intent.ts`), fase 1 na het contactwerk |
| Fase 2 zonder draaiende retentie | Middel | Hoog (AVG) | B5 als harde voorwaarde |
| Fysio-klant krijgt gezondheidsgegevens binnen (fase 2) | Middel | Hoog | Geen vrij reden-veld bij afspraken; hint in het berichtveld |
| Iframe-insluiting breekt bij providers | Hoog als je het doet | Middel | B2: nieuw tabblad |

---

## 7. Open vragen

1. Is er een testklant die nu al een online planner heeft? (Zo ja: fase 1 direct met die URL
   testen; zo nee: eerst B overwegen, of A wachten.) Navragen bij de testklanten, niet in de repo
   vastleggen wie.
2. Moet de afspraakknop ook zichtbaar zijn als de bot gepauzeerd is of de limiet bereikt is
   (`lib/v1/limits/chat-gates.ts:87,113`)? Aanbeveling: ja, dat is precies het moment dat de
   bezoeker anders afhaakt; de knop kost ons niets.
3. Mag "AI-genereer" (`generate-actions.ts`) de afspraak-URL ook uit de website halen (net als
   `contactPageUrl`)? Handig, maar dan moet de klant hem nog bevestigen; nooit automatisch live.
4. Willen we de klik meten met een UTM-parameter (B-keuze per klant) of alleen intern tellen?
5. Hoort Onlineafspraken.nl / Salonized-embed in een latere fase "in de widget" (iframe) als
   klanten erom vragen? Dan eerst per provider testen op CSP en cookies.
6. Bij fase 3: welke provider eerst? Aanbeveling vooraf: **Cal.com** (API-key, open source, EU-
   hosting mogelijk, geen Google-verificatietraject), maar alleen als een echte klant hem gebruikt.
7. Moet bij fase 2 de bezoeker een bevestigingsmail ("aanvraag ontvangen") krijgen? Dat is een
   nieuwe mailstroom met PII; dezelfde vraag ligt open bij contactverzoeken.

---

## Review verwerkt (19 okt 2026)

Alle zeven bevindingen zijn zelf nagelopen in de code. Ze zijn allemaal terecht; geen enkele is verworpen.

| # | Bevinding | Gecheckt | Aangepast |
|---|---|---|---|
| 1 | Rule 9 kent maar één uitzondering (gecrawlde URL's); een planner-URL valt erbuiten | AGENTS.md rule 9 + `rag-config.ts:48` | B0 bevat nu een expliciet rule-9-besluit; §2.3 en §4.2 noemen het een besluit en geen interpretatie; fase 0 en §4.1 werken AGENTS.md, `chatmanta-reviewer.md` en het commentaar bij `sourceLinksEnabled` bij |
| 2 | De admin-vlag beschermt niet tegen URL-wijziging na het aanzetten; de audit-log bestaat niet | `instellingen/actions.ts` schrijft geen audit-log | Gekozen voor optie (a), met (b) erbij: de kolom `appointment_url_approved`, en de knop verschijnt alleen als de URL gelijk is aan de goedgekeurde. Bij een klantwijziging volgen een audit-regel en een admin-mail. B1, §3.2, §4.1 en §6 zijn bijgewerkt |
| 3 | De jsonb-onderbouwing klopte niet: er bestaat al een allowlist | `settings-config.ts:255-290` (`ALLOWED_PATCH_FIELDS`, `TEXT_FIELD_MAX`, `sanitizeChatbotPatch`) | §3.2 en §4.1 zijn gecorrigeerd. De migratie-variant blijft de keuze, omdat admin-data bij de org hoort |
| 4 | Migratienummer | Lokaal 0037. 0033 komt in geen enkele branch of open PR voor (#305 en #207 hebben geen migratie), dus het is een gat | Het nummer wordt pas vlak vóór de bouw gereserveerd, ná de contact-merge. Het gat wordt niet opgevuld |
| 5 | §2.6 was verouderd | `546903a` op `feat/seb/contactverzoeken-beter`, zonder `contact-intent.ts` | De stand is bijgewerkt en er is een fallback: fase 1 maakt de module zelf aan als die ontbreekt |
| 6 | De SELECT-policy van `contact_requests` filtert niet op `deleted_at` | `0011_v1_contact_requests.sql:54-61` | De policy-fix gaat mee in de fase-2-migratie (§3.3, §6) |
| 7 | `organization_id NOT NULL` stond niet bij alle V3-tabellen | §3.4 | Het staat nu bij alle drie de tabellen, samen met RLS en de policies. Het blijft V3 |

Ook meegenomen: §0 punt 3 zei "geen migratie nodig", terwijl de aanbevolen variant wel een migratie heeft. Dat is rechtgezet.
