# Marketing-site chatmanta.nl — design

**Datum:** 2026-10-10 · **Status:** goedgekeurd in brainstorm (Sebastiaan) · **Branch:** `feat/seb/marketing-site` · **Worktree:** `../chatmanta-site`

## 1. Doel

Een publieke voordeur op `chatmanta.nl` (`/`) die elke bezoeker in één scroll laat begrijpen wat ChatManta voor zijn bedrijf betekent, vertrouwen wekt, en naar één van twee acties leidt: **Plan een kennismaking** (primair) of **Bekijk live demo** (`/voorbeeld`, secundair). Plus een duidelijke **Inloggen** (→ `/v1/login`).

Toon: clean, sleek, professioneel, premium — en indrukwekkend, met motion design dat laat zien dat dit een softwarebedrijf is dat weet wat het doet. **Maar functionaliteit en duidelijkheid gaan vóór effect**: duidelijke CTA's, duidelijk wat we voor de klant betekenen.

Scope-noot: de marketingsite stond in `V2_SCOPE_EN_PRINCIPES.md` §7.11 als V2. Sebastiaan heeft op 2026-10-10 expliciet opdracht gegeven hem nu te bouwen. Self-service signup + Mollie blijven V2; hier alleen voorwerk (§6).

## 2. Deelprojecten

1. **V0 verhuist naar `/v0/...`** — losse PR, gaat eerst.
2. **Proxy-aanpassing** — publieke site-paden open, rest blijft dicht.
3. **De site** — `app/(site)/` met eigen ontwerplaag.
4. **Kennismakingsformulier** — e-mail via Resend.
5. **Dogfooding-chatbot** — ChatManta-widget op de site zelf.

## 3. V0-verhuizing

- Alle V0-pagina's naar `/v0/...`: `/home`, `/login`, `/admindashboard`, `/klantendashboard`, `/admintool`, `/commandcenter` (+ eventuele andere V0-pagina-routes die bij inventarisatie opduiken).
- Oude paden → permanente redirect naar het nieuwe pad (incl. subpaden + querystring), zodat bookmarks werken.
- **Blijven staan (draaien op externe sites):** `/embed/*`, `/embed-v1/*`, `/widget.js`, `/widget-v1.js`, `/api/v0/*`, `/api/v1/*`. Ook `/voorbeeld/*`, `/v1/*`, `/privacy`, `/crawl-eval/*` blijven ongewijzigd.
- Alle interne links, `redirect()`-calls, `next=`-parameters, Playwright-tests (`tests/global-setup.ts` login-redirect) en docs-verwijzingen bijwerken.
- `/` wordt de nieuwe site (geen redirect naar de hub meer).

## 4. Proxy (`proxy.ts`) — security-laag

- **Deny-by-default blijft.** Alleen expliciet toegevoegde site-paden omzeilen de V0-wachtwoord-gate: `/` (exact), `/kennismaking`, `/voorwaarden`, de formulier-API (`/api/site/*`), plus site-assets (OG-image, sitemap, robots).
- Segment-geankerde patronen zoals de bestaande (`kennismaking(?:/|$)`); de root via een exacte match.
- Bewust **niet** omgedraaid naar "alleen `/v0` is dicht" — dan wordt elke toekomstige pagina buiten `/v0` per ongeluk publiek.
- V0 server actions blijven zelf `requireAuth()` checken (defense in depth).

## 5. De site — structuur

Eén lange landingspagina + losse pagina's. Alles Nederlands.

