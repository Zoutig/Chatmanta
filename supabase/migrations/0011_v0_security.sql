-- =============================================================================
-- Migration 0011 — V0.4 security telemetry
--
-- Twee toevoegingen aan query_log voor prompt-injection telemetrie. Rate-limit
-- staat los — die heeft geen DB-laag in V0 (in-memory Map per process; bij
-- V1 verhuist naar Upstash met eigen DB/Redis).
--
--   1. injection_detected boolean — werd er een patroon gevonden?
--   2. injection_pattern text     — naam van het matchende patroon (NULL als geen match)
--
-- Plus: kind enum krijgt 'blocked' erbij — voor queries die we expliciet
-- afwijzen (anders dan smalltalk/answer/fallback).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- ALTER: query_log.kind constraint — voeg 'blocked' toe
--
-- Postgres laat geen ALTER CONSTRAINT toe; we moeten drop + recreate. De
-- bestaande constraint heet query_log_kind_chk (zie migratie 0003).
-- -----------------------------------------------------------------------------
alter table public.query_log
  drop constraint if exists query_log_kind_chk;

alter table public.query_log
  add constraint query_log_kind_chk
  check (kind in ('smalltalk', 'answer', 'fallback', 'blocked'));


-- -----------------------------------------------------------------------------
-- ALTER: query_log injection-telemetrie
-- -----------------------------------------------------------------------------
alter table public.query_log
  add column if not exists injection_detected boolean not null default false,
  add column if not exists injection_pattern  text;


-- -----------------------------------------------------------------------------
-- INDEX: snel queryen op gedetecteerde injecties (voor patroon-tuning)
-- -----------------------------------------------------------------------------
create index if not exists query_log_injection_idx
  on public.query_log (organization_id, created_at desc)
  where injection_detected = true;
