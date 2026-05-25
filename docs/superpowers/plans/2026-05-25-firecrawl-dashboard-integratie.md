# Firecrawl Dashboard-integratie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De Website-tab van het Klantendashboard uitbreiden naar een ontdek→kies→crawl-flow met per-pagina-beheer en losse-pagina-import, en de crawler meteen deploybaar maken op Vercel Hobby (zonder cron-per-minuut).

**Architecture:** Ingest wordt aangestuurd door een client-gedreven "tick" (de bestaande poll van de Website-tab) i.p.v. een Vercel-cron. De crawl-flow wordt: Firecrawl `map` (sitemap) → klant kiest pagina's → Firecrawl `startBatchScrape` van de selectie → idempotente ingest. Per-pagina aan/uit wordt een goedkope `included`-vlag waar de retrieval-RPC op filtert (geen re-embedding).

**Tech Stack:** Next.js 16 App Router (server actions + server components), TypeScript, Supabase (Postgres + pgvector, eigen migrate-tooling), `@mendable/firecrawl-js` v4.25, React 19.

---

## Verificatie-aanpak (lees eerst)

**Dit project heeft GEEN unit-test-runner** (geen vitest/jest). Forceer dus geen `*.test.ts`. Elke taak verifieer je met de tooling die er wél is:

- `npm run typecheck` — `tsc --noEmit` (snelste correctheidscheck; draai na elke code-taak).
- `npm run build` — `next build` (vangt server/client-grens-fouten; draai per fase-einde).
- **Probe-scripts** via `tsx` (patroon: `scripts/v0-*.ts`, draaien met `node --env-file=.env.local --conditions=react-server --import tsx scripts/<naam>.ts`) — voor Firecrawl/ingest-logica die je niet in de browser wilt testen.
- **Handmatige dashboard-check** — Website-tab in de dev-server (`npm run dev`), login-pw `chatmanta-dev`, dev-org.

**Commit-discipline:** klein en vaak, één commit per afgeronde taak. Vóór elke commit: `git rev-parse --abbrev-ref HEAD` → moet `feat/seb/crawler-dashboard` zijn.

**Worktree:** alles speelt zich af in `C:\Users\solys\Documents\Code\chatmanta\.claude\worktrees\crawler-dashboard`. Deze worktree heeft nog **geen `node_modules`** — draai eerst `npm ci` hierin (Turbopack-dev werkt niet met een junction; zie [[worktree_node_modules_turbopack]]) en kopieer `.env.local` uit de hoofdrepo (gitignored). Controleer dat `FIRECRAWL_API_KEY` en `OPENAI_API_KEY` actief (niet uitgecommentarieerd) in `.env.local` staan.

---

## Bestandsoverzicht

**Nieuw:**
- `lib/v0/crawler/processJobs.ts` — gedeelde job-verwerker (poll Firecrawl-status + ingest), gebruikt door zowel de tick-action als de cron-route.
- `lib/v0/klantendashboard/group-pages.ts` — util: pagina's/URLs groeperen per pad.
- `app/klantendashboard/kennisbank/components/crawl-progress.tsx` — voortgangskaart (variant B).
- `app/klantendashboard/kennisbank/components/page-selection.tsx` — kies-scherm (stap 2).
- `app/klantendashboard/kennisbank/components/managed-pages.tsx` — beheer-lijst (toggles + fouten).
- `app/klantendashboard/kennisbank/components/single-page-import.tsx` — losse-pagina-import (C1).
- `scripts/v0-crawler-probe.ts` — handmatig probe-script voor map/scrape/batch.
- `supabase/migrations/0035_v0_website_page_controls.sql` — `included` + `error_message` + RPC-filter (nummer verifiëren, zie Taak 2.1).

**Gewijzigd:**
- `vercel.json` — `crons`-blok verwijderen.
- `app/api/v0/cron/process-crawls/route.ts` — body verplaatst naar `processJobs.ts`.
- `lib/v0/crawler/firecrawl.ts` — `mapSite`, `scrapeOne`, `startBatchScrape`, `getBatchScrapeStatus`; `startCrawl`/`getCrawlStatus` verdwijnen.
- `lib/v0/crawler/processCrawl.ts` — `error_message` schrijven; helper voor één-pagina-ingest.
- `lib/v0/server/crawler.ts` — `included` + `error_message` in de UI-shape.
- `lib/v0/klantendashboard/types.ts` — `WebsitePage` uitbreiden.
- `app/actions/crawl.ts` — nieuwe actions: `discoverPagesAction`, `startSelectedCrawlAction`, `tickCrawlIngestAction`, `setPageIncludedAction`, `retryPageAction`, `scrapeSinglePageAction`; `startWebsiteCrawlAction` vervalt.
- `app/klantendashboard/kennisbank/components/website-tab.tsx` — herschreven als state-machine (invoer → kiezen → crawlen → beheer).

---

## Fase-overzicht (elke fase is los commit-/PR-baar)

- **Fase 0 — Deploy-deblokkering + client-tick.** Maakt de *bestaande* crawler live op Hobby. Hoogste prioriteit, kan als eerste eigen PR.
- **Fase 1 — Map + batch-scrape backend.** Firecrawl-wrappers; crawl-start schakelt over op batch-scrape.
- **Fase 2 — Migration + retrieval-filter + datalaag.** `included`/`error_message` + RPC.
- **Fase 3 — Nieuwe crawl-flow UI.** Ontdekken → kiezen → voortgang (variant B).
- **Fase 4 — Beheer-UI + losse import.** A1-toggles, A3-fouten, retry, C1.

---

## FASE 0 — Deploy-deblokkering + client-tick

### Taak 0.1: `crons` uit `vercel.json` halen

**Files:**
- Modify: `vercel.json`

- [ ] **Stap 1: Vervang de inhoud door een lege config.**

```json
{}
```

Reden: Hobby weigert `* * * * *` → elke main-deploy faalt. De cron-route-handler blijft bestaan (zie Taak 0.2) en kan later door een externe pinger of Vercel-Pro-cron gevoed worden; hij is alleen niet meer vereist.

- [ ] **Stap 2: Commit.**

```bash
git add vercel.json
git commit -m "fix(crawler): verwijder cron uit vercel.json (deblokkeert Hobby-deploys)"
```

### Taak 0.2: Gedeelde job-verwerker extraheren

**Files:**
- Create: `lib/v0/crawler/processJobs.ts`
- Modify: `app/api/v0/cron/process-crawls/route.ts`

- [ ] **Stap 1: Maak `lib/v0/crawler/processJobs.ts`** — verplaats de loop + `failJob` uit de cron-route hierheen, zodat tick-action én cron dezelfde code draaien.

