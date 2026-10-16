# Leads-dashboard (deel A: bellijst) — ontwerp

**Datum:** 2026-10-17 · **Status:** goedgekeurd door Sebastiaan (incl. inzicht-dashboard en `qrcode`) · **Eigenaar:** Sebastiaan

## 1. Doel en context

ChatManta belt koud naar MKB-bedrijven (installateurs, hoveniers, dakdekkers, schoonmaak, Gelderland). De leads kwamen tot nu toe uit Niels' Python-tool "ChatbotScanner Pro" (privé-repo `niels1611/Leadschatmanta`). Die tool mist de meeste chatbots, telt woorden verkeerd, schift nauwelijks met zijn score, en zijn dashboard is onveilig online gezet en raakt zijn status kwijt.

We bouwen een eigen leads-dashboard in de ChatManta-app, in drie delen:

- **A. Bellijst** (dit document): bellen, uitkomsten vastleggen, opvolgen, mailen, overzicht en cijfers, gevuld met de bestaande 1.404 leads.
- **B. Nieuwe scanner** (later, eigen ontwerp): vinden via Google Places, scannen met een echte browser als lokaal script.
- **C. Nieuwe score** (later, eigen ontwerp): de score opnieuw opbouwen op de scandata van B.

Succes voor A: Sebastiaan en Niels bellen een middag lang vanuit het dashboard zonder spreadsheet ernaast, niemand belt een bedrijf dubbel, elke uitkomst staat er met één klik in, en de opvolgmail staat binnen een minuut in Outlook.

### Besluiten uit het ontwerpgesprek (2026-10-16/17)

