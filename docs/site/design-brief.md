# DESIGN BRIEF: marketingsite chatmanta.nl

*Synthese van 4 onderzoeksrapporten (landing-benchmark, motion-benchmark, NL-copy, conversie en prijzen) + spec `docs/superpowers/specs/2026-10-10-marketing-site-design.md` + V1-ontwerplaag "Diepzee" (`app/v1/_ui/ui.css`) + logo (`public/logo/`). Datum: 10-10-2026. Voor: de 3 ontwerp-agents van het toernooi (spec §11, fase 2) en de jury.*

**Leesregel.** Alles in §1-§6 is **gedeelde basis**: copy, structuur, prijzen, CTA's, motion-principes en conversie-eisen. De 3 richtingen verschillen **alleen in visuele taal** (§7). Wie copy, volgorde of een bedrag aanpast, valt uit het toernooi. Punten met **[SEB]** zijn open beslissingen (§8). Daar gebruiken de mockups de hier aanbevolen variant.

---

## 1. Positionering en kernbelofte

**Positionering:** ChatManta is de Nederlandse website-chatbot voor het MKB die **alleen antwoordt uit jouw eigen website en documenten**. Hij noemt bij elk antwoord de bron. Weet hij iets niet, dan zegt hij dat eerlijk en maakt hij van die vraag een lead.

**Kernbelofte in één zin:**
> **Je website beantwoordt elke klantvraag, dag en nacht, met bron erbij. En wat hij niet weet, wordt een nieuwe klant in je mailbox in plaats van een verzinsel.**

**Onderscheid (de as van alle ontwerpkeuzes).** Elke NL-concurrent (Watermelon, Trengo, Lime) verkoopt automatisering, percentages en logomuren. Geen van hen profileert zich op **"verzint niets"**. De bronlink en de eerlijke weigering zijn dus het visuele en verbale signatuur-element van de hele site.

**Toon:** "je", ondernemer tegen ondernemer, met Moneybird als referentie. Koppen zijn beeldend en kort, bodytekst is feitelijk zonder superlatieven. Woorden die niet voorkomen: RAG, LLM, AI-agent, omnichannel, revolutionair. "AI" hooguit één keer per sectie. Alles is Nederlands, ook de alt-teksten, aria-labels en microcopy.

---

## 2. Hero-headline

**Gekozen:**
> **Je website beantwoordt elke klantvraag. Ook om 23:00.**
> *Sub:* ChatManta leest je website en documenten en geeft bezoekers direct antwoord, met een link naar de bron. Weet hij het niet? Dan zegt hij dat eerlijk en vraagt hij om hun gegevens.

Waarom deze kop: hij volgt de richting uit de spec, roept een concreet beeld op ("23:00") en is makkelijk te onthouden. De subregel dekt alle drie de beloftes: antwoorden, eerlijkheid en leads. De klok in het hero-gesprek toont 23:04, zodat beeld en kop elkaar bewijzen.

**Alternatief A:** *Elke klantvraag beantwoord. Ook als jij er niet bent.*
Sub: Een chatbot die alleen antwoordt uit jouw eigen content. Geen verzinsels, wel nieuwe aanvragen in je mailbox.

**Alternatief B:** *Van vraag naar klant, terwijl jij slaapt.*
Sub: Bezoekers krijgen direct antwoord. Wie meer wil, laat gegevens achter. Jij belt morgen terug.

*(Gereserveerd: "Liever eerlijk dan verzonnen." is de kop van sectie 7 en wordt niet in de hero gebruikt.)*

**Belofteregel voor live-gang.** Er is nog geen self-service signup. Schrijf daarom nooit "live in minuten" als totaalbelofte. Wel toegestaan: "**binnen een werkdag live**" [SEB/ops bevestigen] en "één regel code, in een paar minuten geplaatst", dat laatste alleen voor de technische stap.

---

## 3. Sectie-volgorde (definitief, 14 conform spec §5)

Per sectie staan hieronder het doel, de kern-copy en het **ene** signatuur-motionmoment. Andere beweging in een sectie mag alleen een micro-interactie zijn (§4). Elke sectie bestaat uit 1 kop en 1 bewijsstuk, zonder sub-sub-features.

### 1. Nav (sticky)
- **Doel:** oriëntatie, en de primaire actie altijd binnen bereik.
- **Copy:** [logo] · Hoe het werkt · Functies · Prijzen · Demo · FAQ · `Inloggen` (tekstlink → `/v1/login`) · **[Plan een kennismaking]** (gevuld, → `/kennismaking`).
- **Motion:** na ~80px scroll wordt de nav compact en krijgt hij een achtergrond met blur. Daarnaast een dunne scroll-voortgangslijn (`scaleX`). Het actieve sectie-item krijgt een onderstreping die via `layoutId` meeschuift.
- Mobiel: hoogte ≤56px, hamburger → sheet met dezelfde items. De CTA blijft zichtbaar in de balk.

