-- =============================================================================
-- Migration 0006 — V0 query log tone/length kolommen
--
-- Voor empirische analyse: zorgt 'detailed' voor meer hallucinaties of
-- fallbacks? Werkt 'casual' beter dan 'formal' op begroetingen?
--
-- Kolommen zijn nullable: legacy rijen blijven geldig zonder backfill.
-- =============================================================================

alter table public.query_log
  add column tone   text,
  add column length text;

alter table public.query_log
  add constraint query_log_tone_chk
    check (tone is null or tone in ('formal','neutral','casual'));

alter table public.query_log
  add constraint query_log_length_chk
    check (length is null or length in ('short','medium','detailed'));

create index query_log_org_style_idx
  on public.query_log (organization_id, tone, length);
