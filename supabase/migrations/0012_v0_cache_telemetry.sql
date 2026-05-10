-- =============================================================================
-- Migration 0012 — V0.4 cache telemetry
--
-- Eén toevoeging: from_cache boolean op query_log + index.
--
-- Waarom: vandaag is niet te tellen hoeveel queries via answer_cache zijn
-- afgehandeld. ChatResponse.extras.fromCache wordt al gezet in rag.ts wanneer
-- lookupCachedAnswer een hit retourneert, maar log.ts schreef die info niet
-- naar query_log. Zonder kolom blijft "hoe vaak slaat de cache aan" een
-- raadsel — we zien 0% hit in een eerste latency-analyse en kunnen niet
-- onderscheiden tussen (a) lege cache, (b) te streng threshold, (c) stille
-- writeCachedAnswer-fout. De boolean + samengestelde index maakt deze
-- diagnostiek triviaal.
--
-- Default false: bestaande rijen waren géén cache-hit (kolom bestond niet
-- toen die rijen geschreven werden).
-- =============================================================================

alter table public.query_log
  add column if not exists from_cache boolean not null default false;

-- Index voor "hoeveel cache-hits per org in window X" — de meest waarschijnlijke
-- query. created_at descending matcht de dashboard-pagination volgorde.
create index if not exists query_log_from_cache_idx
  on public.query_log (organization_id, from_cache, created_at desc);
