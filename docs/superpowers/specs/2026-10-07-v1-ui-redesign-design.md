# V1 UI-redesign: widget, klantendashboard, admindashboard

**Datum:** 2026-10-07 · **Status:** ontwerp goedgekeurd in brainstorm, wacht op review van dit document
**Branch/worktree:** `feat/seb/v1-ui-redesign` · `../chatmanta-ui-redesign`
**Mockups:** canvas "ChatManta Designrichting" (claude.ai artifact `An6VfKW4Q4BMPhDTSYbe9z`): borden *B · Diepzee*, *Klantendashboard · Overzicht (B)* en *Beweging en feedback*.

## 1. Doel en succescriteria

V1 moet er voor de eerste testklanten uitzien en aanvoelen als premium software: rustig, overzichtelijk, snel en verfijnd. Concreet is het klaar als:

1. Widget, klantendashboard en admindashboard draaien op één V1-ontwerplaag (§4) en importeren `app/klantendashboard/klant.css` niet meer.
2. Elke V1-route heeft een `loading.tsx`; een klik in het menu geeft binnen 100 ms zichtbare feedback (actief menu-item + laadskelet).
3. Elk scherm voldoet aan de rustregels (§3) en elke melding staat in de meldingentabel (§6) met een niveau.
4. V0 (dashboards én V0-widget) is visueel en functioneel ongewijzigd.
5. `npm run typecheck` en `npm run build` groen; elk herontworpen scherm is via Playwright op desktop (1440) en telefoon (390) gecontroleerd.

**Buiten scope:** donkere modus (later), nieuwe functionaliteit, wijzigingen aan datamodel/RLS/API. Dit is een presentatielaag-traject; server actions, queries en autorisatie blijven zoals ze zijn.

## 2. Visuele richting: "Diepzee" (richting B)

- **Karakter:** vriendelijk-zakelijk met een Apple-achtige premium afwerking. Diepte via gelaagde zachte schaduwen, niet via randen.
- **Kleur:** diep donkerblauw `#0C1E2E` als merkkleur (zijbalk, hoofdknop, "volgende stap"-blok), teal `#0D9488` als accent (actieve staat, grafieken, focus), lichte koele werkruimte `#F3F6F9` met witte vlakken. Semantisch: groen = goed, oranje = aandacht, rood = kritiek. Kleur alleen voor status en de hoofdactie.
- **Typografie:** Plus Jakarta Sans (staat al in `app/layout.tsx`). Vaste schaal: 12 / 13 / 14 / 16 / 22 / 30 px; koppen 700 met licht negatieve letterafstand; cijfers `tabular-nums`. Geen labels in hoofdletters.
- **Vorm:** hoeken 10 (klein), 12 (knop/invoer), 18–22 (kaart/paneel); knophoogte 40, compact 34.
- **Alleen lichte modus** voor de launch; de donkere zijbalk is het donkere element. De thema-schakelaar verdwijnt uit V1.

## 3. Rustregels (gelden voor elk scherm)

1. Eén hoofdknop per scherm (donker gevuld); overige knoppen secundair of tekst.
2. Hooguit één meldingsblok tegelijk bovenaan een scherm. Meerdere kritieke meldingen worden samengevoegd in dat ene blok ("2 dingen hebben je aandacht"), nooit weggelaten.
3. Eén zin uitleg per pagina; meer uitleg achter een info-icoon of "Meer info".
4. Geavanceerde **instellingen** staan ingeklapt. Status-informatie wordt nooit ingeklapt.
5. Kleur betekent iets (status of hoofdactie), nooit versiering.
6. Lege staten zijn compact: één regel plus een actie.
7. Witruimte boven kaders; geen emoji, geen dubbele knoppen, geen kaart-in-kaart.

## 4. V1-ontwerplaag (aanpak 1)

Nieuwe map `app/v1/_ui/` (naam vrij in plan), los van V0:

- **`tokens.css`**: kleuren, typografie, radii, schaduwen, bewegingscurves als CSS-variabelen onder een V1-scope-class. Geïmporteerd door `app/v1/app/layout.tsx`, `app/v1/admin/layout.tsx` en de login/auth-pagina's.
- **Bouwstenen** (React, zonder externe UI-library-afhankelijkheid tenzij het plan anders onderbouwt): `Button` (primary/secondary/ghost, compact), `Card`/`Panel`, `Tabs` (onderstreept), `SegmentedControl`, `Switch`, `Field` (label + input/textarea/select + hint), `Badge`/`StatusPill`, `StatStrip` (cijferstrook met optionele sparkline), `List`/`ListRow`, `EmptyState` (compact), `AttentionBlock` (§6), `Toast`, `Skeleton`, `Sidebar` + `NavItem` (met teller/stip), `PageHeader` (titel, één zin, max één hoofdknop), `Drawer` (rechts inschuivend paneel), `Menu` (⋯-overflow).
- **Tailwind v4-valkuil:** stijlen van de ontwerplaag staan in eigen CSS-bestanden of CSS-modules, niet als nieuwe properties op bestaande selectors in `app/globals.css`.
- **Migratie:** scherm voor scherm; na golf 4 importeert geen V1-bestand meer `klant.css`. `klant.css` zelf wordt niet gewijzigd (V0 hangt eraan).

## 5. Beweging en snelheid

- **Snelheidsoorzaak (gemeten 2026-10-06 op prod):** geen enkele V1-route heeft `loading.tsx`. Volgens de Next 16-docs (`linking-and-navigating.md`) worden dynamische routes zonder `loading.tsx` niet geprefetcht en blijft het oude scherm staan tot de server klaar is (volledige pagina 1,6–3,5 s).
- **Oplossing:** `loading.tsx` met een skelet in de vorm van de pagina per route; menu-items als `<Link>` met direct optimistisch actieve staat; schakelaars en kleine wijzigingen optimistisch tonen met `Toast` ter bevestiging en terugdraaien bij fout.
- **Bewegingsregels:** feedback binnen 100 ms; duur 150–350 ms; standaardcurve `cubic-bezier(.2,.8,.2,1)`; vering `cubic-bezier(.34,1.3,.64,1)` alleen op aankomst-momenten (actieve menumarkering, widget openen, toast, schakelaarknop). Knoppen: hover −1px + meer schaduw, indrukken schaal .97. Kaarten met een klikdoel tillen 2px bij hover. Inhoud komt binnen met fade + 6px omhoog. `prefers-reduced-motion: reduce` zet alle beweging uit.
- Referentie: bord *Beweging en feedback* op het canvas.

## 6. Meldingsniveaus

| Niveau | Betekenis | Vorm |
|---|---|---|
| Kritiek | er gaat iets mis voor bezoekers | `AttentionBlock` bovenaan Overzicht (altijd, nooit ingeklapt) + rode stip bij het betreffende menu-item |
| Aandacht | er ligt werk voor de klant | teller in de zijbalk + lijst op Overzicht; geen banner |
| Info | uitleg, tips | info-icoon, hulptekst of ingeklapte sectie |
| Bevestiging | resultaat van een actie | `Toast` (succes) of inline fout bij het veld/actie |

De inventaris van alle bestaande meldingen met hun nieuwe niveau staat in bijlage A. Geen melding verdwijnt zonder rij in die tabel.

## 7. Schermen

### 7.1 Schil (klantendashboard)
- Donkere zijbalk: logo; organisatieblok (naam + domein); **Dagelijks:** Overzicht, Gesprekken (teller onbeantwoord), Kennisbank (stip als er een quiz klaarstaat), Contactverzoeken (teller nieuw), Widget (rode stip als niet live/gevonden); **Instellingen:** Chatbot, Account; onderaan klein "Feedback geven" en uitloggen.
- Actief item: glijdende markering (zie beweging).
- De bovenbalk vervalt (bel, schuifjes-icoon, thema-schakelaar, dubbele preview-knop). "Bekijk chatbot" staat als secundaire knop in de `PageHeader` van Overzicht en Widget.
- Zoeken (⌘K) blijft beschikbaar via sneltoets en een klein zoek-icoon in de zijbalk.
- Telefoon (<900 px): zijbalk wordt uitschuifmenu achter een menuknop in een smalle kopbalk.

### 7.2 Overzicht
Volgens het canvas-bord: begroeting + status-pill (Testmodus/Live); `AttentionBlock` als er iets kritiek is; anders het "volgende stap"-blok zolang de setup niet af is (voortgang + één knop, verdwijnt als alles af is); `StatStrip` (gesprekken + sparkline, zelf beantwoord, contactverzoeken, kennisbronnen); twee kolommen "Hier wist je chatbot het niet" (met "Antwoord geven") en "Meest gestelde vragen".

