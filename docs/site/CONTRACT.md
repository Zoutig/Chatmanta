# Marketingsite: bouwcontract voor de sectie-agents (M3/M4)

Het fundament (M2) staat. Dit document zegt wat je mag aanraken, welke bouwstenen er zijn en welke conventies gelden. Wil je iets in een gedeeld bestand veranderen? Meld het in je eindrapport aan de orchestrator en pas het niet zelf aan. Parallelle agents botsen anders op hetzelfde bestand.

**Bronnen van waarheid:** `docs/site/mockup-final.html` (visueel, interactie en motion, zo exact mogelijk volgen), `docs/site/COPY.md` (alle tekst, letterlijk), spec `docs/superpowers/specs/2026-10-10-marketing-site-design.md`, plan `docs/superpowers/plans/2026-10-10-marketing-site-plan.md`.

**Stack:** Next.js 16.2, React 19.2, `motion` v12 (`import … from 'motion/react'`). Geen nieuwe dependencies.

---

## 1. Wie mag welke bestanden aanraken

| Pakket | Mag aanmaken/aanpassen |
|---|---|
| **M3a**: hero, vertrouwensstrook, probleem | `components/site/sections/{hero,trust-strip,problem}.tsx` + `.css`, plus submappen `components/site/sections/{hero,trust-strip,problem}/**` |
| **M3b**: hoe het werkt, functies, eerlijk | `components/site/sections/{how-it-works,features,honest}.tsx` + `.css`, plus submappen met dezelfde naam |
| **M3c**: dashboard, rekenhulp, prijzen | `components/site/sections/{dashboard-showcase,roi-calculator,pricing}.tsx` + `.css`, plus submappen. Een dashboard-screenshot gaat naar `public/site/dashboard/*` |
| **M3d**: live demo, FAQ, slot-CTA | `components/site/sections/{live-demo,faq,final-cta}.tsx` + `.css`, plus submappen. `/voorwaarden` bestaat al als placeholder (`app/(site)/voorwaarden/page.tsx`) en hoeft niet opnieuw |
| **M4**: kennismaking | `app/(site)/kennismaking/**`, `app/api/site/**`, `components/site/kennismaking/**`, `lib/site/kennismaking*.ts` + tests in `lib/site/__tests__/` |

**Niet aanraken. Dit is van de orchestrator:** `app/(site)/layout.tsx`, `app/(site)/page.tsx`, `app/(site)/site.css`, `components/site/ui/*`, `components/site/nav.tsx`, `components/site/footer.tsx`, `lib/site/pricing.ts`, `lib/site/navigation.ts`, `proxy.ts`, `next.config.ts`, `app/globals.css`, `app/layout.tsx` en alles onder `app/v0`, `app/v1` en `app/voorbeeld`.
- Heb je een nieuw icoon nodig? Zet het lokaal in je submap (bijv. `sections/features/icons.tsx`). De orchestrator kan het later naar `ui/icon.tsx` verhuizen.
- Heb je een gedeelde stijl nodig (zoals het chatvenster)? Die staat al in `site.css`, zie §4. Iets anders nodig? Schrijf het sectie-lokaal en meld het.

## 2. De pagina en de sectie-contracten

`app/(site)/page.tsx` rendert de secties in deze volgorde. Elke sectie is een **default export zonder props**. Houd het `id` en de root-klasse vast. Het `id` is het anker, en `scroll-margin-top` zit al in `site.css` (`section[id]`).

| # | Bestand | Component | `id` (via `SECTION_IDS`) | Root-klasse | Kop-id | Variant |
|---|---|---|---|---|---|---|
| 2 | `hero.tsx` | `Hero` | `top` (`hero`) | `s-hero` | `h-hero` (**de enige `<h1>`**) | `plain` |
| 3 | `trust-strip.tsx` | `TrustStrip` | `vertrouwen` (`trust`) | `s-trust` | (aria-label) | `plain` |
| 4 | `problem.tsx` | `Problem` | `probleem` | `s-problem` | `h-prob` | `default` |
| 5 | `how-it-works.tsx` | `HowItWorks` | `hoe-het-werkt` (`how`) | `s-how` | `h-how` | `tint` |
| 6 | `features.tsx` | `Features` | `functies` | `s-features` | `h-feat` | `default` |
| 7 | `honest.tsx` | `Honest` | `eerlijk` | `s-honest` | `h-honest` | `dark` |
| 8 | `dashboard-showcase.tsx` | `DashboardShowcase` | `dashboard` | `s-dashboard` | `h-dash` | `default` |
| 9 | `roi-calculator.tsx` | `RoiCalculator` | `rekenhulp` (`roi`) | `s-roi` | `h-roi` | `default` (mockup: `padding-top:0`) |
| 10 | `pricing.tsx` | `Pricing` | `prijzen` | `s-pricing` | `h-price` | `default` (mockup: eigen verloop) |
| 11 | `live-demo.tsx` | `LiveDemo` | `demo` | `s-demo` | `h-demo` | `default` |
| 12 | `faq.tsx` | `Faq` | `faq` | `s-faq` | `h-faq` | `default` (mockup: `padding-top:0`) |
| 13 | `final-cta.tsx` | `FinalCta` | `contact` (`finalCta`) | `s-final` | `h-final` | `default`; de navy kaart zit binnen de sectie |

