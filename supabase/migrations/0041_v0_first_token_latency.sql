-- =============================================================================
-- Migration 0041 — V0 production TTFT (time-to-first-token)
--
-- query_log mist tot nu toe een productie-TTFT-kolom: first_token_ms werd
-- alléén door de eval-runner ge-set (eval_runs.stage_timings_ms), nooit op het
-- live pad. TTFT is de gevoelde snelheid van een streamende chat (tijd tot het
-- eerste antwoord-woord verschijnt), dus de belangrijkste latency-metric.
--
-- rag.ts vult first_token_ms voortaan zelf in de generatie-loop (alles vóór de
-- eerste answer-delta) en logQuery promoveert het tot deze queryable kolom.
--
-- Optioneel — net als de overige latency-kolommen uit 0010. NULL voor:
--   * bot-versies/queries van vóór deze migratie
--   * smalltalk / fallback / cache-hit (daar streamt geen antwoord)
-- De percentiel-views/aggregaten filteren NULL al weg.
-- =============================================================================

alter table public.query_log
  add column if not exists first_token_ms int;

comment on column public.query_log.first_token_ms is
  'Time-to-first-token (ms): tijd vanaf pipeline-start tot de eerste answer-delta. NULL bij smalltalk/fallback/cache-hit (geen streaming).';
