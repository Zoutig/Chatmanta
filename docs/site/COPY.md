# Copy-deck: chatmanta.nl

Alle zichtbare teksten van de homepage, per sectie en in paginavolgorde. Onderaan staat de copy voor `/kennismaking`. Bedragen zijn excl. btw en komen uit `lib/site/pricing.ts`. **De code is leidend**; dit deck volgt haar.

> **Ronde "site rustiger" (okt 2026).** De homepage ging van 12 naar 8 secties (mobiel ~18 → ~9 schermhoogtes) en kreeg een eerlijkheidsronde. Vaste regels voor een volgende copywijziging:
> - **Geen bronlinks beloven.** V1 toont bewust geen bronlinks (AGENTS.md hard rule 9, `sourceLinksEnabled: false`). Alleen per klant opt-in Linkknoppen, en alleen als de bezoeker om een document/pagina vraagt: beloof dat niet als standaard. Het oude "signatuur-element" (bron-chip) uit `mockup-final.html` en design-brief is daarmee vervallen.
> - **De bot vraagt niet zelf om gegevens.** Contact loopt via de knop "Liever persoonlijk contact?" in de widget (opt-in per klant, Groei en Compleet) met een kort formulier.
> - **Kennisgat-quiz en maandoverzicht worden door ons begeleid**, niet automatisch door de bot.
> - Geen nep-invoervelden: wat op invoer lijkt, moet iets doen (de voet van het hero-gesprek linkt naar de live demo).
> - Weinig eyebrows en niet elke kop in het patroon "X. Y.".
>
> Vervallen als eigen sectie: Vertrouwensstrook (regels staan nu in "Eerlijk"), Probleem (drie kaarten + inbox-illustratie; de kern staat in de lede van "Eerlijk"), Dashboard (screenshot staat in "Functies", alleen vanaf 900px), Rekenhulp (uitklapbaar in "Prijzen"). Uit de functielijst: "Antwoord mét bron" (klopte niet) en "Fast mode" (jargon; staat nog in de vergelijkingstabel). Uit de FAQ: "Verzint de chatbot weleens iets?" (zit in "Eerlijk") en "Wat gebeurt er als ik mijn limiet bereik?" (staat onder de prijskaarten).

---

## 1. Navigatie (sticky)
- Logo: merkteken (rog) + woordmerk **Chat**Manta, met "Manta" in teal (zoals op het logobord)
- Links (volgen de paginavolgorde): Demo · Hoe het werkt · Functies · Prijzen · FAQ
- Tekstlink: **Inloggen** (→ /v1/login)
- Knop: **Plan een kennismaking** (→ /kennismaking). Blijft op mobiel altijd zichtbaar; er komt bewust géén extra sticky CTA-balk.
- Mobiel menu: dezelfde items + Inloggen + knop "Plan een kennismaking". Aria: "Menu openen" / "Menu sluiten".
- Skip-link (alleen voor screenreader/toetsenbord): "Naar de inhoud"

