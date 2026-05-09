-- =============================================================================
-- Migration 0004 — V0 hybrid search + answer cache (v0.3 features)
--
-- Toevoegingen:
--   1. content_tsv kolom op document_chunks (gegenereerd uit content) +
--      GIN-index → keyword-search via Postgres FTS.
--   2. match_chunks_hybrid RPC die vector-search en keyword-search combineert
--      via Reciprocal Rank Fusion (RRF, k=60).
--   3. answer_cache tabel met question_embedding voor near-duplicate lookup.
--   4. lookup_cached_answer RPC die de cache via vector-similarity ondervraagt.
--
-- Backwards compatible: oude match_chunks RPC blijft bestaan, v0.1/v0.2
-- gebruiken die ongewijzigd.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Hybrid search infrastructure
-- -----------------------------------------------------------------------------

-- Generated tsvector kolom — auto-update bij content-wijziging, geen trigger nodig.
-- 'dutch' config gebruikt Nederlandse stemmer (snelle/snel/sneltrein → 'snel').
alter table public.document_chunks
  add column content_tsv tsvector
  generated always as (to_tsvector('dutch', content)) stored;

create index document_chunks_content_tsv_idx
  on public.document_chunks
  using gin (content_tsv);


-- Hybrid match: combineert vector similarity en keyword rank via RRF.
-- RRF: score = 1/(k + rank) per ranking, gesommeerd over rankings. k=60
-- is de canonieke RRF-constante (Cormack et al. 2009).
--
-- Returns top-N chunks gerangschikt op combined_score, met de losse
-- vector- en keyword-scores zichtbaar voor inspectie.
create or replace function public.match_chunks_hybrid(
  p_organization_id uuid,
  query_embedding   vector(1536),
  query_text        text,
  match_count       int default 5
)
returns table (
  id              uuid,
  document_id     uuid,
  website_page_id uuid,
  content         text,
  metadata        jsonb,
  similarity      float,
  keyword_score   float,
  combined_score  float
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with vector_results as (
    select
      c.id, c.document_id, c.website_page_id, c.content, c.metadata,
      (1 - (c.embedding <=> query_embedding))::float as sim,
      row_number() over (order by c.embedding <=> query_embedding) as v_rank
    from public.document_chunks c
    left join public.documents d on d.id = c.document_id
    where c.organization_id = p_organization_id
      and (c.document_id is null or d.deleted_at is null)
    order by c.embedding <=> query_embedding
    limit greatest(match_count * 4, 20)
  ),
  keyword_results as (
    select
      c.id, c.document_id, c.website_page_id, c.content, c.metadata,
      ts_rank(c.content_tsv, plainto_tsquery('dutch', query_text))::float as kw,
      row_number() over (
        order by ts_rank(c.content_tsv, plainto_tsquery('dutch', query_text)) desc
      ) as k_rank
    from public.document_chunks c
    left join public.documents d on d.id = c.document_id
    where c.organization_id = p_organization_id
      and (c.document_id is null or d.deleted_at is null)
      and c.content_tsv @@ plainto_tsquery('dutch', query_text)
    order by kw desc
    limit greatest(match_count * 4, 20)
  ),
  combined as (
    select id, document_id, website_page_id, content, metadata,
      sim, 1.0 / (60 + v_rank) as v_rrf, 0.0::float as k_rrf, 0.0::float as kw_score
    from vector_results
    union all
    select id, document_id, website_page_id, content, metadata,
      0.0::float, 0.0 as v_rrf, 1.0 / (60 + k_rank) as k_rrf, kw as kw_score
    from keyword_results
  ),
  fused as (
    select
      id,
      max(document_id)     as document_id,
      max(website_page_id) as website_page_id,
      max(content)         as content,
      (array_agg(metadata))[1] as metadata,
      max(sim)             as similarity,
      max(kw_score)        as keyword_score,
      sum(v_rrf + k_rrf)::float as combined_score
    from combined
    group by id
  )
  select id, document_id, website_page_id, content, metadata,
    similarity, keyword_score, combined_score
  from fused
  order by combined_score desc
  limit greatest(match_count, 1);
$$;


-- -----------------------------------------------------------------------------
-- Answer cache infrastructure
-- -----------------------------------------------------------------------------

create table public.answer_cache (
  id                 uuid         primary key default gen_random_uuid(),
  organization_id    uuid         not null references public.organizations(id) on delete cascade,
  bot_version        text         not null,
  question           text         not null,
  question_embedding vector(1536) not null,
  response_json      jsonb        not null,
  hit_count          int          not null default 0,
  created_at         timestamptz  not null default now(),
  last_hit_at        timestamptz
);

create index answer_cache_embedding_idx
  on public.answer_cache
  using hnsw (question_embedding vector_cosine_ops);

create index answer_cache_org_version_idx
  on public.answer_cache (organization_id, bot_version);

alter table public.answer_cache enable row level security;

create policy "answer_cache_select_org_members"
  on public.answer_cache
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );


-- Cache lookup: vector similarity boven threshold = hit.
-- Default 0.97 betekent near-duplicate vragen worden geclusterd, kleine
-- variaties zoals leestekens/casing krijgen alsnog cache-hit.
create or replace function public.lookup_cached_answer(
  p_organization_id uuid,
  p_bot_version     text,
  query_embedding   vector(1536),
  min_similarity    float default 0.97
)
returns table (
  id            uuid,
  question      text,
  response_json jsonb,
  similarity    float
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    id, question, response_json,
    (1 - (question_embedding <=> query_embedding))::float as similarity
  from public.answer_cache
  where organization_id = p_organization_id
    and bot_version = p_bot_version
    and 1 - (question_embedding <=> query_embedding) >= min_similarity
  order by question_embedding <=> query_embedding
  limit 1;
$$;