### 2. Hero
- **Doel:** in 5 seconden laten zien wat het product doet en waarom het te vertrouwen is.
- **Copy:** kop + sub uit §2.
  - Primair: **[Plan een gratis kennismaking]**
  - Secundair: **Bekijk live demo →** (`/voorbeeld`)
  - Risk reversal direct onder de knoppen, klein: *14 dagen gratis · Maandelijks opzegbaar · Inrichting gratis*
- **Hero-gesprek** (chatvenster, header "Fietsenmaker Van Dam · voorbeeld", klok 23:04):
  > Bezoeker: *Zijn jullie zaterdag open? Mijn band is lek.*
  > Bot: *Ja, op zaterdag zijn we open van 9:00 tot 16:00. Een lekke band plakken we meestal terwijl je wacht.*
  > [chip] **Bron: vandam-fietsen.nl/openingstijden**
  (Het bedrijf is fictief en het venster draagt het label "Voorbeeldgesprek".)
- **★ Signatuur: zelftypende chat met bronlink.** Eerst verschijnt de vraag, dan typ-puntjes, dan streamt het antwoord woord voor woord, en tot slot schuift de bronlink-chip in (layout-animatie). De volledige tekst staat al in de SSR-DOM met `aria-live="off"`; het typen is alleen visueel. De loop pauzeert buiten beeld en in een verborgen tab.
- Mobiel 375×667: kop, sub en primaire CTA staan **boven** het gesprek en boven de fold.

### 3. Vertrouwensstrook
- **Doel:** de vier grootste bezwaren in één regel wegnemen.
- **Copy (aanbevolen, juridisch veilig) [SEB]:** **Opgeslagen in Europa** · **Verwerkersovereenkomst beschikbaar** · **Volledig Nederlands** · **Antwoordt alleen uit jouw content**
  *(De spec-labels "Data in Europa" en "AVG-proof" pas gebruiken als OpenAI-EU en de DPA rond zijn. Zie §8.)*
- **Motion:** geen signatuur, alleen een scroll-reveal. Dit is een rustpunt.

### 4. Probleem
- **Doel:** herkenning. De ondernemer ziet zijn eigen dag.
- **Kop:** *Je klanten hebben vragen. Op momenten dat jij er niet bent.*
- **Drie kaarten, met een letterlijke klantvraag als visueel motief:**
  1. **Ze zoeken en vinden het niet.** Het antwoord staat ergens op je site, maar bezoekers klikken niet door vijf pagina's. Ze haken af of gaan naar de concurrent.
  2. **Je mailbox loopt vol met hetzelfde.** "Wat kost een APK?" "Leveren jullie in Groningen?" Elke dag dezelfde vragen, elke keer opnieuw typen.
  3. **De aanvraag van 22:00 is morgen koud.** Wie 's avonds een offerte wil, wacht niet tot jij om 9 uur je mail opent.
- **★ Signatuur:** de klantvraag-bubbels stapelen zich op in een "inbox"-teller (bijvoorbeeld 3 → 17 ongelezen) terwijl de sectie in beeld scrollt. Dat maakt de pijn zichtbaar. Reduced motion: de eindstand staat er direct.
- Geen statistieken van derden zonder geverifieerde primaire bron (zie §8).

### 5. Hoe het werkt (3 stappen), het dragende moment van de pagina
- **Doel:** het product uitleggen zonder jargon ("hij leest jóuw site").
- **Kop:** *Zo staat ChatManta op je site.*
- **Stappen:**
  1. **Geef je webadres op.** Wij lezen je website en, als je wilt, je documenten zoals prijslijsten, voorwaarden en handleidingen.
  2. **ChatManta leert je bedrijf kennen.** Elke pagina wordt doorzocht en geordend. Jij test de antwoorden voordat iemand anders ze ziet.
  3. **Eén regel code, en je bent live.** Plak het fragment in je site (WordPress, Shopify, Wix, alles werkt) of laat het ons doen. De chatbot verschijnt in jouw kleuren, met jouw logo.
- In stap 3 staat het **letterlijke snippet** in een codeblok: `<script src="https://chatmanta.nl/widget-v1.js" data-bot="jouw-bedrijf" defer></script>` (illustratief; exacte attributen bij de bouw uit de echte widget halen).
- Na de sectie volgt een secundaire link: **Zie het zelf: live demo →**
- **★ Signatuur: sticky stage met scroll-gestuurde crawl.** Op desktop staat links een sticky paneel en rechts staan de 3 tekstblokken. De actieve stap (`useInView`, amount 0.6) bepaalt wat het paneel toont:
  - stap 1: URL-veld typt "vandam-fietsen.nl"
  - stap 2: een mini-sitemap van paginategels, met een scanlijn eroverheen (`useScroll` + `useTransform`, scrubbable, ook terug). Elke tegel valt uiteen in tekstblokjes die naar een "kennisbank" vliegen. Een teller loopt mee: "24 pagina's gelezen". Maximaal ~60 bewegende elementen.
  - stap 3: het snippet licht op, en de widget-bubbel verschijnt op een mini-website.
  Bouw het in DOM en SVG, geen image-sequence. Mobiel: geen sticky, maar stappen onder elkaar met elk een eigen mini-visual. Reduced motion: een statisch driedelig diagram met cross-fades.

