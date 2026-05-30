-- =============================================================================
-- Migration 0042 — Bron-URL + titel terug uit de retrieval-RPCs
--
-- Doel: de answer-LLM kan straks klikbare bron-links geven, maar ALLEEN naar
-- echte gecrawlde pagina-URLs. Daarvoor moeten de retrieval-RPCs de
-- `website_pages.url` (+ `title`) meegeven per chunk. Beide RPCs joinen
-- `website_pages` al (sinds 0035, voor de included-filter), dus dit is puur een
-- uitbreiding van de RETURNS-shape met twee kolommen:
--   * source_url   text — wp.url    (NULL voor document-chunks)
--   * source_title text — wp.title  (NULL voor document-chunks)
--
-- Drop+recreate is nodig: Postgres accepteert geen RETURNS-shape-wijziging via
-- CREATE OR REPLACE. Alle bestaande kolommen, filters (included/deleted_at/
-- org-isolatie) en `security invoker` blijven byte-identiek aan 0035.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. match_chunks_with_parents — + source_url + source_title
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
  parent_index    int,
  source_url      text,
  source_title    text
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
    p.parent_index  as parent_index,
    wp.url          as source_url,
    wp.title        as source_title
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
-- 2. match_chunks_hybrid — source_url + source_title door beide CTEs + fused
--
-- RETURNS-shape wijzigt → ook hier drop+recreate (0035 gebruikte nog
-- CREATE OR REPLACE omdat de shape toen gelijk bleef).
-- -----------------------------------------------------------------------------

drop function if exists public.match_chunks_hybrid(uuid, vector(1536), text, int);

create function public.match_chunks_hybrid(
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
  combined_score  float,
  source_url      text,
  source_title    text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with vector_results as (
    select
      c.id, c.document_id, c.website_page_id, c.content, c.metadata,
      wp.url as source_url, wp.title as source_title,
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
      wp.url as source_url, wp.title as source_title,
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
       coalesce(1.0 / (60 + k.k_rank), 0))::float           as combined_score,
      coalesce(v.source_url, k.source_url)                  as source_url,
      coalesce(v.source_title, k.source_title)              as source_title
    from vector_results v
    full outer join keyword_results k on v.id = k.id
  )
  select id, document_id, website_page_id, content, metadata,
    similarity, keyword_score, combined_score, source_url, source_title
  from fused
  order by combined_score desc
  limit greatest(match_count, 1);
$$;
