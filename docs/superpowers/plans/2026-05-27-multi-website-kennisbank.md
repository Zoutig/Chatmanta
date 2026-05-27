# Multi-website Kennisbank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meerdere website-bronnen per org in de Kennisbank-Website-tab: een inklapbare lijst van sites, klik vouwt de paginalijst uit; topbalk met "Website crawlen" + "Losse pagina toevoegen".

**Architecture:** In-place (geen greenfield). Het datamodel staat al meerdere `knowledge_sources`-rijen toe; we voegen een partiële unieke index op `(organization_id, normalized_host)` toe (migratie 0037), maken de upsert domein-aware, vervangen de single-source leeslaag door een lijst, en herstructureren de UI naar topbalk + inklapbare website-lijst die de bestaande `PageSelection`/`ManagedPages`/`CrawlProgress` hergebruikt.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (service-role via `getSystemJobClient`), Firecrawl SDK v4.25. Geen jest in de repo — verifiëren via `tsc --noEmit`, tsx-assert-scripts (zoals bestaande `scripts/*`), `npm run migrate`, en Playwright-rooktest.

**Bouwt voort op:** post-#116 main (`944f2a9`) — crawler heeft al `crawlEvents.ts`, `CrawlDiagnostics`, en `getCrawlJobStatus` met `rawStatus/hasNext/creditsUsed`. Lees elk bestand vers in de worktree vóór editen.

**Spec:** `docs/superpowers/specs/2026-05-27-multi-website-kennisbank-design.md`

---

## File Structure

| Bestand | Verantwoordelijkheid | Actie |
|---|---|---|
| `supabase/migrations/0037_v0_multi_website.sql` | `normalized_host` kolom + backfill + dedup + partiële unieke index | Create |
| `lib/v0/crawler/normalizeHost.ts` | Eén bron van waarheid: URL → genormaliseerde host (lowercase, zonder `www.`) | Create |
| `app/actions/crawl.ts` | `upsertWebsiteSource` domein-aware; `tickCrawlIngestAction`/`refreshWebsiteSources` geven lijst; delete faalt open job | Modify |
| `lib/v0/server/crawler.ts` | `getWebsiteSources(orgId): WebsiteSource[]` i.p.v. single `getWebsiteState` | Modify |
| `app/klantendashboard/kennisbank/components/website-list.tsx` | Inklapbare lijst van sites; rij → `ManagedPages` | Create |
| `app/klantendashboard/kennisbank/components/website-tab.tsx` | Orkestrator: topbalk (2 knoppen) + flows + lijst | Rewrite |
| `app/klantendashboard/kennisbank/components/managed-pages.tsx` | Neemt één bron (`source`+`pages`+`onChange`) i.p.v. hele `WebsiteState`; geen eigen header/SinglePageImport meer | Modify |
| `app/klantendashboard/kennisbank/page.tsx` | Passeert de lijst aan `WebsiteTab` | Modify |
| `scripts/multi-website-diag.ts` | Read-only verificatie van `getWebsiteSources` | Create (throwaway, niet committen) |

---

## Task 1: Migratie 0037 — normalized_host + unieke index

**Files:**
- Create: `supabase/migrations/0037_v0_multi_website.sql`

- [ ] **Step 1: Bevestig het migratienummer**

Run: `Get-ChildItem supabase/migrations | Sort-Object Name | Select-Object -Last 3` en `gh pr list --state open --search "supabase/migrations in:path" --limit 10`
Expected: hoogste = `0036_v0_crawl_events.sql`, geen open PR met `0037`. Zo niet → kies het eerstvolgende vrije nummer en hernoem dit bestand + alle verwijzingen.

- [ ] **Step 2: Schrijf de migratie**