### 6. Functies (bento-grid)
- **Doel:** laten zien wat je krijgt, door het te tonen in plaats van op te sommen.
- **Kop:** *Alles wat je nodig hebt. Niets wat je niet gebruikt.*
- **Tegels (6):**
  - **Leads binnenhalen.** Weet de bot het niet, of wil iemand een offerte? Dan vraagt hij netjes om naam en contactgegevens, en jij krijgt een seintje. *(Groei en Compleet)*
  - **Gesprekken teruglezen.** Zie precies wat bezoekers vragen en wat de bot antwoordde. Gratis marktonderzoek.
  - **Kennisgat-quiz.** ChatManta ziet welke vragen hij niet kon beantwoorden en stelt jou een paar korte vragen. Jouw antwoord vult het gat, voortaan voor iedereen.
  - **Jouw stijl, jouw logo.** Eigen kleur, eigen icoon, eigen begroeting. Het voelt als onderdeel van je site.
  - **Fast mode.** Nog sneller antwoord bij eenvoudige vragen. *[SEB: één zin over de trade-off bevestigen]*
  - **Antwoord mét bron.** Elk antwoord linkt naar de pagina waar het vandaan komt, zodat je klant het zelf kan nalezen.
- **★ Signatuur: bento-tegels met live micro-demo's.** Elke tegel speelt een lus van 3 à 4 seconden:
  - leads: een formulierkaartje schuift naar de inbox
  - teruglezen: rijen scrollen
  - quiz: "?" wordt "✓"
  - stijl: de widget wisselt van kleur
  - Fast: een snelheidsmeter
  - bron: de chip verschijnt

  Er spelen **nooit meer dan 2 tegels tegelijk**: in beeld plus hover of focus. Op mobiel speelt alleen de tegel die in beeld is. Een tilt van maximaal 4° bij hover mag als micro-interactie. Reduced motion: een stilstaand eindframe.

### 7. Liever eerlijk dan verzonnen (merkhart)
- **Doel:** het grootste bezwaar ("hij gaat onzin vertellen") omzetten in de reden om te kiezen.
- **Kop:** *Liever eerlijk dan verzonnen.*
- **Body:** Veel chatbots doen alsof ze alles weten. Dan verzinnen ze een levertijd, een prijs of een garantie die niet bestaat, en jij moet het uitleggen. ChatManta werkt anders: hij antwoordt alleen met wat er in jouw website en documenten staat. Staat het er niet? Dan zegt hij dat gewoon en biedt hij aan om je klant met jou in contact te brengen.
- **Split-screen, dezelfde vraag aan twee bots:** *Kunnen jullie zaterdag nog een monteur sturen?*
  - Links (label "Een gewone chatbot"): *Ja hoor, zaterdag komt er een monteur tussen 8 en 12 uur!* Het verzonnen zinsdeel krijgt een markering met de notitie "Staat nergens op de site".
  - Rechts (label "ChatManta"): *Daar kan ik je helaas geen zeker antwoord op geven, want ik zie op de website geen zaterdagservice. Zal ik je gegevens doorgeven, zodat we je maandag meteen bellen?* Daarna verschijnt de knop **[Ja, bel me terug]**.
- **Microcopy-strook:** Alleen uit jouw content · Altijd met bronlink · Weet hij het niet, dan zegt hij het
- **★ Signatuur: split-screen weigering.** Beide gesprekken gebruiken dezelfde typ-engine als de hero (bij `useInView`). Links tekent de markering zich (`scaleX` 0→1), rechts veert de contactknop in. Zo worden anti-hallucinatie en lead capture één beeld. Geen concurrentnamen, alleen "een gewone chatbot".

### 8. Dashboard-showcase
- **Doel:** bewijzen dat het product echt bestaat (social proof zonder klanten).
- **Kop:** *Jij ziet alles wat er gebeurt.*
- **Sub:** Elk gesprek, elke vraag die hij niet wist, elk contactverzoek: overzichtelijk in je eigen dashboard. Elke maand een rapport in je mailbox *(Groei en Compleet)*.
- **Beeld:** een **echte V1-dashboard-screenshot** met de demo-org. Geen verzonnen cijfers en geen nep-klantnamen.
- **★ Signatuur: levende overlays.** Over de statische afbeelding (`next/image`, AVIF) liggen 2 à 3 absolute lagen: een nieuwe gespreksrij vliegt in, een grafieklijn tekent zich (`pathLength`) en een contactverzoek-badge licht op. Reduced motion: alleen de screenshot.

### 9. Rekenhulp (ROI)
- **Doel:** de prijs laten voelen als besparing, vlak vóór de prijzen.
- **Kop:** *Wat levert het je op?*
- **Inputs:**
  - Klantvragen per week: standaard 40, bereik 5-500
  - Minuten per vraag: standaard 4, bereik 1-15
  - Onder "Aannames aanpassen" (ingeklapt):
    - Uurkosten medewerker: standaard €30, bereik €20-60
    - Deel dat de bot afhandelt: standaard 50%, bereik 20-80%, **gelabeld als aanname** [SEB: afhandel%-factor is een aanvulling op de spec-formule, zie §8]
