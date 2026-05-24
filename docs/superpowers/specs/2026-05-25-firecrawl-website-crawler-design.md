# Spec — V1-klare website-crawler (Firecrawl), service-role-bediend in V0

**Datum:** 2026-05-25
**Branch:** `feat/seb/firecrawl-crawler`
**Bouwfase:** Phase 5 (Website Crawler) — bewust vooruit op de planning, gebouwd in **V1-vorm maar V0-bediend** (zie scope-beslissing hieronder).

---

## 1. Doel & context

Een klant voert een website-URL in via het dashboard → Firecrawl crawlt (max 50 pagina's) → pagina's worden chunks + embeddings → de bot gebruikt websitecontent samen met geüploade documenten via dezelfde RAG-pijplijn.

### Scope-beslissing (vastgelegd met Sebastiaan, 2026-05-25)

De blueprint-Phase-5 is geschreven voor de V1-multi-tenant-wereld (Supabase Auth, `organization_members`, RLS-enforcement, SA-1). Die auth-laag bestaat nog niet. Gekozen middenweg:

> **Bouw álle Phase-5-infrastructuur volledig V1-vormgegeven** (`organization_id NOT NULL` + RLS aan + policies in dezelfde migration), **maar bedien het via de service-role in de V0-sandbox** — exact zoals `documents`/`document_chunks` sinds migration 0002 werken. Geen echte auth nodig; per-user enforcement (SA-1) plugt later in bij de echte Phase 1.

Dit doorbreekt de "we starten V1"-poort **niet**: er komt geen auth-laag, geen `requireOrgMember`, geen per-user identiteit. De tabellen zijn alleen V1-klaar zodat ze later zonder migratie-breuk inschuiven.

### In scope
- 4 nieuwe tabellen + 1 FK-aanscherping (zie §3)
- SSRF-validatie (SA-2 hard rule)
- Firecrawl-SDK-wrapper (`@mendable/firecrawl-js`), hardcap 50 pagina's
- Achtergrond-crawl via **cron-poll** (zie §5)
- Ingest-pijplijn crawl → `website_pages` → chunks → embeddings → `document_chunks`
- Website-tab in `klantendashboard/kennisbank`: van mock → echt (URL-invoer, status, hercrawl, verwijderen)
- Usage-logging van crawl + embeddings

### Buiten scope (bewust — echte V1 / Phase 7)
- Supabase Auth / `requireOrgMember` / SA-1 per-user enforcement
- Per-tier limieten (`standard`/`pro`)
- `error_logs`-tabel + admin-error-UI (Phase 7)
- Per-user audit-logging van force-recrawl (geen identiteit in V0)
- Scheduled/periodieke hercrawl (v2)
- `parent_chunks` genereren bij crawl — uploads doen dit nu ook niet bij `ingestText`; parity volgt later via hetzelfde reingest-pad
- `chatbots`-tabel — bestaat niet in V0; `chatbot_id` blijft nullable

---

## 2. Architectuur — dataflow

```
[Klant] kennisbank → Website-tab
   │  URL invoeren + "Crawl starten"
   ▼
startWebsiteCrawlAction(url)            (app/actions/crawl.ts, server action, service-role)
   │  1. validateCrawlUrl(url)         → SSRF-guard, faal = reason terug
   │  2. insert knowledge_sources(status='pending')
   │  3. firecrawl.startCrawl(url,50)  → external crawl-ID
   │  4. insert processing_jobs(job_type='crawl_website', status='pending', external_job_id)
   ▼
[Vercel Cron] /api/v0/cron/process-crawls   (elke minuut, CRON_SECRET-beschermd)
   │  voor elke pending/processing job:
   │   - firecrawl.getCrawlStatus(external_job_id)
   │   - status 'scraping' → job blijft 'processing'
   │   - status 'completed' → ingestCrawlResults(...)
   │   - status 'failed'    → job 'failed' + error_message
   ▼
ingestCrawlResults(knowledgeSourceId, jobId, pages)   (lib/v0/crawler/processCrawl.ts)
   │  idempotent: DELETE website_pages WHERE knowledge_source_id=$1 (CASCADE ruimt chunks)
   │  per pagina:  content_hash → insert website_pages
   │               chunkText(markdown) → embedTexts → insert document_chunks(website_page_id)
   │  knowledge_sources.status='ready', job 'completed', usage_logs
   ▼
[Bot] runRagQuery → match_chunks → vindt nu óók website-chunks (via bestaande vector-search)
```

---

## 3. Datamodel (migration `0032_v0_website_crawler.sql` — nr. verifiëren met `check-migration` skill)

Alle tabellen: `organization_id NOT NULL`, RLS aan, SELECT-policy via `organization_members`/`auth.uid()` (V1-vorm), **geen** INSERT/UPDATE/DELETE-policy (mutaties via service-role). `chatbot_id` overal nullable.

### `knowledge_sources` — parent: één website-bron
| kolom | type | noot |
|---|---|---|
| id | uuid pk | gen_random_uuid() |
| organization_id | uuid NOT NULL | → organizations CASCADE |
| chatbot_id | uuid NULL | V1: FK naar chatbots |
| type | text NOT NULL default 'website' | CHECK in ('website') — ruimte voor 'document_set' later |
| name | text NOT NULL | bv. domeinnaam |
| root_url | text | start-URL van de crawl |
| status | text NOT NULL default 'pending' | CHECK in ('pending','crawling','ready','failed') |
| metadata | jsonb NOT NULL default '{}' | |
| created_at / updated_at | timestamptz NOT NULL default now() | |
| deleted_at | timestamptz | soft-delete |

### `website_pages` — per gecrawlde pagina
| kolom | type | noot |
|---|---|---|
| id | uuid pk | |
| knowledge_source_id | uuid NOT NULL | → knowledge_sources CASCADE |
| organization_id | uuid NOT NULL | → organizations CASCADE |
| url | text NOT NULL | |
| title | text | |
| content_text | text | bron-markdown (debug/rehash) |
| content_hash | text | SHA-256 — diff bij hercrawl |
| status | text NOT NULL | CHECK in ('crawled','failed','excluded') |
| last_crawled_at | timestamptz | |
| created_at | timestamptz NOT NULL default now() | |
| deleted_at | timestamptz | |

Index op `(knowledge_source_id)` en `(organization_id)`.

### `processing_jobs` — achtergrond-jobqueue
| kolom | type | noot |
|---|---|---|
| id | uuid pk | |
| organization_id | uuid NOT NULL | → organizations CASCADE |
| chatbot_id | uuid NULL | |
| job_type | text NOT NULL | CHECK in ('crawl_website','process_document','reprocess_source','delete_source') |
| target_type | text NOT NULL | CHECK in ('document','knowledge_source','website_page') |
| target_id | uuid NOT NULL | |
| status | text NOT NULL default 'pending' | CHECK in ('pending','processing','completed','failed') |
| external_job_id | text | Firecrawl crawl-ID (cron-poll) |
| attempts | int NOT NULL default 0 | poll-safety / retry-cap |
| error_message | text | |
| started_at / finished_at | timestamptz | |
| created_at / updated_at | timestamptz NOT NULL default now() | |

Partiële index op `(status)` waar `status in ('pending','processing')` — voor de cron-poller. Index op `(organization_id)`.

### `usage_logs` — kosten/gebruik
| kolom | type | noot |
|---|---|---|
| id | uuid pk | |
| organization_id | uuid NOT NULL | → organizations CASCADE |
| chatbot_id | uuid NULL | |
| conversation_id | uuid NULL | |
| event_type | text NOT NULL | CHECK in ('chat_message','embedding','document_processed','website_crawled') |
| tokens_input / tokens_output | int default 0 | |
| cost_eur | numeric(12,6) default 0 | best-effort; V0 USD-tracking blijft in query_log |
| metadata | jsonb NOT NULL default '{}' | bv. {pages: 23} |
| created_at | timestamptz NOT NULL default now() | |

Index op `(organization_id, created_at)`.

### FK-aanscherping op bestaande `document_chunks`
```sql
alter table public.document_chunks
  add constraint document_chunks_website_page_fk
  foreign key (website_page_id) references public.website_pages(id) on delete cascade;
```
Kolom `website_page_id` + XOR-check (`document_id` XOR `website_page_id`) bestaan al sinds 0002. Gecrawlde chunks komen zo via dezelfde `match_chunks`-RPC binnen als documenten — geen RAG-codewijziging nodig.

**Idempotency:** vóór herinsert `DELETE FROM website_pages WHERE knowledge_source_id=$1` → CASCADE ruimt de oude chunks. Nooit dubbele content.

---

## 4. Pipeline-code (`lib/v0/crawler/`)

> Codeorganisatie-keuze: onder `lib/v0/` (consistent met de rest van de V0-server-laag), niet `lib/crawler/` zoals de blueprint schrijft, omdat het V0-bediend draait.

- **`validateCrawlUrl.ts`** — `validateCrawlUrl(url): Promise<{ allowed: boolean; reason?: string }>`
  Weigert: non-`http(s)`-schema's, `localhost`/`*.local`, private+gereserveerde IP-ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254.0.0/16 incl. cloud-metadata `169.254.169.254`, `::1`, `fc00::/7`, `fe80::/10`), lege/malformede host. **Verplicht (SA-2)** vóór elke crawl-start.
- **`firecrawl.ts`** — dunne SDK-wrapper:
  - `startCrawl(url, maxPages=50): Promise<{ crawlId: string }>` — `client.startCrawl(url, { limit: Math.min(maxPages,50), scrapeOptions: { formats: ['markdown'] } })`
  - `getCrawlStatus(crawlId): Promise<{ status; pages: Array<{url,title,markdown}> }>`
  - **Hardcap 50** afgedwongen in code (kosten-rem). API-key uit `FIRECRAWL_API_KEY` (server-only).
- **`processCrawl.ts`** — `ingestCrawlResults(knowledgeSourceId, jobId, pages)`: idempotency-delete → per pagina content_hash + insert `website_pages` → `chunkText` (bestaand) → `embedTexts` (bestaand) → insert `document_chunks(website_page_id=…)` → status-updates + `usage_logs`. Ingest eventueel in batches als 50 pagina's één cron-tick overschrijden.

### Server data-laag (`lib/v0/server/crawler.ts`)
`listWebsiteSources(orgId)`, `listWebsitePages(sourceId, orgId)`, `getLatestCrawlJob(orgId)` — voor de UI.

### Server actions (`app/actions/crawl.ts`)
`startWebsiteCrawlAction(url)`, `recrawlSourceAction(sourceId)`, `deleteSourceAction(sourceId)` — alle met `organizationId` uit de active-org cookie + `validateCrawlUrl`.

---

## 5. Achtergrond-verwerking — cron-poll

- Server action start de crawl (Firecrawl `startCrawl`) en zet `processing_jobs(pending, external_job_id)`. Geeft direct terug — geen wachttijd in de request.
- **`app/api/v0/cron/process-crawls/route.ts`** (GET, `CRON_SECRET`-header-check) — pollt alle jobs in `('pending','processing')`, roept `getCrawlStatus` aan, en ingest klaar-crawls. `attempts++` per tick; na N pogingen → `failed` (voorkomt eeuwig pollen).
- **`vercel.json`** crons-entry: `/api/v0/cron/process-crawls`, elke minuut (`* * * * *` of `*/1`). Verifiëren of er al een `vercel.json`/cron-config is om naast te zetten.
- Crawl-duur staat zo volledig los van de request-lifetime → werkt ook bij trage/grote sites.

---

## 6. UI — Website-tab echt maken

`app/klantendashboard/kennisbank/components/website-tab.tsx` toont nu `getMockWebsitePages`. Vervangen door:
- URL-invoerveld + "Crawl starten" (→ `startWebsiteCrawlAction`)
- Live job-status (pending/processing/completed/failed) — server-rendered + lichte client-refresh
- Lijst van echte `website_pages` (url, titel, status, last_crawled_at)
- Knoppen "Opnieuw crawlen" + "Bron verwijderen"
- `page.tsx`: `getMockWebsitePages` → echte `listWebsiteSources`/`listWebsitePages`

Mock-helper (`lib/v0/klantendashboard/mock/website-pages.ts`) verwijderen zodra de echte data live is.

---

## 7. Kosten & veiligheid
- Een echte crawl is een **betaalde Firecrawl-call** → nooit draaien zonder expliciete bevestiging per keer.
- Hardcap 50 pagina's in code (niet alleen UI).
- `validateCrawlUrl` verplicht (SA-2) — in V0 extra belangrijk: geen auth-poort vóór de URL-invoer.
- `FIRECRAWL_API_KEY` server-only, nooit `NEXT_PUBLIC_*`, gitignored `.env.local`.

---

## 8. Testplan
- **Unit:** `validateCrawlUrl` (SSRF-cases: localhost, 169.254.169.254, 10.x, ftp://, malformed) · content_hash-stabiliteit.
- **Integratie:** Firecrawl-SDK gemockt → `ingestCrawlResults` → assert `website_pages` + `document_chunks(website_page_id)` + XOR-check houdt + CASCADE-delete ruimt chunks bij source-delete + idempotency (2× ingest = geen dubbele chunks).
- **Migration:** `npm run migrate` → `migrate:status` groen; RLS-policies aanwezig op alle 4 tabellen.
- **E2E (handmatig/Playwright, gated op kosten + lokale `OPENAI_API_KEY`):** kennisbank Website-tab → URL → status loopt → pagina's verschijnen → bot beantwoordt een website-only vraag.

---

## 9. Open punten (bevestigen vóór/ tijdens build)
1. `chatbot_id` nullable in alle 4 tabellen — akkoord? (V0 heeft geen `chatbots`-tabel.)
2. `cost_eur` best-effort vullen (Firecrawl-pagina-prijs + embedding-tokens) vs. voorlopig 0 laten + alleen `metadata.pages`. Voorstel: 0 + metadata, EUR-billing is V1.
3. Cron-frequentie elke minuut akkoord? En: 50 pagina's ingesten binnen één cron-tick — batchen indien Vercel-functietimeout dreigt.
4. Migration-nummer: `0032` aangenomen; verifiëren met `check-migration` (lokaal + open PRs).
