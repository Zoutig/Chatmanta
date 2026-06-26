# V1 PR-1b — V1-RAG-pad achter auth (migratie 0002 + seed + /v1/app + e2e) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laat `/v1/app` voor het eerst écht een vraag beantwoorden met de gegradueerde `lib/rag/`-motor — onder echte auth (`requireOrgMember`), via de **session-client** (RLS afgedwongen door de DB) + de match-RPC met `p_organization_id`+`p_chatbot_id`-isolatie — gevoed door echte, geseede chunks in het V1-project.

**Architecture:** V1-migratie `0002_v1_rag_core.sql` zet de retrieval-tabellen (`chatbots`/`documents`/`parent_chunks`/`document_chunks`/`query_log`) + de document-only `match_chunks_with_parents`-RPC neer in het V1-project, allemaal met `organization_id`+`chatbot_id NOT NULL`, RLS aan, en SELECT-policies die het V1-`0001`-membership-patroon spiegelen. Een seed-script (V1-service-role) vult één chatbot + een handvol echte chunks per seed-org. `/v1/app` draait `runRagQuery(<session-client>, { organizationId, chatbotId, config:{...,chatbotScoped:true,cacheEnabled:false}, persona, disableCache:true })` via een server action en toont een gegrond antwoord. Een Playwright-e2e bewijst het lid-pad; een deterministisch isolatie-script bewijst dat org A org B's chunks niet kan lezen (RPC-predicaat + RLS-backstop).

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), TypeScript, `@supabase/supabase-js` (V1 session-client `lib/supabase/v1/server.ts` + service-role `lib/supabase/v1/service-role.ts`), pgvector/HNSW, OpenAI `text-embedding-3-small` (via `lib/rag/embeddings.ts`), `node:test`+tsx, Playwright (`v1`-project). Migratie toegepast via **Supabase MCP `apply_migration`** op het V1-project (ref `tfijdnxqdvwzwgxdioqo`), niet via de pooler ([[migrate_network_block_prod]]).

**Spec:** `docs/superpowers/specs/2026-06-25-v1-kernel-graduatie-rag-design.md` — §4 PR-1 + §5 (beveiliging) + §6 (org/chatbot-resolutie) + §7 PR-1b.

**Scope note:** Dit is **PR-1b** van de big-ship-mijlpaal; PR-1a (kernel-graduatie) is gemerged (`54a99b6`). Bewust **buiten PR-1b** (= PR-2/PR-3): ingest-pad (`ingestText`-graduatie), `answer_cache`/`lookup_cached_answer`, `website_pages`/crawler + de website-tak in de RPC, `match_chunks_hybrid`, echte per-user org-resolutie (PR-1b blijft `V1_SEED_ORG_ID` provisioneel gebruiken — spec §6). `query_log` wordt wél aangemaakt (spec §4 PR-1 item 5, complete schema-fold) maar in PR-1b nog **niet geschreven** (geen `logQuery`-port deze ronde).

---

## Deviations from the spec (deliberate, with reason)

1. **`document_chunks.website_page_id` weggelaten + `document_id` NOT NULL.** De V0-tabel heeft een nullable `document_id` + `website_page_id` + XOR-CHECK omwille van de website-tak. PR-1 is document-only; `website_pages` bestaat pas in PR-3. → drop `website_page_id`, drop de XOR-CHECK, maak `document_id NOT NULL`. PR-3 voegt de website-tak terug (spec §4 PR-3 + de RPC-drop+recreate die de spec al voorziet).
2. **`match_chunks` (non-parents) + `match_chunks_hybrid` niet geport.** V1-config pint `parentDocumentRetrieval:true` en `hybridSearch:false` (spec §3.2) → de motor roept alléén `match_chunks_with_parents` aan. De andere twee zijn dode RPC's in PR-1. `match_chunks_hybrid` komt in PR-3 (met `content_tsv`-gebruik). *(`ponytail`: skip ongebruikte RPC's; ceiling = config-vlaggen, opwaardeerpad = PR-3.)*
3. **`content_tsv` (generated stored, `'dutch'`) + GIN-index wél meegenomen** ook al gebruikt PR-1's RPC ze niet. Reden: het is een generated kolom (geen seed-last, geen runtime-kost), een *bekende* PR-3-behoefte (geen speculatie), en nu meenemen voorkomt een latere table-rewrite-ALTER op een gevulde tabel. Spec §4 PR-1 item 3 noemt `content_tsv` expliciet.
4. **Cross-org-isolatie bewezen via een deterministisch script** (`scripts/v1-test-org-isolation.ts`, V0-precedent `v0:test-org-isolation`) i.p.v. een browser-e2e. Reden: de provisionele `/v1/app` is org-A-vastgepind (`V1_SEED_ORG_ID`), dus een tweede org is niet via de pagina te bereiken in PR-1. Het script bewijst sterker én deterministisch: (a) RPC-predicaat isoleert, (b) RLS blokkeert een cross-org read. De browser-e2e bewijst het lid→gegrond-antwoord-pad; `tests/v1/auth.spec.ts` dekt al redirect + niet-lid-geweigerd.

---

## File Structure

**New:**
- `supabase/migrations-v1/0002_v1_rag_core.sql` — de hele V1-retrieval-core (tabellen + RPC + RLS). Toegepast via MCP.
- `app/v1/app/rag-config.ts` — V1-glue: `V1_RAG_DEFAULTS` (= `{ ...LATEST-bot, ...V1-overrides }` — bewezen config + V1-vlaggen), `buildV1Persona(company): RagPersona` (volledige 10-velden-persona), `getOrgChatbot(client, orgId)` (resolveert de enige actieve chatbot van de org).
- `app/v1/app/actions.ts` — `'use server'`; `askV1(question)`: re-resolveert org+chatbot uit de sessie (SA-1), draait `runRagQuery` via de session-client, geeft het gegronde antwoord terug.
- `app/v1/app/v1-chat.tsx` — `'use client'`; vraag-formulier dat `askV1` aanroept en het antwoord toont.
- `app/v1/app/__tests__/rag-config.test.ts` — shape-test: `V1_RAG_DEFAULTS` heeft de PR-1-vlaggen goed (`chatbotScoped:true`, `hybridSearch:false`, `parentDocumentRetrieval:true`, `cacheEnabled:false`).
- `scripts/v1-seed-chunks.ts` — service-role-seed: 1 chatbot + docs/parents/chunks per seed-org (A = Manta-demo, B = isolatie-token). tsx + `--conditions=react-server` (voor `embedTexts`).
- `scripts/v1-test-org-isolation.ts` — deterministisch isolatie-bewijs (RPC-predicaat + RLS-backstop).
- `tests/v1/rag.spec.ts` — Playwright: lid logt in → stelt vraag → krijgt gegrond antwoord.

