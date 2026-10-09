# V1 UI-redesign golf 2: widget, Widget-scherm en Preview

**Datum:** 2026-10-09 · **Branch/worktree:** `feat/seb/v1-ui-golf2` · `../chatmanta-ui-golf2`
**Bovenliggende spec:** `2026-10-07-v1-ui-redesign-design.md` (§2–§6, §7.6, §7.6b, §8, §10, bijlage A).
**Mockup:** canvas `An6VfKW4Q4BMPhDTSYbe9z`, borden *B · Diepzee* (widget) en *Beweging en feedback*.

## Wat

De chatwidget die bezoekers op de site van een klant zien krijgt de Diepzee-vormgeving: kop in de merkkleur van de klant met een persoonlijke begroeting, rustige bubbels, zachte startvragen, een getint invoerveld en vloeiende beweging. Foutmeldingen in de chat krijgen een knop "Opnieuw proberen". Wat de klant op het Widget-scherm instelt (logo, ondertitel, startvragen) is voortaan ook echt wat bezoekers zien. Het Widget-scherm in het dashboard wordt drie stappen onder elkaar (Uiterlijk met live voorbeeld, Installeren, Status), en Preview toont dezelfde widget op een neutrale nep-website.

## Besliste keuzes (Seb, 2026-10-09)

1. **Instellingen aansluiten, thema weg.** Logo/icoon (`logoStyle`, `customLogoDataUrl`), `subtitle` en de startvragen (`starterQuestions`, `showStarterQuestions`) gaan via de bestaande `loadV1Embed` naar de bezoekers-widget. Het veld Thema verdwijnt uit het scherm (de opgeslagen waarde blijft ongemoeid in de DB); de widget is alleen licht.
2. **Geen bronlinks en geen vervolgvragen** in deze golf. `sourceLinksEnabled` blijft uit, `renderMarkdownLite(..., linkify=false)` blijft.
3. **Eén gedeelde widget-weergave** (`WidgetView`) voor drie plekken: de echte widget (iframe), Preview en het live voorbeeld in stap 1. De chatlogica blijft per plek apart.

## Acceptatiecriteria

### A. Bezoekers-widget (`/embed-v1/[slug]`)
- [ ] Kop in `accentColor` (fallback `#0C1E2E` als de waarde ongeldig is); tekst en iconen in de kop wit of donker via `bestForegroundOn` (WCAG, bestaande helper).
- [ ] Kop toont avatar (eigen logo, chat-bubbel of ChatManta-mark), titel en optionele ondertitel; zolang er geen berichten zijn staat het welkomstbericht groot in de kop als begroeting, daarna wordt de kop compact.
- [ ] Paneel: hoeken 22, gelaagde schaduw, werkvlak `#F6F8FA`, bot-bubbels wit met zachte schaduw, gebruikersbubbels in de accentkleur.
- [ ] Startvragen (max 4) als zachte knoppen bij een leeg gesprek, alleen als `showStarterQuestions !== false` en er vragen zijn; klik verstuurt de vraag.
- [ ] Invoer in een getint veld met verstuurknop in de accentkleur; "Mogelijk gemaakt door ChatManta" eronder.
- [ ] Beweging: launcher schaalt bij hover, paneel veert open vanuit de launcher, icoon draait naar een kruisje, nieuwe berichten faden in, typ-indicator (drie stippen) zolang een antwoord leeg is en loopt. Alles uit bij `prefers-reduced-motion: reduce`.
- [ ] Desktop: paneel en launcher (met kruisje) passen binnen het bestaande open-formaat van de iframe (480×720); mobiel: paneel schermvullend met sluitknop in de kop.
- [ ] Foutbubbels ("Even niet beschikbaar", "Er ging iets mis", "Verbinding viel weg") hebben een knop "Opnieuw proberen" die dezelfde vraag opnieuw stuurt en de foutbubbel vervangt.
- [ ] Contactknop, formulier, bedankt- en foutstaat in de nieuwe stijl; velden, validatie, honeypot en payload ongewijzigd.
- [ ] Ongewijzigd: embed-token + refresh-op-401, origin-lock, rate-limit, heartbeat-ping, postMessage-protocol (`chatmanta:ready/resize/host`), `public/widget-v1.js`, de paused/blocked/notfound-paden. Geen duimpjes.
- [ ] `customLogoDataUrl` wordt alleen getoond als het een `data:image/(png|jpeg|webp|svg+xml);base64,…`-URL is, en alleen via `<img src>`.

