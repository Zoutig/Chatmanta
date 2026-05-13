-- =============================================================================
-- Migration 0019 — Eval-pipeline per-stage latency capture
--
-- Doel: elke eval_runs rij krijgt de volledige PhaseTimings JSONB die
-- runRagQueryStreaming nu al uitstuurt via 'metrics-done' maar door runEvalRow
-- tot nu toe werd weggegooid. Maakt p50/p95/p99 per-stage segmentatie op
-- question_type mogelijk in v0-eval-report.ts en de Evals-tab.
--
-- Waarom JSONB en geen 12 losse *_ms kolommen: de PhaseTimings shape leeft in
-- lib/v0/server/rag.ts en kan tussen versies wijzigen (nieuwe stages erbij,
-- oude stages weg). Losse kolommen geven schema-pijn bij elke wijziging.
-- query_log heeft historisch losse kolommen omdat 0010 voor v0.4 een view rond
-- p50/p95 nodig had; voor eval doen we het bewust beter.
--
-- Geen backfill: NULL voor pre-migration runs en synthetic-fallback rows. UI en
-- report-formatter handelen nullable graceful af. Eerlijke meet-start = nu.
--
-- Geen RLS-changes: erft eval_runs_select_org_members policy uit 0007. Writes
-- lopen via service-role (eval-runner CLI), zoals alle andere eval_runs writes.
-- =============================================================================

alter table public.eval_runs
  add column if not exists stage_timings_ms jsonb;

alter table public.eval_runs
  add constraint eval_runs_stage_timings_is_object_chk
    check (stage_timings_ms is null or jsonb_typeof(stage_timings_ms) = 'object');

comment on column public.eval_runs.stage_timings_ms is
  'PhaseTimings (lib/v0/server/rag.ts) snapshot per eval-run. Mirror van ChatResponse.extras.phaseTimingsMs zoals runRagQueryStreaming die via metrics-done emit. NULL voor pre-migration runs en synthetic-fallback rows.';

-- Expression-index op total_ms voor snelle order-by/percentile-queries vanuit
-- toekomstige SQL-views. Geen GIN op de hele jsonb — we queryen altijd ofwel
-- total_ms of een vaste key, niet containment-search.
create index if not exists eval_runs_stage_timings_total_idx
  on public.eval_runs (((stage_timings_ms->>'total_ms')::int))
  where stage_timings_ms is not null;
