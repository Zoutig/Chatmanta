-- =============================================================================
-- Migration 0010 — V0.4 latency profiling (data layer)
--
-- Twee toevoegingen:
--   1. Per-fase timing kolommen op query_log (5 named columns + jsonb voor
--      de volledige breakdown). Maakt SQL-queries simpel ("welke fase is
--      traag?") zonder jsonb-extractie nodig te hebben.
--   2. View v_latency_summary met p50/p95/p99 per bot_version voor de admin-
--      pagina (UI-rendering komt later, view is alvast bruikbaar via psql).
--
-- Alle kolommen optional — oude bot-versies (v0.1/v0.2/v0.3 vóór deze migratie)
-- krijgen NULL en worden niet meegenomen in de view (WHERE total_ms IS NOT NULL).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- ALTER: query_log — 5 named buckets + full jsonb
-- -----------------------------------------------------------------------------
alter table public.query_log
  add column if not exists embedding_ms      int,
  add column if not exists retrieval_ms      int,
  add column if not exists rerank_ms         int,
  add column if not exists generation_ms     int,
  add column if not exists total_ms          int,
  add column if not exists phase_timings_ms  jsonb;


-- -----------------------------------------------------------------------------
-- VIEW: v_latency_summary
--
-- p50/p95/p99 per bot_version voor de 5 hoofd-fases + total. Filtert rijen
-- met total_ms IS NULL (queries van vóór deze migratie of mislukte runs).
--
-- security_invoker = on: view erft RLS van query_log (de aanroepende user
-- ziet alleen zijn eigen org). security_barrier voorkomt dat de planner
-- rijen "lekt" via clever predicate pushing — bij aggregate views hoort
-- dit aan te staan.
-- -----------------------------------------------------------------------------
create or replace view public.v_latency_summary
with (security_invoker = on, security_barrier = on) as
select
  bot_version,
  count(*)::int                                                            as n,
  -- Total
  percentile_cont(0.50) within group (order by total_ms)::int              as p50_total_ms,
  percentile_cont(0.95) within group (order by total_ms)::int              as p95_total_ms,
  percentile_cont(0.99) within group (order by total_ms)::int              as p99_total_ms,
  -- Embedding
  percentile_cont(0.50) within group (order by embedding_ms)::int          as p50_embedding_ms,
  percentile_cont(0.95) within group (order by embedding_ms)::int          as p95_embedding_ms,
  -- Retrieval
  percentile_cont(0.50) within group (order by retrieval_ms)::int          as p50_retrieval_ms,
  percentile_cont(0.95) within group (order by retrieval_ms)::int          as p95_retrieval_ms,
  -- Rerank (kan NULL zijn als rerank='none' — percentile_cont negeert NULL)
  percentile_cont(0.50) within group (order by rerank_ms)::int             as p50_rerank_ms,
  percentile_cont(0.95) within group (order by rerank_ms)::int             as p95_rerank_ms,
  -- Generation
  percentile_cont(0.50) within group (order by generation_ms)::int         as p50_generation_ms,
  percentile_cont(0.95) within group (order by generation_ms)::int         as p95_generation_ms
from public.query_log
where total_ms is not null
group by bot_version;