```ts
// V0 Website Crawler — gedeelde job-verwerker.
//
// Pollt openstaande crawl-jobs bij Firecrawl en ingest afgeronde crawls.
// Aangeroepen door (a) de client-tick server action tijdens een lopende crawl
// en (b) de cron-route (optioneel, voor een externe pinger). Service-role via
// de meegegeven client (SA-5).

import 'server-only';

import type { getSystemJobClient } from '@/lib/supabase/admin';
import { getCrawlStatus } from '@/lib/v0/crawler/firecrawl';
import { ingestCrawlResults } from '@/lib/v0/crawler/processCrawl';

type Sb = Awaited<ReturnType<typeof getSystemJobClient>>;

/** Na zoveel polls zonder afronding geven we op (≈1u bij 1 poll/min; sneller bij 4s-tick). */
export const MAX_ATTEMPTS = 200;

export type OpenJob = {
  id: string;
  organization_id: string;
  target_id: string;
  external_job_id: string | null;
  attempts: number;
};

export type JobOutcome = { jobId: string; outcome: string };

/** Verwerkt een batch openstaande crawl-jobs. Muteert job- en bron-status. */
export async function processCrawlJobs(sb: Sb, jobs: OpenJob[]): Promise<JobOutcome[]> {
  const now = () => new Date().toISOString();
  const summary: JobOutcome[] = [];

  for (const job of jobs) {
    const { id: jobId, target_id: sourceId, organization_id: orgId } = job;
    const crawlId = job.external_job_id;
    const attempts = job.attempts ?? 0;

    try {
      if (!crawlId) {
        await failJob(sb, jobId, sourceId, 'Geen Firecrawl crawl-ID op de job.');
        summary.push({ jobId, outcome: 'failed:no-crawl-id' });
        continue;
      }

      const status = await getCrawlStatus(crawlId);

      if (status.status === 'scraping') {
        if (attempts + 1 >= MAX_ATTEMPTS) {
          await failJob(sb, jobId, sourceId, 'Crawl duurde te lang (timeout na max polls).');
          summary.push({ jobId, outcome: 'failed:timeout' });
        } else {
          await sb
            .from('processing_jobs')
            .update({ status: 'processing', attempts: attempts + 1, updated_at: now() })
            .eq('id', jobId);
          summary.push({ jobId, outcome: 'pending' });
        }
        continue;
      }

      if (status.status === 'failed') {
        await failJob(sb, jobId, sourceId, 'Firecrawl meldde een mislukte crawl.');
        summary.push({ jobId, outcome: 'failed:firecrawl' });
        continue;
      }

      const result = await ingestCrawlResults(sourceId, orgId, status.pages);
      await sb
        .from('processing_jobs')
        .update({ status: 'completed', attempts: attempts + 1, finished_at: now(), updated_at: now(), error_message: null })
        .eq('id', jobId);
      await sb.from('knowledge_sources').update({ status: 'ready', updated_at: now() }).eq('id', sourceId);
      summary.push({ jobId, outcome: `completed:${result.pagesCrawled}p/${result.chunks}c` });
    } catch (err) {
      await failJob(sb, jobId, sourceId, err instanceof Error ? err.message : 'onbekende fout');
      summary.push({ jobId, outcome: 'failed:exception' });
    }
  }

  return summary;
}

async function failJob(sb: Sb, jobId: string, sourceId: string, message: string): Promise<void> {
  const now = new Date().toISOString();
  await sb
    .from('processing_jobs')
    .update({ status: 'failed', error_message: message, finished_at: now, updated_at: now })
    .eq('id', jobId);
  await sb.from('knowledge_sources').update({ status: 'failed', updated_at: now }).eq('id', sourceId);
}
```

> Let op: in Fase 1 wordt `getCrawlStatus` hier vervangen door `getCrawlJobStatus` (batch). Eén regel.

- [ ] **Stap 2: Vervang de cron-route-body** door een dunne aanroep van `processCrawlJobs`. Houd de auth-check + query.

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getSystemJobClient } from '@/lib/supabase/admin';
import { processCrawlJobs, type OpenJob } from '@/lib/v0/crawler/processJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JOBS_PER_TICK = 5;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = await getSystemJobClient({ reason: 'process_crawls_cron' });
  const { data: jobs, error } = await sb
    .from('processing_jobs')
    .select('id, organization_id, target_id, external_job_id, attempts')
    .eq('job_type', 'crawl_website')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(JOBS_PER_TICK);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = await processCrawlJobs(sb, (jobs ?? []) as OpenJob[]);
  return NextResponse.json({ processed: summary.length, jobs: summary });
}
```

- [ ] **Stap 3: Verifieer.** `npm run typecheck` → groen.
- [ ] **Stap 4: Commit.** `git add lib/v0/crawler/processJobs.ts app/api/v0/cron/process-crawls/route.ts && git commit -m "refactor(crawler): gedeelde processCrawlJobs voor cron + tick"`

### Taak 0.3: `tickCrawlIngestAction` + client-tick koppelen

**Files:**
- Modify: `app/actions/crawl.ts`
- Modify: `app/klantendashboard/kennisbank/components/website-tab.tsx`

- [ ] **Stap 1: Voeg `tickCrawlIngestAction` toe** aan `app/actions/crawl.ts`. **Geen** `checkMutationLimit` — dit is een poll (elke 4s = 15/min, zou de 10/min mutation-limiter raken). Scope op de actieve org.

```ts
import { processCrawlJobs, type OpenJob } from '@/lib/v0/crawler/processJobs';

/**
 * Client-gedreven "tick": verwerkt openstaande crawl-jobs van de actieve org en
 * geeft de verse state terug. Vervangt de Vercel-cron als motor (Hobby-vriendelijk).
 * Bewust niet rate-limited — het is een lichte poll, geen mutatie-trigger.
 */
export async function tickCrawlIngestAction(): Promise<WebsiteState> {
  const activeOrg = await getActiveOrgFromCookies();
  const sb = await getSystemJobClient({ reason: 'process_crawls_tick' });
  const { data: jobs } = await sb
    .from('processing_jobs')
    .select('id, organization_id, target_id, external_job_id, attempts')
    .eq('organization_id', activeOrg.id)
    .eq('job_type', 'crawl_website')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(5);
  if (jobs && jobs.length > 0) {
    await processCrawlJobs(sb, jobs as OpenJob[]);
  }
  return getWebsiteState(activeOrg.id);
}
```

- [ ] **Stap 2: Wijzig de poll in `website-tab.tsx`** zodat hij `tickCrawlIngestAction` aanroept (drijft de ingest) i.p.v. enkel `refreshWebsiteState`, plus een inhaal-tick on-mount.

Vervang de bestaande `useEffect` (regel ~36-46) door:

```tsx
import { tickCrawlIngestAction } from '@/app/actions/crawl';

// Inhaal-tick bij openen: een crawl kan afgerond zijn terwijl de tab dicht was.
useEffect(() => {
  let cancelled = false;
  tickCrawlIngestAction()
    .then((s) => { if (!cancelled) setState(s); })
    .catch(() => {});
  return () => { cancelled = true; };
}, []);

// Tijdens een lopende crawl: elke 4s de tick draaien (poll + ingest).
useEffect(() => {
  if (!isCrawling) return;
  const timer = setInterval(async () => {
    try { setState(await tickCrawlIngestAction()); } catch { /* volgende tick */ }
  }, 4000);
  return () => clearInterval(timer);
}, [isCrawling]);
```

- [ ] **Stap 3: Verifieer.** `npm run typecheck` → groen. `npm run build` → groen.
- [ ] **Stap 4: Handmatige check (cron uit).** `npm run dev`; voeg in de Website-tab een kleine site toe; bevestig dat de pagina's binnenkomen zónder dat er een cron draait (de tab-poll doet het werk). Sluit de tab tijdens crawl en heropen → inhaal-tick maakt het af.
- [ ] **Stap 5: Commit.** `git add app/actions/crawl.ts app/klantendashboard/kennisbank/components/website-tab.tsx && git commit -m "feat(crawler): client-tick ingest (Hobby-vriendelijk, geen cron nodig)"`

> **Einde Fase 0:** de bestaande crawler is nu deploybaar op Hobby en werkt via de tab-poll. Dit kan als eerste PR mergen vóór de rest af is.

---

## FASE 1 — Map + batch-scrape backend

### Taak 1.1: Firecrawl-wrappers uitbreiden

**Files:**
- Modify: `lib/v0/crawler/firecrawl.ts`

- [ ] **Stap 1: Refactor de doc→page-mapping naar een helper en voeg `mapSite`, `scrapeOne`, `startBatchScrape`, `getCrawlJobStatus` toe.** Verwijder `startCrawl` en `getCrawlStatus` (we crawlen niet meer link-volgend; alles loopt via batch-scrape van een geselecteerde URL-set).

```ts
import Firecrawl from '@mendable/firecrawl-js';