- **Formule:** uren/mnd = vragen/week × min / 60 × 4,33. Besparing = uren × afhandel% × uurkosten. Met de standaardwaarden geeft dat **±6 uur en ±€170 per maand** (exact €173, afgerond op tientallen), tegenover Groei €57.
- **Output:**
  - bespaarde uren per maand
  - euro's per maand
  - netto na je pakket
  - pakketadvies (vragen/mnd ≤500 Start, ≤2.000 Groei, anders Compleet)
- **Eerlijkheidsregel (altijd zichtbaar):** *Schatting. Het afhandelpercentage hangt af van hoe compleet je website is. Vragen die de bot niet weet, stuurt hij door in plaats van te gokken.*
- CTA: **[Bespreek jouw besparing]** → `/kennismaking?bron=rekenhulp`
- **★ Signatuur: verende cijfers.** `useSpring` (stiffness 120, damping 20) naar `Intl.NumberFormat('nl-NL')`, met `tabular-nums` en `aria-live="polite"` met debounce. Reduced motion: de waarde wisselt direct.

### 10. Prijzen (zie §5 voor exacte bedragen)
- **Doel:** kiezen voor Groei, zonder twijfel over de kosten.
- **Kop:** *Eerlijke prijzen. Geen verrassingen.*
- **Kostenvergelijking boven de kaarten:** *Een medewerker die 1 uur per dag klantvragen beantwoordt, kost ±€650 per maand. Groei: €57.* De aanname staat in kleine tekst: €30/uur × 21,7 werkdagen.
- Toggle (segmented): **Jaarlijks** [2 maanden gratis] | Maandelijks. Standaard jaarlijks.
- Drie kaarten met Groei in het midden (desktop), **op mobiel Groei eerst**, dan Start, dan Compleet. Exacte kaartopbouw en regels staan in §5.
- Onder de kaarten, gecentreerd:
  - *Kom je aan je limiet? Je krijgt eerst een seintje. Nooit onverwachte kosten.*
  - *Introductieprijs voor onze eerste 25 klanten — levenslang vastgezet.*
  - Knop **Vergelijk alle functies** klapt de vergelijkingstabel open.
- **★ Signatuur: toggle met prijsrol.** De pill schuift via `layoutId`. De bedragen rollen verticaal (oud y:-100%, nieuw van y:100%), met vaste breedte en `tabular-nums`, dus CLS = 0. De streep door de normale prijs tekent zich 0→100%. Micro-interactie: een subtiele spotlight-rand op **alleen** de Groei-kaart bij `(hover: hover)`. Reduced motion: alleen een opacity-wissel.

### 11. Live demo-blok
- **Doel:** de twijfelaar laten ervaren in plaats van lezen.
- **Kop:** *Probeer hem zelf. Stel een moeilijke vraag.*
- **Sub:** Op onze voorbeeldsite draait een echte ChatManta. Vraag wat je wilt en kijk wat hij doet als hij het antwoord niet weet.
- CTA: **[Open de live demo]** → `/voorbeeld`. Dit is hier de enige gevulde knop van het scherm, omdat dit blok geen kennismaking-CTA heeft.
- **★ Signatuur:** een browserframe-preview van `/voorbeeld` waarin de widget-bubbel opent bij `useInView`. Eén keer, geen loop.

### 12. FAQ
- **Doel:** de laatste bezwaren wegnemen.
- **Kop:** *Veelgestelde vragen*
- **Vragen en antwoorden:**
  1. **Verzint de chatbot weleens iets?** Hij is gebouwd om dat niet te doen. Hij antwoordt alleen op basis van jouw content en noemt de bron. Vindt hij geen goed antwoord, dan zegt hij dat en biedt hij contact aan. Elk gesprek kun je teruglezen.
  2. **Heb ik technische kennis nodig?** Nee. Wij richten alles in. Je plakt één regel code op je site, of je laat dat door ons of je webbouwer doen.
  3. **Hoe lang duurt het voor hij live staat?** Na de kennismaking meestal binnen een werkdag. *[SEB/ops bevestigen]*
  4. **Wat als mijn website verandert?** Je laat ChatManta je site opnieuw lezen en de antwoorden zijn weer actueel. *[SEB: handmatig of automatisch bevestigen]*
  5. **Waar staan mijn gegevens, en hoe zit het met de AVG?** We slaan je gegevens op in Europa, sluiten een verwerkersovereenkomst met je af en gebruiken jouw content niet om AI-modellen te trainen. *[SEB: juridische/technische check vóór publicatie]*
  6. **Wat als een klant een mens wil spreken?** Dan vraagt de chatbot om naam en contactgegevens en krijg jij direct een seintje. Jij neemt het over. *(Contactverzoeken: Groei en Compleet.)*
  7. **Wat gebeurt er als ik mijn limiet bereik?** Je krijgt eerst een seintje. Nooit onverwachte kosten.
  8. **Kan ik opzeggen?** Ja, maandelijks opzegbaar. En de eerste 14 dagen probeer je gratis.