## 2. Hero
- **Kop:** Je website beantwoordt elke klantvraag. *Ook om 23:00.*
- **Sub:** ChatManta leest je website en documenten en geeft bezoekers direct antwoord, alleen op basis van wat daarin staat. Weet hij het niet? Dan zegt hij dat eerlijk, in plaats van iets te verzinnen.
- Primair: **Plan een gratis kennismaking →**
- Secundair: **Bekijk live demo →** (→ /voorbeeld)
- Eén regel: 14 dagen gratis · maandelijks opzegbaar · inrichting gratis · **vanaf €29 per maand** (→ #prijzen) excl. btw
- Chatvenster
  - Label: Voorbeeldgesprek · fictief bedrijf
  - Header: Fietsmakerij De Vrijloop, met daaronder "Antwoordt uit devrijloop.nl". Klok: 23:04
  - Bezoeker: Zijn jullie zaterdag open? Mijn band is lek.
  - Bot: Ja, op zaterdag zijn we open van 9:00 tot 16:00. Een lekke band plakken we meestal terwijl je wacht.
  - Voet (echte link → /voorbeeld): **Stel zelf een vraag in de live demo →**

## 3. Liever eerlijk dan verzonnen (donkere sectie)
- **Kop:** Liever eerlijk dan verzonnen.
- **Body:** Je klanten stellen hun vragen ook als jij er niet bent. Veel chatbots vullen dat gat met een verzonnen levertijd, prijs of garantie. ChatManta antwoordt alleen met wat er op jouw website en in je documenten staat. Staat het er niet, dan zegt hij dat.
- Links, EEN GEWONE CHATBOT
  - Bezoeker: Kunnen jullie zaterdag nog een monteur sturen?
  - Bot: Ja hoor, *zaterdag komt er een monteur tussen 8 en 12 uur!*
  - Notitie: Staat nergens op de site
- Rechts, CHATMANTA
  - Bezoeker: Kunnen jullie zaterdag nog een monteur sturen?
  - Bot: Dat kan ik niet met zekerheid zeggen: op de website staat niets over een zaterdagservice. Neem gerust contact op, dan wordt het voor je nagekeken.
  - Illustratie van de widgetknop (niet klikbaar): Liever persoonlijk contact?
- Vertrouwensregels: Antwoordt alleen uit jouw content · Opgeslagen in Europa · Verwerkersovereenkomst beschikbaar · Volledig Nederlands

## 4. Live demo
- **Kop:** Stel hem zelf een lastige vraag
- **Sub:** Op onze voorbeeldsite van een fictief vakantiepark draait een echte ChatManta. Vraag wat je wilt en kijk wat hij doet als hij het antwoord niet weet.
- Knop: **Open de live demo →** (→ /voorbeeld)
- Browser-preview (alleen vanaf 640px): "Voorbeeldbedrijf" (Diensten · Over ons · Contact), "Een fictieve site met een echte ChatManta.", widget "Stel je vraag", met "Hoi! Waar kan ik je mee helpen?" en "Wat als je het niet weet?"

## 5. Hoe het werkt
- **Kop:** Zo staat ChatManta op je site
- Stap 1. **Geef je webadres op.** Wij lezen je website en, als je wilt, je documenten zoals prijslijsten, voorwaarden en handleidingen.
- Stap 2. **ChatManta leert je bedrijf kennen.** Elke pagina wordt doorzocht en geordend. Jij test de antwoorden voordat iemand anders ze ziet.
- Stap 3. **Eén regel code, en je bent live.** Plak het fragment in je site (WordPress, Shopify, Wix, alles werkt) of laat het ons doen. De chatbot verschijnt in jouw kleuren, met jouw logo.
  - Code: het echte V1-fragment met `data-org="jouw-bedrijf"` (illustratief)
- Desktop-visual (sticky stage, decoratief): scène 1 "Jouw website" met URL-veld en documenten, scène 2 "Pagina's lezen en ordenen", scène 3 "Plakken en live". Mobiel: geen visuals.

## 6. Functies
- **Kop:** Wat je erbij krijgt
- **Contactverzoeken** (In Groei en Compleet). Wil een bezoeker liever persoonlijk contact? Via een kort formulier in de chat laat hij naam en e-mail of telefoonnummer achter, en jij krijgt een seintje.
- **Gesprekken teruglezen.** Zie wat bezoekers vragen, wat de chatbot antwoordde en welke vragen hij niet kon beantwoorden. In Groei en Compleet zetten wij elke maand de belangrijkste inzichten voor je op een rij.
- **Kennisgat-quiz** (In Groei en Compleet). Wij zoeken met je mee waar je kennisbank nog gaten heeft en zetten daar een paar korte vragen voor je klaar. Jouw antwoorden vullen het gat, voortaan voor iedereen.
- **Jouw stijl, jouw logo.** Eigen kleur, eigen icoon, eigen begroeting. De chat voelt als onderdeel van je site.
- Vanaf 900px: screenshot van het V1-dashboard (demo-omgeving), onderschrift: Je eigen dashboard, hier met de gegevens van ons fictieve voorbeeldbedrijf.

## 7. Prijzen
- **Kop:** Wat het kost
- Toggle: **Jaarlijks** [2 maanden gratis] | Maandelijks. Standaard staat hij op jaarlijks.
- Onder 980px (met JS): tabs Start / Groei / Compleet boven één kaart, Groei voorgeselecteerd.

| | Start | Groei [label linksboven: Aanbevolen] | Compleet |
|---|---|---|---|
| Voor wie | Voor wie wil beginnen met de standaardvragen | Voor bedrijven die er klanten mee willen winnen | Voor grotere sites en wie het volledig uit handen geeft |
| Doorgestreept (jaarlijks / maandelijks) | €39 / €49 | €79 / €99 | €199 / €249 |
| Label bij streep | normaal, na de eerste 25 klanten | idem | idem |
| Prijs (jaarlijks / maandelijks) | €29 / €35 /mnd excl. btw | €57 / €69 | €149 / €179 |
| Regel jaarlijks | p/m, jaarlijks gefactureerd (€348 per jaar) | (€684 per jaar) | (€1.788 per jaar) |
| Regel maandelijks | maandelijks gefactureerd | idem | idem |
| Dagframing (gewone tekstregel, geen badge) | — | Minder dan €2 per dag (jaarlijks) / Minder dan €3 per dag (maandelijks) | — |
| Vragen/mnd | 500 | 2.000 | 7.500 |
| Websitepagina's | 25 | 50 | Hele site — op maat, in overleg |
| Documenten | 10 | 50 | Onbeperkt (redelijk gebruik) |
| Contactverzoeken (leads) | — | ✓ | ✓ |
| Support | Elke werkdag, reactie binnen 1 werkdag | 24/7 bereikbaar, reactie binnen 24 uur | 24/7 prioriteit, reactie binnen 4 uur |
| Knop | Kies Start (outline) | **Kies Groei →** (gevuld) | Kies Compleet (outline) |

- Onder elke knop: Kennismaking van 20 min — we richten het samen in.
- Risk reversal onder elke knop: 14 dagen gratis proberen · Maandelijks opzegbaar · Inrichting t.w.v. €199 — gratis
- Onder de kaarten: Kom je aan je limiet? Je krijgt eerst een seintje. Nooit onverwachte kosten. · Introductieprijs voor onze eerste 25 klanten — levenslang vastgezet.
- Uitklapper **Reken uit wat het je oplevert** (open: **Verberg rekenhulp**), anker `#rekenhulp`:
  - Schuiven: Klantvragen per week (40) · Minuten per vraag (4)
  - Uitklapper **Aannames aanpassen**: Uurkosten medewerker (€30) · Deel dat ChatManta zelf afhandelt [AANNAME] (50%)
  - Uitkomst: Bespaarde uren per maand **±6 uur** · Besparing per maand **±€170** · Netto na je pakket **±€140** · Pakketadvies **Start (€29 p/m)**
  - Aanname, altijd zichtbaar en live bijgewerkt: Aanname: ChatManta handelt **±50%** van de vragen zelf af, tegen **€30** per uur. Pas dit aan onder "Aannames aanpassen".
  - Eerlijkheidsregel: Schatting. Het afhandelpercentage hangt af van hoe compleet je website is. Vragen die de bot niet weet, stuurt hij door in plaats van te gokken.
  - Knop: **Bespreek jouw besparing →** (→ /kennismaking?bron=rekenhulp)
- Uitklapper **Vergelijk alle functies** (open: **Verberg vergelijking**)
  - Groep Capaciteit: Vragen / maand · Websitepagina's · Documenten
  - Groep Functies: Widget in eigen kleur + logo (✓✓✓) · Gesprekken teruglezen (✓✓✓) · Contactverzoeken (leads) (—✓✓) · Kennisgat-quiz + FAQ-inzichten (—✓✓) · Maandrapport (—✓✓) · Fast mode (—✓✓) · "Powered by ChatManta" weg (——✓) · Persoonlijke onboarding + kwartaalcheck (——✓)
  - Groep Support: zie de tabel hierboven
  - Mobiel: tabs Start / Groei / Compleet, met Groei voorgeselecteerd

## 8. FAQ
- **Kop:** Veelgestelde vragen
1. **Heb ik technische kennis nodig?** Nee. Wij richten alles in. Je plakt één regel code op je site, of je laat dat door ons of je webbouwer doen.
2. **Hoe lang duurt het voor hij live staat?** Na de kennismaking meestal binnen een werkdag.
3. **Wat als mijn website verandert?** Vanuit je dashboard laat je ChatManta je site opnieuw lezen, en de antwoorden zijn weer actueel.
4. **Waar staan mijn gegevens, en hoe zit het met de AVG?** Je gegevens worden opgeslagen in Europa. Voor het formuleren van antwoorden gebruiken we OpenAI, onder een verwerkersovereenkomst; jouw content wordt niet gebruikt om AI-modellen te trainen.
5. **Wat als een klant een mens wil spreken?** Zet je contactverzoeken aan, dan staat er in de chat een knop "Liever persoonlijk contact?". Je bezoeker laat via een kort formulier naam en e-mail of telefoonnummer achter, en jij krijgt een seintje. Jij neemt het over. (Contactverzoeken: Groei en Compleet.)
6. **Kan ik opzeggen?** Ja, maandelijks opzegbaar. En de eerste 14 dagen probeer je gratis.

## 9. Slot-CTA
- **Kop:** Benieuwd wat hij met jouw website doet?
- **Sub:** In een kennismaking van 20 minuten kijken we samen naar je site. Daarna staat hij meestal binnen een werkdag live. Geen verplichtingen.
- Knop: **Plan een kennismaking →**
- Liever mailen? info@chatmanta.com
- Vanaf 960px: golflijn + zwemmend merkteken rechts (decoratief); daaronder geen zee-strook.

## 10. Footer
- Merkregel: De Nederlandse website-chatbot die alleen antwoordt uit jouw eigen website en documenten.
- Product: Hoe het werkt · Functies · Prijzen · Live demo
- Bedrijf: Kennismaking · info@chatmanta.com
- Juridisch: Privacy · Voorwaarden
- Onderregel: Een Nederlands bedrijf · © 2026 ChatManta *(geen KvK)*

## Meta
- Paginatitel: ChatManta website-chatbot
- Description: ChatManta: de Nederlandse website-chatbot die alleen antwoordt uit jouw eigen website en documenten, en eerlijk zegt wanneer hij iets niet weet.

---

## /kennismaking (formulier, uit brief §6; niet in de mockup)
- **Kop (voorstel):** Plan een kennismaking
- **Intro (voorstel):** In 20 minuten kijken we samen naar je site en wat ChatManta voor je kan doen.
- Velden, labels boven het veld
  - Naam
  - Bedrijfsnaam
  - Website (placeholder: bedrijf.nl)
  - E-mail
  - Telefoon *(optioneel)*. Hint: alleen als je liever gebeld wordt
  - Pakket: Start / Groei / Compleet / Weet ik nog niet. Wordt voorgeselecteerd via ?pakket=
  - Bericht *(optioneel)*
  - Toestemming: Ik ga akkoord met de verwerking van mijn gegevens volgens de [privacyverklaring]. *(voorstel)*
- Knop (voorstel): **Plan mijn kennismaking**. Geen "Verzenden".
- Naast of onder het formulier
  - Reactie binnen 1 werkdag
  - Geen verplichtingen
  - Gegevens opgeslagen in Europa
  - Je spreekt met een van de oprichters: Sebastiaan of Niels. *(geen foto)*
- Blok "Wat bespreken we" (3 bullets, voorstel)
  - Welke vragen je klanten nu stellen
  - Hoe ChatManta jouw site leest en antwoordt
  - Welk pakket past, en wanneer je live kunt
- Validatie (voorstel)
  - Vul je naam in.
  - Vul een geldig e-mailadres in.
  - Vul je website in, bijvoorbeeld bedrijf.nl.
  - Vink aan dat we je gegevens mogen gebruiken om contact op te nemen.
- **Bevestiging:** Bedankt, [naam]! Je ontvangt een bevestiging op [e-mail]. We nemen binnen 1 werkdag contact op. Daaronder: Alvast kijken? **Open de live demo →**
- **Foutmelding (voorstel):** Er ging iets mis bij het versturen. Je gegevens staan er nog. Probeer het opnieuw of mail ons direct: info@chatmanta.com (mailto met vooringevuld onderwerp "Kennismaking ChatManta").