- **Ankers wijken af van de mockup.** De mockup gebruikt `#hoe`, de site gebruikt `#hoe-het-werkt`. Gebruik altijd `SECTION_IDS` en `anchor()` uit `lib/site/navigation.ts`, nooit een losse string.
- De nav-items (Hoe het werkt, Functies, Prijzen, Demo, FAQ) volgen `#hoe-het-werkt #functies #prijzen #demo #faq` voor de actieve-sectie-indicator. Hernoem die ids niet.
- Elke sectie staat nu als **placeholder** met kop en copy en een `.sec-placeholder`-blok. Vervang de inhoud, maar houd de `Section`-wrapper met id, klasse en `labelledBy`.
- Wat mag een sectie-component zijn? Bij voorkeur een **server component** die de statische HTML (alle tekst) rendert. Interactie en motion zet je in een **kleine client-subcomponent** (`'use client'`) in je submap, bijvoorbeeld `sections/hero/hero-chat.tsx`.

## 3. Primitives (`components/site/ui/`)

| Import | API | Gebruik |
|---|---|---|
| `Section`, `Container`, `SectionHead` from `ui/section` | `Section({ id, variant: 'default'\|'tint'\|'dark'\|'plain', className, labelledBy, ariaLabel, contained = true, containerClassName, style })`. `Container({ className })` geeft `.wrap`. `SectionHead({ eyebrow?, title, titleId, lede?, center? })` | Sectie-wrapper met ritme-padding (`.sec`) en `.wrap`-container. Schrijf `eyebrow` gewoon ("Hoe het werkt"); CSS zet hem in hoofdletters |
| `LinkButton`, `Button` from `ui/button` | `variant: 'primary'\|'teal'\|'outline'\|'light'\|'link'`, `size: 'md'\|'sm'`, `arrow` (geanimeerde →), `block`. `LinkButton` gebruikt `next/link` voor paden die met `/` beginnen en anders `<a>` | primary = navy op licht. teal = CTA op navy (Groei-kaart, slot-kaart). outline = "Kies Start". light = wit op navy (rekenhulp). link = "Bekijk live demo →" |
| `Reveal` from `ui/reveal` (client) | `Reveal({ delay?, y? = 12, as?: 'div'\|'li', className })` | Fade en lift bij binnenscrollen. Content-first: de SSR-HTML is zichtbaar en alleen elementen onder de vouw worden na hydratie verborgen. Bij reduced motion gebeurt er niets. **Niet voor hero- of LCP-content** |
| `Logo`, `Mark`, `Wordmark` from `ui/logo` | `Logo({ href = '/#top' \| null, onDark, ariaLabel, onClick })`. `Mark({ className, style })` | `Mark` is het **echte** merkteken (`public/logo/mono-mark.png`) als CSS-mask in `currentColor`. Breedte via CSS (`.mk` is standaard 32px). Teken nooit zelf een manta |
| `Icon` from `ui/icon` | `Icon({ name, size?, className?, title? })` | Namen: `check link chev send close file warn info globe docCheck chat shieldCheck inbox database`. Decoratief, tenzij je `title` meegeeft |
| `cx` from `ui/cx` | `cx(...classes)` | Klassen samenvoegen. **Niet** `cn()` uit `lib/utils`, want tailwind-merge kent onze klassen niet |