- **Motion:** geen signatuur. Een accordion met hoogte-animatie van maximaal 250ms en een chevron die 180° draait. De hele rij is klikbaar. De content blijft in de DOM (SEO, en FAQ-schema optioneel).

### 13. Slot-CTA
- **Doel:** de beslissing vastzetten.
- **Kop:** *Laat je website vanavond al meedenken.* Alternatief: *Klaar om geen vraag meer te missen?*
- **Sub:** In een kennismaking van 20 minuten kijken we samen naar je site en wat ChatManta voor je kan doen. Geen verplichtingen.
- Knoppen: **[Plan een kennismaking]** + **Bekijk live demo →**, daaronder *Liever mailen? info@chatmanta.com*
- **★ Signatuur:** het manta-merkteken zweeft in één rustige diagonale beweging door het vlak en "trekt" een golflijn achter zich aan (SVG `pathLength`, eenmalig bij `useInView`). Dit is het enige merkmoment van de pagina. Een eventuele `three`-variant mag alleen hier, lazy na LCP, met een statische fallback op mobiel en bij reduced motion. Aanbevolen is de SVG-variant.

### 14. Footer
- **Kolommen:**
  - Product: Hoe het werkt, Functies, Prijzen, Live demo
  - Bedrijf: Kennismaking, Contact `info@chatmanta.com`
  - Juridisch: Privacy, Voorwaarden
- Onderaan: "Een Nederlands bedrijf" · © 2026 ChatManta. Het **KvK-veld komt uit config en wordt niet getoond zolang het leeg is.**
- Geen motion.

### Doorlopend (niet per sectie)
- **Dogfooding-widget:** na ~20s of 50% scroll veert er één keer per sessie een teaser uit de widget-knop: *"Probeer mij — vraag iets over de prijzen."* (`sessionStorage`, nooit over een CTA heen). Mockups tonen de bubbel rechtsonder; de feitelijke widget volgt in PR 3.
- **Scroll-reveal** van secties via CSS `view()` als progressive enhancement (§4).

**Bewust weggelaten:** een changelog-strook, concurrentnamen, een logomuur, statistieken over eigen prestaties, en een sticky CTA-balk onderin op mobiel (die botst met de widget-bubbel; de nav-CTA volstaat).

---

## 4. Motion

### Principes (hard, uit spec §9 en het onderzoek)
1. **Uitleg of feedback, nooit alleen decoratie.** Bij twijfel: schrappen.
2. **Eén signatuurmoment per sectie** (zie §3). Daaromheen alleen micro-interacties.
3. **Scroll-gestuurd alleen waar het een verhaal vertelt** (sectie 5). Geen scroll-jacking en geen smooth-scroll-libraries; de native scroll blijft leidend.
4. **Content eerst.** Tekst is altijd zichtbaar in de SSR-staat. Nooit `opacity:0` als beginstand buiten `@supports`, anders blijft tekst onzichtbaar in Firefox en lijdt LCP eronder. Lighthouse mobiel ≥90 op alle 4 categorieën.
5. **Alleen `transform`, `opacity` (en `clipPath`/`filter`) animeren.** Geen width/height/top. `will-change` alleen op elementen die echt bewegen.
6. **Loops pauzeren** buiten beeld (`useInView`) en bij `document.hidden`.
7. **Reduced motion:** globaal `<MotionConfig reducedMotion="user">`, plus per component de eindstand of een fade van ≤150ms. In CSS: `@media not (prefers-reduced-motion)`.
8. **Gereedschap:** `motion` (v12) en `three` (alleen optioneel in sectie 13). Geen nieuwe dependencies. `AnimateNumber` is Motion+ en dus betaald; tellers bouwen we zelf met `animate()` en `useInView`.
9. **Firefox:** CSS scroll-timelines alleen als enhancement. Waar het verhaal ervan afhangt (sectie 5) gebruik je `useScroll` van motion.

### Timing-tokens (overgenomen uit Diepzee, gedeeld door alle richtingen)
- `ease: cubic-bezier(0.2, 0.8, 0.2, 1)`, de standaard voor alle in- en uitkomende beweging
- `spring: cubic-bezier(0.34, 1.3, 0.64, 1)`, alleen voor feedback (knopbevestiging, chip, badge)
- `fast 150ms` (hover, tap), `base 220ms` (reveal, accordion), `slow 340ms` (sectie-overgangen)
- motion-springs: `{stiffness:120, damping:20}` voor cijfers, `{stiffness:300, damping:30}` voor layout/pill
- Typesnelheid van de chat: ~35ms per woord. Puntjes 600-900ms. Pauze tussen loops 2,5s.
- Reveal-afstand: `translateY` 8-12px, nooit meer.

