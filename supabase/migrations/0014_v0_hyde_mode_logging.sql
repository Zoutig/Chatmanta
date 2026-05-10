-- =============================================================================
-- Migration 0014 — V0 HyDE-modus logging
--
-- Hernoemd van 0013 → 0014 om naam-collision met 0013_lockdown_users_update
-- te vermijden (beide werden parallel gemerged). Functioneel identiek aan
-- het origineel. Als je deze migratie al onder de oude naam hebt gerund:
--
--   update public._migrations
--      set id = '0014_v0_hyde_mode_logging'
--    where id = '0013_v0_hyde_mode_logging';
--
-- (Run één keer per environment dat de oude naam in z'n tracking-tabel heeft.)
--
-- Voor systematische A/B/C-eval van HyDE-modi (Geen / Upfront / Selective)
-- per query, los van de impliciete bot-versie-keuze. Vier kolommen:
--
--   1. hyde_mode_requested  text — wat de gebruiker (of eval-script) vroeg.
--                                  'auto' = volg bot-config, anders override.
--   2. hyde_mode_actual     text — wat er feitelijk draaide. NULL voor
--                                  smalltalk/blocked (geen HyDE pad).
--   3. hyde_ms              int  — losse kolom (zit ook in phase_timings_ms
--                                  jsonb) voor SQL-gemak: avg/percentiles
--                                  zonder jsonb-extractie.
--   4. hyde_document        text — gegenereerde hypothetische tekst, voor
--                                  kwalitatieve inspectie achteraf. NULL als
--                                  HyDE niet draaide.
--
-- Alle kolommen optional — legacy rijen krijgen NULL en blijven geldig.
-- =============================================================================


alter table public.query_log
  add column if not exists hyde_mode_requested text,
  add column if not exists hyde_mode_actual    text,
  add column if not exists hyde_ms             int,
  add column if not exists hyde_document       text;

alter table public.query_log
  add constraint query_log_hyde_mode_requested_chk
    check (hyde_mode_requested is null or hyde_mode_requested in ('auto','off','upfront','selective'));

alter table public.query_log
  add constraint query_log_hyde_mode_actual_chk
    check (hyde_mode_actual is null or hyde_mode_actual in ('off','upfront','selective'));

-- Index voor eval-aggregatie: groeperen op (bot_version, hyde_mode_actual)
-- bij het rapport. Org-scoped voor RLS-friendly planner.
create index if not exists query_log_org_hyde_idx
  on public.query_log (organization_id, bot_version, hyde_mode_actual);

comment on column public.query_log.hyde_mode_requested is
  'Wat de gebruiker vroeg via UI-toggle of eval-script: auto/off/upfront/selective.';
comment on column public.query_log.hyde_mode_actual is
  'Wat er feitelijk draaide: off/upfront/selective. Bij selective zonder trigger = "selective" maar zonder generation (hyde_document NULL, hyde_ms NULL).';
comment on column public.query_log.hyde_ms is
  'Latency van HyDE-generatie (LLM-call). NULL als HyDE niet draaide.';
comment on column public.query_log.hyde_document is
  'De gegenereerde hypothetische paragraaf. NULL als HyDE niet draaide.';


-- -----------------------------------------------------------------------------
-- ALTER: eval_runs — hyde_mode tracking voor 3-way A/B/C aggregatie in report.
--
-- Eval runner kan dezelfde vragenset 3× draaien (off/upfront/selective) tegen
-- dezelfde bot-versie; deze kolommen maken groeperen op (bot_version × mode)
-- mogelijk in v0-eval-report.ts.
-- -----------------------------------------------------------------------------
alter table public.eval_runs
  add column if not exists hyde_mode_requested text,
  add column if not exists hyde_mode_actual    text;

alter table public.eval_runs
  add constraint eval_runs_hyde_mode_requested_chk
    check (hyde_mode_requested is null or hyde_mode_requested in ('auto','off','upfront','selective'));

alter table public.eval_runs
  add constraint eval_runs_hyde_mode_actual_chk
    check (hyde_mode_actual is null or hyde_mode_actual in ('off','upfront','selective'));

create index if not exists eval_runs_org_version_hyde_idx
  on public.eval_runs (organization_id, bot_version, hyde_mode_actual);