**Data en config:**
- `lib/site/navigation.ts` bevat `ROUTES` (`home kennismaking login demo privacy voorwaarden`), `SECTION_IDS`, `anchor(key)` (geeft `/#id`), `NAV_ITEMS` en `SITE_URL`.
- `lib/site/pricing.ts` bevat `TIERS`, `FEATURES`, `PRICING` (`defaultCycle: 'yearly'`, `yearlyLabel`, `anchorLabel`, `introSpots: 25`, `showSpotsCounter: false`, `setupValue: 199`, `trialDays: 14`, `staffComparison`) en `SITE_COMPANY` (`email`, `kvk: null`). De helpers zijn puur en werken op server en client:
  - `monthlyPrice(tier, cycle, kind='intro')`
  - `yearlyTotal(tier)` geeft 348, 684 of 1788
  - `dayFraming(tier, cycle)` geeft bijvoorbeeld "Minder dan €2 per dag"
  - `billedLine(tier, cycle)`
  - `perDayCeil()`
  - `formatEuro(n, { cents? })` geeft "€1.788" of "€24,95"
  - `formatNumber(n)` geeft "2.000"
  - `staffCostPerMonth()` en `roundTo(n, 50)` geven samen ±€650
  - `getTier(id)`

  **Hardcode nooit een bedrag of limiet in een sectie.** Lees ze altijd uit deze module. De rekenhulp-uitkomst "Pakketadvies Start (€29 p/m)" komt ook uit `TIERS`.

## 4. Tokens en gedeelde klassen (`app/(site)/site.css`)

Alles staat onder `.site-ui`, de wrapper in de site-layout.