| Besluit | Reden |
|---|---|
| Eerst A, daarna B en C. | Er wordt nu al gebeld; de bellijst levert het meest op. |
| Eigen dashboard op `/v1/leads`, los van de admin-schil. In de admin-zijbalk één knop "Leads ↗" die een nieuw tabblad opent. | Anders wordt het admin-dashboard onoverzichtelijk. |
| Toegang: alle V1-admins (`users.is_jorion_admin`). Niels is sinds 2026-10-16 admin. | Sebastiaan koos volwaardig admin voor Niels. |
| Data in de V1-productiedatabase, in admin-only tabellen **zonder `organization_id`**. | Leads zijn geen klantdata maar eigen verkoopdata. Expliciete uitzondering op hard rule 2, akkoord Sebastiaan 2026-10-16 (zoals `audit_logs`). |
| Niets met de ACM-/rechtsvormregel in dit dashboard: geen veld, geen waarschuwing, geen filter. | Keuze van Sebastiaan. |
| Bellen: dashboard op de laptop, bellen met de eigen telefoon via een QR-code. Later eventueel klikken naar de Telefoon-app van Windows. | Zo werken ze nu. |
| Interesse = mail sturen en/of kennismaking gepland. | Keuze van Sebastiaan. |
| De mail-pop-up is de bestaande opvolgmail-maker, ingebouwd. Het dashboard verstuurt zelf niets. | Werk uit de mailsessie (PR #301-#303); verkoopmail via Resend kan de bezorging van app-mails schaden en staat niet in Outlook Verzonden. |

### Buiten scope voor A

Scannen en vinden (B), nieuwe score (C), rechtsvorm/KvK, CSV-export, eigen tags, instelbare belschema's, belopnames, automatisch bellen, mail versturen vanuit de app, echte agendakoppeling.

## 2. Pagina's en navigatie

| Adres | Inhoud |
|---|---|
| `/v1/leads` | Overzicht met tabbladen en cijfers (§5). |
| `/v1/leads/bellen` | Belmodus (§4). Optioneel `?niche=…&plaats=…` als focus. |
| `/v1/leads/[id]` | Detail van één lead: alle velden bewerkbaar, volledige tijdlijn, knoppen "bel nu" en "mail". |
| `/v1/leads/inzicht` | Inzicht-dashboard met kerncijfers, trechter, verloop, beste beltijd en uitsplitsingen (§5). |
| `/v1/leads/instellingen` | Eigen afzenderprofiel voor de opvolgmail (§6). |

- Eigen layout `app/v1/leads/layout.tsx` met `requireJorionAdmin()` (zelfde gate als `app/v1/admin/layout.tsx`): geen sessie → `/v1/login`, geen admin → "Geen toegang".
- Eigen rustige kopbalk: logo, de vier pagina's, ingelogde naam. Visueel de V1-ontwerplaag (Diepzee) hergebruiken; geen bestaande admin-klassen herdefiniëren.
- Knop "Leads ↗" in `app/v1/admin/_shell/sidebar.tsx` bij de bestaande losse link onderaan, `target="_blank" rel="noopener"`.
- `/v1/*` valt al onder `updateSession` in `proxy.ts`; geen wijziging in de proxy nodig.
- Werkt op laptop én telefoon (op smal scherm alles onder elkaar, grote tikdoelen).

## 3. Datamodel (V1-migratie 0032, nummer bevestigen met `/check-migration`)

Alle drie de tabellen: **RLS aan, geen policies** (patroon van `0017_v1_admin_overlay`, `0019_v1_admin_error_groups`). Alleen bereikbaar via `getV1ServiceRoleClient()` in server actions die eerst `requireJorionAdmin()` aanroepen. Geen `organization_id` (gesanctioneerde uitzondering, zie §1); dit staat als commentaar in de migratie.

### `leads` (één rij per bedrijf)

| Groep | Kolommen |
|---|---|
| Sleutel | `id uuid pk`, `domein text` (genormaliseerd: kleine letters, zonder `www.`, zonder pad/query), `telefoon text` (genormaliseerd naar `+31…`). Uniek: partiële unieke index op `domein` (waar niet null) en op `telefoon` (waar niet null). Minstens één van beide verplicht (CHECK). |
| Bedrijf | `bedrijfsnaam text not null`, `website_url text`, `niche text`, `plaats text`, `provincie text`, `telefoons_extra text[]` (max 3), `email text` (gekozen adres), `emails_gevonden text[]`, `contactpersoon text`, `aanspreekvorm text check in ('je','u') default 'je'`, `haakje text`, `notitie text` |
| Scan (nu uit import, later B/C) | `google_rating numeric`, `google_reviews int`, `heeft_chatbot boolean`, `chatbot_naam text`, `platform text`, `woorden int`, `score int`, `score_max int`, `score_redenen jsonb`, `score_voorlopig boolean default true`, `labels text[]` (bv. `keten`, `generieke_naam`, `site_onbereikbaar`, `weinig_tekst`) |
| Stand | `status text not null default 'open'` met CHECK in (`open`, `terugbellen`, `opvolgen`, `kans`, `klant`, `geen_interesse`, `niet_bellen`, `heeft_chatbot`, `archief`), `status_reden text`, `volgende_actie_op timestamptz`, `volgende_actie_notitie text`, `pogingen_niet_opgenomen int default 0`, `laatste_poging_op timestamptz`, `kennismaking_op timestamptz`, `opvolgmail_gestuurd_op timestamptz`, `opvolgmail_situatie text` |
| Slot | `geclaimd_door uuid references users(id)`, `geclaimd_tot timestamptz` |
| Herkomst | `bron text not null` (`import_niels`, `handmatig`, later `scan`), `bron_data jsonb` (ruwe bronvelden voor B/C), `aangemaakt_door uuid`, `created_at`, `updated_at` (trigger) |

Indexen: `(status, volgende_actie_op)`, `(niche, plaats)`.

### `lead_activiteiten` (logboek)

`id uuid pk`, `lead_id uuid not null references leads on delete cascade`, `user_id uuid references users`, `soort text` CHECK in (`belpoging`, `mail`, `notitie`, `status`, `kennismaking`, `import`), `uitkomst text` (bij belpoging: `niet_opgenomen`, `terugbellen`, `wil_mail`, `interesse`, `geen_interesse`, `niet_bellen`), `details jsonb` (bv. voicemail, bezwaar, mailsituatie, onderwerp, reden), `vorige_staat jsonb` (de stand-kolommen van de lead vóór deze actie, voor ongedaan maken), `ongedaan_op timestamptz`, `created_at`.

Regels worden alleen toegevoegd; de enige wijziging is `ongedaan_op` zetten. Cijfers tellen alleen regels zonder `ongedaan_op`. Index: `(lead_id, created_at)`, `(created_at)`.

### `lead_afzenders` (afzenderprofiel per beller)

`user_id uuid pk references users`, `naam`, `voornaam`, `functie`, `telefoon`, `email`, `foto_url` (nullable; Sebastiaan: `https://www.chatmanta.nl/mail/foto.png`), `updated_at`. Telefoonnummers staan hier en niet in de code (publieke repo).

### AVG-bewaartermijn

Bij het laden van `/v1/leads` draait hooguit één keer per dag een opschoonactie (geen nieuwe cron nodig):
- Leads met status `geen_interesse` of `archief`, 12 maanden niet gewijzigd: verwijderen (activiteiten gaan mee via cascade).
- Leads met status `niet_bellen`, 12 maanden niet gewijzigd: alleen `domein`, `telefoon`, `status`, `status_reden` bewaren, de rest leegmaken. Zo komen ze bij een nieuwe scan nooit terug.

## 4. Belmodus (`/v1/leads/bellen`)

### Wachtrij

De volgende lead is de eerste uit, in deze volgorde:
1. `status = 'terugbellen'` en `volgende_actie_op <= nu`, vroegste eerst;
2. `status = 'open'` en (`volgende_actie_op` leeg of `<= nu`), hoogste `score` eerst, daarna `google_reviews`;

steeds alleen leads die niet door een ander geclaimd zijn (`geclaimd_tot < nu` of `geclaimd_door = ik`), en binnen de gekozen focus (niche/plaats). Het ophalen en claimen gebeurt in één atomaire stap (bijv. een `update … where id = (select … for update skip locked) returning *` via een database-functie), zodat twee bellers nooit dezelfde lead krijgen.

### Slot

Claim van 10 minuten bij openen; elke 2 minuten verlengd zolang de pagina open en zichtbaar is. Vrijgegeven bij een uitkomst, bij "overslaan" en bij het verlaten van de pagina (best effort). Een verlopen claim mag een ander overnemen.

### Kaart

- Bedrijfsnaam, niche, plaats; knop "Website" (nieuw tabblad); bewerkbare velden contactpersoon, haakje, aanspreekvorm en notitie (opslaan bij verlaten van het veld).
- Telefoonnummer groot, met QR-code (`tel:+31…`). Op een smal scherm vervangt een tikbare `tel:`-link de QR-code. Extra nummers en e-mail eronder.
- Tijdlijn van eerdere pogingen en notities (wie, wanneer, wat); chatbotstatus; score met de redenen en het label "voorlopig".
- Uitklapbaar spiekbriefje met Sebastiaans belscript in vijf stappen (begroeting + compliment, wat ChatManta doet in één zin, vraag naar klantvragen/aanvragen, voordeel voor dit bedrijf, afsluiten met kennismaking via Teams en een demo per mail).
- Teller bovenin: vandaag gebeld · opgenomen · interesse (van de ingelogde beller).

### Uitkomstknoppen (toetsen 1-6, S, Ctrl+Z)

| Toets | Knop | Effect |
|---|---|---|
| 1 | Niet opgenomen | `pogingen_niet_opgenomen + 1`. Optie "voicemail ingesproken". Volgende actie: volgende werkdag, in het andere dagdeel dan deze poging (vóór 12:00 → morgen 13:00, anders → morgen 9:00). Bij de 3e poging vraagt hij: "Mail sturen" (→ status `opvolgen`, mail-pop-up) of "Archiveren" (→ `archief`, reden `3x niet opgenomen`). |
| 2 | Terugbellen | Snelkeuze: over 2 uur · morgen · volgende week · over 3 maanden · eigen datum/tijd, plus notitie. → `terugbellen`. |
| 3 | Wil een mail | Mail-pop-up met situatie "interesse". → `opvolgen`, volgende actie +3 werkdagen. |
| 4 | Interesse | Venster met twee vinkjes: "Mail sturen" en "Kennismaking gepland" (datum + tijd). → `kans`. Met kennismaking: `kennismaking_op` en volgende actie = die datum, plus knop "Zet in agenda" (downloadt een `.ics` met bedrijfsnaam, telefoon en notitie). Alleen mail: volgende actie +3 werkdagen. Met mail opent daarna de pop-up (situatie "kennis" als er een kennismaking is, anders "info"). |
| 5 | Geen interesse | Optioneel bezwaar (chips): geen interesse · chatbots irritant · heeft al een chatbot · klanten willen een mens · te duur · te klein · te ingewikkeld · vertrouwt AI niet · bel volgende maand. Keuze "weg" (→ `geen_interesse`) of "over 3 maanden opnieuw" (→ `terugbellen`, +3 maanden). |
| 6 | Niet bellen | Reden (chips): verkeerd nummer · geen doelgroep · al klant · bestaat niet meer · heeft al een chatbot. → `niet_bellen` (bij "heeft al een chatbot": `heeft_chatbot`). |
| S | Overslaan | Niets vastleggen; volgende actie +2 uur; claim vrij. |
| Ctrl+Z | Ongedaan maken | Toast van 10 seconden na elke uitkomst: zet de lead terug uit `vorige_staat` en zet `ongedaan_op` op de activiteit. |

Elke uitkomst legt een `lead_activiteiten`-regel vast en springt door naar de volgende lead. Alle regels voor "wat gebeurt er na uitkomst X" staan in één pure functie `volgendeStand(lead, uitkomst, opties, nu)` in `lib/leads/`, met unit-tests; de server action past alleen het resultaat toe.

Werkdagen: maandag t/m vrijdag; feestdagen negeren we in A. Tijdzone: `Europe/Amsterdam`.

## 5. Overzicht (`/v1/leads`)

### Tabbladen (met teller)

| Tabblad | Filter |
|---|---|
| Vandaag bellen | `open` of `terugbellen` met volgende actie leeg of `<= vandaag 23:59`. Grote knop "Start bellen" (met focuskeuze). |
| Terugbellen | `terugbellen` met volgende actie in de toekomst, op datum, met notitie. |
| Opvolgen | `opvolgen`, in twee groepen: "mail nog sturen" (`opvolgmail_gestuurd_op` leeg) en "gemaild, nabellen op…". Na 3-4 werkdagen zonder reactie: knop "Herinnering sturen" (mail-pop-up, situatie "herinnering"). |
| Kansen | `kans` en `klant`, met kennismakingsdatum, mail ja/nee en knoppen "Klant geworden" (→ `klant`) / "Afgehaakt" (→ `geen_interesse`). |
| Heeft chatbot | `heeft_chatbot`. |
| Archief | `geen_interesse`, `niet_bellen`, `archief`, filter op reden; per lead "terug naar open". |
| Inzicht | Eigen pagina `/v1/leads/inzicht`, zie hieronder. |

### Lijst

Kolommen: bedrijf + plaats, niche, telefoon, score, volgende actie (leesbaar, bv. "morgen 14:00 terugbellen"), laatste uitkomst, pogingen, chatbotlabel. Zoeken op naam/domein/telefoon, filters niche/plaats/minimale score, sorteren per kolom, server-side paginering (50 per pagina). Per rij: klik → detail; menu met bel nu, archiveren, niet bellen, terug naar open. Meerdere rijen aanvinken → archiveren in één keer. Knop "+ Lead" (website, naam, telefoon; dubbelcheck op domein en telefoon, bij een treffer de bestaande lead tonen).

### Inzicht-dashboard (`/v1/leads/inzicht`, tabblad "Inzicht")

Toegevoegd op verzoek van Sebastiaan (2026-10-17): een volwaardig inzichtdashboard in plaats van een kale cijferlijst. Periodekeuze bovenaan (vandaag · deze week · deze maand · alles · eigen periode) en beller (iedereen · Sebastiaan · Niels). Alle cijfers uit `lead_activiteiten` zonder `ongedaan_op`, berekend in SQL (één RPC of view per blok) zodat de pagina snel blijft bij duizenden regels.

1. **Kerncijfers (tegels, met verschil t.o.v. de vorige periode):** cold calls (belpogingen), unieke bedrijven gebeld, opneemratio (= belpogingen met andere uitkomst dan `niet_opgenomen` / alle belpogingen), interesse-% (interesse / opgenomen), kennismakingen gepland, klanten, opvolgmails gestuurd.
2. **Trechter:** gebeld → opgenomen → interesse → kennismaking → klant, met aantallen en het percentage per stap. Laat zien waar het weglekt.
3. **Verloop in de tijd:** per dag (of per week bij lange periodes) belletjes, opgenomen en interesse als lijnen of staven.
4. **Beste beltijd:** opneemratio per weekdag × uurblok (heatmap), zodat je ziet wanneer mensen opnemen.
5. **Per niche en per plaats:** tabel met belletjes, opneemratio, interesse-% en het aantal leads dat nog op de lijst staat ("voorraad"). Wijst de richting voor scan B.
6. **Bezwaren:** top-bezwaren bij "geen interesse", als horizontale staven.
7. **Per beller:** belletjes, opneemratio, interesse-%, kennismakingen naast elkaar.
8. **Opvolging:** opvolgmails gestuurd, en hoeveel daarvan binnen 7 dagen tot kans of kennismaking leidden.
9. **Pijplijn nu:** aantal leads per status (open, terugbellen, opvolgen, kans, klant) als momentopname.

Leeg-staat: zolang er nog weinig belletjes zijn, toont elk blok "Nog te weinig gegevens" in plaats van misleidende percentages (minimaal 10 belpogingen voor een percentage). Grafieken volgens de `dataviz`-skill (één palet, licht en donker); hergebruik bestaande V1-grafiekcomponenten als die er zijn.

## 6. Mail-pop-up = ingebouwde opvolgmail-maker

**Bron van waarheid:** `C:\Users\solys\Documents\ChatManta-opvolgmails\opvolgmail-maker.html` en Second Brain `projecten/chatmanta-opvolgmail.md`. Teksten (`teksten()`), ontwerp B (`mail()`), knop-PNG's op `https://www.chatmanta.nl/mail/` en de vastgelegde keuzes worden **ongewijzigd** overgenomen.

- **Mailbouwer als pure functie** `lib/leads/opvolgmail.ts`: `bouwOpvolgmail(invoer, afzender) → { onderwerp, html, tekst, ontbreekt[] }`, met `esc()` op alle vrije tekst. Unit-tests: per situatie × je/u een snapshot, escaping (ook in naam/bedrijf/haakje/P.S.), `ontbreekt` (naam, bedrijf, https-link bij "klaar"). Niet `emailLayout` uit `lib/notifications/email-layout.ts` gebruiken (dat is de navy app-mailstijl).
- **Afzender** komt uit `lead_afzenders` van de ingelogde admin (naam, voornaam, functie, telefoon, e-mail, foto). Zonder foto: handtekening zonder foto-cel. Zonder profiel: de pop-up verwijst naar `/v1/leads/instellingen`.
- **Vooraf ingevuld vanuit de lead:** situatie (uit de knop, zie §4), aanspreekvorm, naam (contactpersoon), bedrijfsnaam, haakje, eigen zin (leeg), P.S. (leeg), e-mailadres, en "gesproken" (dagdeel) uit de laatste belpoging: vandaag vóór 12:00 → "vanochtend", vandaag na 12:00 → "vanmiddag", gisteren → "gisteren", anders "vandaag".
- **Aan-veld:** bewerkbaar, met keuzelijst uit `emails_gevonden`; ongeldig adres (geen geldige e-mailvorm) rood gemarkeerd. Een gewijzigd adres wordt bij de lead opgeslagen (`email`).
- **Voorbeeld:** rechts, live, `contenteditable` zoals in de maker, met melding "Je hebt de mail zelf aangepast" en "Opnieuw opbouwen"; weergave computer/telefoon.
- **Kopieer mail:** geblokkeerd zolang `ontbreekt` niet leeg is. `navigator.clipboard.write` met `text/html` + `text/plain`, terugval Range + `execCommand('copy')`.
- **Open Outlook:** `mailto:` met adres en onderwerp (geen body; de opgemaakte tekst plak je met Ctrl+V). Tip-tekst uit de maker, en bij "herinnering" de instructie om te beantwoorden in de bestaande thread.
- **Na kopiëren:** "Verstuurd?" → ja legt een `mail`-activiteit vast (situatie, onderwerp, adres), zet `opvolgmail_gestuurd_op` en `opvolgmail_situatie`, en zet de volgende actie op +3 werkdagen (nabellen of herinnering).
- **Niels' foto:** een eigen portret-PNG in `public/mail/` (via `scripts/mail-assets.mjs`) zodra Niels er een levert; tot dan zonder foto.

## 7. Import van Niels' leads

Script `scripts/leads-import.ts`, `npm run leads:import -- <leads.json> [status.json] [--toepassen]`. De bronbestanden staan buiten de repo (publieke repo, bedrijfsgegevens). Standaard een proefrun met rapport; pas met `--toepassen` schrijven. Idempotent: upsert op `domein`, en bij een bestaande lead worden status- en belvelden nooit overschreven.

Opschoning (pure functies in `lib/leads/import-opschonen.ts`, met unit-tests):
- URL normaliseren: `utm_*` en andere query weg, `www.` weg, alleen het domein als sleutel. Paden met `/vestiging/` → label `keten`.
- Adresgidsen eruit (lijst met domeinen, beginnend met `nlmappoint.org`, `nlpathmap.org`; aan te vullen na de proefrun).
- Generieke namen ("Dakdekker Arnhem") → label `generieke_naam`.
- Hetzelfde telefoonnummer op meerdere domeinen → één lead (die met de meeste Google-reviews), de andere domeinen in `bron_data`.
- E-mails valideren: weg met telefoonnummers, lege strings en ongeldige vormen. Gekozen adres: het eerste geldige adres op het eigen domein, anders het eerste geldige.
- Telefoon: het Google-nummer is het hoofdnummer, maximaal 3 extra.
- `heeft_chatbot = true` → status `heeft_chatbot`.
- Niels' knock-outs "geen e-mail", "onbereikbaar" en "te weinig content" gooien we **niet** weg (om te bellen is een telefoonnummer genoeg); "onbereikbaar" en "te weinig content" krijgen een label.
- Score: Niels' `score`/`max_score`/`redenen` overnemen met `score_voorlopig = true`.
- Leads zonder telefoon en zonder domein: overslaan (in het rapport).

`status.json` (als Niels hem levert, per domein): `gebeld` en `mail_verstuurd` → één `import`-activiteit met die datums (telt niet mee in de cijfers, want de uitkomst is onbekend); uitkomst `geen interesse` → `geen_interesse`; `interesse`/`demo gepland` → `kans`; `klant` → `klant`; `niet_benaderen` → `niet_bellen`; `notitie` → `notitie`.

Het rapport van de proefrun gaat eerst naar Sebastiaan; `--toepassen` op productie pas na zijn akkoord.

## 8. Code-indeling

| Waar | Wat |
|---|---|
| `supabase/migrations-v1/0032_v1_leads.sql` | Drie tabellen, indexen, RLS aan zonder policies, `updated_at`-trigger, claim-functie (security definer, gepinde `search_path`, execute alleen voor `service_role`). |
| `lib/leads/` | Pure logica met tests: `volgende-stand.ts`, `werkdagen.ts`, `opvolgmail.ts`, `import-opschonen.ts`, `normaliseren.ts` (domein/telefoon/e-mail), `cijfers.ts` (indien niet volledig in SQL). Plus `server/` met de DB-toegang (service-role via de wrapper). |
| `app/v1/leads/` | `layout.tsx` (gate), `page.tsx` (overzicht), `bellen/`, `[id]/`, `instellingen/`, `actions.ts` (elke action begint met `requireJorionAdmin()` en valideert invoer), `_ui/` (componenten: lijst, kaart, uitkomstknoppen, mail-pop-up, QR). |
| `app/v1/admin/_shell/sidebar.tsx` | Knop "Leads ↗". |
| `scripts/leads-import.ts` + `package.json` | Import-script. |

**Nieuwe library:** `qrcode` (npm, MIT, geen runtime-afhankelijkheden) voor de QR-code als SVG, server-side gerenderd. Akkoord Sebastiaan 2026-10-17. De `.ics` maken we zonder library (een paar regels tekst).

## 9. Foutafhandeling

- Server actions geven nette Nederlandse meldingen terug en loggen naar Sentry; geen stille fouten.
- Claim mislukt (lead net door een ander genomen) → automatisch de volgende.
- Opslaan van een uitkomst mislukt → de kaart blijft staan met de melding, er wordt niet doorgesprongen.
- Kopiëren naar het klembord mislukt → melding plus de terugval-route.
- Lege wachtrij → "Niets meer te bellen voor deze focus" met een link naar de andere tabbladen.

## 10. Testen en Definition of Done

- Unit-tests (`npm run verify`): `volgendeStand` voor elke uitkomst incl. de 3e poging en dagdelen, werkdagen, opvolgmail (snapshots, escaping, ontbreekt), import-opschoning (UTM, adresgidsen, dubbele telefoons, e-mailvalidatie, knock-outs blijven), normalisatie.
- Migratie: na `npm run migrate:v1` controleren dat RLS aan staat en een `authenticated`-sessie niets kan lezen of schrijven op de drie tabellen (toevoegen aan `npm run v1:test-org-isolation` of een losse check).
- Playwright op de dev-server tegen testleads (`bron = 'test'`, na afloop verwijderd): belmodus doorlopen met elke uitkomst, ongedaan maken, twee sessies die niet dezelfde lead krijgen, mail-pop-up kopiëren, niet-admin krijgt "Geen toegang".
- Proefrun van de import op de echte `leads.json` met rapport aan Sebastiaan.
- `npm run typecheck` + `npm run build` groen; PR met ingevuld template.

## 11. Open punten (geen blokkade voor de bouw)

- Niels' `status.json` van de belronde van 16 oktober: nodig om dubbel bellen te voorkomen bij de import.
- Portretfoto van Niels voor zijn handtekening.
- Afzenderprofielen invullen (Sebastiaan en Niels) via `/v1/leads/instellingen` na de merge.