**`/` secties, in volgorde:**
1. **Nav** (sticky): logo · Hoe het werkt · Functies · Prijzen · Demo · FAQ · **Inloggen** · **[Plan een kennismaking]**.
2. **Hero**: één scherpe belofte (richting: *"Je website beantwoordt elke klantvraag. Ook om 23:00."*), subregel, twee CTA's (kennismaking primair, live demo secundair). Ernaast een geanimeerd chatgesprek (vraag → typend antwoord → bronlink).
3. **Vertrouwensstrook**: Opgeslagen in Europa · Verwerkersovereenkomst beschikbaar · Volledig Nederlands · Antwoordt alleen uit jouw content (besluit 2026-10-10; "AVG-proof/Data in Europa" pas na OpenAI-EU + DPA).
4. **Probleem**: klanten zoeken, vinden niets, mailen of haken af; medewerkers beantwoorden steeds dezelfde vragen.
5. **Hoe het werkt (3 stappen)**: URL invullen → ChatManta leest je site (crawl-animatie) → één regel code, live. Signatuur-motionmoment, scroll-gestuurd.
6. **Functies (bento-grid)**: leads binnenhalen, gesprekken teruglezen, kennisgat-quiz, eigen stijl/logo, Fast mode.
7. **"Liever eerlijk dan verzonnen"**: anti-hallucinatie-spotlight — de bot zegt "dat weet ik niet, zal ik je doorverbinden?" i.p.v. te gokken.
8. **Dashboard-showcase**: het echte V1-dashboard, licht geanimeerd.
9. **Rekenhulp (ROI)**: vragen per week × minuten per vraag → bespaarde uren en euro's per maand.
10. **Prijzen** (§6).
11. **Live demo-blok** → `/voorbeeld`.
12. **FAQ**.
13. **Slot-CTA** → kennismaking.
14. **Footer**: privacy, voorwaarden, contact `info@chatmanta.com`. KvK-nummer: **nog niet beschikbaar** — veld in config, niet tonen zolang leeg.

**Losse pagina's:** `/kennismaking` (formulier), `/privacy` (bestaat), `/voorwaarden` (placeholder-pagina mag; inhoud later).

**Social proof zonder klanten:** vertrouwensstrook (3), anti-hallucinatie (7), echte dashboard (8), live demo (11) en de dogfooding-widget (§8). Geen nep-logo's, nep-reviews of verzonnen cijfers.

## 6. Prijzen

Alle pakketten, prijzen, limieten en vlaggen in **één bestand**: `lib/site/pricing.ts` (voorwerk: later lezen Mollie-billing en limiet-enforcement dezelfde bron — `V2_SCOPE` §4 "tiers leven in code"). Bedragen excl. btw.

| | **Start** | **Groei** ⭐ *Aanbevolen* | **Compleet** |
|---|---|---|---|
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

**Prijspsychologie (vastgelegd):**
- Center-stage: Groei in het midden, visueel groter, badge "Aanbevolen" (besluit 2026-10-10: "Meest gekozen" pas met echte klantdata). Op mobiel Groei eerst.
- Anker: Compleet maakt Groei redelijk; Start bewust kaal (geen leads) als decoy.
- Jaar/maand-toggle, **standaard op jaarlijks**, label "2 maanden gratis".
- Doorgestreepte normale prijs naast de introductieprijs — echt anker: na de eerste 25 klanten gaat de normale prijs gelden.
- Dagframing onder Groei ("minder dan €3 per dag", afgeleid uit config), en een kostenvergelijking boven de prijzen (medewerker 1 uur/dag ≈ €650/mnd).
- Risk reversal bij elk pakket: 14 dagen gratis proberen, maandelijks opzegbaar, "Inrichting t.w.v. €199 — gratis".
- Copy: "Introductieprijs voor onze eerste 25 klanten — levenslang vastgezet."
- **Plekken-teller staat UIT** (`showSpotsCounter: false`) — pas aanzetten bij voldoende klanten (bv. ≥10); niemand wil de allereerste zijn.
- Limiet-geruststelling: "Kom je aan je limiet? Je krijgt eerst een seintje. Nooit onverwachte kosten."
- **Verboden:** nep-schaarste (aftellende timers, onware "nog X plekken"), verzonnen cijfers.

**Kleine code-gevolgen (aparte, latere taken — niet in deze build tenzij expliciet):** toggle om "Powered by ChatManta" in de widget uit te zetten; crawl-cap > 50 pagina's voor Compleet. Tier-toewijzing blijft voorlopig handmatig (admin stelt limieten per org in, facturatie handmatig).

## 7. Kennismakingsformulier (`/kennismaking`)

- Velden: naam, bedrijfsnaam, website, e-mail (verplicht); telefoon, interesse-pakket, bericht (optioneel). Pakket voorgeselecteerd als je via een prijskaart komt (`?pakket=groei`).
- Verzending: route `/api/site/kennismaking` → Resend: notificatie naar **info@chatmanta.com** + bevestigingsmail naar de aanvrager. Afzender op het geverifieerde domein **`@chatmanta.com`** (`RESEND_FROM` verplicht, anders stille 403).
- **Geen DB-tabel** (zou een uitzondering op `organization_id NOT NULL` vereisen — die beslissen we pas bij de echte signup-flow).
- Spambescherming: honeypot-veld + per-IP rate-limit (bestaande Upstash-infra) + server-side validatie.
- Privacy: toestemmingsvinkje met link naar `/privacy`; geen PII in logs (bestaande redactor).
- Faalpad: als Resend faalt → nette foutmelding met `info@chatmanta.com` als alternatief; fout naar Sentry (gescrubd).