### 7.3 Gesprekken
Eén filterregel (periode-`SegmentedControl`, schakelaar "Alleen onbeantwoord", ⋯-menu met CSV-export en Herladen); lijst; gesprek opent in een `Drawer` rechts (detailroute blijft bestaan voor directe links). Tab "Meest gestelde vragen" blijft als tweede tab.

### 7.4 Kennisbank
Tabs Documenten / Website / Q&A. Eén hoofdknop "Toevoegen" met keuzemenu (document uploaden, website scannen, Q&A schrijven); slepen-en-neerzetten werkt op de hele pagina. Crawl-diagnose als compacte statusregel per bron. Quiz verschijnt hier als `AttentionBlock`-variant (aandacht) wanneer er een klaarstaat; de losse Quiz-route blijft bereikbaar via die link.

### 7.5 Chatbot-instellingen
Vier secties met eigen subnavigatie links (boven op telefoon): **Basis · Toon · Antwoorden · Contact**. Per sectie de hoofdinstellingen zichtbaar, de rest onder "Geavanceerd". Opslaanbalk verschijnt pas bij een wijziging, vast onderaan het werkvlak (fix voor de nu midden in de pagina zwevende balk). Contactverzoeken-schakelaar staat in Contact.

### 7.6 Widget
Drie stappen onder elkaar: **1. Uiterlijk** (instellingen links, live widget-voorbeeld rechts dat direct meeverandert), **2. Installeren** (code + kopieerknop; instructies per platform ingeklapt; toegestane domeinen als alleen-lezen regel), **3. Status** (live/niet gevonden + laatst gezien, aan/uit, "Installatie testen").

### 7.6b Preview (testchat)
De route `/v1/app/preview` blijft (echte testchat via `v1-chat.tsx`), maar is geen menu-item meer: de knop "Bekijk chatbot" in de `PageHeader` van Overzicht en Widget opent hem. Vormgeving: de nieuwe V1-widget op een neutrale nep-website, zoals nu maar in de nieuwe stijl.

### 7.7 Contactverzoeken, Account, Feedback
Zelfde `List`/`Field`-stijl; geen nieuwe functies.

### 7.8 Login en auth-pagina's
Zelfde ontwerplaag; rustige gecentreerde kaart op de lichte werkruimte met logo. De bestaande shader-achtergrond vervalt.

### 7.9 Admindashboard
Krijgt de schil (donkere zijbalk, `PageHeader`), de bouwstenen, `loading.tsx` per route en de rustregels; géén per-scherm-herontwerp. Opruimen: emoji weg, bedragen als `€ 0,00` (nl-NL), lange uitleg in kaarten → info-icoon.

## 8. Widget (bezoekerskant)

- Vormgeving volgens bord *B · Diepzee*: kop in de **merkkleur van de klant** (standaard `#0C1E2E` als er geen is gekozen), persoonlijke begroeting in de kop, gelaagde schaduw, hoeken 22, bot-bubbels wit op koel grijs, bron-link onderaan het antwoord, suggesties als zachte knoppen, invoer in een getint veld.
- Leesbaarheid: tekstkleur op de kop wordt automatisch wit of donker gekozen op basis van het contrast met de klantkleur (WCAG 4.5:1).
- Beweging: launcher schaalt bij hover; paneel veert open vanuit de knop; icoon draait naar kruisje; antwoorden komen binnen met fade; typ-indicator.
- **Waar:** de V1-widget is los van V0: `public/widget-v1.js` laadt `/embed-v1/<slug>` (`app/embed-v1/[slug]/v1-widget.tsx`). V0 gebruikt `public/widget.js` → `/embed/[slug]` → `app/widget/components/chatmanta-widget`. Alleen de V1-bestanden worden herontworpen; de V0-widget blijft ongewijzigd.
- Embed-token, origin-lock, rate-limit, heartbeat en contactformulier-logica blijven ongewijzigd; alleen markup, styling en beweging veranderen.

## 9. Golven (elk een eigen PR)

1. **Fundament:** ontwerplaag (tokens + bouwstenen), schil klantendashboard (zijbalk, mobiel menu), `loading.tsx` voor alle `app/v1/app`-routes, login/auth-pagina's.
2. **Widget** (bezoekerskant + widget-scherm in het dashboard).
3. **Klantendashboard-schermen:** Overzicht, Gesprekken, Kennisbank, Instellingen, Contactverzoeken, Account, Feedback; meldingentabel volledig toegepast.
4. **Admindashboard:** schil, bouwstenen, `loading.tsx`, opruimpunten.