### Patronen-shortlist (alleen deze)
| # | Patroon | Waar | Rol |
|---|---|---|---|
| 1 | Zelftypende chat + bronlink-chip | Hero, sectie 7 (zelfde engine) | Signatuur |
| 2 | Sticky stage + scroll-scrubbed crawl | Hoe het werkt | Signatuur (dragend) |
| 3 | Bento micro-demo-loops (max 2 tegelijk) | Functies | Signatuur |
| 4 | Split-screen + markering `scaleX` | Eerlijk | Signatuur |
| 5 | Screenshot + 2-3 overlays (`pathLength`) | Dashboard | Signatuur |
| 6 | Verende cijfers (`useSpring`) | Rekenhulp | Signatuur |
| 7 | Toggle `layoutId` + prijsrol + streep | Prijzen | Signatuur |
| 8 | Inbox-teller met stapelende bubbels | Probleem | Signatuur |
| 9 | Manta-golflijn (SVG) | Slot-CTA | Merkmoment |
| 10 | CSS `view()` scroll-reveal | Overal | Micro |
| 11 | Nav compact + voortgangslijn + `layoutId`-onderstreping | Nav | Micro |
| 12 | Knop: hover y:-1, tap scale .97, pijl +2px; verzenden → spinner → vinkje (`pathLength`) | Alle CTA's, formulier | Micro |
| 13 | Accordion ≤250ms | FAQ | Micro |
| 14 | Tilt ≤4° / spotlight-rand (alleen Groei) | Bento, prijzen | Micro, alleen `(hover:hover)` |
| 15 | Widget-teaser, 1× per sessie | Doorlopend | Micro |

**Uitgesloten:** een 3D-manta in de hero, een WebGL-gradient (CSS-blobs mogen als achtergrond, bewegen langzaam via `transform` en staan stil bij reduced motion), image-sequences, parallax zonder betekenis, en aftellende timers.

---

## 5. Prijzen: exact uit spec §6 (bron: `lib/site/pricing.ts`, alle bedragen excl. btw)

| | **Start** | **Groei** (badge, midden) | **Compleet** |
|---|---|---|---|
| Voor wie (één regel) | Voor wie wil beginnen met de standaardvragen | Voor bedrijven die er klanten mee willen winnen | Voor grotere sites en wie het volledig uit handen geeft |
| Normale prijs / mnd | €49 | €99 | €249 |
| Normaal, jaarlijks p/m | €39 | €79 | €199 |
| **Introductieprijs / mnd** | **€35** | **€69** | **€179** |
| **Introductie, jaarlijks p/m** | **€29** | **€57** | **€149** |
| Vragen / maand | 500 | 2.000 | 7.500 |
| Websitepagina's | 25 | 50 | Hele site, op maat |
| Documenten | 10 | 50 | Onbeperkt (redelijk gebruik) |
| Widget in eigen kleur + logo | ✓ | ✓ | ✓ |
| Gesprekken teruglezen | ✓ | ✓ | ✓ |
| Contactverzoeken (leads) | — | ✓ | ✓ |
| Kennisgat-quiz + FAQ-inzichten | — | ✓ | ✓ |
| Maandrapport | — | ✓ | ✓ |
| Fast mode | — | ✓ | ✓ |
| "Powered by ChatManta" weg | — | — | ✓ |
| Persoonlijke onboarding + kwartaalcheck | — | — | ✓ |
| Support | Elke werkdag, reactie binnen 1 werkdag | 24/7 bereikbaar, reactie binnen 24 uur | 24/7 prioriteit, reactie binnen 4 uur |

*(De regel "Voor wie" is nieuwe copy op uitvoeringsniveau en mag in fase 3 worden aangescherpt.)*

**Kaartopbouw (identiek in alle richtingen), van boven naar beneden:**
1. Badge boven of op de rand van de Groei-kaart, niet in de kaart.
2. Pakketnaam + regel "voor wie".
3. Klein en grijs, met streep: de normale prijs van de actieve toggle-stand (jaarlijks: €39/€79/€199, maandelijks: €49/€99/€249), met het label *"normaal, na de eerste 25 klanten"*.
4. Groot: introductieprijs **/mnd excl. btw**. Bij jaarlijks daaronder: *"p/m, jaarlijks gefactureerd (€348 / €684 / €1.788 per jaar)"*.
5. Alleen bij Groei: de dagframing, **berekend uit config per toggle-stand en naar boven afgerond**. Jaarlijks: €57×12/365 = €1,87 → *"Minder dan €2 per dag"*. Maandelijks: €69×12/365 = €2,27 → *"Minder dan €3 per dag"*.
6. Vijf vergelijkingsrijen, op elke kaart gelijk en in dezelfde volgorde: **Vragen/mnd · Websitepagina's · Documenten · Contactverzoeken (leads) · Support**. Bij Start staat **"Leads: —"** zichtbaar; dat is de decoy-taak.
7. CTA: Groei als enige **gevuld** ("Kies Groei"), Start en Compleet **outline** ("Kies Start", "Kies Compleet"). Ze linken naar `/kennismaking?pakket=start|groei|compleet`.
8. Microcopy onder elke CTA: *Kennismaking van 20 min — we richten het samen in.*
9. Risk reversal onder elke CTA (drie vinkjes, klein): **14 dagen gratis proberen · Maandelijks opzegbaar · Inrichting t.w.v. €199 — gratis**