## 8. Dogfooding-chatbot

- Een V1-organisatie "ChatManta" met een kennisbank over het product (prijzen, functies, werkwijze, FAQ); widget embedded op de site (origin-allowlist `chatmanta.nl`).
- Kennisbank-inhoud wordt door Sebastiaan goedgekeurd vóór livegang.
- Uitvoering kan ná de eerste site-PR (aparte stap) — de site werkt ook zonder.

## 9. Visueel ontwerp + motion

- Basis: de V1-"Diepzee"-lijn (navy `#0c1e2e`, teal `#0d9488`, Plus Jakarta Sans) als vertrekpunt; definitieve richting volgt uit het ontwerp-toernooi (§11, fase 2).
- Eigen ontwerplaag `.site-ui` in een los CSS-bestand (niet in `app/globals.css` — Tailwind-v4-valkuil), V0/V1 nooit geraakt.

**Motion-principes (hard):**
1. Elke animatie legt iets uit of geeft feedback — geen decoratie-only.
2. Per sectie één signatuurmoment; daaromheen alleen subtiele micro-interacties (knoppen, tilt op tegels, tellende cijfers).
3. Scroll-gestuurd waar het een verhaal vertelt.
4. Content eerst: tekst direct zichtbaar, animatie progressief. Lighthouse ≥ 90 (performance, a11y, SEO, best practices) op mobiel.
5. `prefers-reduced-motion` → rustige variant.
6. Gereedschap: `motion` en `three` (al geïnstalleerd). Geen nieuwe animatie-dependencies zonder voorleggen.

## 10. Kwaliteitseisen / Definition of Done

- Responsive (mobiel 375px t/m desktop 1440px+), geen horizontale scroll.
- Lighthouse mobiel ≥ 90 op alle vier categorieën.
- Toegankelijk: toetsenbord-navigatie, focus-states, contrast AA, semantische headings.
- SEO: metadata, OG-afbeelding, `sitemap.xml`, `robots.txt`. Let op Next.js metadata-route-filename-collisies (`icon`/`opengraph-image` onder `app/`) — verifiëren met echte `next build`.
- `npm run typecheck` + `npm run build` groen (Windows: `.next/` eerst wissen).
- Playwright-screenshots desktop + mobiel; formulier end-to-end getest.
- Review: `chatmanta-reviewer` (hard rules) + code-review + Codex cross-check.
- Geen secrets in client/`NEXT_PUBLIC_*`.

## 11. Uitvoering — agent-team (big-ship)

| Fase | Inhoud | Gate |
|---|---|---|
| 1. Onderzoek | 4 parallelle agents: SaaS-landingspagina's (Intercom, Linear, Vercel, Stripe, Chatbase, Tidio, Watermelon), motion-benchmark, NL-MKB-copy, conversie/pricing-patronen | — |
| 2. Ontwerp-toernooi | 3 ontwerp-agents, elk een richting als klikbare mockup (hero + prijzen), jury-agent scoort | **Seb kiest richting** |
| 3. Spec | Design tokens, volledige copy-deck, motion-plan per sectie | **Seb keurt copy goed** |
| 4. Bouw | Fundament eerst (layout, tokens, nav, primitives); dan secties parallel + formulier + pricing-config | — |
| 5. Review | Hard-rules-review, code-review, Codex, Playwright, Lighthouse | — |
| 6. Oplevering | PR('s) met Vercel-preview | **Seb merge-akkoord** |

Volgorde PR's: (1) V0 → `/v0` + proxy, (2) site + formulier, (3) dogfooding-chatbot.

## 12. Buiten scope

Self-service signup, Mollie/checkout, tier-enforcement in code, leads-DB-tabel, Engelse versie, blog/CMS, plekken-teller aan, "Powered by"-toggle en crawl-cap-verhoging (aparte kleine taken).