```sql
-- =============================================================================
-- Migration 0037 — V0 multi-website: één website-entry per domein per org.
--
-- Voegt knowledge_sources.normalized_host toe (host zonder leidende www., lower),
-- backfilt bestaande website-rijen uit root_url, soft-delete't oudere duplicaten
-- per (org, host), en dwingt met een partiële unieke index af dat er max één
-- levende website-bron per domein per org bestaat. Geen RLS-wijziging nodig
-- (knowledge_sources heeft al RLS; mutaties lopen via service-role).
-- =============================================================================

alter table public.knowledge_sources
  add column if not exists normalized_host text;

-- Backfill: scheme + optioneel 'www.' strippen, host tot '/' of ':'.
update public.knowledge_sources
set normalized_host = lower(regexp_replace(root_url, '^https?://(www\.)?([^/:]+).*$', '\2'))
where type = 'website'
  and root_url is not null
  and normalized_host is null;

-- Dedup vóór de unieke index: houd de nieuwste levende rij per (org, host),
-- soft-delete de oudere. Zonder dit faalt de index-creatie op bestaande data.
with ranked as (
  select id,
         row_number() over (
           partition by organization_id, normalized_host
           order by created_at desc, id desc
         ) as rn
  from public.knowledge_sources
  where type = 'website'
    and deleted_at is null
    and normalized_host is not null
)
update public.knowledge_sources k
set deleted_at = now(), updated_at = now()
from ranked
where k.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists knowledge_sources_org_host_uidx
  on public.knowledge_sources (organization_id, normalized_host)
  where type = 'website' and deleted_at is null and normalized_host is not null;
```

- [ ] **Step 3: Draai de migratie**

Run: `npm run migrate`
Expected: 0037 toegepast zonder fouten. Daarna `npm run migrate:status` → 0037 als applied.

- [ ] **Step 4: Verifieer kolom + index bestaan**

Run een ad-hoc read via een bestaand patroon (of `npm run migrate:status`). Expected: geen errors; bestaande website-bronnen hebben nu een gevulde `normalized_host`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0037_v0_multi_website.sql
git commit -m "feat(crawler): migratie 0037 — normalized_host + unieke index per domein/org"
```

---

## Task 2: normalizeHost helper

**Files:**
- Create: `lib/v0/crawler/normalizeHost.ts`
- Test: `scripts/normalize-host-check.ts` (throwaway tsx-assert)

- [ ] **Step 1: Schrijf de helper**

```typescript
// lib/v0/crawler/normalizeHost.ts
// Eén bron van waarheid voor het domein waarop website-bronnen gededupliceerd
// worden. Lowercase host zonder leidende 'www.'. Ongeldige URL → null.
// Spiegelt de SQL-backfill in migratie 0037 (scheme + www. strippen).
export function normalizeHost(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.hostname.toLowerCase().replace(/^www\./, '');
}
```

- [ ] **Step 2: Schrijf de assert-check**

```typescript
// scripts/normalize-host-check.ts
import { normalizeHost } from '../lib/v0/crawler/normalizeHost';
const cases: [string, string | null][] = [
  ['https://www.Foo.nl/over', 'foo.nl'],
  ['http://foo.nl', 'foo.nl'],
  ['https://sub.foo.nl/', 'sub.foo.nl'],
  ['https://v0-demo1-website.vercel.app/', 'v0-demo1-website.vercel.app'],
  ['not a url', null],
  ['ftp://foo.nl', null],
];
let ok = true;
for (const [inp, exp] of cases) {
  const got = normalizeHost(inp);
  const pass = got === exp;
  ok &&= pass;
  console.log(pass ? 'PASS' : 'FAIL', JSON.stringify(inp), '=>', got);
}
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 3: Run het en zie het slagen**

Run: `node --conditions=react-server --import tsx scripts/normalize-host-check.ts`
Expected: `ALL PASS`.

- [ ] **Step 4: Verwijder het check-script en commit de helper**

```bash
Remove-Item scripts/normalize-host-check.ts
git add lib/v0/crawler/normalizeHost.ts
git commit -m "feat(crawler): normalizeHost helper (dedup-sleutel per domein)"
```

