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
