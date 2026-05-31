-- =============================================================================
-- Migration 0045 — admin_feedback: 'anders' als extra type melding
--
-- Niels-verzoek: een klant kan "Anders" kiezen als de reden van de melding niet
-- in de bestaande lijst (antwoordkwaliteit/bug/dashboard/feedback/wens) staat.
-- De reden zelf gaat in het al-verplichte beschrijvingsveld — er komt GEEN extra
-- kolom.
--
-- Alleen de type-CHECK wordt verbreed. De TS-union FEEDBACK_TYPES in
-- lib/controlroom/types.ts spiegelt deze enum (bij elke wijziging beide updaten).
--
-- Geen RLS-wijziging: admin_feedback volgt bewust het admin_*-precedent (geen RLS,
-- toegang via proxy.ts + requireV0Auth() + service-role wrappers) — zie 0043.
-- =============================================================================

alter table public.admin_feedback
  drop constraint if exists admin_feedback_type_check;

alter table public.admin_feedback
  add constraint admin_feedback_type_check
  check (type in ('antwoordkwaliteit', 'bug', 'dashboard', 'feedback', 'wens', 'anders'));
