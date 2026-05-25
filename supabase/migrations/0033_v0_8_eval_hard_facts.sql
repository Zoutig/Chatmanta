-- =============================================================================
-- Migration 0033 — v0.8.0 Eval Foundation: hard-facts in eval_runs
--
-- Doel: de hard-fact-verifier (lib/v0/server/hard-facts.ts) draait al in
-- runtime en zet response.extras.hardFactSupport = { supported, missing }.
-- Tot nu toe ging die informatie verloren bij het wegschrijven naar eval_runs.
-- Deze migratie voegt drie kolommen toe zodat de eval-pipeline unsupported
-- hard facts per case kan meten en rapporteren — de meest schadelijke
-- hallucinatie-categorie voor een MKB-klantcontactbot (prijzen/datums/aantallen).
--
--   * hard_fact_supported (boolean null)
--        true  = alle harde feiten in het antwoord zijn terug te vinden in de
--                bot-sources; false = minstens één ontbreekt; null = niet gemeten
--                (zie hard_fact_status='unknown'/'none_detected').
--   * missing_hard_facts (jsonb null)
--        lijst van category-prefixed missing facts ("money:249", "phone:06...").
--        Leeg array bij supported=true; null bij niet gemeten.
--   * hard_fact_status (text)
--        supported     — feiten aanwezig én ondersteund
--        unsupported   — minstens één hard fact niet in sources (= risico)
--        none_detected — antwoord bevat geen harde feiten
--        unknown       — verifier draaide niet op dit pad (fallback/smalltalk/
--                        error/synthetic-row). Op hard-fact-risk cases telt
--                        'unknown' als warning/fail, NOOIT automatisch PASS.
--
-- Alle kolommen nullable: pre-0033 eval_runs houden NULL en worden door de
-- report-laag als 'unknown' behandeld voor history-rijen.
--
-- RLS: eval_runs heeft al RLS aan + SELECT-policy voor org-members sinds 0007.
-- Kolommen toevoegen via ALTER vereist geen nieuwe policy. Writes blijven
-- uitsluitend via service-role (eval-runner CLI) — zelfde discipline.
-- =============================================================================

alter table public.eval_runs
  add column if not exists hard_fact_supported boolean,
  add column if not exists missing_hard_facts jsonb,
  add column if not exists hard_fact_status text;

-- Idempotente check-constraint (DROP IF EXISTS + ADD) — zelfde patroon als 0024.
alter table public.eval_runs
  drop constraint if exists eval_runs_hard_fact_status_chk;

alter table public.eval_runs
  add constraint eval_runs_hard_fact_status_chk
    check (
      hard_fact_status is null
      or hard_fact_status in ('supported', 'unsupported', 'none_detected', 'unknown')
    );

comment on column public.eval_runs.hard_fact_supported is
  'v0.8 — alle harde feiten (geld/percentage/datum/aantal/email/url/telefoon) in bot_answer terug te vinden in bot_sources? Mirror van response.extras.hardFactSupport.supported. NULL = niet gemeten (zie hard_fact_status).';

comment on column public.eval_runs.missing_hard_facts is
  'v0.8 — jsonb-array van category-prefixed missing facts ("money:249"). Leeg bij supported=true; NULL bij niet gemeten.';

comment on column public.eval_runs.hard_fact_status is
  'v0.8 — supported | unsupported | none_detected | unknown. unknown = verifier draaide niet (fallback/smalltalk/error). Op hard-fact-risk cases telt unknown als warning/fail, nooit automatisch PASS.';
