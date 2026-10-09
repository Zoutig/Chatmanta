# V1 UI-redesign golf 4a: admin-schil, laadskeletten en lijstpagina's

**Datum:** 2026-10-09 · **Branch/worktree:** `feat/seb/v1-ui-golf4a` · `../chatmanta-ui-golf4`
**Bovenliggende spec:** `2026-10-07-v1-ui-redesign-design.md` §3 (rustregels), §5 (snelheid), §7.9 (admin).
**Vervolg:** golf 4b = detailpagina's (klant-detail met tabs en formulieren, feedback-/issue-detail, recap per klant, quiz per klant, gesprek) en daarna `klant.css` volledig uit V1.

## Wat

Het interne admindashboard (`/v1/admin`) krijgt dezelfde schil als het klantendashboard: donkere zijbalk met glijdende markering, mobiel menu, uitloggen onderaan. Elke admin-route krijgt een laadskelet, zodat een klik direct reageert. De lijst- en overzichtspagina's gaan over op de V1-ontwerplaag en worden opgeruimd volgens de rustregels: geen emoji, Nederlandse teksten, bedragen als `€ 0,00`, lange uitleg achter een info-icoon. Geen herontwerp per scherm: dezelfde inhoud en functies, in de nieuwe stijl.

## Besliste keuzes (Seb, 2026-10-09)

1. Twee PR's: 4a (deze) en 4b.
2. Alle labels Nederlands, schrijfregels als het klantendashboard (geen em-dashes, geen emoji, geen AI-toon).
3. Zichtbare worktree.

## Acceptatiecriteria

### A. Schil
- [ ] Donkere zijbalk (zelfde `v1-sidebar`-stijl en glijdende markering als `/v1/app`) met: Overzicht, Klanten, Onboarding, Quiz (teller), Crawls en taken, Issues, Feedback (teller), Gebruik en kosten, Botprestaties, Maandrecap, Instellingen. Onderaan "Naar klantendashboard" en Uitloggen.
- [ ] Merk + label "Admin" bovenaan; geen bel/bovenbalk meer. Op telefoon (<900 px) een smalle kopbalk met menuknop en uitschuifmenu (Escape sluit, focus terug).
- [ ] Tellers komen uit dezelfde queries als nu (`getJorionAdminClient`, faalt stil naar 0).
- [ ] "Geen toegang" als rustige pagina in de nieuwe stijl.
- [ ] `klant.css` en `data-klant-scope` blijven in 4a nog op de admin-schil staan, zodat de nog niet omgezette detailpagina's (4b) intact blijven.

### B. Laadskeletten
- [ ] Elke admin-route met een `page.tsx` (19) heeft een `loading.tsx`. Nieuwe skeletvariant `table` voor lijstpagina's; detailroutes gebruiken een passende bestaande variant.

### C. Lijst- en overzichtspagina's
Overzicht, Klanten, Nieuwe klant, Onboarding, Quiz, Crawls en taken, Issues, Feedback, Gebruik en kosten, Botprestaties (incl. `?org=`-weergave), Maandrecap, Instellingen, Audit-log:
- [ ] `PageHeader` (titel, één zin, acties rechts); hooguit één hoofdknop.
- [ ] Geen `klant-*`-klassen, `--klant-*`-variabelen of imports uit `app/klantendashboard/` of `app/admindashboard/` meer in deze pagina's en in `_shell/`.
- [ ] Tabellen in één V1-tabelstijl (horizontaal scrollbaar op telefoon); cijferkaarten in V1-stijl; statuslabels als V1-`Badge`.
- [ ] Geen emoji (ook niet 👍/👎, 🎉, ✓, ⚙, ✏️, 🟢🟡🔴); vervangen door woorden of een gekleurde stip/badge.
- [ ] Bedragen via één helper: `Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })`; onder € 1 met maximaal 3 decimalen zodat kleine kosten zichtbaar blijven (`€ 0,004`). Het OpenAI-accounttotaal blijft in dollars maar nl-NL-opgemaakt (`US$ 12,34`), want omrekenen zou een verzonnen koers vereisen.
- [ ] Uitleg van meer dan één zin in kaarten of onder tabellen → `InfoTip` of ingeklapte "Meer info".
- [ ] Nederlandse teksten (bv. "Gezondheid" i.p.v. "Health", jobstatus "In wachtrij / Bezig / Klaar / Mislukt" i.p.v. de ruwe waarde, "Laag volume" i.p.v. "Lage volume").
- [ ] Datums en tijden met vaste `timeZone: 'Europe/Amsterdam'` (lost ook de hydration-kans in Crawls en taken op).
- [ ] Functies ongewijzigd: filters (links/zoekformulier), opnieuw proberen van crawls, FAQ-cadans-schakelaar, maand kiezen, recap genereren, nieuwe klant aanmaken, herladen.

### D. Kwaliteit
- [ ] `npm run typecheck`, `npm run test:unit`, schone `next build` groen.
- [ ] Playwright als admin op 1440 en 390 van elke omgezette pagina; geen console-fouten.
- [ ] V0-admin (`/admindashboard`) en het klantendashboard ongewijzigd.

## Buiten scope
- Detailpagina's en hun componenten (golf 4b): `organizations/[id]/**`, `feedback/[id]`, `issues/[groupId]`, `maandelijkse-recap/[orgId]`, `quiz/[orgId]`. Ze krijgen in 4a alleen een laadskelet.
- Verwijderen van `klant.css` uit V1 (4b).
- Nieuwe functies, nieuwe metrics, andere queries, server actions, datamodel.
- Een zoek-palette voor admin.
- Herontwerp van grafieken buiten restylen (de dagelijkse lijngrafiek wordt een V1-versie met dezelfde data).

## Randgevallen
- Geen data (lege lijsten, nieuwe omgeving) → compacte lege staat, één regel.
- DB-fout bij tellers of pagina's → zoals nu: stil naar 0 of de bestaande foutregel, in nieuwe stijl.
- Niet-admin ingelogd → "Geen toegang"; geen sessie → redirect naar `/v1/login` (ongewijzigd).
- Lange klantnamen en brede tabellen → afkappen of horizontaal scrollen binnen de kaart, geen paginabrede scroll.
- Bedragen 0, negatief (niet verwacht) of `null` → `€ 0,00` resp. "Onbekend".
