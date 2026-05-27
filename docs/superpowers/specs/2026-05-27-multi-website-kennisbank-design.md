# Spec — meerdere websites in de kennisbank (multi-website)

**Datum:** 2026-05-27
**Status:** ontwerp goedgekeurd, klaar voor implementation-plan
**Scope:** V0 klantendashboard → Kennisbank → Website-tab. Geldt voor élke org (gedeelde component).
**Aanpak:** B — in-place + DB-constraint (één entry per domein per org), géén greenfield.

## Probleem

De crawler ondersteunt nu bewust **één** website-bron per org: `getWebsiteState` leest "de enige
website-bron" en `upsertWebsiteSource` hergebruikt de meest-recente. De gebruiker wil meerdere
websites kunnen toevoegen, met een **inklapbare lijst** van ingescande sites; klik op een site →
de paginalijst van díé site vouwt eruit. Bovenaan blijft een **crawl-knop** (website toevoegen) en
komt er een **knop "losse pagina toevoegen"** bij.

Het datamodel ondersteunt al meerdere `knowledge_sources`-rijen per org (geen één-per-org-constraint);
de "één website"-aanname zit puur in de leeslaag + UI.

## Beslissingen (vastgelegd met de gebruiker)

1. **Losse pagina = slim samenvoegen op domein.** Hoort de losse pagina bij een al-gecrawlde website
   (zelfde genormaliseerde host)? Dan landt hij in díé website-entry. Geen match → eigen entry voor
   dat domein. (Sluit aan op hoe single-page-import nu al per hostname werkt.)
2. **Zelfde domein crawlen = bestaande entry her-crawlen** (idempotent vervangen), géén tweede entry.
3. **Her-crawl = verse snapshot.** Een her-crawl vervangt *alle* `website_pages` van de bron, inclusief
   eerder los-toegevoegde pagina's van dat domein. Geen `origin`-kolom nodig.

## Ontwerp

### 1. Datamodel + migratie `0037`

> Migratienummer `0037` — `0036` is geclaimd door de net-gemergede observability-PR (#116,
> `0036_v0_crawl_events.sql`). Bevestig vóór implementatie nogmaals met de check-migration skill.

- Nieuwe kolom `knowledge_sources.normalized_host text` (host zonder leidende `www.`, lowercase).
  Alleen zinvol voor `type='website'`; blijft `null` voor toekomstige andere types.
- **Backfill** bestaande website-rijen uit `root_url` via regexp (scheme + optioneel `www.` strippen,
  host tot `/` of `:`). Voorbeeld:
  `lower(regexp_replace(root_url, '^https?://(www\.)?([^/:]+).*$', '\2'))`.
- **Dedup-pre-check** (vóór de unieke index): zet oudere duplicaat-rijen per `(organization_id,
  normalized_host)` op `deleted_at = now()` (nieuwste `created_at` blijft levend). Anders faalt de
  index-creatie op bestaande data.
- **Partiële unieke index**:
  `create unique index knowledge_sources_org_host_uidx on knowledge_sources (organization_id, normalized_host) where type = 'website' and deleted_at is null and normalized_host is not null;`
  → dwingt af: max één levende website-entry per domein per org.
- **Geen nieuwe RLS-policy**: `knowledge_sources` heeft al RLS (SELECT voor org-members; mutaties via
  service-role). Kolom + index toevoegen raakt RLS niet. `type`-CHECK blijft `'website'`.

### 2. Domein-matching (app-laag, index als vangnet)

- `lib/v0/crawler/` krijgt een `normalizeHost(url): string|null` helper (URL parsen, host lowercase,
  leidende `www.` weg). Eén bron van waarheid voor zowel de upsert als de backfill-logica.
- `upsertWebsiteSource(sb, orgId, rootUrl, name)`: SELECT bestaande bron op
  `(org, normalized_host, type='website', deleted_at is null)`. Match → update (`status='crawling'`,
  `root_url`, `name`, `updated_at`). Geen match → INSERT met `normalized_host`.
- `scrapeSinglePageAction`: dezelfde upsert op de host van de losse pagina.
- **Race** bij gelijktijdige crawl van een nieuw domein → unique-violation (Postgres code `23505`)
  → opvangen en opnieuw selecteren (de andere transactie won; gebruik die rij).

### 3. Leeslaag — `lib/v0/server/crawler.ts`