---

## Task 3: Domein-aware upsertWebsiteSource

**Files:**
- Modify: `app/actions/crawl.ts` (de bestaande `upsertWebsiteSource` helper onderaan)

- [ ] **Step 1: Lees de huidige helper**

Run: lees `app/actions/crawl.ts` — vind `async function upsertWebsiteSource(...)` (kiest nu de meest-recente website-bron). Importeer `normalizeHost` bovenaan: voeg toe aan de imports `import { normalizeHost } from '@/lib/v0/crawler/normalizeHost';`

- [ ] **Step 2: Vervang de helper-body door domein-matching**

```typescript
/** Hergebruikt of maakt de website-bron van de org VOOR DIT DOMEIN; zet status 'crawling'.
 *  Match op normalized_host (uniek per org via index 0037). Race → 23505 → opnieuw lezen. */
async function upsertWebsiteSource(
  sb: Awaited<ReturnType<typeof getSystemJobClient>>,
  orgId: string,
  rootUrl: string,
  name: string,
): Promise<string> {
  const host = normalizeHost(rootUrl);
  const now = new Date().toISOString();

  const findExisting = async () => {
    const { data } = await sb
      .from('knowledge_sources')
      .select('id')
      .eq('organization_id', orgId)
      .eq('type', 'website')
      .eq('normalized_host', host)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    return data?.id as string | undefined;
  };

  const existingId = host ? await findExisting() : undefined;
  if (existingId) {
    const { error } = await sb
      .from('knowledge_sources')
      .update({ root_url: rootUrl, name, status: 'crawling', updated_at: now })
      .eq('id', existingId)
      .eq('organization_id', orgId);
    if (error) throw new Error(`knowledge_sources update: ${error.message}`);
    return existingId;
  }

  const { data: created, error } = await sb
    .from('knowledge_sources')
    .insert({ organization_id: orgId, type: 'website', name, root_url: rootUrl, normalized_host: host, status: 'crawling' })
    .select('id')
    .single();
  if (error) {
    // 23505 = unique_violation: een parallelle crawl van hetzelfde domein won de race.
    if ((error as { code?: string }).code === '23505' && host) {
      const raced = await findExisting();
      if (raced) {
        await sb.from('knowledge_sources')
          .update({ root_url: rootUrl, name, status: 'crawling', updated_at: now })
          .eq('id', raced).eq('organization_id', orgId);
        return raced;
      }
    }
    throw new Error(`knowledge_sources insert: ${error.message}`);
  }
  return created.id as string;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/actions/crawl.ts
git commit -m "feat(crawler): upsertWebsiteSource matcht op domein i.p.v. meest-recente"
```

---

## Task 4: getWebsiteSources leeslaag

**Files:**
- Modify: `lib/v0/server/crawler.ts`

- [ ] **Step 1: Lees het huidige bestand**

Run: lees `lib/v0/server/crawler.ts`. Behoud `toUiPageStatus` en de `WebsitePage`-mapping. Je vervangt `getWebsiteState` door `getWebsiteSources`.

- [ ] **Step 2: Voeg het lijst-type toe en de nieuwe functie**

