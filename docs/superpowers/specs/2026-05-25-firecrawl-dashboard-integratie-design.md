# Firecrawl Dashboard-integratie — Design

**Datum:** 2026-05-25
**Branch:** `feat/seb/crawler-dashboard`
**Status:** ontwerp goedgekeurd (brainstorm), klaar voor implementatieplan

## 1. Context & doel

De Firecrawl-crawler is al gebouwd en gemerged (PR #95, migration `0032_v0_website_crawler.sql`). De Website-tab in het Klantendashboard (`app/klantendashboard/kennisbank/components/website-tab.tsx`) werkt nu zo: klant plakt een URL → de hele site wordt gecrawld (max 50) → live status → pagina-lijst → opnieuw crawlen / verwijderen.

Twee beperkingen die deze ronde aanpakt:

1. **Niet deploybaar op productie.** `vercel.json` definieert een cron `* * * * *` (elke minuut) die de ingest aanstuurt. Het **Hobby-account weigert cron-per-minuut**, waardoor *elke* main-deploy faalt. De crawler staat daarom niet live (prod hangt op een oudere commit). Zie [[phase5_crawler_v1ready]].
2. **Weinig controle voor de klant.** Vaste 50-pagina-crawl, geen keuze welke pagina's, geen per-pagina beheer, geen losse-pagina-import.

**Doel:** een rijkere én meteen-deploybare Website-tab. Scope deze ronde: A1, A2, A3, C1, C3 (zie §4). Geparkeerd: C2 (zie §10).

## 2. Kernbeslissing — ingest zonder Vercel-cron (deploybaarheid)

Het crawlen zelf is een gewone server-actie en werkt. Het probleem zit in de **tweede helft**: iets moet periodiek checken of Firecrawl klaar is en dan de pagina's binnenhalen (*ingest*). Dat was de Vercel-cron — precies wat Hobby blokkeert.

**Besluit: client-gedreven "tick" (brainstorm-optie 1).** De Website-tab polt al elke 4 s (`refreshWebsiteState`). Die poll gaat óók de Firecrawl-status checken én klaar-zijnde pagina's ingesten. Plus een **inhaal-tick bij page-load** zodat een crawl die afrondde terwijl de tab dicht was, alsnog wordt opgepikt.

Gevolgen:
- **`crons`-blok uit `vercel.json` verwijderen** → deblokkeert alle main-deploys. Dit kan zelfs als losse eerste stap/PR.
- De cron-route-handler (`app/api/v0/cron/process-crawls/route.ts`) **blijft bestaan** (kan later door een externe pinger of Vercel-Pro-cron gevoed worden) maar is niet meer vereist. De `proxy.ts`-uitzondering voor die route blijft staan.
- Voortgang loopt alleen door zolang iemand de tab open heeft. Bij sluiten pauzeert de ingest en hervat bij terugkeer. De ingest is al idempotent, dus dit is veilig.

## 3. Nieuwe crawl-flow — ontdekken → kiezen → crawlen

De flow verandert van "URL → crawl meteen alles" naar drie stappen:

1. **Website invoeren.** URL → SSRF-validatie (`validateCrawlUrl`, bestaat al).
2. **Pagina's kiezen.** We halen de sitemap/pagina-lijst op (Firecrawl `map`). De klant ziet alle gevonden pagina's, **gegroepeerd per pad**, en kiest welke meegaan + een **max (≤50)**. Groep-toggle (hele `/blog` in één klik uit), pagina-toggle, max-stepper, "alles / niets"-snelknop.
3. **Crawlen & klaar.** Alleen de geselecteerde pagina's worden opgehaald → client-tick ingest → live voortgang (variant B, §5).

**Technische aanpak stap 3:** voor per-pagina-precisie ("volledig aanpasbaar welke pagina's") past **batch-scrape van de geselecteerde URLs** beter dan een crawl-die-links-volgt. Te verifiëren tegen `@mendable/firecrawl-js` v4.25 (exacte methodenamen + limieten van `map` / batch-scrape) vóór de bouw — conform AGENTS.md (eerst de SDK-docs lezen).

## 4. Features in scope

- **A1 · Per-pagina aan/uit.** Toggle per pagina (en per groep) ná de crawl. Uit = pagina-status `excluded`; de chunks van die pagina tellen niet meer mee bij retrieval. De `excluded`-status bestaat al in het datamodel en de UI-mapping (`toUiPageStatus` → `disabled`), dus dit sluit netjes aan.
- **A2 · Crawl-instellingen.** Zit in stap 2: welke pagina's (individueel + per pad uitsluiten) en max pagina's (≤50). De vaste-50-crawl vervalt; de klant kiest.
- **A3 · Per-pagina foutmeldingen.** Mislukte pagina toont de reden (bijv. "404 — niet gevonden") + een "Opnieuw"-knop voor die ene pagina.
- **C1 · Losse pagina importeren.** Plak één URL → **synchrone single-scrape** → direct in de lijst. Geen wachten, geen cron. Voor één losse/nieuwe pagina.
- **C3 · Sitemap-import.** Dit *is* de `map`-stap die stap 2 voedt — geen losse feature, maar de motor onder A2.

## 5. UI-ontwerp (goedgekeurd in brainstorm)

Mockups bewaard in `.superpowers/brainstorm/<sessie>/content/` (`progress-ux.html`, `crawl-flow.html`, `managed-pages.html`).

- **Voortgang — variant B:** eigen kaart met voortgangsbalk, live teller "X van Y pagina's", tijdsindicatie (± 1–3 min) en een duidelijke **"houd dit tabblad open"-waarschuwing** (cruciaal bij optie 1). De live teller komt uit de Firecrawl-status — eerlijker dan een nep-aftelklok.
- **Kies-scherm (stap 2):** pagina's gegroepeerd per pad, groep- en pagina-toggles, max-stepper (cap 50), live "X van Y geselecteerd"-teller + startknop.
- **Beheer-weergave (na crawl):** header met telling (actief / uit / mislukt) + acties (Opnieuw crawlen · + Losse pagina · verwijderen); een "losse pagina importeren"-veld; gegroepeerde pagina-lijst met per-pagina toggle, statusbadge, foutregel + "Opnieuw" bij mislukking.

## 6. Datamodel-impact

Bestaat al (migration 0032): `knowledge_sources`, `website_pages`, `processing_jobs`, `usage_logs`, `document_chunks.website_page_id`.

- **A1** gebruikt de bestaande `website_pages.status = 'excluded'`. Geen migration nodig.
- **Stap-2-selectie niet persisteren.** Het `map`-resultaat leeft in de server-actie/-state tot de klant op "start" klikt; pas dan schrijven we `website_pages` voor de geselecteerde set. Eenvoudiger, geen extra tabel.
- **A3 foutreden:** verifiëren of `website_pages` al een veld heeft voor een per-pagina foutmelding. Zo niet → kleine migration. **Hard rule:** nieuwe migration = RLS-policies in dezelfde file, `organization_id NOT NULL`. Vóór een nieuw migratienummer: check hoogste nummer lokaal én in open PRs.

## 7. Firecrawl-gebruik

`lib/v0/crawler/firecrawl.ts` uitbreiden:
- `mapSite(url)` → lijst gevonden URLs (stap 2).
- `scrapeOne(url)` → synchrone single-scrape (C1).
- batch-scrape van de geselecteerde URLs (stap 3) — of een crawl-variant; afhankelijk van wat v4.25 biedt.

Verifieer de SDK-API vóór de bouw. Houd de 50-cap streng (kostenbeheersing).

## 8. Deploy-deblokkering

- **`crons` uit `vercel.json`** halen — losse, kleine wijziging; mag een eigen eerste PR zijn zodat main weer deployt vóór de feature af is.
- `FIRECRAWL_API_KEY` + `CRON_SECRET` staan al op Vercel Production.

## 9. Beveiliging

- **SSRF (SA-2) op álle klant-URLs.** `validateCrawlUrl` geldt voor (a) de ingevoerde root-URL, (b) de **`map`-resultaten** — een site kan naar interne/private URLs linken, dus elke te-scrapen URL opnieuw valideren vóór de scrape — en (c) de losse C1-URL.
- **Rate-limiting** (`checkMutationLimit`) op start-crawl, batch-scrape én single-scrape.
- **V0 sandbox-disclaimer blijft:** geen echte klantdata; service-role alleen via de bestaande wrappers (`getSystemJobClient`).

## 10. Out-of-scope / geparkeerd

- **C2 · Periodiek auto-hercrawlen** — vereist een scheduler/cron, precies wat we weghalen voor deploybaarheid. Pas oppakken bij Vercel Pro (of via de externe pinger).
- **Externe pinger (cron-job.org)** — optioneel vangnet later, niet nodig voor deze ronde.
- **Meerdere website-bronnen per org** — blijft één bron per org.

## 11. Testen

- SSRF-validatie op `map`-resultaten (interne URL in de lijst → geweigerd).
- Idempotente ingest via de tick: tab sluiten tijdens crawl → heropenen → pagina's compleet.
- A1: uitgezette pagina valt uit de retrieval (handmatige check / eval).
- C1: single-scrape verschijnt direct in de lijst.
- `next build` lokaal groen vóór PR.
- Na de `vercel.json`-fix: main deployt weer; testcrawl op productie (kleine site) en daarna opruimen.
