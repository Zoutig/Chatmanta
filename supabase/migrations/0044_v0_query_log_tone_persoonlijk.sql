-- =============================================================================
-- Migration 0044 — query_log.tone: nieuwe 'persoonlijk' toon toestaan
--
-- De widget-default-toon werd 'persoonlijk' (warm, je-vorm, spaarzaam emoji).
-- lib/v0/server/log.ts schrijft response.tone naar query_log.tone, maar de
-- CHECK uit migratie 0006 (query_log_tone_chk) liet alleen formal/neutral/casual
-- toe. Zonder deze verbreding faalt élke query_log-insert op een personal-org,
-- waardoor er geen queryLogId is en de feedback-koppeling + telemetrie breken.
--
-- Puur een constraint-verbreding: bestaande rijen (formal/neutral/casual/null)
-- blijven geldig, geen data-rewrite, omkeerbaar. RLS ongewijzigd — query_log
-- heeft al policies sinds eerdere migraties; deze ALTER raakt die niet.
-- =============================================================================

alter table public.query_log
  drop constraint if exists query_log_tone_chk;

alter table public.query_log
  add constraint query_log_tone_chk
    check (tone is null or tone in ('formal', 'neutral', 'casual', 'persoonlijk'));