```typescript
export type WebsiteSource = {
  source: { id: string; rootUrl: string | null; host: string | null; status: SourceStatus };
  job: { status: CrawlJobStatus; error: string | null; completed: number; total: number } | null;
  pages: WebsitePage[];
};

/** Alle website-bronnen van een org met hun laatste job + pagina's. Bulk-queries, geen N+1. */
export async function getWebsiteSources(organizationId: string): Promise<WebsiteSource[]> {
  const sb = await getSystemJobClient({ reason: 'list_website_sources' });

  const { data: sources } = await sb
    .from('knowledge_sources')
    .select('id, root_url, normalized_host, status')
    .eq('organization_id', organizationId)
    .eq('type', 'website')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (!sources || sources.length === 0) return [];

  const sourceIds = sources.map((s) => s.id as string);

  const [{ data: jobRows }, { data: pageRows }] = await Promise.all([
    sb.from('processing_jobs')
      .select('target_id, status, error_message, created_at')
      .eq('organization_id', organizationId)
      .eq('job_type', 'crawl_website')
      .in('target_id', sourceIds)
      .order('created_at', { ascending: false }),
    sb.from('website_pages')
      .select('id, knowledge_source_id, url, title, status, last_crawled_at, included, error_message')
      .eq('organization_id', organizationId)
      .in('knowledge_source_id', sourceIds)
      .is('deleted_at', null)
      .order('url', { ascending: true }),
  ]);

  // Laatste job per source (rows zijn al desc op created_at).
  const latestJob = new Map<string, { status: string; error_message: string | null }>();
  for (const j of jobRows ?? []) {
    const tid = j.target_id as string;
    if (!latestJob.has(tid)) latestJob.set(tid, { status: j.status as string, error_message: (j.error_message as string | null) ?? null });
  }

  // Pagina's per source.
  const pagesBySource = new Map<string, WebsitePage[]>();
  for (const p of pageRows ?? []) {
    const sid = p.knowledge_source_id as string;
    const list = pagesBySource.get(sid) ?? [];
    list.push({
      id: p.id as string,
      title: (p.title as string | null) ?? (p.url as string),
      url: p.url as string,
      status: toUiPageStatus(p.status as string, (p.included as boolean) ?? true),
      lastProcessedAt: (p.last_crawled_at as string | null) ?? '',
      included: (p.included as boolean) ?? true,
      errorMessage: (p.error_message as string | null) ?? null,
    });
    pagesBySource.set(sid, list);
  }

  return sources.map((s) => {
    const j = latestJob.get(s.id as string);
    return {
      source: {
        id: s.id as string,
        rootUrl: (s.root_url as string | null) ?? null,
        host: (s.normalized_host as string | null) ?? null,
        status: s.status as SourceStatus,
      },
      job: j ? { status: j.status as CrawlJobStatus, error: j.error_message, completed: 0, total: 0 } : null,
      pages: pagesBySource.get(s.id as string) ?? [],
    };
  });
}
```

- [ ] **Step 3: Verwijder `getWebsiteState` + oude `WebsiteState`-type**

Verwijder de `getWebsiteState`-functie en het `WebsiteState`-type uit dit bestand (vervangen door `WebsiteSource`). De volgende tasks updaten alle callers.

- [ ] **Step 4: Typecheck (verwacht rode callers)**

Run: `npx tsc --noEmit`
Expected: fouten in `crawl.ts`, `website-tab.tsx`, `managed-pages.tsx`, `single-page-import.tsx`, `page.tsx` — die fixen Task 5-8.

- [ ] **Step 5: Commit (WIP, types nog rood)**

```bash
git add lib/v0/server/crawler.ts
git commit -m "feat(crawler): getWebsiteSources (lijst) vervangt single getWebsiteState"
```

---

## Task 5: Actions geven de lijst terug

**Files:**
- Modify: `app/actions/crawl.ts`

- [ ] **Step 1: Update imports + refresh-action**

Vervang `import { getWebsiteState, type WebsiteState } from '@/lib/v0/server/crawler';` door
`import { getWebsiteSources, type WebsiteSource } from '@/lib/v0/server/crawler';`

Vervang `refreshWebsiteState`:

```typescript
/** Leest alle website-bronnen — voor client-polling tijdens een lopende crawl. */
export async function refreshWebsiteSources(): Promise<WebsiteSource[]> {
  const activeOrg = await getActiveOrgFromCookies();
  return getWebsiteSources(activeOrg.id);
}
```

- [ ] **Step 2: tickCrawlIngestAction → lijst + per-site outcome-merge**