**Overige vaste regels:**
- Groei is visueel groter (~8% hoger), met een accentrand of donker vlak.
- Toggle-label: **"2 maanden gratis"** (17% korting, dus ≈2,0 maanden).
- **Plekken-teller UIT** (`showSpotsCounter: false`). Geen timers en geen "nog X plekken".
- Vergelijkingstabel: rijen gegroepeerd als *Capaciteit · Functies · Support*, ✓ in accentkleur en "—" in grijs (geen rood kruis), met verborgen tekst "Inbegrepen" / "Niet inbegrepen". De Groei-kolom krijgt een lichte tint en de tabelkop is sticky. Op mobiel tabs Start/Groei/Compleet met Groei geselecteerd, **nooit horizontaal scrollen**.
- **Geen hardcoded bedragen in componenten.** Alles komt uit `pricing.ts`.

---

## 6. Conversie-eisen (gedeeld, meetbaar)

**CTA-kaart**
| Plek | Primair (gevuld) | Secundair |
|---|---|---|
| Nav | Plan een kennismaking | Inloggen (tekstlink) |
| Hero | Plan een gratis kennismaking | Bekijk live demo → |
| Na Hoe het werkt | — | Zie het zelf: live demo → |
| Rekenhulp | Bespreek jouw besparing | — |
| Prijskaarten | Kies Groei (alleen deze gevuld) | Kies Start / Kies Compleet (outline) |
| Demo-blok | Open de live demo | — |
| Slot | Plan een kennismaking | Bekijk live demo → · info@chatmanta.com |

Regel: een werkwoord plus een concreet resultaat. Nooit "Meer info" of "Verzenden". **Precies één gevulde primaire knop per schermhoogte.**

**Kennismakingsformulier (`/kennismaking`)**
- Eén kolom, labels boven de velden. Volgorde:
  - Naam (één veld)
  - Bedrijfsnaam
  - Website (`type=url`, accepteert ook "bedrijf.nl")
  - E-mail (`type=email`, `autocomplete=email`)
  - Telefoon **(optioneel)**, met de uitleg "alleen als je liever gebeld wordt"
  - Pakket: segmented Start/Groei/Compleet/Weet ik nog niet, voorgeselecteerd via `?pakket=`
  - Bericht (optioneel)
  - Toestemmingsvinkje met link naar `/privacy`
  - Een verborgen honeypot
- Fontgrootte ≥16px (anders zoomt iOS in), tikdoelen ≥44px, inline validatie bij blur, en de invoer blijft staan bij een fout.
- Naast of onder het formulier:
  - Reactie binnen 1 werkdag *[SEB bevestigen]*
  - Geen verplichtingen
  - Je gegevens blijven in Europa
  - "Je spreekt met de oprichter" (foto en naam van Sebastiaan) *[SEB: foto aanleveren]*
  - "Wat bespreken we": 3 bullets
- Na verzenden toont de pagina een successtate met focus op de kop: *Bedankt, [naam]! Je ontvangt een bevestiging op [e-mail]. We nemen binnen 1 werkdag contact op.* Daaronder: *Alvast kijken? Open de live demo →*
- Faalpad: een nette fout plus `mailto:info@chatmanta.com` met een vooringevulde onderwerpregel.

**Checklist (toetsbaar)**
1. Kernbelofte en primaire CTA staan boven de fold op 375×667 en 1440×900.
2. Precies één gevulde primaire knop per scherm.
3. De toggle staat standaard op jaarlijks; wisselen geeft CLS = 0.
4. Alle bedragen, de dagframing en "2 maanden gratis" komen uit `pricing.ts`. Een unit-test controleert de dagclaim per stand.
5. Elke streepprijs heeft het label "na de eerste 25 klanten".
6. De 5 kaartrijen zijn identiek op alle kaarten en Start toont "Leads: —".
7. Risk reversal staat onder alle 3 de CTA's.
8. De tabel scrollt niet horizontaal op 375px; axe geeft 0 fouten.
9. Een prijskaart-CTA zet het pakket voor in het formulier (E2E, 3×).
10. Het formulier heeft 4 verplichte velden en de optionele velden zijn gemarkeerd. De velden hebben de juiste types en autocomplete.
11. De successtate verschijnt binnen 2s met focus op de kop, en de bevestigingsmail komt aan.
12. Bij een Resend-fout blijft de invoer staan en is de mailto zichtbaar.
13. Rekenhulp: de standaardwaarden geven €173 (getoond als ±€170). De aannametekst is zichtbaar zonder klik en het pakketadvies volgt de limieten.
14. Lighthouse mobiel ≥90 ×4. Tikdoelen ≥44px. De widget-bubbel overlapt geen enkele CTA (375px).
15. Geen nep-logo's, reviews of percentages. Cijfers van derden alleen met geverifieerde, zichtbare bron.

---

## 7. Wat de 3 richtingen delen, en waarin ze mogen verschillen