Na golf 4 verwijst geen V1-bestand meer naar `klant.css`.

## 10. Testen en verificatie

- Per golf: `npm run typecheck`, `npm run build` (eerst `.next/` wissen), bestaande tests (`tests/v1/*.spec.ts` gebruiken `name="email"`/`name="password"`, die blijven), en Playwright-screenshots desktop 1440 + telefoon 390 van elk geraakt scherm, naast elkaar met de mockup.
- V0-regressie: screenshots van `/klantendashboard`, `/admindashboard` en de V0-widget vóór en na; ze moeten gelijk zijn.
- Snelheid: meten van klik → zichtbare feedback en klik → inhoud op prod na golf 1.
- Toegankelijkheid: zichtbare focusring, tekstcontrast 4.5:1, echte `<button>`/`<a>`, `prefers-reduced-motion`.

## Bijlage A: meldingentabel

Inventaris van de huidige code (2026-10-07). Niveau: **K** = kritiek, **A** = aandacht, **I** = info, **B** = bevestiging/fout bij een actie, **S** = status (altijd zichtbaar, geen melding). "Plek nieuw" verwijst naar §7.

| Scherm | Melding nu | Vorm nu | Niveau | Plek nieuw |
|---|---|---|---|---|
| Schil | Chatbotstatus Concept/Testen/Live/Gepauzeerd | badge in bovenbalk | S | status-pill in `PageHeader` van Overzicht + Widget; "Gepauzeerd" ook als K-blok op Overzicht |
| Schil | Belteller (onbeantwoord + negatieve feedback) | badge op bel | A | vervalt; vervangen door tellers op menu-items |
| Schil | Teller onbeantwoord op Gesprekken | badge | A | blijft (zijbalk-teller) |
| Schil | Teller "Nieuw" op Contactverzoeken; item verborgen als uit | badge | A | blijft |
| Schil | Zoeken: "Geen scherm gevonden." | inline | I | blijft |
| Alle pagina's | "Geen toegang" | PageHead | K | compacte foutpagina in de schil |
| Alle pagina's | "Nog geen chatbot geconfigureerd" | PageHead-subtitle | K | compacte lege staat met contact-hint |
| Overzicht | Kopzin "je chatbot staat live / op pauze / in testmodus / in concept" | titel | S | begroeting + status-pill |
| Overzicht | Weekzin ("N vragen wachten op jouw input") | subtitle | I | vervalt; staat al in `StatStrip` + "Hier wist je chatbot het niet" |
| Overzicht | "Je hebt nog geen bronnen toegevoegd" | banner (warning) | A | volgende-stap-blok (stap 1) |
| Overzicht | "Je widget is nog niet geplaatst" | banner (info) | A | volgende-stap-blok; na livegang zonder heartbeat → K "Widget niet gevonden op je site" |
| Overzicht | "Er staat een kennisquiz voor je klaar" | banner (info) | A | stip bij Kennisbank + regel in Kennisbank (§7.4) |
| Overzicht | "Alle vragen zijn beantwoord" | succeskaart | I | compacte lege staat in "Hier wist je chatbot het niet" |
| Overzicht | "N vragen wachten op een antwoord" + top 3 | hero-kaart | A | lijst "Hier wist je chatbot het niet" |
| Overzicht | Cijfers (gesprekken, behulpzaam, berichten, bronnen) | 4 kaarten | S | `StatStrip` |
| Overzicht | Top-vragen leeg/opbouwend | lege staat | I | compacte lege staat |
| Overzicht | Checklist "Aan de slag" (5 stappen, overslaan) | checklist-kaart | A | volgende-stap-blok met voortgang; "Alle stappen" opent de lijst |
| Gesprekken | "N bezoekers gaven negatieve feedback" | banner (danger) | — | **verborgen** (banner, filter en badge "Feedback"): sinds PR #262 heeft de V1-widget geen duimpjes meer (besluit Seb 2026-10-07) |
| Gesprekken | "N gesprekken hebben een onbeantwoorde vraag" | banner (warn) | A | schakelaar "Alleen onbeantwoord" met teller |
| Gesprekken | Lege lijst per filter | lege staat | I | compact |
| Gesprekken | Statusbadge per gesprek; tellers op tabs | badge | S | blijft |
| Gesprekken › Meest gesteld | Opbouwend / leeg / opslaan-fout / drempel opgeslagen | lege staat, inline | I / B | compact; `Toast` voor opslaan |
| Gesprek detail | "Je chatbot kon deze vraag niet beantwoorden" | banner (warn) | A | regel bovenaan de `Drawer` met knop "Antwoord geven" |
| Gesprek detail | Afhandel-fout | inline | B | `Toast` (fout) |
| Kennisbank | Tellers op tabs; statusbadges documenten/pagina's | badge | S | blijft |
| Kennisbank | Lege staten Documenten / Website / Q&A | lege staat | I | compact, met knop "Toevoegen" |
| Kennisbank | Uploadfouten (type, leeg, te groot, mislukt) | inline | B | `Toast` (fout) + fout bij het bestand |
| Kennisbank | Crawl loopt + voortgang, "houd tabblad open", tempo-beperking | voortgangskaart | S | compacte voortgangsregel bij de bron |
| Kennisbank | Crawl mislukt (geen pagina's, te lang, niet geladen, tempo, vorige mislukt) + technische details | kaart (danger) | K | statusregel bij de bron + rode stip op Kennisbank + K-blok op Overzicht; details ingeklapt |
| Kennisbank | "Firecrawl vond pagina's, maar er kwam niets binnen" | kaart (info) | A | statusregel bij de bron |
| Kennisbank | Fout per pagina (403, serverfout, verwerken/opslaan mislukt) | inline + badge | A | badge + uitleg in tooltip |
| Kennisbank | "Maximaal N per keer" bij crawl-selectie | hint | I | blijft |
| Kennisbank › Q&A | Huidig bot-antwoord: dagbudget, maandlimiet, te veel verzoeken, geen antwoord | inline | B | inline in het Q&A-venster |
| Preview | Foutbubbels (maandlimiet, daglimiet, druk, niet beschikbaar, generiek) | chatbubbel | B | blijft, in nieuwe stijl |
| Instellingen | "Opgeslagen" / fout | inline | B | `Toast` + opslaanbalk |
| Instellingen | Contactverzoeken aanzetten: bevestigingsvraag | dialoog | B | blijft (bevestiging in de pagina) |
| Instellingen | Genereer-fout / rate-limit | inline | B | inline bij het veld |
| Widget | Slug ontbreekt; "Gekopieerd" | inline | K / B | slug-fout als K-regel; kopiëren → `Toast` |
| Widget | Toegestane domeinen "Geen beperking — werkt overal." | inline | I | alleen-lezen regel in Installeren |
| Widget | Uiterlijk opgeslagen / logo-fout | inline | B | `Toast` / inline bij upload |
| Widget | Live-status (actief/gepauzeerd, gevonden op site, laatst gezien, domeinen), "Installatie testen", pauze-uitleg | statuscellen | S | stap 3 Status; niet gevonden na installatie → rode stip op Widget |
| Quiz | Geen quiz / voltooid / antwoord-fout | kaart, inline | I / B | lege staat compact; voltooid → `Toast` + terug naar Kennisbank |
| Contactverzoeken | "Staat uit" / "Nog geen" | PageHead + lege staat | I | compacte lege staat met link naar Instellingen › Contact |
| Contactverzoeken | Statusbadge, notitie opgeslagen, actiefout | badge, inline | S / B | badge blijft; `Toast` |
| Account | Verbruik "X van N gesprekken" + balk | meter | S | blijft |
| Account | Maandlimiet of dagbudget bereikt, chatbot pauzeert | callout | K | ook als K-blok op Overzicht + rode stip op Account |
| Account | E-mail/wachtwoord/naam gewijzigd, fouten | inline | B | `Toast` / inline bij veld |
| Feedback | Bedankt / bijlage te groot / versturen mislukt | lege staat, inline | B | blijft, nieuwe stijl |
| V1-widget | Domein niet toegestaan, gepauzeerd, opgeschort, onbekende org | onzichtbaar / 404 / console | — | ongewijzigd (bewust onzichtbaar voor bezoekers) |
| V1-widget | "Even niet beschikbaar" / "Er ging iets mis" / "Verbinding viel weg" | foutbubbel | B | blijft, nieuwe stijl, met knop "Opnieuw proberen" |
| V1-widget | Contactformulier bedankt / mislukt | inline | B | blijft, nieuwe stijl |

Bijvangst uit de inventaris: `app/v1/app/_overview/sections.tsx` wordt nergens geïmporteerd en kan in golf 3 weg.