export const MAX_CRAWL_PAGES = 50;

export type CrawledPage = {
  url: string;
  title: string | null;
  markdown: string;
  statusCode: number | null;
  error: string | null;
};

export type CrawlStatus = {
  status: 'scraping' | 'completed' | 'failed';
  total: number;
  completed: number;
  pages: CrawledPage[];
};

let client: Firecrawl | null = null;
function getClient(): Firecrawl {
  if (client) return client;
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY ontbreekt in de omgeving.');
  client = new Firecrawl(apiKey);
  return client;
}

/** Normaliseert één Firecrawl Document naar onze CrawledPage-shape. */
function toCrawledPage(doc: { markdown?: string; metadata?: Record<string, unknown> }): CrawledPage {
  const meta = (doc.metadata ?? {}) as Record<string, unknown>;
  return {
    url: (meta.sourceURL as string) ?? (meta.url as string) ?? '',
    title: (meta.title as string) ?? null,
    markdown: doc.markdown ?? '',
    statusCode: typeof meta.statusCode === 'number' ? meta.statusCode : null,
    error: typeof meta.error === 'string' ? meta.error : null,
  };
}

/**
 * Haalt de sitemap/pagina-lijst van een site op (geen scrape — alleen URLs).
 * Cap op MAX_CRAWL_PAGES zodat het kies-scherm nooit meer dan 50 toont.
 */
export async function mapSite(url: string, limit: number = MAX_CRAWL_PAGES): Promise<string[]> {
  const res = await getClient().map(url, { sitemap: 'include', limit });
  const urls = (res.links ?? []).map((l) => l.url).filter((u): u is string => typeof u === 'string');
  return Array.from(new Set(urls)).slice(0, limit);
}

/** Synchrone scrape van één pagina (C1: losse import). */
export async function scrapeOne(url: string): Promise<CrawledPage> {
  const doc = await getClient().scrape(url, { formats: ['markdown'] });
  return toCrawledPage(doc as { markdown?: string; metadata?: Record<string, unknown> });
}

/** Start een async batch-scrape van een expliciete URL-set. Geeft het batch-ID terug. */
export async function startBatchScrape(urls: string[]): Promise<{ crawlId: string }> {
  const capped = urls.slice(0, MAX_CRAWL_PAGES);
  const res = await getClient().startBatchScrape(capped, { options: { formats: ['markdown'] } });
  if (!res?.id) throw new Error('Firecrawl startBatchScrape gaf geen job-ID terug.');
  return { crawlId: res.id };
}

/** Pollt een batch-scrape-job en normaliseert naar CrawlStatus. */
export async function getCrawlJobStatus(jobId: string): Promise<CrawlStatus> {
  const job = await getClient().getBatchScrapeStatus(jobId);
  const status: CrawlStatus['status'] =
    job.status === 'completed' ? 'completed' : job.status === 'scraping' ? 'scraping' : 'failed';
  const pages = (job.data ?? []).map((d) => toCrawledPage(d as { markdown?: string; metadata?: Record<string, unknown> }));
  return { status, total: job.total ?? 0, completed: job.completed ?? 0, pages };
}
```

- [ ] **Stap 2: Update `processJobs.ts`** — vervang `import { getCrawlStatus }` door `import { getCrawlJobStatus }` en de aanroep `getCrawlStatus(crawlId)` → `getCrawlJobStatus(crawlId)`.
- [ ] **Stap 3: Verifieer.** `npm run typecheck`. Verwacht: faalt nog op `startWebsiteCrawlAction` (gebruikt `startCrawl`) — dat fixen we in Taak 1.3.

### Taak 1.2: Probe-script voor de Firecrawl-wrappers

**Files:**
- Create: `scripts/v0-crawler-probe.ts`

- [ ] **Stap 1: Schrijf een probe** die `mapSite` + `scrapeOne` tegen een publieke site draait (verifieert de SDK-shapes echt vóór UI-werk).

```ts
import { mapSite, scrapeOne } from '../lib/v0/crawler/firecrawl';