### Vast voor alle richtingen (niet aanraken)
- **Copy:** alle teksten uit §2, §3, §5 en §6, letterlijk. Alleen [SEB]-punten in de aanbevolen variant.
- **Structuur:** 14 secties in deze volgorde, dezelfde nav-items, dezelfde CTA-kaart en dezelfde signatuurmomenten per sectie (§3 en §4).
- **Prijzen:** de exacte tabel, kaartopbouw en psychologie uit §5. Groei in het midden, op mobiel eerst.
- **Merk:** het logo is de manta (`public/logo/mono-mark.png`, verhouding 270×148, als CSS-mask in `currentColor`; `board-clean.svg` is de volledige illustratie). Het mantasilhouet is het enige terugkerende merkmotief: in de nav, als favicon en in sectie 13. Geen nieuwe mascotte en geen tweede metafoor.
- **Kleurbasis:** Diepzee-navy `#0c1e2e` / `#16314a` en teal `#0d9488` (tekst-teal `#0f766e` voor AA op licht) blijven herkenbaar aanwezig. Elke richting moet AA-contrast halen.
- **Body-font:** Plus Jakarta Sans (de V1-font). Alleen de display-font van de koppen mag per richting verschillen, via `next/font`.
- **Tokens:** de motion-tokens uit §4 en de focusring `0 0 0 3px rgba(13,148,136,.35)` (of een AA-equivalent op donker).
- **Techniek:** eigen laag `.site-ui` in een los CSS-bestand (niet in `globals.css`), CSS-variabelen op de root van de laag, responsive van 375 tot 1440+, geen horizontale scroll.
- **Mockup-scope voor het toernooi:** hero (incl. nav en het werkende hero-gesprek) + prijzen (incl. toggle). Beide op desktop en op 375px.

### Vrij per richting (de visuele taal)
- Licht of donker als basis per sectie (bijvoorbeeld een donkere hero met een lichte rest, of andersom), en het ritme van de afwisseling.
- De display-font en de typografische schaal (editorial-groot tegenover compact-technisch).
- Vormtaal: radii (bijvoorbeeld 12-28px), kaartstijl (schaduw, rand, glas, vlak) en lijn-/rasterwerk.
- Achtergrondbehandeling: vlak, CSS-blobs, golf- of contourlijnen, ruis. Alles statisch of langzaam, en stil bij reduced motion.
- Illustratiestijl van de micro-visuals (lijnwerk, isometrisch, UI-getrouw).
- De styling van het chatvenster (bubbelvorm, chip-vorm), zolang de bronlink-chip duidelijk herkenbaar blijft.

### Startvoorstel voor de 3 richtingen (indicatief; de agents werken het uit)
- **A — Diepzee Licht:** licht, rustig en editorial. Navy-tekst op koel wit, met teal als enig accent. Het dichtst bij V1, het meest Moneybird-achtig vertrouwd.
- **B — Diepzee Nacht:** een donkere navy hero en prijssectie met een zachte teal glow en contourlijnen als oceaanbodem. Het meest "softwarebedrijf dat weet wat het doet" (in de lijn van Linear en Resend), met het risico dat het minder MKB-warm oogt.
- **C — Getij:** een warmere ondergrond (zand of papier) met navy en teal, golflijnen als doorlopend motief en een grotere, vriendelijkere typografie. Het meest benaderbaar voor installateurs en praktijken.

---

## 8. Open beslissingen voor Sebastiaan (mockups gebruiken de aanbeveling)

| # | Punt | Spec zegt | Aanbeveling + reden |
|---|---|---|---|
| 1 | Vertrouwensstrook | "Data in Europa · AVG-proof" | **"Opgeslagen in Europa · Verwerkersovereenkomst beschikbaar"** tot OpenAI-EU en de DPA rond zijn. De chat-calls gaan nu naar OpenAI, dus de spec-claim is mogelijk onjuist. |
| 2 | Badge Groei | "Meest gekozen" | **"Aanbevolen"** tot er klantdata is. "Meest gekozen" zonder klanten is een verzonnen claim, en die verbiedt de spec zelf. |
| 3 | Dagframing | "minder dan €3 per dag" | **Afleiden per toggle-stand** (jaarlijks "< €2", maandelijks "< €3"). Een vaste "€3" is te zwak in de standaardstand en klopt niet in de normale maandprijs (€3,25). |
| 4 | Doorgestreepte prijs | anker naast de introductieprijs | **Altijd met het label "normaal, na de eerste 25 klanten"**. Een streep suggereert een eerdere prijs. B2B-reclame (art. 6:194 BW) kort laten checken. |
| 5 | ROI-formule | vragen × minuten | **Afhandel%-aanname (50%) toevoegen.** Zonder die aanname claim je 100% overname, en dat is een verzonnen cijfer. |
| 6 | Live-termijn | — | "Binnen een werkdag live" en "reactie binnen 1 werkdag" zijn beloftes. Bevestigen of aanpassen. |
| 7 | Compleet "hele site, op maat" | aparte latere taak (crawl-cap > 50) | Pas verkopen als de crawl-cap-taak klaar is, of tot dan "op maat, in overleg" laten staan. |
| 8 | Fast mode-zin, site opnieuw lezen (handmatig of auto), foto van Sebastiaan | — | Aanleveren of bevestigen vóór de copy-sign-off (fase 3). |