- **Kleur:** `--bg --bg-2 --surface --surface-2 --line --line-2 --ink --ink-2 --muted --faint --teal --teal-ink --teal-soft --teal-line --warn --warn-soft`. Voor navy-blokken: `--navy-deep --navy-hi --aqua --aqua-hi --aqua-pale --on-dark --on-dark-2 --line-dark --warn-dark`. Voor het fictieve bedrijf: `--demo-brand` (#e0663c).
- **Vorm en schaduw:** `--r-sm --r --r-lg --r-xl --sh-1 --sh-2 --sh-3`.
- **Focus:** `--focus` en `--focus-dark` (op navy).
- **Achtergrond:** `--contours` (de contourlijnen-SVG voor navy-blokken).
- **Motion:** `--ease --spring --fast --base --slow`.
- **Type:** `--font`, `--display` (Plus Jakarta Sans) en `--code` (Azeret Mono, **alleen** voor het codefragment).
- **Layout:** `--gutter --maxw (1200px) --nav-h --anchor-offset (72px)`.
- **Merk:** `--mark` (de mask-URL).

**Gedeelde klassen.** Je mag ze gebruiken, maar niet opnieuw definiëren.
- **Layout:** `.wrap`, `.sec`, `.sec-tint`, `.sec-dark` (zet zelf de koppen, `.lede`, `.eyebrow`, `.btn-link` en `:focus-visible` goed voor donker), `.sec-head`, `.center`.
- **Tekst:** `.eyebrow`, `.label`, `.lede`, `.sr-only`, `.tnum`.
- **Knoppen:** `.btn .btn-primary .btn-teal .btn-outline .btn-light .btn-link .btn-sm .btn-block .arrow`. Gebruik bij voorkeur de componenten.
- **Overig:** `.rr` (lijstje met vinkjes voor risk reversal), `.yes`, `.nope`.
- **Logo:** `.mk`, `.logo`, `.logo.on-dark`, `.wm em`.
- **Chatvenster (gedeeld door hero, eerlijk en demo):** `.chat .chat-head .chat-av .chat-title .chat-sub .dot-live .chat-clock .chat-log .msg.user .msg.bot .bubble .chip (.u) .typing (.on = zichtbaar) .chat-foot .chat-input .chat-send .label-ex`. Dit is de basisstijl uit de mockup. Toestanden die een sectie zelf animeert (zoals `.prep`, `.in`, streaming-woorden en de donkere varianten in "eerlijk") zet je sectie-lokaal onder `.site-ui .s-<naam>`.
- Typografie (`h1/h2/h3`), knoppen, de nav, de mobiele sheet en de footer zijn al gestyled.

## 5. CSS-conventies (gekozen: één los CSS-bestand per sectie)

- **Elke sectie heeft één stylesheet:** `components/site/sections/<naam>.css`. Het component importeert hem zelf (`import './<naam>.css'`, al gedaan in de placeholders). Subcomponenten in je submap mogen een eigen `.css` importeren, met dezelfde regels.
- **Elke selector begint met `.site-ui .s-<root>`.** Een voorbeeld is `.site-ui .s-pricing .plan.groei { … }`. Zo lekt er niets naar andere secties of naar V0/V1. De mockup-klassen botsen namelijk onderling: `.demo` is zowel het bento-paneel als de demo-sectie. Port je mockup-CSS, zet dan dit voorvoegsel ervoor.
- **Keyframes krijgen het voorvoegsel van je sectie.** Keyframe-namen zijn globaal, dus `@keyframes features-leadFly`, niet `leadFly`.
- **Geen** CSS modules, **geen** Tailwind-utilityklassen, **niets** in `app/globals.css`. De Tailwind-v4-PostCSS-valkuil dropt daar soms stil properties. Gebruik inline `style` alleen voor dynamische waarden, zoals `--p` op een slider of een berekende transform.
- Media-queries volgen de breekpunten uit de mockup. Geen horizontale scroll van 375 tot 1440 px.

## 6. Motion en interactie

- Gebruik `motion/react` (`motion`, `useInView`, `useScroll`, `useTransform`, `useReducedMotion`, `AnimatePresence`) of CSS-animaties, zoals de mockup doet. Geen andere animatielibraries.
- **Content eerst.** Alle tekst staat in de SSR-HTML. Typen of streamen is alleen visueel (`aria-live="off"`, volledige tekst in de DOM). Een sectie mag nooit leeg zijn zonder JS.
- **Reduced motion is verplicht.** Gebruik `useReducedMotion()` in JS. CSS-animaties worden al globaal naar 1ms gezet. Toon dan de eindtoestand (bijvoorbeeld de quiz op "!" en de naald op 55°), geen lege of verborgen staat.
- **Loops pauzeren buiten beeld en bij een verborgen tabblad** (`useInView` en `document.visibilitychange`), zoals `makeGate` in de mockup.
- Per sectie is er één signatuurmoment. Alle andere motion is subtiel (spec §9).
- `'use client'` alleen in de bladcomponent die het nodig heeft.

## 7. Content, toegankelijkheid en links

- Neem de tekst **letterlijk** over uit `COPY.md`. Geen nep-logo's, nep-reviews, verzonnen cijfers of aftellende schaarste. `PRICING.showSpotsCounter` staat op `false`.
- Er is **één `<h1>`** (hero). Elke sectie heeft een `<h2>` met de kop-id uit de tabel in §2. Kaarten krijgen `<h3>`.
- Tap-targets zijn minimaal 44px en elk interactief element heeft een zichtbare focus. Een toggle krijgt `aria-pressed` en een accordeon `aria-expanded`/`aria-controls`, net als in de mockup.
- Links:
  - Primaire CTA: `ROUTES.kennismaking`. Vanaf de prijskaart wordt dat `/kennismaking?pakket=<tierId>`, vanaf de rekenhulp `?bron=rekenhulp`.
  - Demo: `ROUTES.demo`.
  - Inloggen: `ROUTES.login`.
  - Mail: `SITE_COMPANY.email`.
- Schermafbeeldingen gaan naar `public/site/**` (dat pad is al publiek via de `.png`/`.svg`-uitzondering in de proxy). Gebruik `next/image`.

## 8. Wat al werkt en wat nog open staat

- `/` is publiek (geen V0-gate). De nav is sticky, wordt compact na scrollen, heeft een voortgangslijn, een actieve-sectie-indicator en een mobiele sheet. De footer is er ook.
- `/voorwaarden` is een placeholder. `/sitemap.xml`, `/robots.txt` en de OG-image (`/opengraph-image-<hash>`) werken, en de metadata is `nl_NL`.
- `/kennismaking` geeft een 404 tot M4. Daardoor zie je één console-404 van de Link-prefetch. Dat is verwacht.
- **Nog niet gebouwd:** de doorlopende widget-knop en teaser uit de mockup ("Doorlopend: widget-knop"). Die hoort bij de dogfooding-stap (M6) of de orchestrator. Sectie-agents bouwen hem niet.

## 9. Klaar per pakket (acceptatie)

- `npm run typecheck` is groen.
- Voor een build: wis eerst `.next` en draai dan `npm run build`. Dat moet groen zijn.
- De pagina matcht mockup-final op 1440 en 390 px.
- De reduced-motion-variant klopt.
- Er is geen horizontale scroll.
- Er zijn geen console-errors, afgezien van de bekende `/kennismaking`-prefetch tot M4.
- Er zijn alleen bestanden uit je eigen rij in §1 gewijzigd.