**Modified:**
- `app/v1/app/page.tsx` — vervang de placeholder-success-tak door: resolveer chatbot → render `<V1Chat>`; nette "geen chatbot geconfigureerd"-tak. Auth-gating (`requireOrgMember` + `AUTH_FORBIDDEN`-tak) blijft.
- `scripts/v1-seed.mjs` — voeg org B (`seed-org-b`) toe + maak `outsider@example.com` lid van B (blijft niet-lid van A → `auth.spec.ts` ongewijzigd geldig).
- `package.json` — scripts `v1:seed:chunks` + `v1:test-org-isolation` (tsx + react-server-pattern, zie `v0:seed-orgs`).

**Unchanged (bewust):** `lib/rag/**` (de motor is in PR-1a af; PR-1b raakt 'm niet), alle V0-paden, `tests/v1/auth.spec.ts`, de V0-DB.

---

## Task 0: Worktree baseline groen

**Files:** none (de worktree is al geprept: `npm ci` gedraaid, `.env.local` gekopieerd).

- [ ] **Step 1: Bevestig branch + groene start**

Run: `git rev-parse --abbrev-ref HEAD` → verwacht `feat/seb/v1-pr1b`.
Run: `npm run typecheck && npm run test:unit`
Expected: beide groen (geërfde `main`-staat). Zo niet → STOP en rapporteer vóór je iets bouwt.

- [ ] **Step 2: Bevestig V1-env aanwezig**

Run (PowerShell): `Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_V1_SUPABASE_URL=|^NEXT_PUBLIC_V1_SUPABASE_ANON_KEY=|^V1_SUPABASE_SERVICE_ROLE_KEY=|^V1_SEED_ORG_ID=|^V1_SEED_MEMBER_PW=|^V1_SEED_OUTSIDER_PW=|^OPENAI_API_KEY=' | Select-Object Line`
Expected: alle zes V1-vars + `OPENAI_API_KEY` aanwezig en ongecommentarieerd (`NEXT_PUBLIC_V1_SUPABASE_ANON_KEY` is nodig voor het isolatie-script in Task 5) ([[feedback_worktree_env_keys]]). `V1_SEED_ORG_ID` = `08ed675f-1870-4352-94e0-768e69f6f127`.

---

## Task 1: V1-migratie `0002_v1_rag_core.sql` schrijven + via MCP toepassen

**Files:**
- Create: `supabase/migrations-v1/0002_v1_rag_core.sql`

> ⚠️ **Real-resource write.** Vóór `apply_migration` draait, MELD het aan Sebastiaan (afspraak deze sessie: "ga je gang, meld het vlak ervoor"). Toepassing gaat naar het BESTAANDE V1-project (ref `tfijdnxqdvwzwgxdioqo`, leeg, gratis tier, geen klantdata).

- [ ] **Step 1: Bevestig het volgende V1-migratienummer + de baseline-staat (read-only MCP)**

Via Supabase MCP op project `tfijdnxqdvwzwgxdioqo`:
- `list_migrations` → verwacht alleen `0001_core_tenancy` (of de runner-equivalent). Bevestigt next = `0002`.
- `list_tables` (schema `public`) → verwacht alleen `organizations`, `users`, `organization_members`, `_migrations`. Géén `documents`/`document_chunks`/etc.
- `list_extensions` → check of `vector` (pgvector) installeerbaar/geïnstalleerd is. Zo niet geïnstalleerd: `create extension if not exists vector;` in de migratie regelt het (pgvector is op alle Supabase-tiers beschikbaar).

Ook lokaal ([[check-migration]]): `ls supabase/migrations-v1` → alleen `0001_core_tenancy.sql`. `gh pr list --state open --search "migrations-v1"` → geen concurrent `0002`.

- [ ] **Step 2: Schrijf `supabase/migrations-v1/0002_v1_rag_core.sql`**

Exacte inhoud (geverifieerd tegen V0 `0002/0003/0004/0008/0042` + V1-`0001`-policy-patroon):

```sql
-- 0002_v1_rag_core.sql
-- V1 RAG retrieval-core: chatbots + documents + parent_chunks + document_chunks + query_log
-- + document-only match_chunks_with_parents-RPC. Alles org+chatbot-geïsoleerd, RLS aan,
-- SELECT-policies spiegelen het 0001_core_tenancy-membership-patroon (service-role schrijft).
-- Geport uit V0 0002/0003/0004/0008/0042, gevouwen tot één migratie + chatbot_id/p_chatbot_id.
-- Document-only (PR-1): geen website_page_id, geen answer_cache, geen hybrid-RPC (zie plan-deviations).

-- Supabase: vector in de `extensions`-schema (geverifieerd: pgcrypto staat daar
-- ook, en het V1-project heeft vector 0.8.0 beschikbaar maar nog niet geïnstalleerd).
-- Expliciete search_path zodat de DDL (vector(1536), vector_cosine_ops) én de RPC
-- (<=> operator) deterministisch resolven — vermijdt de extension_in_public-advisor.
set search_path = public, extensions, pg_temp;
create extension if not exists vector with schema extensions;

-- 1. chatbots (net-new in V1; één actieve per org) --------------------------
create table public.chatbots (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  name            text        not null,
  bot_version     text        not null default 'v1.0',
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create unique index chatbots_one_active_per_org
  on public.chatbots (organization_id) where deleted_at is null;

alter table public.chatbots enable row level security;
create policy "chatbots_select_org_members"
  on public.chatbots for select to authenticated
  using (
    deleted_at is null
    and organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- 2. documents --------------------------------------------------------------
create table public.documents (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  filename        text        not null,
  source          text        not null,
  status          text        not null default 'ready',
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint documents_status_chk check (status in ('pending','processing','ready','failed')),
  constraint documents_source_chk check (source in ('upload','v0_local'))
);
create index documents_org_idx     on public.documents (organization_id) where deleted_at is null;
create index documents_chatbot_idx on public.documents (chatbot_id)      where deleted_at is null;

alter table public.documents enable row level security;
create policy "documents_select_org_members"
  on public.documents for select to authenticated
  using (
    deleted_at is null
    and organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- 3. parent_chunks ----------------------------------------------------------
create table public.parent_chunks (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid        not null references public.chatbots(id) on delete cascade,
  document_id     uuid        not null references public.documents(id) on delete cascade,
  parent_index    int         not null,
  content         text        not null,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint parent_chunks_index_chk check (parent_index >= 0),
  constraint parent_chunks_doc_idx_unique unique (document_id, parent_index)
);
create index parent_chunks_org_doc_idx on public.parent_chunks (organization_id, document_id);

alter table public.parent_chunks enable row level security;
create policy "parent_chunks_select_org_members"
  on public.parent_chunks for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- 4. document_chunks (document-only: geen website_page_id) -------------------
create table public.document_chunks (
  id              uuid         primary key default gen_random_uuid(),
  organization_id uuid         not null references public.organizations(id) on delete cascade,
  chatbot_id      uuid         not null references public.chatbots(id) on delete cascade,
  document_id     uuid         not null references public.documents(id) on delete cascade,
  content         text         not null,
  embedding       vector(1536) not null,
  content_tsv     tsvector     generated always as (to_tsvector('dutch', content)) stored,
  parent_chunk_id uuid         references public.parent_chunks(id) on delete set null,
  metadata        jsonb        not null default '{}'::jsonb,
  created_at      timestamptz  not null default now()
);
create index document_chunks_org_doc_idx     on public.document_chunks (organization_id, document_id);
create index document_chunks_chatbot_idx      on public.document_chunks (chatbot_id);
create index document_chunks_embedding_idx    on public.document_chunks using hnsw (embedding vector_cosine_ops);
create index document_chunks_content_tsv_idx  on public.document_chunks using gin (content_tsv);
create index document_chunks_parent_chunk_idx on public.document_chunks (parent_chunk_id) where parent_chunk_id is not null;

alter table public.document_chunks enable row level security;
create policy "document_chunks_select_org_members"
  on public.document_chunks for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- 5. query_log (44 V0-kolommen gevouwen + chatbot_id; append-only via service-role) --
create table public.query_log (
  id                       uuid          primary key default gen_random_uuid(),
  organization_id          uuid          not null references public.organizations(id) on delete cascade,
  chatbot_id               uuid          not null references public.chatbots(id) on delete cascade,
  bot_version              text          not null,
  kind                     text          not null,
  question                 text          not null,
  rewritten                text,
  threshold                numeric(4,2),
  top_similarity           numeric(6,4),
  source_count             int           not null default 0,
  answer                   text          not null,
  embed_tokens             int           not null default 0,
  chat_in_tokens           int           not null default 0,
  chat_out_tokens          int           not null default 0,
  pre_in_tokens            int           not null default 0,
  pre_out_tokens           int           not null default 0,
  cost_usd                 numeric(10,6) not null default 0,
  created_at               timestamptz   not null default now(),
  tone                     text,
  length                   text,
  top1_sim                 numeric(6,4),
  hyde_triggered           boolean       not null default false,
  rerank_scores            jsonb,
  claim_confidence         numeric(4,2),
  embedding_ms             int,
  retrieval_ms             int,
  rerank_ms                int,
  generation_ms            int,
  total_ms                 int,
  phase_timings_ms         jsonb,
  injection_detected       boolean       not null default false,
  injection_pattern        text,
  from_cache               boolean       not null default false,
  hyde_mode_requested      text,
  hyde_mode_actual         text,
  hyde_ms                  int,
  hyde_document            text,
  category                 text,
  request_id               text,
  general_knowledge_actual boolean,
  hard_fact_supported      boolean,
  missing_hard_facts       jsonb,
  gap_kind                 text,
  adaptive_decision        jsonb,
  first_token_ms           int,
  constraint query_log_kind_chk   check (kind in ('smalltalk','answer','fallback','blocked')),
  constraint query_log_tone_chk   check (tone is null or tone in ('formal','neutral','casual','persoonlijk')),
  constraint query_log_length_chk check (length is null or length in ('short','medium','detailed')),
  constraint query_log_hyde_mode_requested_chk check (hyde_mode_requested is null or hyde_mode_requested in ('auto','off','upfront','selective')),
  constraint query_log_hyde_mode_actual_chk    check (hyde_mode_actual    is null or hyde_mode_actual    in ('off','upfront','selective'))
);
create index query_log_org_created_idx  on public.query_log (organization_id, created_at desc);
create index query_log_org_version_idx  on public.query_log (organization_id, bot_version);
create index query_log_org_chatbot_idx  on public.query_log (organization_id, chatbot_id, created_at desc);
create index query_log_org_style_idx    on public.query_log (organization_id, tone, length);
create index query_log_injection_idx    on public.query_log (organization_id, created_at desc) where injection_detected = true;
create index query_log_from_cache_idx   on public.query_log (organization_id, from_cache, created_at desc);
create index query_log_org_hyde_idx     on public.query_log (organization_id, bot_version, hyde_mode_actual);
create index query_log_request_id_idx   on public.query_log (request_id) where request_id is not null;
create index query_log_hard_fact_unsupported_idx
  on public.query_log (organization_id, bot_version, created_at desc) where hard_fact_supported = false;
create index query_log_gap_kind_idx
  on public.query_log (organization_id, bot_version, gap_kind, created_at desc) where gap_kind is not null;

alter table public.query_log enable row level security;
create policy "query_log_select_org_members"
  on public.query_log for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );
-- Geen INSERT/UPDATE/DELETE-policy → append-only via service-role (parity V0). query_log
-- wordt in PR-1b nog NIET geschreven (geen logQuery-port deze ronde) — tabel staat klaar.

-- 6. match_chunks_with_parents (document-only + p_chatbot_id; security invoker) ----
create function public.match_chunks_with_parents(
  p_organization_id uuid,
  p_chatbot_id      uuid,
  query_embedding   vector(1536),
  match_count       int default 5
)
returns table (
  id              uuid,
  document_id     uuid,
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
set search_path = public, extensions, pg_temp
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::float as similarity,
    c.parent_chunk_id,
    p.content      as parent_content,
    p.parent_index as parent_index
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  left join public.parent_chunks p on p.id = c.parent_chunk_id
  where c.organization_id = p_organization_id
    and c.chatbot_id = p_chatbot_id
    and d.deleted_at is null
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- ponytail: match_chunks (non-parents) + match_chunks_hybrid NIET geport — V1-config pint
-- parentDocumentRetrieval:true + hybridSearch:false. Ceiling: een config-flip naar false
-- zou een ontbrekende-functie-fout geven. Opwaardeerpad: PR-3 (hybrid) / on-demand.
```

> **Named-arg-check:** de motor roept aan met named params `{ p_organization_id, query_embedding, match_count, p_chatbot_id }` (`lib/rag/run-rag-query.ts:719-724`, `p_chatbot_id` spread alléén bij `chatbotScoped`). De V1-config zet `chatbotScoped:true`, dus `p_chatbot_id` wordt altijd meegestuurd — geen default nodig op die param.

- [ ] **Step 3: MELD het aan Sebastiaan, dan `apply_migration` via MCP**

Korte heads-up ("Ik pas migratie 0002 nu toe op het V1-project `tfijdnxqdvwzwgxdioqo`"). Dan Supabase MCP `apply_migration` op `tfijdnxqdvwzwgxdioqo`, `name: "0002_v1_rag_core"`, `query`: de volledige inhoud uit Step 2.
Expected: success. Bij een DDL-fout → fix de SQL en herhaal (de migratie is idempotent op tabelnamen alleen via `create extension if not exists`; tabellen niet — bij een halve toepassing eerst handmatig `drop table ... cascade` de aangemaakte tabellen vóór re-apply).

- [ ] **Step 4: Ledger-rij + verificatie (MCP `execute_sql`)**

Lees eerst `scripts/migrate.mjs` om het `public._migrations.id`-formaat te bevestigen (filename-stem, waarschijnlijk `0002_v1_rag_core`). Dan via `execute_sql` op `tfijdnxqdvwzwgxdioqo`:
```sql
insert into public._migrations (id) values ('0002_v1_rag_core')
on conflict (id) do nothing;
```
Verifieer:
- `list_tables` → de 5 nieuwe tabellen aanwezig, RLS aan op elk.
- `get_advisors` (type `security`) → geen "RLS disabled"-warnings op de nieuwe tabellen; geen `security definer`-warning (de RPC is `security invoker`); geen `function_search_path_mutable` (we zetten `set search_path`); geen `extension_in_public` (vector staat in `extensions`). Een bestaande baseline-warning die er al stond vóór 0002 telt niet mee — vergelijk met de pre-apply advisor-staat.
- `execute_sql`: `select proname, prosecdef from pg_proc where proname = 'match_chunks_with_parents';` → `prosecdef = false` (invoker).
Expected: schoon. Noteer eventuele advisor-output voor de PR.

---

## Task 2: V1-RAG-glue — config, persona, chatbot-resolutie

**Files:**
- Create: `app/v1/app/rag-config.ts`
- Create: `app/v1/app/__tests__/rag-config.test.ts`

- [ ] **Step 1: Schrijf de falende shape-test** `app/v1/app/__tests__/rag-config.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { V1_RAG_DEFAULTS, buildV1Persona } from '../rag-config';

test('V1_RAG_DEFAULTS heeft de PR-1-vlaggen goed', () => {
  assert.equal(V1_RAG_DEFAULTS.chatbotScoped, true, 'chatbotScoped moet true (V1)');
  assert.equal(V1_RAG_DEFAULTS.hybridSearch, false, 'hybridSearch uit (geen content_tsv-gebruik in PR-1)');
  assert.equal(V1_RAG_DEFAULTS.parentDocumentRetrieval, true, 'parent-retrieval aan (RPC = with_parents)');
  assert.equal(V1_RAG_DEFAULTS.cacheEnabled, false, 'cache uit (geen answer_cache in V1 PR-1)');
  assert.equal(V1_RAG_DEFAULTS.similarityThreshold, 0.4, 'V0-empirie-drempel');
});

test('buildV1Persona vult alle 10 RagPersona-velden', () => {
  const p = buildV1Persona('Manta Bakkerij');
  for (const k of ['company','companySuffix','audience','citationExample1','citationExample2',
    'smalltalkGreeting','smalltalkHelpScope','domainKeywords','generalKnowledgeClosing','offTopicScope'] as const) {
    assert.ok(p[k] !== undefined && p[k] !== '', `persona.${k} ontbreekt`);
  }
  assert.equal(p.company, 'Manta Bakkerij');
  assert.ok(Array.isArray(p.domainKeywords));
});
```

- [ ] **Step 2: Run → verwacht FAIL** (module bestaat nog niet)

Run: `node --import tsx --test app/v1/app/__tests__/rag-config.test.ts`
Expected: FAIL — cannot find `../rag-config`.

- [ ] **Step 3: Schrijf `app/v1/app/rag-config.ts`**

Implementatie-instructie:
1. `import type { RagConfig, RagPersona } from '@/lib/rag/types';`, `import type { SupabaseClient } from '@supabase/supabase-js';`, en `import { BOTS, LATEST_BOT_VERSION } from '@/lib/v0/server/bots';` (geverifieerd **build-safe**: `bots.ts` is pure config-data met alléén een `import type { RagConfig }` — geen `server-only`/`next/*`-keten die de V1-bundle breekt; `app/v1` valt buiten de grep-gate, die alleen `lib/rag ⊄ lib/v0` afdwingt; `rag-config` wordt alleen door server-code (page + `'use server'` action) geïmporteerd → `BOTS` belandt niet in de client-bundle).
2. **`export const V1_RAG_DEFAULTS: RagConfig = { ...BOTS[LATEST_BOT_VERSION], ...V1_OVERRIDES };`** — hergebruik de bewezen LATEST-bot-config (38 verplichte velden + getunede, anti-hallucinatie-prompts) en override **alléén** de V1-specifieke vlaggen (`V1_OVERRIDES satisfies Partial<RagConfig>`):
   - `chatbotScoped: true` (V1 stuurt `p_chatbot_id`)
   - `hybridSearch: false` (geen `match_chunks_hybrid` in 0002 — niet leunen op silent-fallback)
   - `parentDocumentRetrieval: true` (de enige geporteerde RPC = `_with_parents`)
   - `cacheEnabled: false` (geen `answer_cache`/`lookup_cached_answer` in V1 PR-1)
   - `sourceLinksEnabled: false` — ⚠️ **KRITISCH**: de LATEST-bot heeft dit op **TRUE** (standaard sinds v0.9.1); de document-only RPC levert géén `source_url` → uit zetten anders verwacht de bronlink-logica een ontbrekend veld
   - `generalKnowledgeEnabled: false` (anti-hallucinatie: alleen-gegrond)
   - `similarityThreshold: 0.4` (V0-empirie)
   - `version: 'v1.0'`, `label: 'V1'`, `description: 'V1 RAG document-only chatbot-scoped (PR-1b)'`
   > `ponytail`: hergebruik de bewezen config i.p.v. 38 velden + getunede prompts opnieuw te schrijven. Ceiling: V1's default = snapshot van V0's LATEST (gekoppeld aan de V0-registry, maar build-safe data). Opwaardeerpad: V1-config-per-chatbot uit de `chatbots`-rij in een latere PR → dan vervalt de `lib/v0/server/bots`-import. Zet dit met een `// ponytail:`-comment in de code.
3. **`export function buildV1Persona(company: string): RagPersona`** — een volledige `RagPersona` (alle 10 velden, NL, generiek-professioneel) met `company` ingevuld; geen `{{TOKEN}}` mag leeg blijven. Voorbeeld-waarden: `companySuffix: ''`, `audience: 'bezoekers van de website'`, `citationExample1`/`citationExample2`: korte NL-bronverwijzingen, `smalltalkGreeting`: een warme NL-begroeting, `smalltalkHelpScope`: 'vragen over onze diensten en informatie', `domainKeywords: ['openingstijden','diensten','contact','producten']`, `generalKnowledgeClosing`: een nette afsluit-zin, `offTopicScope`: 'onderwerpen buiten de informatie van ' + company.
4. **`export async function getOrgChatbot(client: SupabaseClient, orgId: string): Promise<{ id: string; name: string; bot_version: string } | null>`**:
   ```ts
   const { data, error } = await client
     .from('chatbots')
     .select('id, name, bot_version')
     .eq('organization_id', orgId)
     .is('deleted_at', null)
     .order('created_at', { ascending: true })
     .limit(1)
     .maybeSingle();
   if (error) throw error;
   return data ?? null;
   ```
   (Onder de session-client gelden RLS + de `chatbots_select_org_members`-policy; onder service-role ziet hij alles van die org — beide paden geven de enige actieve chatbot.)

- [ ] **Step 4: Run de test → verwacht PASS**

Run: `node --import tsx --test app/v1/app/__tests__/rag-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: groen (ontbrekend verplicht `RagConfig`-veld zou hier opduiken).
```bash
git add supabase/migrations-v1/0002_v1_rag_core.sql app/v1/app/rag-config.ts app/v1/app/__tests__/rag-config.test.ts
git commit -m "feat(v1): migratie 0002 rag-core + V1 rag-config/persona/chatbot-resolutie"
```

---

## Task 3: Seed — org B + chatbots + chunks

**Files:**
- Modify: `scripts/v1-seed.mjs`
- Create: `scripts/v1-seed-chunks.ts`
- Modify: `package.json`

- [ ] **Step 1: Lees de huidige seed + voeg org B toe**

Lees `scripts/v1-seed.mjs` (creëert org A `seed-org` = `V1_SEED_ORG_ID`, member `member@example.com` [owner van A], outsider `outsider@example.com` [geen membership]).
Voeg toe, met hetzelfde service-role-patroon dat al in het bestand staat:
- Een tweede org `seed-org-b` (idempotent: upsert op slug; bewaar de id in een lokale var).
- Maak `outsider@example.com` lid van `seed-org-b` (role `member`). `outsider` blijft géén lid van A → `tests/v1/auth.spec.ts` (outsider → "geen toegang" op `/v1/app`, dat A gebruikt) blijft kloppen.
Log beide org-id's aan het eind.

- [ ] **Step 2: Schrijf `scripts/v1-seed-chunks.ts`**

Service-role-seed (bypasst RLS — systeem-write, spec §5). Run-pattern = `v0:seed-orgs` (tsx + `--conditions=react-server` zodat `embedTexts` `server-only` laadt). Structuur:

```ts
// run: node --env-file=.env.local --conditions=react-server --import tsx scripts/v1-seed-chunks.ts
import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { embedTexts } from '../lib/rag/embeddings';

const ISO_TOKEN = 'ZQXGEHEIM-ORG-B-VERTROUWELIJK'; // uniek; gebruikt door v1-test-org-isolation

const ORG_A = process.env.V1_SEED_ORG_ID!;
const MANTA_TEXT = `Manta Bakkerij is een ambachtelijke bakkerij in Amsterdam.
Onze openingstijden: maandag tot en met vrijdag van 08:00 tot 18:00 uur,
zaterdag van 08:00 tot 16:00 uur. Op zondag zijn wij gesloten.
Wij bakken dagelijks vers brood, taarten en koekjes. Bestellingen voor
taarten kunnen telefonisch via 020-1234567 of per e-mail naar info@manta-bakkerij.nl.
Ons adres is Mantastraat 12, 1011 AB Amsterdam.`;
const ORG_B_TEXT = `Interne notitie. Het geheime projectcodewoord is ${ISO_TOKEN}.
Dit document hoort uitsluitend bij organisatie B en mag niet zichtbaar zijn voor andere organisaties.`;

async function seedOrg(client, orgId, name, text) {
  // 1) wipe bestaande RAG-data van deze org (FK-cascade vanaf chatbots) — idempotent
  await client.from('chatbots').delete().eq('organization_id', orgId);
  // 2) chatbot (één actieve per org)
  const { data: bot, error: be } = await client.from('chatbots')
    .insert({ organization_id: orgId, name, bot_version: 'v1.0' }).select('id').single();
  if (be) throw be;
  const chatbotId = bot.id;
  // 3) document
  const { data: doc, error: de } = await client.from('documents')
    .insert({ organization_id: orgId, chatbot_id: chatbotId, filename: `${name}.txt`, source: 'v0_local', status: 'ready' })
    .select('id').single();
  if (de) throw de;
  // 4) parent + child chunks (mirror v0-seed-orgs: parent 3200/400, child 800/100;
  //    voor de seed volstaat 1 parent + de child-chunks daarvan)
  const parents = chunk(text, 3200, 400);
  for (let pi = 0; pi < parents.length; pi++) {
    const { data: parent, error: pe } = await client.from('parent_chunks')
      .insert({ organization_id: orgId, chatbot_id: chatbotId, document_id: doc.id, parent_index: pi, content: parents[pi] })
      .select('id').single();
    if (pe) throw pe;
    const children = chunk(parents[pi], 800, 100);
    const { vectors } = await embedTexts(children);
    const rows = children.map((content, ci) => ({
      organization_id: orgId, chatbot_id: chatbotId, document_id: doc.id,
      content, embedding: vectors[ci], parent_chunk_id: parent.id,
      metadata: { chunk_index: ci, parent_index: pi },
    }));
    const { error: ce } = await client.from('document_chunks').insert(rows);
    if (ce) throw ce;
  }
  console.log(`seeded ${name}: chatbot ${chatbotId}, ${parents.length} parent(s)`);
}

// kleine sliding-window chunker (mirror van de seed-helper; geen import nodig)
function chunk(text, size, overlap) {
  const t = text.trim();
  if (t.length <= size) return [t];
  const out = []; let i = 0;
  while (i < t.length) { out.push(t.slice(i, i + size)); i += size - overlap; }
  return out;
}

async function main() {
  const client = getV1ServiceRoleClient();
  await seedOrg(client, ORG_A, 'Manta Demo', MANTA_TEXT);
  const { data: orgB } = await client.from('organizations').select('id').eq('slug', 'seed-org-b').single();
  await seedOrg(client, orgB.id, 'Org B Demo', ORG_B_TEXT);
  console.log('v1 chunk-seed klaar.');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

> Verifieer bij het schrijven dat `getV1ServiceRoleClient` zonder `server-only`-conflict laadt onder `--conditions=react-server` (het V0-equivalent doet dat in `v0-seed-orgs.ts`). `embedTexts` retourneert `{ vectors, tokens, costUsd }` (`lib/rag/embeddings.ts`).

- [ ] **Step 3: Voeg de npm-scripts toe** in `package.json` (naast `v0:seed-orgs`):

```json
"v1:seed:chunks": "node --env-file=.env.local --conditions=react-server --import tsx scripts/v1-seed-chunks.ts",
"v1:test-org-isolation": "node --env-file=.env.local --conditions=react-server --import tsx scripts/v1-test-org-isolation.ts"
```

- [ ] **Step 4: Draai de seed (na Task 1's migratie is toegepast)**

Run: `npm run v1:seed` (org B + outsider-membership) → dan `npm run v1:seed:chunks`
Expected: beide exit 0; de chunks-seed logt "Manta Demo" + "Org B Demo". Dit doet echte OpenAI-embed-calls (~enkele centen). Verifieer via MCP `execute_sql`: `select organization_id, count(*) from public.document_chunks group by 1;` → rijen voor org A en org B.

- [ ] **Step 5: Commit**

```bash
git add scripts/v1-seed.mjs scripts/v1-seed-chunks.ts package.json
git commit -m "feat(v1): seed org B + chatbots + echte chunks (Manta-demo + isolatie-token)"
```

---

## Task 4: `/v1/app` echte RAG via session-client

**Files:**
- Create: `app/v1/app/actions.ts`
- Create: `app/v1/app/v1-chat.tsx`
- Modify: `app/v1/app/page.tsx`

- [ ] **Step 1: Schrijf de server action** `app/v1/app/actions.ts`

```ts
'use server';

import { requireOrgMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/v1/server';
import { runRagQuery } from '@/lib/rag/run-rag-query';
import { V1_RAG_DEFAULTS, buildV1Persona, getOrgChatbot } from './rag-config';

export type AskV1Result =
  | { ok: true; answer: string; sources: { title: string }[]; kind: string }
  | { ok: false; error: 'CONFIG' | 'NO_CHATBOT' | 'FORBIDDEN' | 'FAILED' };

export async function askV1(question: string): Promise<AskV1Result> {
  const orgId = process.env.V1_SEED_ORG_ID;
  if (!orgId) return { ok: false, error: 'CONFIG' };
  if (!question || question.trim().length === 0) return { ok: false, error: 'FAILED' };

  // SA-1: org NIET uit client-input — uit de getrouwde sessie. Gooit AUTH_FORBIDDEN bij niet-lid.
  try {
    await requireOrgMember(orgId);
  } catch {
    return { ok: false, error: 'FORBIDDEN' };
  }

  const supabase = await createClient(); // session-client → RLS afgedwongen
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) return { ok: false, error: 'NO_CHATBOT' };

  const config = { ...V1_RAG_DEFAULTS, version: chatbot.bot_version };
  const persona = buildV1Persona(chatbot.name);

  // Terminale StreamEvents dragen de volledige ChatResponse in `ev.response`.
  // 'replacement' (claim-regenerate / deterministische weiger) wint van een
  // eerdere answer-done. `answer` zit op alle drie ChatResponse-varianten;
  // `sources` alléén op 'answer'/'fallback' (NIET 'smalltalk') → `'sources' in r`.
  let final: { answer: string; sources: { title: string }[]; kind: string } | null = null;
  try {
    for await (const ev of runRagQuery(supabase, {
      question: question.trim(),
      threshold: config.similarityThreshold,
      enableRewrite: config.enableRewriteByDefault,
      config,
      persona,
      organizationId: orgId,
      chatbotId: chatbot.id,
      disableCache: true,
    })) {
      if (ev.kind === 'answer-done' || ev.kind === 'fallback' || ev.kind === 'smalltalk' || ev.kind === 'replacement') {
        const r = ev.response;
        final = {
          answer: r.answer,
          sources: 'sources' in r ? r.sources.map((s) => ({ title: s.filename ?? 'bron' })) : [],
          kind: r.kind,
        };
      }
    }
  } catch {
    return { ok: false, error: 'FAILED' };
  }
  if (!final) return { ok: false, error: 'FAILED' };
  return { ok: true, ...final };
}
```

> **Geverifieerd tegen de bron** (`run-rag-query.ts:1019-1048` ChatResponse-union + `:1133-1176` StreamEvent + `app/api/v0/chat/route.ts:428` consumptie): de discriminator is `ev.kind` (niet `ev.type`); `ChatResponse` = union `'smalltalk' | 'answer' | 'fallback'` met `answer: string` op alle drie, maar `sources: ChatSource[]` alléén op `'answer'`/`'fallback'`. `ChatSource` = `{ id?, filename: string|null, similarity, contentExcerpt, parentExcerpt?, url?, ... }` — **geen `title`** → map `filename → title`.

- [ ] **Step 2: Schrijf het client-formulier** `app/v1/app/v1-chat.tsx`

```tsx
'use client';

import { useState } from 'react';
import { askV1, type AskV1Result } from './actions';

export function V1Chat({ chatbotName, userEmail }: { chatbotName: string; userEmail: string }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AskV1Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setResult(await askV1(question));
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>V1 — {chatbotName}</h1>
      <p style={{ color: '#666' }}>Ingelogd als {userEmail}</p>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input
          name="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Stel een vraag…"
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={loading}>{loading ? 'Bezig…' : 'Vraag'}</button>
      </form>
      {result && (
        <section data-testid="v1-answer" style={{ marginTop: 24, whiteSpace: 'pre-wrap' }}>
          {result.ok ? (
            <>
              <p>{result.answer}</p>
              {result.sources.length > 0 && (
                <ul style={{ color: '#666', fontSize: 14 }}>
                  {result.sources.map((s, i) => <li key={i}>{s.title}</li>)}
                </ul>
              )}
            </>
          ) : (
            <p style={{ color: '#b00' }}>Er ging iets mis ({result.error}).</p>
          )}
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Herschrijf `app/v1/app/page.tsx`** — vervang ALLEEN de success-tak

Behoud de bestaande `V1_SEED_ORG_ID`-check, `requireOrgMember`-try/catch en de `AUTH_FORBIDDEN`-"geen toegang"-tak (lees het huidige bestand). Vervang de huidige "beschermde pagina"-render door:

```tsx
import { requireOrgMember } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { getOrgChatbot } from './rag-config';
import { V1Chat } from './v1-chat';

export const dynamic = 'force-dynamic';

export default async function V1AppPage() {
  const orgId = process.env.V1_SEED_ORG_ID;
  if (!orgId) {
    return <main style={{ padding: 24 }}><h1>Config-fout</h1><p>V1_SEED_ORG_ID ontbreekt.</p></main>;
  }

  let user;
  try {
    user = await requireOrgMember(orgId);
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <main style={{ padding: 24 }}><h1>Geen toegang</h1><p>Je bent geen lid van deze organisatie.</p></main>;
    }
    throw e; // NEXT_REDIRECT (geen sessie) of andere fout
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) {
    return <main style={{ padding: 24 }}><h1>Geen chatbot geconfigureerd</h1><p>Deze organisatie heeft nog geen chatbot.</p></main>;
  }

  return <V1Chat chatbotName={chatbot.name} userEmail={user.email ?? ''} />;
}
```

- [ ] **Step 4: Typecheck + clean build**

Run (PowerShell): `npm run typecheck`
Expected: groen. Fix `ChatSource`/`StreamEvent`-mismatches uit Step 1 hier.
Run (PowerShell): `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npm run build`
Expected: succesvol ([[windows_next_build_dirty_next_crash]] — eerst `.next` wissen). Een `server-only`/`next`-keten-breuk in de actie-import-keten zou hier opduiken.

- [ ] **Step 5: Commit**

```bash
git add app/v1/app/actions.ts app/v1/app/v1-chat.tsx app/v1/app/page.tsx
git commit -m "feat(v1): /v1/app draait echte RAG via session-client (server action + chat-form)"
```

---

## Task 5: Deterministisch cross-org-isolatie-bewijs

**Files:**
- Create: `scripts/v1-test-org-isolation.ts`

- [ ] **Step 1: Schrijf `scripts/v1-test-org-isolation.ts`**

Bewijst drie dingen tegen de echte V1-DB (vereist Task 1 + 3 gedraaid):
(a) RPC-predicaat isoleert: service-role roept de RPC aan gescoopt op org A met de embedding van org B's geheime token → org B's chunk komt NIET terug.
(b) RLS staat eigen-org toe: een als `member@example.com` ingelogde session-client gescoopt op org A → krijgt org A's chunks.
(c) RLS-backstop blokkeert cross-org: diezelfde member-session gescoopt op org B (gespoofte `p_organization_id`) → leeg (RLS laat member-A geen org-B-rijen zien, ook al vraagt de RPC erom).

```ts
// run: node --env-file=.env.local --conditions=react-server --import tsx scripts/v1-test-org-isolation.ts
import { createClient as createSb } from '@supabase/supabase-js';
import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { embedTexts } from '../lib/rag/embeddings';

const ISO_TOKEN = 'ZQXGEHEIM-ORG-B-VERTROUWELIJK';
const ORG_A = process.env.V1_SEED_ORG_ID!;
const URL = process.env.NEXT_PUBLIC_V1_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY!;

function fail(msg: string): never { console.error('❌ ISOLATIE-FAIL:', msg); process.exit(1); }

async function main() {
  const admin = getV1ServiceRoleClient();
  // chatbot-id's ophalen
  const { data: bots } = await admin.from('chatbots').select('id, organization_id');
  const botA = bots!.find((b) => b.organization_id === ORG_A)!;
  const { data: orgBRow } = await admin.from('organizations').select('id').eq('slug', 'seed-org-b').single();
  const orgB = orgBRow!.id;
  const botB = bots!.find((b) => b.organization_id === orgB)!;

  const { vectors } = await embedTexts([`Wat is het geheime projectcodewoord? ${ISO_TOKEN}`]);
  const qv = vectors[0];

  // (a) service-role, gescoopt op A → mag B's token-chunk niet bevatten
  const { data: aHits, error: aErr } = await admin.rpc('match_chunks_with_parents', {
    p_organization_id: ORG_A, p_chatbot_id: botA.id, query_embedding: qv, match_count: 10,
  });
  if (aErr) fail('RPC-A faalde: ' + aErr.message);
  if ((aHits ?? []).some((h: { content: string }) => h.content.includes(ISO_TOKEN)))
    fail('(a) org A retrieval bevat org B\'s geheime token — PREDICAAT LEKT');
  console.log('✅ (a) RPC-predicaat: org A ziet org B\'s token niet');

  // member-session
  const member = createSb(URL, ANON);
  const { error: signErr } = await member.auth.signInWithPassword({
    email: 'member@example.com', password: process.env.V1_SEED_MEMBER_PW!,
  });
  if (signErr) fail('member-login faalde: ' + signErr.message);

  // (b) member-session op eigen org A → krijgt chunks
  const { data: bHits, error: bErr } = await member.rpc('match_chunks_with_parents', {
    p_organization_id: ORG_A, p_chatbot_id: botA.id, query_embedding: qv, match_count: 5,
  });
  if (bErr) fail('RPC-member-A faalde: ' + bErr.message);
  if ((bHits ?? []).length === 0) fail('(b) member-A kreeg 0 chunks van eigen org — RLS te streng of seed leeg');
  console.log(`✅ (b) RLS staat eigen org toe: member-A kreeg ${bHits!.length} chunk(s)`);

  // (c) member-A gespooft naar org B → RLS-backstop blokkeert (leeg)
  const { data: cHits, error: cErr } = await member.rpc('match_chunks_with_parents', {
    p_organization_id: orgB, p_chatbot_id: botB.id, query_embedding: qv, match_count: 10,
  });
  if (cErr) fail('RPC-member-B faalde: ' + cErr.message);
  if ((cHits ?? []).length !== 0) fail('(c) member-A las org B\'s chunks — RLS-BACKSTOP LEKT');
  console.log('✅ (c) RLS-backstop: member-A leest org B niet (0 chunks)');

  console.log('\n✅ V1 cross-org-isolatie INTACT (predicaat + RLS).');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Draai het isolatie-bewijs**

Run: `npm run v1:test-org-isolation`
Expected: drie ✅-regels + "ISOLATIE INTACT", exit 0. Een ❌ = echte isolatie-bug → STOP en fix de RPC/RLS (geen false-positive zoals de V0-`forbidContains`-string-check; dit test echte chunk-aanwezigheid).

- [ ] **Step 3: Commit**

```bash
git add scripts/v1-test-org-isolation.ts
git commit -m "test(v1): deterministisch cross-org-isolatie-bewijs (RPC-predicaat + RLS-backstop)"
```

---

## Task 6: Playwright-e2e — lid krijgt gegrond antwoord

**Files:**
- Create: `tests/v1/rag.spec.ts`

- [ ] **Step 1: Schrijf `tests/v1/rag.spec.ts`**

Hergebruik het login-patroon uit `tests/v1/auth.spec.ts` (lees het voor de exacte selectors/creds). De `v1`-project matcht `/v1\/.*\.spec\.ts/`, logt zelf in (geen storageState), baseURL = dev-server.

```ts
import { test, expect } from '@playwright/test';

const MEMBER_EMAIL = 'member@example.com';
const MEMBER_PW = process.env.V1_SEED_MEMBER_PW;

test.describe('V1 RAG-pad', () => {
  test.skip(!MEMBER_PW, 'V1_SEED_MEMBER_PW ontbreekt');

  test('lid stelt vraag en krijgt gegrond antwoord uit eigen chunks', async ({ page }) => {
    test.setTimeout(90_000); // echte OpenAI-call (embed + retrieval + chat)

    await page.goto('/v1/login');
    await page.fill('input[name="email"]', MEMBER_EMAIL);
    await page.fill('input[name="password"]', MEMBER_PW!);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/v1\/app/);

    await page.fill('input[name="question"]', 'Wat zijn de openingstijden op zaterdag?');
    await page.click('button:has-text("Vraag")');

    const answer = page.getByTestId('v1-answer');
    await expect(answer).toBeVisible({ timeout: 80_000 });
    // Gegrond uit de Manta-seed: zaterdag 08:00–16:00.
    await expect(answer).toContainText(/16[:.]00|16 uur|zaterdag/i, { timeout: 80_000 });
  });
});
```

- [ ] **Step 2: Draai de e2e**

Zorg dat de dev-server op poort 3000 vrij is (anders `next dev -p 3001` + `PLAYWRIGHT_PORT=3001`). Run: `npx playwright test --project=v1 tests/v1/rag.spec.ts`
Expected: PASS. De `v1`-project start zelf `npm run dev` (reuseExistingServer). Dit doet een echte (billable) OpenAI-call. Bij flakey timeout: verhoog de timeout of check de dev-server-logs op een actie-fout. (Bevestig ook dat `tests/v1/auth.spec.ts` nog groen is: `npx playwright test --project=v1`.)

- [ ] **Step 3: Commit**

```bash
git add tests/v1/rag.spec.ts
git commit -m "test(v1): e2e — lid krijgt gegrond RAG-antwoord uit eigen chunks"
```

---

## Task 7: Volle gate + review + PR-1b

- [ ] **Step 1: Volle lokale gate**

Run: `npm run typecheck && npm run test:unit`
Run (PowerShell): `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npm run build`
Run: `npm run v1:test-org-isolation` (isolatie nog intact)
Expected: alles groen. De grep-gate (`lib/rag`-neutraliteit) draait mee in `test:unit` en blijft groen (PR-1b raakt `lib/rag/` niet).

- [ ] **Step 2: Bevestig branch + push**

```bash
git rev-parse --abbrev-ref HEAD   # verwacht feat/seb/v1-pr1b
git push -u origin feat/seb/v1-pr1b
```

- [ ] **Step 3: Open PR-1b** met `gh pr create` (template). Titel: `feat(v1): V1-RAG-pad achter auth — migratie 0002 + seed + /v1/app + e2e (PR-1b)`. Body: migratie 0002 toegepast op V1-prod (advisors clean), document-only RPC met `p_chatbot_id`, RLS spiegelt 0001, `/v1/app` draait echte RAG via session-client (RLS), isolatie deterministisch bewezen (predicaat + RLS-backstop), e2e lid→gegrond-antwoord groen. Noem de bewuste deviations (website_page_id weggelaten, query_log nog niet geschreven, isolatie via script i.p.v. browser). Noem PR-2 (ingest) als vervolg.

- [ ] **Step 4: Review-loop** — `chatmanta-reviewer` op de branch-diff (hard-rules-lens: RLS, SA-1/SA-5, vector-isolatie) + een lokale `/code-review`. Verifieer de ~1-2 verwachte false-positives zelf vóór je fixt. Merge pas na groen + Sebastiaan's go.

---

## Definition of Done (PR-1b)

- [ ] Migratie `0002_v1_rag_core.sql` toegepast op het V1-project; `list_tables` toont de 5 tabellen met RLS aan; `get_advisors` clean; ledger-rij in `public._migrations`.
- [ ] `/v1/app` geeft een ingelogd lid een **gegrond antwoord** uit de eigen chunks, via de **session-client** (RLS) met `chatbotScoped:true` + `disableCache:true`.
- [ ] Niet-lid geweigerd (bestaande `auth.spec.ts`); geen-sessie → redirect naar `/v1/login`.
- [ ] Cross-org-isolatie **deterministisch bewezen**: RPC-predicaat + RLS-backstop (`v1:test-org-isolation` = 3×✅).
- [ ] V0 onaangeraakt (geen V0-migratie, geen `lib/rag/`- of V0-code-wijziging); grep-gate groen.
- [ ] `typecheck` + `test:unit` + clean `build` groen.

## Verification summary

1. `npm run typecheck` — clean.
2. `npm run test:unit` — `rag-config`-shape-test + bestaande suite + grep-gate groen.
3. `Remove-Item -Recurse -Force .next; npm run build` — clean.
4. MCP `list_tables` + `get_advisors` op `tfijdnxqdvwzwgxdioqo` — 5 tabellen, RLS aan, advisors clean.
5. `npm run v1:test-org-isolation` — 3×✅ (predicaat + RLS eigen-org + RLS-backstop).
6. `npx playwright test --project=v1` — `auth.spec.ts` + `rag.spec.ts` groen (lid → gegrond antwoord).

---

## Self-review (writing-plans)

- **Spec-dekking (§4 PR-1 + §5 + §6 + §7 PR-1b):** migratie 0002 met alle 5 tabellen + RLS + `org_id`/`chatbot_id NOT NULL` (Task 1) ✓; document-only RPC + `p_chatbot_id` + `security invoker` + soft-delete behouden + website-tak weggelaten (Task 1 Step 2) ✓; SELECT-policies spiegelen 0001 (Task 1) ✓; seed via V1-service-role, 1 chatbot + chunks (Task 3) ✓; `/v1/app` echte RAG via session-client + chatbotScoped + disableCache (Task 4) ✓; "geen chatbot" → nette fail, nooit lege chatbotId (Task 4 Step 3) ✓; org uit membership/`V1_SEED_ORG_ID`-provisioneel + chatbot = enige van de org (Task 2 `getOrgChatbot` + Task 4) ✓; e2e lid→gegrond + niet-lid geweigerd (Task 6 + bestaande auth.spec) ✓; cross-org-isolatie bewezen (Task 5) ✓; pgvector aan vóór document_chunks (Task 1 Step 1/2) ✓; MCP-toepassing + ledger + advisors (Task 1) ✓. **Bewuste deviations** (eigen sectie boven): website_page_id weg/document_id NOT NULL, match_chunks(_hybrid) niet geport, content_tsv wél, isolatie via script. **Buiten scope (PR-2/3):** ingest, answer_cache, website/crawler, echte per-user org-resolutie, query_log-writes.
- **Placeholder-scan:** de "lees de StreamEvent-union en match op ev.type" (Task 4 Step 1) is een bewuste precisie-instructie met een veilige duck-typing-fallback + concrete bron (`run-rag-query.ts` regels + `route.ts:393`), geen placeholder. `V1_RAG_DEFAULTS` "lees types.ts + LATEST-bot voor waarden" (Task 2 Step 3) is mechanische volledigheid-via-typecheck, niet TBD — de override-lijst + sleutelwaarden staan concreet.
- **Type-consistentie:** `V1_RAG_DEFAULTS: RagConfig`, `buildV1Persona(): RagPersona`, `getOrgChatbot(client, orgId): {id,name,bot_version}|null`, `askV1(question): AskV1Result`, `<V1Chat chatbotName userEmail>` — identiek gebruikt in Tasks 2/4/6. RPC-param-namen (`p_organization_id`, `p_chatbot_id`, `query_embedding`, `match_count`) consistent tussen de migratie (Task 1), de motor-call (via `runRagQuery`) en het isolatie-script (Task 5). `ISO_TOKEN` identiek in seed (Task 3) en isolatie-script (Task 5).