async function main() {
  const target = process.argv[2] ?? 'https://example.com';
  console.log('mapSite:', target);
  const urls = await mapSite(target, 10);
  console.log(` → ${urls.length} URLs`, urls.slice(0, 5));

  const one = urls[0] ?? target;
  console.log('scrapeOne:', one);
  const page = await scrapeOne(one);
  console.log(` → title=${page.title} status=${page.statusCode} mdLen=${page.markdown.length} err=${page.error}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Stap 2: Draai het.** `node --env-file=.env.local --conditions=react-server --import tsx scripts/v0-crawler-probe.ts https://example.com`
Verwacht: ≥1 URL uit `mapSite`, een `scrapeOne` met `mdLen > 0` en `status=200`. **Dit is een betaalde Firecrawl-call** — draai spaarzaam, alleen op kleine publieke sites.
- [ ] **Stap 3: Commit.** `git add lib/v0/crawler/firecrawl.ts lib/v0/crawler/processJobs.ts scripts/v0-crawler-probe.ts && git commit -m "feat(crawler): map + scrapeOne + batch-scrape wrappers (v4.25)"`

### Taak 1.3: Crawl-start omzetten naar discover + batch-scrape

**Files:**
- Modify: `app/actions/crawl.ts`

- [ ] **Stap 1: Vervang `startWebsiteCrawlAction`** door twee actions: `discoverPagesAction` (map, niet-persistent) en `startSelectedCrawlAction` (batch-scrape van de selectie). Beide SSRF-gevalideerd; `startSelectedCrawlAction` re-valideert elke geselecteerde URL server-side (vertrouw de client niet).

```ts
import { mapSite, startBatchScrape, MAX_CRAWL_PAGES } from '@/lib/v0/crawler/firecrawl';

export type DiscoverResult = { rootUrl: string; urls: string[] };

/** Stap 2-voorbereiding: ontdek de pagina's van een site (geen scrape, niet opgeslagen). */
export async function discoverPagesAction(rawUrl: string): Promise<ActionResult<DiscoverResult>> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    const url = normalizeUrl(rawUrl);
    const check = await validateCrawlUrl(url);
    if (!check.allowed) fail('CRAWL_FAILED', check.reason);

    const found = await mapSite(url, MAX_CRAWL_PAGES);
    // SSRF: élke teruggegeven URL opnieuw toetsen — een site kan naar interne hosts linken.
    const validated = await filterPublicUrls([url, ...found]);
    return { rootUrl: url, urls: Array.from(new Set(validated)) };
  });
}

/** Start de batch-scrape van de door de klant geselecteerde URLs. */
export async function startSelectedCrawlAction(
  rootUrl: string,
  selectedUrls: string[],
  maxPages: number = MAX_CRAWL_PAGES,
): Promise<ActionResult> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    const root = normalizeUrl(rootUrl);
    const rootCheck = await validateCrawlUrl(root);
    if (!rootCheck.allowed) fail('CRAWL_FAILED', rootCheck.reason);

    const cap = Math.min(Math.max(1, Math.floor(maxPages)), MAX_CRAWL_PAGES);
    const safe = (await filterPublicUrls(selectedUrls)).slice(0, cap);
    if (safe.length === 0) fail('CRAWL_FAILED', 'Geen geldige pagina's geselecteerd.');

    const activeOrg = await getActiveOrgFromCookies();
    const sb = await getSystemJobClient({ reason: 'crawl_website' });
    const name = hostnameOf(root);

    const sourceId = await upsertWebsiteSource(sb, activeOrg.id, root, name);

    let crawlId: string;
    try {
      ({ crawlId } = await startBatchScrape(safe));
    } catch (err) {
      await sb.from('knowledge_sources').update({ status: 'failed' }).eq('id', sourceId);
      fail('CRAWL_FAILED', err instanceof Error ? err.message : 'Crawl kon niet starten.');
    }

    const { error: jobErr } = await sb.from('processing_jobs').insert({
      organization_id: activeOrg.id,
      job_type: 'crawl_website',
      target_type: 'knowledge_source',
      target_id: sourceId,
      status: 'pending',
      external_job_id: crawlId,
      started_at: new Date().toISOString(),
    });
    if (jobErr) throw new Error(`processing_jobs insert: ${jobErr.message}`);

    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}
```

- [ ] **Stap 2: Voeg de helpers toe** (onderaan `crawl.ts`). `filterPublicUrls` valideert parallel; `upsertWebsiteSource` + `hostnameOf` dedupliceren de bestaande upsert-logica uit de oude `startWebsiteCrawlAction`.

```ts
import { validateCrawlUrl } from '@/lib/v0/crawler/validateCrawlUrl';

/** Houdt alleen publieke, SSRF-veilige http(s)-URLs over (parallel gevalideerd). */
async function filterPublicUrls(urls: string[]): Promise<string[]> {
  const checks = await Promise.all(
    urls.map(async (u) => ((await validateCrawlUrl(u)).allowed ? u : null)),
  );
  return checks.filter((u): u is string => u !== null);
}

function hostnameOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** Hergebruikt of maakt de (enige) website-bron van de org; zet status op 'crawling'. */
async function upsertWebsiteSource(
  sb: Awaited<ReturnType<typeof getSystemJobClient>>,
  orgId: string,
  rootUrl: string,
  name: string,
): Promise<string> {
  const { data: existing } = await sb
    .from('knowledge_sources')
    .select('id')
    .eq('organization_id', orgId)
    .eq('type', 'website')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await sb
      .from('knowledge_sources')
      .update({ root_url: rootUrl, name, status: 'crawling', updated_at: new Date().toISOString() })
      .eq('id', existing.id as string)
      .eq('organization_id', orgId);
    if (error) throw new Error(`knowledge_sources update: ${error.message}`);
    return existing.id as string;
  }
  const { data: created, error } = await sb
    .from('knowledge_sources')
    .insert({ organization_id: orgId, type: 'website', name, root_url: rootUrl, status: 'crawling' })
    .select('id')
    .single();
  if (error) throw new Error(`knowledge_sources insert: ${error.message}`);
  return created.id as string;
}
```

> `ActionResult<T>` met payload: controleer `lib/errors/action.ts` — als `actionTry` al een generieke payload teruggeeft, gebruik die; zo niet, breid het type uit met een generic (kleine, lokale wijziging). Dit is de enige typ-aanpassing buiten de crawler-map.

- [ ] **Stap 3: Verifieer.** `npm run typecheck` → groen (geen verwijzing meer naar `startCrawl`). `npm run build` → groen.
- [ ] **Stap 4: Commit.** `git add app/actions/crawl.ts && git commit -m "feat(crawler): discover (map) + batch-scrape van geselecteerde pagina's"`

---

## FASE 2 — Migration + retrieval-filter + datalaag

### Taak 2.1: Migration `included` + `error_message` + RPC-filter

**Files:**
- Create: `supabase/migrations/0035_v0_website_page_controls.sql`

- [ ] **Stap 1: Bepaal het migratienummer.** Draai `ls supabase/migrations | sort | tail -3` én `gh pr list --state open --search "supabase/migrations" --limit 5`. Hoogste lokaal = `0034`; `0033` ontbreekt (mogelijk in een open PR). Gebruik het eerstvolgende vrije nummer dat ook in geen open PR voorkomt (waarschijnlijk `0035`). Pas de bestandsnaam aan als nodig.

- [ ] **Stap 2: Schrijf de migration.** Twee kolommen + de RPC die website-page-chunks gaat filteren op `included` (en, als bug-fix, op `deleted_at`).

```sql
-- =============================================================================
-- Migration 0035 — Website-pagina-controle: included-vlag + foutreden + RPC-filter
--
-- * website_pages.included: per-pagina aan/uit (A1). Uit = chunks tellen niet
--   meer mee bij retrieval — zonder re-embedding (RPC filtert erop).
-- * website_pages.error_message: reden van een mislukte pagina (A3), voor de UI.
-- * match_chunks_with_parents: join nu website_pages en sluit niet-included of
--   soft-deleted website-pagina's uit. (Voorheen werden website-chunks NIET op
--   deleted_at gefilterd — die latente bug wordt hier meteen gedicht.)
--
-- Geen nieuwe tabel → geen nieuwe RLS-policy nodig; bestaande policies op
-- website_pages blijven gelden. Kolommen erven de tabel-RLS.
-- =============================================================================

alter table public.website_pages
  add column if not exists included boolean not null default true,
  add column if not exists error_message text;

create or replace function public.match_chunks_with_parents(
  p_organization_id uuid,
  query_embedding   vector(1536),
  match_count       int default 5
)
returns table (
  id              uuid,
  document_id     uuid,
  website_page_id uuid,
  content         text,
  metadata        jsonb,
  similarity      float,
  parent_chunk_id uuid,
  parent_content  text,
  parent_index    int
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.document_id,
    c.website_page_id,
    c.content,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::float as similarity,
    c.parent_chunk_id,
    p.content       as parent_content,
    p.parent_index  as parent_index
  from public.document_chunks c
  left join public.documents d      on d.id  = c.document_id
  left join public.website_pages wp on wp.id = c.website_page_id
  left join public.parent_chunks p  on p.id  = c.parent_chunk_id
  where c.organization_id = p_organization_id
    and (c.document_id is null or d.deleted_at is null)
    and (c.website_page_id is null or (wp.deleted_at is null and wp.included = true))
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
```

- [ ] **Stap 3: Verifieer dat dit de enige actieve match-RPC is** die website-chunks teruggeeft: `grep -rn "match_chunks_with_parents" lib/ scripts/` en bevestig dat `lib/v0/server/rag.ts` deze RPC aanroept. Is er een tweede variant (bv. een hybrid-RPC in 0004) die ook website-chunks levert, geef die dezelfde `wp`-filter.
- [ ] **Stap 4: Pas de migration toe.** `npm run migrate` → daarna `npm run migrate:status` (nieuwe migration = applied).
- [ ] **Stap 5: Commit.** `git add supabase/migrations/0035_v0_website_page_controls.sql && git commit -m "feat(crawler): website_pages.included + error_message + RPC-filter"`

### Taak 2.2: Ingest schrijft `error_message`; één-pagina-ingest helper

**Files:**
- Modify: `lib/v0/crawler/processCrawl.ts`

- [ ] **Stap 1: Schrijf de foutreden** bij een mislukte pagina. Voeg in de `insert` van `ingestCrawlResults` een `error_message`-veld toe en bepaal de reden.

```ts
// boven de insert:
const errorMessage =
  status === 'failed'
    ? page.error ?? (page.statusCode != null ? `HTTP ${page.statusCode}` : 'Pagina kon niet worden opgehaald')
    : null;
```
En in het insert-object: `error_message: errorMessage,` (naast de bestaande velden).

- [ ] **Stap 2: Exporteer een `ingestSinglePage`-helper** (voor C1 + retry) die één pagina toevoegt/vervangt zónder de hele bron te wissen.

```ts
/**
 * Ingest één losse pagina (C1 / retry). Vervangt een bestaande rij met dezelfde
 * URL binnen de bron (idempotent), houdt de rest van de pagina's intact.
 */
export async function ingestSinglePage(
  knowledgeSourceId: string,
  organizationId: string,
  page: CrawledPage,
): Promise<{ status: 'crawled' | 'failed' | 'excluded'; pageId: string }> {
  const sb = await getSystemJobClient({ reason: 'crawl_website' });

  // Bestaande rij met dezelfde URL weg (CASCADE ruimt chunks).
  await sb
    .from('website_pages')
    .delete()
    .eq('knowledge_source_id', knowledgeSourceId)
    .eq('url', page.url);

  const status = pageStatus(page);
  const errorMessage =
    status === 'failed'
      ? page.error ?? (page.statusCode != null ? `HTTP ${page.statusCode}` : 'Pagina kon niet worden opgehaald')
      : null;
  const contentHash =
    status === 'crawled' ? createHash('sha256').update(page.markdown).digest('hex') : null;

  const { data: inserted, error: pageErr } = await sb
    .from('website_pages')
    .insert({
      knowledge_source_id: knowledgeSourceId,
      organization_id: organizationId,
      url: page.url || '(onbekend)',
      title: page.title,
      content_text: status === 'crawled' ? page.markdown : null,
      content_hash: contentHash,
      status,
      error_message: errorMessage,
      last_crawled_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (pageErr) throw new Error(`website_pages insert (${page.url}): ${pageErr.message}`);
  const pageId = inserted.id as string;

  if (status === 'crawled') {
    const chunks = chunkText(page.markdown);
    if (chunks.length > 0) {
      const embed = await embedTexts(chunks);
      const rows = chunks.map((content, i) => ({
        organization_id: organizationId,
        website_page_id: pageId,
        content,
        embedding: embed.vectors[i],
        metadata: { chunk_index: i, url: page.url },
      }));
      const { error: chunkErr } = await sb.from('document_chunks').insert(rows);
      if (chunkErr) throw new Error(`document_chunks insert (${page.url}): ${chunkErr.message}`);
    }
  }
  return { status, pageId };
}
```

- [ ] **Stap 3: Verifieer.** `npm run typecheck` → groen.
- [ ] **Stap 4: Commit.** `git add lib/v0/crawler/processCrawl.ts && git commit -m "feat(crawler): error_message bij ingest + ingestSinglePage helper"`

### Taak 2.3: Datalaag + types uitbreiden

**Files:**
- Modify: `lib/v0/klantendashboard/types.ts`
- Modify: `lib/v0/server/crawler.ts`

- [ ] **Stap 1: Breid `WebsitePage` uit** in `types.ts` met `included` en `errorMessage`.

```ts
export type WebsitePage = {
  id: string;
  title: string;
  url: string;
  status: WebsitePageStatus;
  lastProcessedAt: string;
  included: boolean;
  errorMessage: string | null;
};
```

- [ ] **Stap 2: Update `getWebsiteState`** in `crawler.ts`: selecteer `included, error_message`, en map de UI-status zó dat een uitgezette pagina `disabled` toont, een mislukte `error`, anders `active`.

```ts
// in de select:
.select('id, url, title, status, included, error_message, last_crawled_at')

// vervang toUiPageStatus-gebruik door:
function toUiPageStatus(db: string, included: boolean): WebsitePageStatus {
  if (db === 'failed') return 'error';
  if (!included || db === 'excluded') return 'disabled';
  return 'active';
}

// in de map:
const pages: WebsitePage[] = (pageRows ?? []).map((p) => ({
  id: p.id as string,
  title: (p.title as string | null) ?? (p.url as string),
  url: p.url as string,
  status: toUiPageStatus(p.status as string, (p.included as boolean) ?? true),
  lastProcessedAt: (p.last_crawled_at as string | null) ?? '',
  included: (p.included as boolean) ?? true,
  errorMessage: (p.error_message as string | null) ?? null,
}));
```

- [ ] **Stap 3: Verifieer.** `npm run typecheck` → groen.
- [ ] **Stap 4: Commit.** `git add lib/v0/klantendashboard/types.ts lib/v0/server/crawler.ts && git commit -m "feat(crawler): included + errorMessage in WebsiteState"`

### Taak 2.4: Beheer-actions (toggle, retry, losse import)

**Files:**
- Modify: `app/actions/crawl.ts`

- [ ] **Stap 1: Voeg drie actions toe.** Alle drie rate-limited (echte mutaties).

```ts
import { scrapeOne } from '@/lib/v0/crawler/firecrawl';
import { ingestSinglePage } from '@/lib/v0/crawler/processCrawl';

/** A1: zet één pagina aan/uit. Goedkoop — alleen een vlag; RPC doet de rest. */
export async function setPageIncludedAction(pageId: string, included: boolean): Promise<ActionResult> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);
    const activeOrg = await getActiveOrgFromCookies();
    const sb = await getSystemJobClient({ reason: 'toggle_website_page' });
    const { error } = await sb
      .from('website_pages')
      .update({ included })
      .eq('id', pageId)
      .eq('organization_id', activeOrg.id);
    if (error) throw new Error(`website_pages toggle: ${error.message}`);
    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}

/** A3: herprobeer één mislukte pagina (synchrone scrape + ingest). */
export async function retryPageAction(pageId: string): Promise<ActionResult> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);
    const activeOrg = await getActiveOrgFromCookies();
    const sb = await getSystemJobClient({ reason: 'retry_website_page' });
    const { data: row } = await sb
      .from('website_pages')
      .select('url, knowledge_source_id')
      .eq('id', pageId)
      .eq('organization_id', activeOrg.id)
      .maybeSingle();
    if (!row) fail('CRAWL_FAILED', 'Pagina niet gevonden.');
    const check = await validateCrawlUrl(row.url as string);
    if (!check.allowed) fail('CRAWL_FAILED', check.reason);
    const page = await scrapeOne(row.url as string);
    await ingestSinglePage(row.knowledge_source_id as string, activeOrg.id, page);
    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}

/** C1: importeer één losse pagina (synchroon). Maakt de bron aan als die nog niet bestaat. */
export async function scrapeSinglePageAction(rawUrl: string): Promise<ActionResult> {
  return actionTry(async () => {
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);
    const url = normalizeUrl(rawUrl);
    const check = await validateCrawlUrl(url);
    if (!check.allowed) fail('CRAWL_FAILED', check.reason);
    const activeOrg = await getActiveOrgFromCookies();
    const sb = await getSystemJobClient({ reason: 'scrape_single_page' });
    const sourceId = await upsertWebsiteSource(sb, activeOrg.id, url, hostnameOf(url));
    const page = await scrapeOne(url);
    page.url = page.url || url; // borg dat de rij een URL heeft
    const { status } = await ingestSinglePage(sourceId, activeOrg.id, page);
    if (status === 'failed') fail('CRAWL_FAILED', page.error ?? 'Pagina kon niet worden opgehaald.');
    await sb.from('knowledge_sources').update({ status: 'ready' }).eq('id', sourceId);
    revalidatePath(KENNISBANK_PATH);
    return {};
  });
}
```

- [ ] **Stap 2: Verwijder de oude `deleteWebsiteSourceAction`/`refreshWebsiteState` niet** — die blijven. Verwijder enkel restanten die naar `startWebsiteCrawlAction` verwijzen.
- [ ] **Stap 3: Verifieer.** `npm run typecheck` → groen.
- [ ] **Stap 4: Commit.** `git add app/actions/crawl.ts && git commit -m "feat(crawler): toggle + retry + losse-pagina-import actions"`

---

## FASE 3 — Nieuwe crawl-flow UI (ontdekken → kiezen → voortgang)

### Taak 3.1: Groepeer-util

**Files:**
- Create: `lib/v0/klantendashboard/group-pages.ts`

- [ ] **Stap 1: Schrijf `groupByPath`** — groepeert URLs op hun eerste pad-segment ("Hoofdpagina's" voor `/`).

```ts
export type UrlGroup = { key: string; label: string; urls: string[] };

/** Groepeert URLs op eerste pad-segment; root-pagina's komen in "Hoofdpagina's". */
export function groupByPath(urls: string[]): UrlGroup[] {
  const map = new Map<string, string[]>();
  for (const u of urls) {
    let seg = '';
    try {
      const path = new URL(u).pathname.replace(/^\/+/, '');
      seg = path.split('/')[0] ?? '';
    } catch { seg = ''; }
    const key = seg === '' ? '_root' : seg;
    (map.get(key) ?? map.set(key, []).get(key)!).push(u);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a === '_root' ? -1 : b === '_root' ? 1 : a.localeCompare(b)))
    .map(([key, groupUrls]) => ({
      key,
      label: key === '_root' ? "Hoofdpagina's" : `/${key}`,
      urls: groupUrls,
    }));
}
```

- [ ] **Stap 2: Verifieer + commit.** `npm run typecheck`; `git add lib/v0/klantendashboard/group-pages.ts && git commit -m "feat(crawler): groupByPath util"`

### Taak 3.2: Voortgangskaart (variant B)

**Files:**
- Create: `app/klantendashboard/kennisbank/components/crawl-progress.tsx`

- [ ] **Stap 1: Schrijf de presentational component** (variant B uit de brainstorm: balk + live teller + tijdsindicatie + "houd tabblad open"). Gebruik de bestaande `klant-card`-stijl; teller-data komt uit `WebsiteState.job` (uitgebreid in Stap 2).

```tsx
'use client';
import { Loader2, AlertTriangle } from 'lucide-react';

export function CrawlProgress({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 5;
  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
        <Loader2 size={14} style={{ animation: 'org-spin 0.9s linear infinite' }} /> Je website wordt verwerkt
      </div>
      <div style={{ height: 8, background: 'var(--klant-track, #ece8df)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--klant-accent, #c9a227)', transition: 'width .4s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>
          {completed}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--klant-fg-dim)' }}> / {total || '…'} pagina&apos;s</span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--klant-fg-dim)' }}>± 1–3 min</span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11.5, color: 'var(--klant-fg-dim)' }}>
        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        Houd dit tabblad open tot het klaar is. Sluit je het, dan pauzeert de verwerking en gaat verder zodra je terugkomt.
      </div>
    </div>
  );
}
```

- [ ] **Stap 2: Geef de teller-data door.** Breid in `lib/v0/server/crawler.ts` de `job`-shape uit met `completed`/`total` uit `processing_jobs`. (De cron/tick zet `attempts`; voor de live teller lezen we de job-progress die `processCrawlJobs` kan meeschrijven — voeg in `processCrawlJobs` bij status `scraping` een update toe van `metadata`/aparte kolommen óf lees `status.completed/total` rechtstreeks in de tick en geef ze door.)

  Eenvoudigste route zonder migration: laat `tickCrawlIngestAction` de laatste `getCrawlJobStatus` teruggeven als deel van de state. Pas `WebsiteState.job` aan naar `{ status; error; completed; total }` en vul `completed/total` vanuit de tick (0 als geen actieve poll). Werk `getWebsiteState` bij om `completed: 0, total: 0` te defaulten.

- [ ] **Stap 3: Verifieer + commit.** `npm run typecheck`; `git add app/klantendashboard/kennisbank/components/crawl-progress.tsx lib/v0/server/crawler.ts && git commit -m "feat(crawler): voortgangskaart variant B met live teller"`

### Taak 3.3: Kies-scherm

**Files:**
- Create: `app/klantendashboard/kennisbank/components/page-selection.tsx`

- [ ] **Stap 1: Schrijf het kies-scherm.** Props: `rootUrl`, `urls: string[]`, `onStart(selected, maxPages)`, `onCancel()`. State: een `Set<string>` van geselecteerde URLs (default alle), `maxPages` (default min(urls.length, 50)). Groepeer met `groupByPath`. Groep-toggle (alle in groep aan/uit), pagina-toggle, "alles/niets", live teller, startknop. Volg de mockup `crawl-flow.html` en de `klant-*`-stijl.

```tsx
'use client';
import { useState } from 'react';
import { groupByPath } from '@/lib/v0/klantendashboard/group-pages';
import { MAX_CRAWL_PAGES } from '@/lib/v0/crawler/firecrawl';

export function PageSelection({
  rootUrl, urls, pending, onStart, onCancel,
}: {
  rootUrl: string; urls: string[]; pending: boolean;
  onStart: (selected: string[], maxPages: number) => void; onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(urls));
  const [maxPages, setMaxPages] = useState(Math.min(urls.length, MAX_CRAWL_PAGES));
  const groups = groupByPath(urls);

  const toggle = (u: string) => setSelected((s) => { const n = new Set(s); n.has(u) ? n.delete(u) : n.add(u); return n; });
  const toggleGroup = (groupUrls: string[]) => setSelected((s) => {
    const n = new Set(s); const allOn = groupUrls.every((u) => n.has(u));
    groupUrls.forEach((u) => (allOn ? n.delete(u) : n.add(u))); return n;
  });
  const setAll = (on: boolean) => setSelected(on ? new Set(urls) : new Set());
  const count = selected.size;

  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h3 className="klant-section-title">Kies welke pagina&apos;s je chatbot mag gebruiken</h3>
          <p className="klant-section-help">We vonden {urls.length} pagina&apos;s op {rootUrl}. Vink uit wat je niet wilt.</p>
        </div>
        <label style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
          Max
          <input type="number" min={1} max={MAX_CRAWL_PAGES} value={maxPages}
            onChange={(e) => setMaxPages(Math.min(MAX_CRAWL_PAGES, Math.max(1, Number(e.target.value) || 1)))}
            className="klant-input" style={{ width: 64 }} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
        <button type="button" className="klant-btn" data-variant="ghost" onClick={() => setAll(true)}>Alles</button>
        <button type="button" className="klant-btn" data-variant="ghost" onClick={() => setAll(false)}>Niets</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {groups.map((g) => {
          const allOn = g.urls.every((u) => selected.has(u));
          return (
            <div key={g.key} style={{ border: '1px solid var(--klant-border)', borderRadius: 10, overflow: 'hidden' }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 12px', background: 'var(--klant-subtle)', fontWeight: 600, fontSize: 13 }}>
                <input type="checkbox" checked={allOn} onChange={() => toggleGroup(g.urls)} />
                {g.label} <span style={{ color: 'var(--klant-fg-dim)', fontWeight: 500 }}>· {g.urls.length}</span>
              </label>
              {g.urls.map((u) => (
                <label key={u} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px 8px 30px', fontSize: 12.5, borderTop: '1px solid var(--klant-border)' }}>
                  <input type="checkbox" checked={selected.has(u)} onChange={() => toggle(u)} />
                  <span style={{ color: 'var(--klant-fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u}</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--klant-fg-dim)' }}><b style={{ color: 'var(--klant-fg)' }}>{count}</b> van {urls.length} geselecteerd</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="klant-btn" data-variant="ghost" onClick={onCancel} disabled={pending}>Annuleren</button>
          <button type="button" className="klant-btn" data-variant="primary" disabled={pending || count === 0}
            onClick={() => onStart(Array.from(selected), maxPages)}>
            {pending ? 'Starten…' : `Crawl ${Math.min(count, maxPages)} pagina's starten`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

> CSS-vars (`--klant-border`, `--klant-subtle`, `--klant-accent`, `--klant-track`): controleer de echte namen in `app/globals.css`/het klant-thema en gebruik de bestaande. Bestaan ze niet, val terug op de inline-hex uit de mockups (Tailwind-v4-quirk: inline-styles zijn hier de veilige route — zie [[tailwind_v4_postcss_quirk]]).

- [ ] **Stap 2: Verifieer + commit.** `npm run typecheck`; `git add app/klantendashboard/kennisbank/components/page-selection.tsx && git commit -m "feat(crawler): kies-scherm met groepering + max"`

### Taak 3.4: Website-tab als state-machine

**Files:**
- Modify: `app/klantendashboard/kennisbank/components/website-tab.tsx`

- [ ] **Stap 1: Herschrijf de tab** als orchestrator over vier toestanden: `input` (geen bron / nog niets ontdekt) → `selecting` (discover klaar) → `crawling` (job loopt) → `managed` (pagina's aanwezig). Behoud de tick-poll uit Fase 0.

```tsx
'use client';
import { useState, useEffect, useTransition } from 'react';
import {
  discoverPagesAction, startSelectedCrawlAction, tickCrawlIngestAction,
  deleteWebsiteSourceAction, refreshWebsiteState,
} from '@/app/actions/crawl';
import type { WebsiteState } from '@/lib/v0/server/crawler';
import { CrawlProgress } from './crawl-progress';
import { PageSelection } from './page-selection';
import { ManagedPages } from './managed-pages';

export function WebsiteTab({ initialState }: { initialState: WebsiteState }) {
  const [state, setState] = useState<WebsiteState>(initialState);
  const [discovered, setDiscovered] = useState<{ rootUrl: string; urls: string[] } | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { source, job, pages } = state;
  const isCrawling = job?.status === 'pending' || job?.status === 'processing';

  useEffect(() => { tickCrawlIngestAction().then(setState).catch(() => {}); }, []);
  useEffect(() => {
    if (!isCrawling) return;
    const t = setInterval(async () => { try { setState(await tickCrawlIngestAction()); } catch {} }, 4000);
    return () => clearInterval(t);
  }, [isCrawling]);

  function onDiscover() {
    if (!url.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await discoverPagesAction(url);
      if (!res.ok) { setError(res.error); return; }
      setDiscovered(res.data); // ActionResult<DiscoverResult>
    });
  }

  function onStart(selected: string[], maxPages: number) {
    if (!discovered) return;
    setError(null);
    startTransition(async () => {
      const res = await startSelectedCrawlAction(discovered.rootUrl, selected, maxPages);
      if (!res.ok) { setError(res.error); return; }
      setDiscovered(null); setUrl('');
      try { setState(await refreshWebsiteState()); } catch {}
    });
  }

  // Render: selecting > crawling > managed > input
  if (discovered && !isCrawling) {
    return <PageSelection rootUrl={discovered.rootUrl} urls={discovered.urls} pending={pending}
      onStart={onStart} onCancel={() => setDiscovered(null)} />;
  }
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!source && (
        <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h3 className="klant-section-title">Voeg je website toe</h3>
            <p className="klant-section-help">Geef je website-URL op. We zoeken eerst de pagina&apos;s, daarna kies je welke meegaan.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="url" placeholder="https://jouwwebsite.nl" value={url}
              onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onDiscover()}
              className="klant-input" disabled={pending} />
            <button type="button" onClick={onDiscover} className="klant-btn" data-variant="primary"
              disabled={pending || !url.trim()}>{pending ? 'Zoeken…' : "Pagina's zoeken"}</button>
          </div>
        </div>
      )}
      {error && (
        <div className="klant-card" data-tone="danger" style={{ fontSize: 13 }}>{error}</div>
      )}
      {isCrawling && <CrawlProgress completed={job?.completed ?? 0} total={job?.total ?? 0} />}
      {source && !isCrawling && (
        <ManagedPages state={state} onChange={setState} />
      )}
    </section>
  );
}
```

> `res.data` vereist dat `ActionResult` een optionele payload draagt (zie Taak 1.3 Stap 2). Controleer `lib/errors/action.ts`.

- [ ] **Stap 2: Verifieer.** `npm run typecheck` (faalt nog op ontbrekende `ManagedPages` → Fase 4). `npm run build` na Fase 4.
- [ ] **Stap 3: Commit.** `git add app/klantendashboard/kennisbank/components/website-tab.tsx && git commit -m "feat(crawler): Website-tab state-machine (input -> kiezen -> crawlen -> beheer)"`

---

## FASE 4 — Beheer-UI (A1 toggle + A3 fouten + retry) + C1 import

### Taak 4.1: Losse-pagina-import

**Files:**
- Create: `app/klantendashboard/kennisbank/components/single-page-import.tsx`

- [ ] **Stap 1: Schrijf de component** (input + "Toevoegen", synchroon). Roept `scrapeSinglePageAction`; bij succes `onAdded(state)` met verse state.

```tsx
'use client';
import { useState, useTransition } from 'react';
import { scrapeSinglePageAction, refreshWebsiteState } from '@/app/actions/crawl';
import type { WebsiteState } from '@/lib/v0/server/crawler';

export function SinglePageImport({ onAdded }: { onAdded: (s: WebsiteState) => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function add() {
    if (!url.trim() || pending) return;
    setError(null);
    start(async () => {
      const res = await scrapeSinglePageAction(url);
      if (!res.ok) { setError(res.error); return; }
      setUrl(''); try { onAdded(await refreshWebsiteState()); } catch {}
    });
  }
  return (
    <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Losse pagina importeren</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="url" className="klant-input" placeholder="https://jouwsite.nl/nieuwe-pagina"
          value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} disabled={pending} />
        <button type="button" className="klant-btn" data-variant="primary" onClick={add} disabled={pending || !url.trim()}>
          {pending ? 'Toevoegen…' : 'Toevoegen'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--klant-fg-dim)' }}>⚡ Direct opgehaald — geen wachten, geen volledige crawl.</div>
      {error && <div style={{ fontSize: 12, color: 'var(--klant-danger, #dc2626)' }}>{error}</div>}
    </div>
  );
}
```

- [ ] **Stap 2: Commit.** `npm run typecheck`; `git add app/klantendashboard/kennisbank/components/single-page-import.tsx && git commit -m "feat(crawler): losse-pagina-import (C1)"`

### Taak 4.2: Beheer-lijst met toggles + fouten + retry

**Files:**
- Create: `app/klantendashboard/kennisbank/components/managed-pages.tsx`

- [ ] **Stap 1: Schrijf de component.** Props: `state`, `onChange(state)`. Toont header (telling + acties: opnieuw crawlen via re-discover, verwijderen), `SinglePageImport`, en een per-pad gegroepeerde lijst (`groupByPath` op `pages.map(p=>p.url)`) met per pagina: titel/url, statusbadge, toggle (`setPageIncludedAction`), en bij `error`-status de `errorMessage` + "Opnieuw" (`retryPageAction`). Volg de mockup `managed-pages.html`.

```tsx
'use client';
import { useState, useTransition } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import {
  setPageIncludedAction, retryPageAction, deleteWebsiteSourceAction, refreshWebsiteState,
} from '@/app/actions/crawl';
import type { WebsiteState } from '@/lib/v0/server/crawler';
import { groupByPath } from '@/lib/v0/klantendashboard/group-pages';
import { StatusBadge } from '../../components/status-badge';
import { SinglePageImport } from './single-page-import';

export function ManagedPages({ state, onChange }: { state: WebsiteState; onChange: (s: WebsiteState) => void }) {
  const { source, pages } = state;
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const groups = groupByPath(pages.map((p) => p.url));
  const counts = {
    active: pages.filter((p) => p.status === 'active').length,
    off: pages.filter((p) => p.status === 'disabled').length,
    failed: pages.filter((p) => p.status === 'error').length,
  };

  const refresh = async () => { try { onChange(await refreshWebsiteState()); } catch {} };
  const toggle = (id: string, included: boolean) => start(async () => {
    setBusyId(id); await setPageIncludedAction(id, included); await refresh(); setBusyId(null);
  });
  const retry = (id: string) => start(async () => { setBusyId(id); await retryPageAction(id); await refresh(); setBusyId(null); });
  const del = () => {
    if (!source || !confirm('Website-bron verwijderen? Alle pagina's gaan uit de kennisbank.')) return;
    start(async () => { await deleteWebsiteSourceAction(source.id); onChange({ source: null, job: null, pages: [] }); });
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="klant-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>🌐 {source?.rootUrl}</div>
          <div style={{ fontSize: 12, color: 'var(--klant-fg-dim)' }}>
            {pages.length} pagina&apos;s · {counts.active} actief · {counts.off} uit · {counts.failed} mislukt
          </div>
        </div>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" className="klant-btn" data-variant="danger" onClick={del} disabled={pending} title="Verwijderen" style={{ padding: 6 }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <SinglePageImport onAdded={onChange} />

      <div className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
        {groups.map((g) => (
          <div key={g.key}>
            <div style={{ padding: '9px 12px', background: 'var(--klant-subtle)', fontWeight: 600, fontSize: 13 }}>
              {g.label} <span style={{ color: 'var(--klant-fg-dim)', fontWeight: 500 }}>· {g.urls.length}</span>
            </div>
            {g.urls.map((u) => {
              const p = byUrl.get(u)!;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: '1px solid var(--klant-border)' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500, color: 'var(--klant-fg)' }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--klant-fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.url}</div>
                    {p.status === 'error' && p.errorMessage && (
                      <div style={{ fontSize: 11, color: 'var(--klant-danger, #dc2626)' }}>⚠ {p.errorMessage}</div>
                    )}
                  </div>
                  <StatusBadge status={p.status} kind="webpage" />
                  {p.status === 'error' ? (
                    <button type="button" className="klant-btn" data-variant="ghost" disabled={pending && busyId === p.id}
                      onClick={() => retry(p.id)} style={{ padding: '4px 9px', fontSize: 12 }}>
                      <RefreshCw size={12} /> Opnieuw
                    </button>
                  ) : (
                    <input type="checkbox" checked={p.included} disabled={pending && busyId === p.id}
                      onChange={() => toggle(p.id, !p.included)} title={p.included ? 'Aan' : 'Uit'} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
```

> "Opnieuw crawlen" van de hele site: bewust weggelaten uit deze knoppenrij om dubbel-werk te voorkomen — een volledige hercrawl = bron verwijderen + opnieuw toevoegen, of (optioneel later) een knop die `discoverPagesAction(source.rootUrl)` opnieuw opent. Voeg dit alleen toe als Sebastiaan erom vraagt (minimaal-eerst).

- [ ] **Stap 2: Verifieer.** `npm run typecheck` → groen (alle imports bestaan nu). `npm run build` → groen.
- [ ] **Stap 3: Commit.** `git add app/klantendashboard/kennisbank/components/managed-pages.tsx && git commit -m "feat(crawler): beheer-lijst met A1-toggle, A3-fouten en retry"`

### Taak 4.3: End-to-end handmatige check + StatusBadge

**Files:**
- Verify: `app/klantendashboard/components/status-badge.tsx` (ondersteunt `kind="webpage"` met `active|disabled|error|processing`)

- [ ] **Stap 1: Controleer `StatusBadge`** rendert `disabled` ("uit") en `error` netjes voor `kind="webpage"`. Mist een variant → voeg een label toe (volg het bestaande patroon in dat bestand).
- [ ] **Stap 2: E2E in de dev-server.** `npm run dev`, dev-org:
  1. Voeg een kleine publieke site toe → "Pagina's zoeken" → kies-scherm verschijnt met groepen.
  2. Deselecteer een groep + zet max lager → "Crawl starten" → voortgangskaart (variant B) telt op.
  3. Na afloop: beheer-lijst toont pagina's; zet een pagina **uit** → bevestig via de Test-chatbot of `npm run v0:chat` dat die content niet meer in antwoorden zit (RPC-filter werkt).
  4. Importeer een losse pagina (C1) → verschijnt direct.
  5. (Indien een pagina faalde) check de foutreden + "Opnieuw".
- [ ] **Stap 3: `graphify update .`** (output gitignored) en **commit** eventuele StatusBadge-aanpassing.

---

## Self-review (uitgevoerd bij het schrijven)

- **Spec-dekking:** Fase 0 = deploy-deblokkering (§2,§8). Fase 1 = map/scrape/batch (§3,§7). Fase 2 = `included`/`error_message`/RPC (§4 A1/A3, §6). Fase 3 = flow + variant B (§3,§5). Fase 4 = beheer + C1 (§4 A1/A3/C1). C3 = `mapSite` (Fase 1). C2 expliciet out-of-scope (§10). SSRF op map-resultaten (§9) → `filterPublicUrls`. ✔ Alle spec-eisen hebben een taak.
- **Placeholder-scan:** geen "TBD/handle errors later"; het migratienummer is een expliciete verificatiestap (AGENTS.md-vereiste), geen luie placeholder.
- **Type-consistentie:** `getCrawlJobStatus` (Fase 1) vervangt `getCrawlStatus` overal (processJobs Stap 1.1.2). `CrawledPage`/`CrawlStatus` shapes onveranderd. `WebsitePage` krijgt `included`/`errorMessage` consistent in types.ts → crawler.ts → UI. `ActionResult<T>`-payload gemarkeerd als te-bevestigen punt in `lib/errors/action.ts` (Taak 1.3).
- **Te verifiëren tijdens bouw (geen aannames):** (a) `lib/errors/action.ts` payload-generic; (b) exacte `--klant-*` CSS-var-namen; (c) of er een tweede match-RPC met website-chunks bestaat; (d) `StatusBadge` webpage-varianten.
