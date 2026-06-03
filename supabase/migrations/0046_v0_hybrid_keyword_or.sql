-- Migration 0046 — V0 hybrid search: keyword-helft van AND naar OR
--
-- Probleem (read-only FTS-probe 2026-06-03): `match_chunks_hybrid` bouwde de
-- keyword-query met `plainto_tsquery('dutch', query_text)`, en dat AND't ÁLLE
-- content-lexemen van de vraag. Een natuurlijke meerwoords-vraag ("Telt
-- fysiotherapie mee voor mijn eigen risico?") eist dan dat één chunk alle woorden
-- samen bevat → 0 chunks → `keyword_results` leeg → de hybrid degradeert stil naar
-- vector-only voor élke echte vraag. Bewijs: full-question @@ plainto = 0 hits,
-- terwijl single "fysiotherapie" = 45 hits (content_tsv + NL-stemming zijn prima).
-- websearch_to_tsquery ANDt ongequote termen óók → loste het niet op.
--
-- Fix: zet de AND-tsquery om naar OR. plainto_tsquery doet de NL-stemming +
-- stopwoord-verwijdering nog steeds correct; we vervangen alleen ' & ' door ' | '
-- in de tekstrepresentatie en casten terug. Een chunk die ÉÉN topicaal woord
-- matcht krijgt dan al een keyword-rank; ts_rank zet chunks met méér overlap
-- vanzelf vooraan, en de RRF-fusie (k=60) combineert dat met de vector-ranking.
-- nullif(...,'') vangt het geval dat de vraag enkel uit stopwoorden bestaat
-- (plainto → '') → tsq null → de keyword-helft wordt netjes overgeslagen i.p.v.
-- alles te matchen of te crashen.
--
-- Alleen de keyword-helft verandert; vector_results, RRF-fusie, de signatuur en de
-- soft-delete/included-filters blijven identiek aan 0042. CREATE OR REPLACE →
-- geen drop, geen RLS-impact (functie, geen tabel). security invoker behouden.

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
  combined_score  float,
  source_url      text,
  source_title    text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with q_or as (
    -- AND → OR: behoud NL-stemming/stopwoorden van plainto_tsquery, flip alleen
    -- de operator. Leeg (enkel stopwoorden) → null → keyword-helft overgeslagen.
    select nullif(replace(plainto_tsquery('dutch', query_text)::text, ' & ', ' | '), '')::tsquery as tsq
  ),
  vector_results as (
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
      ts_rank(c.content_tsv, (select tsq from q_or))::float as kw,
      row_number() over (
        order by ts_rank(c.content_tsv, (select tsq from q_or)) desc
      ) as k_rank
    from public.document_chunks c
    left join public.documents d on d.id = c.document_id
    left join public.website_pages wp on wp.id = c.website_page_id
    where c.organization_id = p_organization_id
      and (c.document_id is null or d.deleted_at is null)
      and (c.website_page_id is null or (wp.deleted_at is null and wp.included = true))
      and (select tsq from q_or) is not null
      and c.content_tsv @@ (select tsq from q_or)
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