```typescript
export async function tickCrawlIngestAction(): Promise<WebsiteSource[]> {
  const activeOrg = await getActiveOrgFromCookies();
  const sb = await getSystemJobClient({ reason: 'process_crawls_tick' });
  const { data: jobs, error: jobsError } = await sb
    .from('processing_jobs')
    .select('id, organization_id, target_id, external_job_id, attempts')
    .eq('organization_id', activeOrg.id)
    .eq('job_type', 'crawl_website')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(JOBS_PER_TICK);
  if (jobsError) throw jobsError;

  const outcomes = jobs && jobs.length > 0 ? await processCrawlJobs(sb, jobs as OpenJob[]) : [];
  const sources = await getWebsiteSources(activeOrg.id);

  // Live counts uit de outcomes mergen op de juiste site (jobId → target_id).
  if (outcomes.length > 0 && jobs) {
    const targetByJob = new Map(jobs.map((j) => [j.id as string, j.target_id as string]));
    const bySource = new Map<string, { completed: number; total: number }>();
    for (const o of outcomes) {
      const tid = targetByJob.get(o.jobId);
      if (tid) bySource.set(tid, { completed: o.completed, total: o.total });
    }
    for (const ws of sources) {
      const live = bySource.get(ws.source.id);
      if (live && ws.job && (ws.job.status === 'pending' || ws.job.status === 'processing')) {
        ws.job.completed = live.completed;
        ws.job.total = live.total;
      }
    }
  }
  return sources;
}
```

- [ ] **Step 3: deleteWebsiteSourceAction faalt ook de open job**

In `deleteWebsiteSourceAction`, vóór de `knowledge_sources` delete, voeg toe:

```typescript
    const now = new Date().toISOString();
    await sb.from('processing_jobs')
      .update({ status: 'failed', error_message: 'Bron verwijderd tijdens crawl.', finished_at: now, updated_at: now })
      .eq('organization_id', activeOrg.id)
      .eq('job_type', 'crawl_website')
      .eq('target_id', sourceId)
      .in('status', ['pending', 'processing']);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: alleen nog UI-fouten (`website-tab.tsx`, `managed-pages.tsx`, `single-page-import.tsx`, `page.tsx`).

- [ ] **Step 5: Commit**

```bash
git add app/actions/crawl.ts
git commit -m "feat(crawler): tick/refresh geven website-lijst; delete faalt open job"
```

---

## Task 6: ManagedPages werkt op één bron

**Files:**
- Modify: `app/klantendashboard/kennisbank/components/managed-pages.tsx`

- [ ] **Step 1: Wijzig de props + verwijder header en SinglePageImport**

`ManagedPages` neemt voortaan één bron. Vervang de signatuur en de afhankelijkheid van `WebsiteState`:

```typescript
import type { WebsiteSource } from '@/lib/v0/server/crawler';
// verwijder de SinglePageImport-import; die verhuist naar de topbalk (Task 8).

