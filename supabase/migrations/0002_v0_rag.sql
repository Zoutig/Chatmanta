-- =============================================================================
-- Migration 0002 — V0 RAG: documents + document_chunks + match_chunks
--
-- Doel: V0 leerprototype (document → chunks → embeddings → vector search →
-- LLM-antwoord) bouwen bovenop V1's multi-tenancy foundation.
--
-- Ontwerpkeuzes:
--   * Schema is V1-COMPATIBEL: organization_id NOT NULL + RLS overal, conform
--     blueprint sectie 1.5 hard rule. Geen "naked V0" zonder org_id.
--   * `document_chunks` heeft TWEE mutually-exclusive nullable FKs zoals
--     blueprint sectie 13 voorschrijft: `document_id` (deze fase) en
--     `website_page_id` (Fase 5 — kolom alvast aanwezig met CHECK,
--     FK constraint volgt zodra `website_pages` bestaat).
--   * `match_chunks(p_organization_id, query_embedding, match_count)` heeft
--     org_id als VERPLICHTE eerste parameter — blueprint hard rule "vector
--     search isolation". Geen optional, geen default.
--   * Soft-delete-filter zit in de RPC zelf via LEFT JOIN naar `documents`,
--     niet alleen in app-laag (blueprint sectie 27).
--   * Dev-organization wordt gezaaid met vaste UUID zodat V0-code zonder
--     auth-layer tegen één tenant kan praten. In V1 wordt dit vervangen
--     door echte org-membership via `requireOrgMember(orgId)`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Required extensions
-- -----------------------------------------------------------------------------
create extension if not exists vector;


-- =============================================================================
-- TABLE: documents
-- =============================================================================
create table public.documents (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  filename        text        not null,
  source          text        not null,
  status          text        not null default 'ready',
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint documents_status_chk
    check (status in ('pending', 'processing', 'ready', 'failed')),
  constraint documents_source_chk
    check (source in ('upload', 'website', 'v0_local'))
);

create index documents_org_idx
  on public.documents (organization_id)
  where deleted_at is null;

alter table public.documents enable row level security;

create policy "documents_select_org_members"
  on public.documents
  for select
  to authenticated
  using (
    deleted_at is null
    and organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- No INSERT/UPDATE/DELETE policy: mutations gaan via service-role wrappers
-- (V0 ingest-script + Jorion-admin upload-flow in V1).


-- =============================================================================
-- TABLE: document_chunks
-- =============================================================================
-- Twee mutually-exclusive bron-FKs:
--   * document_id      — chunk uit een geüpload document (V0 + V1 Fase 3)
--   * website_page_id  — chunk uit gecrawlde website-pagina (V1 Fase 5)
-- Exact één moet gevuld zijn (CHECK constraint hieronder).
create table public.document_chunks (
  id              uuid         primary key default gen_random_uuid(),
  organization_id uuid         not null references public.organizations(id) on delete cascade,
  document_id     uuid         references public.documents(id) on delete cascade,
  website_page_id uuid,
  content         text         not null,
  embedding       vector(1536) not null,
  metadata        jsonb        not null default '{}'::jsonb,
  created_at      timestamptz  not null default now(),
  constraint document_chunks_source_xor_chk check (
    (document_id is not null and website_page_id is null) or
    (document_id is null     and website_page_id is not null)
  )
);

create index document_chunks_org_doc_idx
  on public.document_chunks (organization_id, document_id);

create index document_chunks_embedding_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.document_chunks enable row level security;

create policy "document_chunks_select_org_members"
  on public.document_chunks
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- No INSERT/UPDATE/DELETE policy: mutations alleen via service-role.


-- =============================================================================
-- FUNCTION: match_chunks
-- =============================================================================
-- Vector search met verplichte org_id + soft-delete-filter via JOIN.
-- security invoker = draait met privileges van de aanroeper:
--   * via service-role-client: RLS bypassed, function returns alles (V0)
--   * via authenticated user: RLS enforces org-membership (V1 future)
-- De `where c.organization_id = p_organization_id` clause is de
-- daadwerkelijke isolatie-laag bij service-role-aanroepen.
create or replace function public.match_chunks(
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
  similarity      float
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
    1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  left join public.documents d on d.id = c.document_id
  where c.organization_id = p_organization_id
    and (c.document_id is null or d.deleted_at is null)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;


-- =============================================================================
-- SEED: V0 dev organization
-- =============================================================================
-- Vaste UUID zodat V0-code (zonder auth) een stabiele tenant heeft.
-- Idempotent: opnieuw runnen verandert niets.
insert into public.organizations (id, name, slug)
values (
  '00000000-0000-0000-0000-0000000000d0',
  'V0 Dev Organization',
  'v0-dev'
)
on conflict (id) do nothing;