### B. Widget-scherm (`/v1/app/widget`)
- [ ] `PageHeader` met titel, één zin, `StatusPill` (zelfde regel als Overzicht: gepauzeerd > live > testmodus > concept) en secundaire knop "Bekijk chatbot" → `/v1/app/preview`.
- [ ] **1. Uiterlijk:** instellingen links (kleur, icoon, positie, titel, ondertitel, welkomstbericht, tekst bij de knop), rechts een live `WidgetView` dat direct meeverandert. Opslaan via de bestaande `saveChatbotSettingsAction` met een patch van alleen de gewijzigde velden; opslaanbalk verschijnt pas bij een wijziging; succes/fout als `Toast`. Logo-uploadfouten inline bij de upload.
- [ ] **2. Installeren:** code + kopieerknop (toast "Code gekopieerd"), één zin waar hij moet staan, instructies per platform ingeklapt, toegestane domeinen als alleen-lezen regel. Ontbrekende slug → kritiek-regel in plaats van de code.
- [ ] **3. Status:** aan/uit-schakelaar (bestaande `toggleWidgetActiveAction`, optimistisch met terugdraaien bij fout + toast), "Gevonden op je site" met origin en laatst gezien, of "Nog niet gevonden"; na 7 dagen stilte (zelfde drempel als `attention.ts`) een waarschuwing; knop "Installatie testen" (bestaande action) met toast-resultaat.
- [ ] Hydration #418 opgelost: alle datums/tijden met vaste `timeZone: 'Europe/Amsterdam'`.
- [ ] Geen `klant-*`-klassen, geen import uit `app/klantendashboard/` meer in `app/v1/app/widget/`.
- [ ] Geen-toegang en geen-chatbot als compacte staat in de nieuwe stijl.

### C. Preview (`/v1/app/preview`)
- [ ] Neutrale nep-website in V1-stijl met daarop `WidgetView` (zelfde props als de echte widget, incl. logo/ondertitel/startvragen); paneel staat bij binnenkomst open.
- [ ] Chat via de bestaande `askV1`; fouten als foutbubbel met "Opnieuw proberen"; localStorage-geschiedenis blijft werken.
- [ ] Geen `klant-*`, geen import uit `app/klantendashboard/` meer in `app/v1/app/preview/`.

### D. Laadskeletten
- [ ] `PageSkeleton` varianten `widget` en `chat` volgen de nieuwe opbouw (drie stappen; nep-website met widget).

### E. Regressie
- [ ] V0-widget (`/embed/[slug]`, `public/widget.js`, `app/widget/`) en `app/klantendashboard/` ongewijzigd (git diff leeg op die paden).
- [ ] `npm run typecheck`, `npm run test:unit`, schone `next build` groen; Playwright op 1440 en 390 van widget (dicht/open/gesprek/fout/contact), Widget-scherm en Preview.

## Buiten scope
- Bronlinks, vervolgvragen, duimpjes.
- Donkere widget-variant; het veld Thema wordt verborgen, niet verwijderd uit het datamodel.
- Wijzigingen aan `public/widget-v1.js`, API-routes, het datamodel, RLS of de chat-stream.
- Startvragen bewerken (blijft op de Chatbot-pagina).
- Een aparte logo-route met caching (zie randgevallen).
- Golf 4 (admin) en het verwijderen van de `klant.css`-import uit de layout.

## Randgevallen
- Ongeldige of te lichte/donkere `accentColor` → fallback navy resp. automatisch contrasterende tekst.
- `customLogoDataUrl` leeg, ongeldig of geen afbeelding-data-URL → val terug op de chat-bubbel.
- Groot logo: de data-URL (max ~270 KB) zit in elke iframe-load, twee keer (HTML + RSC-data), dus tot ~540 KB. Bewust geaccepteerd (typische logo's zijn klein); een gecachete logo-route is een vervolgpunt.
- Startvragen: lege strings eruit, getrimd, max 4, max ~120 tekens per stuk weergegeven.
- Lange titel/ondertitel/begroeting → afkappen met ellipsis (titel) of netjes laten afbreken (begroeting, max 3 regels).
- Snel dubbel klikken op Verstuur of een startvraag tijdens een lopend antwoord → genegeerd (bestaand `pending`-gedrag).
- Opnieuw proberen na een fout terwijl de token verlopen is → bestaande refresh-op-401 vangt het.
- Paneel sluiten tijdens een lopend antwoord → stream loopt door zoals nu; heropenen toont het resultaat.
- Widget-scherm: opslaan mislukt → waarden blijven staan, fout-toast; schakelaar mislukt → terug naar de oude stand.