export function ManagedPages({
  data, onChange, onDelete,
}: {
  data: WebsiteSource;
  onChange: (s: WebsiteSource[]) => void;   // verse lijst na een mutatie
  onDelete: (sourceId: string) => void;     // ouder verwijdert de site uit de lijst
}) {
  const source = data.source;
  const pages = data.pages;
  // ... rest van de bestaande grouping/filter-logica blijft identiek, met `pages` ...
```

- [ ] **Step 2: Refresh + delete via de nieuwe lijst-actions**

Vervang de `refresh`/`del`-helpers:

```typescript
  const refresh = async () => { try { onChange(await refreshWebsiteSources()); } catch {} };
  // import bovenaan: refreshWebsiteSources i.p.v. refreshWebsiteState
  const del = () => {
    if (!confirm('Website-bron verwijderen? Alle pagina’s gaan uit de kennisbank.')) return;
    start(async () => { await deleteWebsiteSourceAction(source.id); onDelete(source.id); });
  };
```

Verwijder de oude bron-header-card (`🌐 {source?.rootUrl}` blok, regels ~105-115) en de `<SinglePageImport .../>` regel — die wonen straks in de lijst-rij resp. de topbalk. De `section` begint nu direct met het zoekveld + de scroll-lijst.

- [ ] **Step 3: Typecheck dit bestand mentaal + geheel**

Run: `npx tsc --noEmit`
Expected: `managed-pages.tsx` is groen; resterende fouten in `website-tab.tsx`/`page.tsx`/`single-page-import.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/klantendashboard/kennisbank/components/managed-pages.tsx
git commit -m "refactor(crawler): ManagedPages werkt op één WebsiteSource"
```

---

## Task 7: website-list.tsx (inklapbare sites)

**Files:**
- Create: `app/klantendashboard/kennisbank/components/website-list.tsx`

- [ ] **Step 1: Schrijf de lijst-component**

```typescript
'use client';
import { useState } from 'react';
import { ChevronRight, Globe } from 'lucide-react';
import type { WebsiteSource } from '@/lib/v0/server/crawler';
import { ManagedPages } from './managed-pages';
import { CrawlProgress } from './crawl-progress';

export function WebsiteList({
  sources, onChange,
}: {
  sources: WebsiteSource[];
  onChange: (s: WebsiteSource[]) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const removeSource = (id: string) => onChange(sources.filter((w) => w.source.id !== id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sources.map((ws) => {
        const id = ws.source.id;
        const crawling = ws.job?.status === 'pending' || ws.job?.status === 'processing';
        const isOpen = open.has(id);
        const counts = {
          active: ws.pages.filter((p) => p.status === 'active').length,
          off: ws.pages.filter((p) => p.status === 'disabled').length,
          failed: ws.pages.filter((p) => p.status === 'error').length,
        };
        return (
          <div key={id} className="klant-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div role="button" onClick={() => !crawling && toggle(id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: crawling ? 'default' : 'pointer' }}>
              <ChevronRight size={16} style={{ color: 'var(--klant-fg-dim)', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', opacity: crawling ? 0.3 : 1 }} />
              <Globe size={15} style={{ color: 'var(--klant-accent)', flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ws.source.host ?? ws.source.rootUrl}
                </div>
                <div style={{ fontSize: 12, color: 'var(--klant-fg-dim)' }}>
                  {crawling ? 'Bezig met verwerken…' : `${ws.pages.length} pagina's · ${counts.active} actief · ${counts.off} uit · ${counts.failed} mislukt`}
                </div>
              </div>
            </div>
            {crawling && (
              <div style={{ padding: '0 14px 14px' }}>
                <CrawlProgress completed={ws.job?.completed ?? 0} total={ws.job?.total ?? 0} />
              </div>
            )}
            {isOpen && !crawling && (
              <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--klant-border)' }}>
                <ManagedPages data={ws} onChange={onChange} onDelete={removeSource} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `website-list.tsx` groen; alleen `website-tab.tsx`/`page.tsx`/`single-page-import.tsx` resteren.

- [ ] **Step 3: Commit**

```bash
git add app/klantendashboard/kennisbank/components/website-list.tsx
git commit -m "feat(crawler): WebsiteList — inklapbare lijst van sites"
```

---

## Task 8: website-tab.tsx — topbalk + flows + lijst

**Files:**
- Modify: `app/klantendashboard/kennisbank/components/website-tab.tsx`
- Modify: `app/klantendashboard/kennisbank/components/single-page-import.tsx`
- Modify: `app/klantendashboard/kennisbank/page.tsx`

- [ ] **Step 1: single-page-import → lijst-callback**

```typescript
// single-page-import.tsx: prop-type + import wijzigen
import { scrapeSinglePageAction, refreshWebsiteSources } from '@/app/actions/crawl';
import type { WebsiteSource } from '@/lib/v0/server/crawler';

export function SinglePageImport({ onAdded }: { onAdded: (s: WebsiteSource[]) => void }) {
  // ... body identiek, behalve:
  //   onAdded(await refreshWebsiteSources())
```

- [ ] **Step 2: Herschrijf website-tab.tsx**

```typescript
'use client';
import { useState, useEffect, useTransition } from 'react';
import {
  discoverPagesAction, startSelectedCrawlAction, tickCrawlIngestAction, refreshWebsiteSources,
} from '@/app/actions/crawl';
import type { WebsiteSource } from '@/lib/v0/server/crawler';
import { PageSelection } from './page-selection';
import { WebsiteList } from './website-list';
import { SinglePageImport } from './single-page-import';

export function WebsiteTab({ initialSources }: { initialSources: WebsiteSource[] }) {
  const [sources, setSources] = useState<WebsiteSource[]>(initialSources);
  const [mode, setMode] = useState<'list' | 'crawl' | 'single'>('list');
  const [url, setUrl] = useState('');
  const [discovered, setDiscovered] = useState<{ rootUrl: string; urls: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const anyCrawling = sources.some((w) => w.job?.status === 'pending' || w.job?.status === 'processing');

  // Poll terwijl er ergens een crawl loopt.
  useEffect(() => {
    if (!anyCrawling) return;
    const t = setInterval(async () => { try { setSources(await tickCrawlIngestAction()); } catch {} }, 4000);
    return () => clearInterval(t);
  }, [anyCrawling]);

  function onDiscover() {
    if (!url.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await discoverPagesAction(url);
      if (!res.ok) { setError(res.error); return; }
      setDiscovered({ rootUrl: res.rootUrl, urls: res.urls });
    });
  }

  function onStart(selected: string[], maxPages: number) {
    if (!discovered) return;
    setError(null);
    startTransition(async () => {
      const res = await startSelectedCrawlAction(discovered.rootUrl, selected, maxPages);
      if (!res.ok) { setError(res.error); return; }
      setDiscovered(null); setUrl(''); setMode('list');
      try { setSources(await refreshWebsiteSources()); } catch {}
    });
  }

  // Kies-scherm heeft voorrang.
  if (discovered) {
    return <PageSelection rootUrl={discovered.rootUrl} urls={discovered.urls} pending={pending}
      onStart={onStart} onCancel={() => { setDiscovered(null); setMode('list'); }} />;
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="klant-btn" data-variant={mode === 'crawl' ? 'primary' : 'ghost'}
          onClick={() => { setMode(mode === 'crawl' ? 'list' : 'crawl'); setError(null); }}>+ Website crawlen</button>
        <button type="button" className="klant-btn" data-variant={mode === 'single' ? 'primary' : 'ghost'}
          onClick={() => { setMode(mode === 'single' ? 'list' : 'single'); setError(null); }}>+ Losse pagina toevoegen</button>
      </div>

      {mode === 'crawl' && (
        <div className="klant-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="klant-section-help">Geef je website-URL op. We zoeken eerst de pagina’s, daarna kies je welke meegaan.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="url" placeholder="https://jouwwebsite.nl" value={url} disabled={pending}
              onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onDiscover()} className="klant-input" />
            <button type="button" onClick={onDiscover} className="klant-btn" data-variant="primary" disabled={pending || !url.trim()}>
              {pending ? 'Zoeken…' : "Pagina's zoeken"}
            </button>
          </div>
        </div>
      )}

      {mode === 'single' && (
        <SinglePageImport onAdded={(s) => { setSources(s); setMode('list'); }} />
      )}

      {error && <div className="klant-card" data-tone="danger" style={{ fontSize: 13 }}>{error}</div>}

      {sources.length === 0 && mode === 'list' && (
        <div className="klant-card" style={{ fontSize: 13, color: 'var(--klant-fg-dim)' }}>
          Nog geen websites. Klik “+ Website crawlen” om er een toe te voegen.
        </div>
      )}

      <WebsiteList sources={sources} onChange={setSources} />
    </section>
  );
}
```

- [ ] **Step 3: page.tsx passeert de lijst**

In `app/klantendashboard/kennisbank/page.tsx`: vervang de `getWebsiteState(...)`-aanroep door `getWebsiteSources(...)` en geef `initialSources={...}` aan `<WebsiteTab />` i.p.v. `initialState`. (Lees het bestand; pas de import + prop aan.)

- [ ] **Step 4: Typecheck volledig groen**

Run: `npx tsc --noEmit`
Expected: exit 0 (geen resterende fouten).

- [ ] **Step 5: Commit**

```bash
git add app/klantendashboard/kennisbank/components/website-tab.tsx app/klantendashboard/kennisbank/components/single-page-import.tsx app/klantendashboard/kennisbank/page.tsx
git commit -m "feat(crawler): Website-tab met topbalk + meerdere sites"
```

---

## Task 9: End-to-end verificatie

**Files:**
- Create (throwaway): `scripts/multi-website-diag.ts`

- [ ] **Step 1: Read-only diag van getWebsiteSources**

```typescript
// scripts/multi-website-diag.ts — read-only. NIET committen.
import { getWebsiteSources } from '../lib/v0/server/crawler';
const ORG = process.argv[2] ?? '00000000-0000-0000-0000-0000000000a4'; // demo-nieuw
async function main() {
  const list = await getWebsiteSources(ORG);
  console.log(`sites: ${list.length}`);
  for (const w of list) console.log(`- ${w.source.host} | ${w.source.status} | pages=${w.pages.length} | job=${w.job?.status ?? '-'}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `node --env-file=.env.local --conditions=react-server --import tsx scripts/multi-website-diag.ts`
Expected: lijst van bestaande website-bronnen met tellers, zonder errors.

- [ ] **Step 2: Verwijder het diag-script**

```bash
Remove-Item scripts/multi-website-diag.ts
```

- [ ] **Step 3: Dev-server rooktest (Playwright of handmatig)**

Start dev server (`npm run dev`, eigen poort in worktree → `next dev -p 3001`; vereist echte `npm ci` in de worktree i.p.v. de junction — zie memory worktree_node_modules_turbopack). Test in Kennisbank → Website:
- Twee verschillende domeinen crawlen → twee entries in de lijst.
- Losse pagina van een bestaand domein → landt in die entry (geen tweede entry).
- Klik een rij → paginalijst vouwt uit; klik nog eens → klapt in.
- Per-site verwijderen werkt; andere sites blijven staan.
- Her-crawl van bestaand domein → entry ververst, geen duplicaat.

Expected: alle punten kloppen.

- [ ] **Step 4: Finale typecheck + commit (indien nodig)**

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Self-Review (uitgevoerd door planschrijver)

**Spec-dekking:** migratie 0037 (§1) ✓ Task 1; normalizeHost (§2) ✓ Task 2; domein-upsert + 23505 (§2) ✓ Task 3; getWebsiteSources (§3) ✓ Task 4; tick/refresh-lijst + delete-faalt-job (§4) ✓ Task 5; UI topbalk + lijst + ManagedPages-refactor (§5) ✓ Task 6-8; edge cases (§6) ✓ verspreid (delete-job Task 5, verse-snapshot = bestaand ingest-gedrag, parallelle crawls = #115-retry al aanwezig). 
**Placeholders:** geen TBD/TODO; alle code-stappen bevatten echte code. 
**Type-consistentie:** `WebsiteSource` (source/job/pages) consistent in crawler.ts → actions → website-list → managed-pages → website-tab; `getWebsiteSources`/`refreshWebsiteSources` overal gelijk gespeld; `onChange(WebsiteSource[])` + `onDelete(string)` consistent tussen WebsiteList en ManagedPages.
**Bekende afhankelijkheid:** de dev-server-rooktest (Task 9 Step 3) vereist een echte `npm ci` in de worktree (junction faalt voor Turbopack-dev).
