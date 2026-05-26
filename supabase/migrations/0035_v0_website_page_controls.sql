-- =============================================================================
-- Migration 0035 — Website-pagina-controle: included-vlag + foutreden + RPC-filter
--
-- * website_pages.included: per-pagina aan/uit (A1). Uit = chunks tellen niet
--   meer mee bij retrieval — zonder re-embedding (RPC filtert erop).
-- * website_pages.error_message: reden van een mislukte pagina (A3), voor de UI.
-- * match_chunks_with_parents: join nu website_pages en sluit niet-included
--   website-pagina's uit (en soft-deleted pagina's via deleted_at).
-- * match_chunks_hybrid: zelfde filter toegepast op beide CTEs (vector + keyword).
--
-- Geen nieuwe tabel → geen nieuwe RLS-policy nodig.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Nieuwe kolommen op website_pages
-- -----------------------------------------------------------------------------

alter table public.website_pages
  add column if not exists included      boolean not null default true,
  add column if not exists error_message text;


-- -----------------------------------------------------------------------------
-- 2. match_chunks_with_parents — voeg wp.included + wp.deleted_at filter toe
--
-- CRITICAL: signature (args + returns table columns) identiek aan 0017 —
-- Postgres verbiedt wijziging van een CREATE OR REPLACE bij signature-verschil.
-- -----------------------------------------------------------------------------

drop function if exists public.match_chunks_with_parents(uuid, vector(1536), int);

create function public.match_chunks_with_parents(
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
  left join public.documents d on d.id = c.document_id
  left join public.parent_chunks p on p.id = c.parent_chunk_id
  left join public.website_pages wp on wp.id = c.website_page_id
  where c.organization_id = p_organization_id
    and (c.document_id is null or d.deleted_at is null)
    and (c.website_page_id is null or (wp.deleted_at is null and wp.included = true))
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;


-- -----------------------------------------------------------------------------
-- 3. match_chunks_hybrid — zelfde wp.included + wp.deleted_at filter in beide CTEs
--
-- signature identiek aan 0004 — CREATE OR REPLACE is hier safe.
-- -----------------------------------------------------------------------------

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
    left join public.website_pages wp on wp.id = c.website_page_id
    where c.organization_id = p_organization_id
      and (c.document_id is null or d.deleted_at is null)
      and (c.website_page_id is null or (wp.deleted_at is null and wp.included = true))
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
    left join public.website_pages wp on wp.id = c.website_page_id
    where c.organization_id = p_organization_id
      and (c.document_id is null or d.deleted_at is null)
      and (c.website_page_id is null or (wp.deleted_at is null and wp.included = true))
      and c.content_tsv @@ plainto_tsquery('dutch', query_text)
    order by kw desc
    limit greatest(match_count * 4, 20)
  ),
  fused as (
    select
      coalesce(v.id, k.id)                                  as id,
      coalesce(v.document_id, k.document_id)                as document_id,
      coalesce(v.website_page_id, k.website_page_id)        as website_page_id,
      coalesce(v.content, k.content)                        as content,
      coalesce(v.metadata, k.metadata)                      as metadata,
      coalesce(v.sim, 0)::float                             as similarity,
      coalesce(k.kw, 0)::float                              as keyword_score,
      (coalesce(1.0 / (60 + v.v_rank), 0) +
       coalesce(1.0 / (60 + k.k_rank), 0))::float           as combined_score
    from vector_results v
    full outer join keyword_results k on v.id = k.id
  )
  select id, document_id, website_page_id, content, metadata,
    similarity, keyword_score, combined_score
  from fused
  order by combined_score desc
  limit greatest(match_count, 1);
$$;