- `getWebsiteState` (één bron) → **`getWebsiteSources(orgId): Promise<WebsiteSource[]>`**.
- `WebsiteSource = { source: {id, rootUrl, host, status}, job: {status, error, completed, total} | null, pages: WebsitePage[] }`.
- Query-strategie (geen N+1): (a) alle website-`knowledge_sources` van de org (deleted_at null),
  geordend op `created_at`; (b) alle `crawl_website`-jobs voor die `target_id`s, in JS de laatste per
  source pikken; (c) alle `website_pages` van de org (deleted_at null), in JS groeperen per
  `knowledge_source_id`. Daarna assembleren.
- `completed`/`total` blijven 0 in de DB; live counts komen (zoals nu) uit de tick-outcome-merge.

### 4. Server actions — `app/actions/crawl.ts`

- `refreshWebsiteState` → **`refreshWebsiteSources(): Promise<WebsiteSource[]>`** (de lijst).
- `tickCrawlIngestAction`: geeft de **lijst** terug. Mapt elke job-outcome op de juiste site via
  `jobId → target_id` (i.p.v. `outcomes[0]` blind op één job). Polling in de UI loopt zolang énige
  site een open job (`pending`/`processing`) heeft.
- `deleteWebsiteSourceAction` (al per `sourceId`): markeert tevens een eventuele open job van die bron
  als `failed`, zodat een lopende crawl geen wees-job achterlaat die in een verwijderde bron probeert
  te ingesten.
- `startSelectedCrawlAction` + `scrapeSinglePageAction`: ongewijzigd qua signatuur; profiteren van de
  domein-aware `upsertWebsiteSource`.

### 5. UI — `app/klantendashboard/kennisbank/components/`

- **`website-tab.tsx`** wordt orkestrator: state `WebsiteSource[]`, polling-effect (loopt zolang énige
  site crawlt), en een mode-state voor de twee invoer-flows.
- **Topbalk** met twee knoppen:
  - **"Website crawlen"** → URL-invoer → `discoverPagesAction` → bestaande `PageSelection` → start.
  - **"Losse pagina toevoegen"** → losse-URL-invoer → `scrapeSinglePageAction`.
  Beide flows hergebruiken de bestaande componenten; na afronding verschijnt/ververst de site in de lijst.
- **Nieuw `website-list.tsx`**: rendert elke `WebsiteSource` als een **inklapbare rij**: globe + domein,
  tellers (`X pagina's · Y actief · Z uit · W mislukt`), status-badge, prullenbak (per-site delete).
  Klik op de rij → de bestaande **`ManagedPages`** (zoeken + gegroepeerde pagina's + toggle/retry)
  vouwt eronder uit, gescoped op die bron. Standaard alles ingeklapt; meerdere tegelijk open mag
  (set van open source-ids).
- Een site met een lopende crawl toont in z'n rij de bestaande **`CrawlProgress`**.
- **Lege staat** (geen sites): de "Website crawlen"-invoer prominent, zoals nu.
- `ManagedPages` wordt licht aangepast: neemt voortaan één bron (`source` + `pages`) + een `onChange`
  die díé bron in de lijst bijwerkt, i.p.v. de hele single-`WebsiteState`.

### 6. Edge cases

- Site verwijderen tijdens crawl → cascade ruimt pagina's/chunks + open job op `failed`.
- Losse pagina zonder gecrawlde match → eigen website-entry met die ene pagina.
- Her-crawl van een domein met eerder losse pagina's → die pagina's worden ververst/gewist (bewuste
  keuze: verse snapshot).
- Meerdere parallelle crawls in één org → de tick verwerkt tot `JOBS_PER_TICK` (5) jobs per beurt; de
  net-geshipte 429-retry (#115) voorkomt dat een rate-limit een van de crawls onterecht laat falen.

## Niet in scope (YAGNI)

- Aparte per-rij "opnieuw crawlen"-knop (de crawl-knop met dezelfde URL dekt dit — her-crawlt de entry).
- Globaal zoeken over alle sites (zoeken blijft binnen een uitgeklapte site).
- Een hard maximum op het aantal websites per org (de 50-pagina-per-crawl-cap blijft de kosten-rem;
  een website-count-cap kan later als V1-kostenbeheer).

## Verificatie (implementatie-fase)

- `tsc --noEmit` groen.
- Migratie `0037` draait schoon via `npm run migrate` (incl. backfill + dedup + index) op een DB met
  bestaande website-bronnen.
- Read-only check: `getWebsiteSources` geeft meerdere sites met juiste tellers terug.
- UI-rooktest: twee verschillende domeinen crawlen → twee entries; losse pagina van bestaand domein →
  landt in die entry; her-crawl → entry ververst zonder duplicaat; per-site delete werkt.
- Bouwt voort op de post-#116 crawler (observability-laag) — `firecrawl.ts`/`processJobs.ts` opnieuw
  lezen in de worktree vóór editen, want #116 kan ze hebben aangeraakt.
