-- 0022_v0_6_1_hard_facts — V0.6.1 hard-fact verifier telemetrie
--
-- V0.6.1 (PR-A van de v0.6 split) introduceert een regex-gebaseerde post-hoc
-- check of harde feiten in het antwoord (geld/percentages/datums/aantallen/
-- e-mail/URL/telefoon) 1-op-1 of genormaliseerd in de chunks staan. Bij
-- supported=false triggert de bestaande v0.5 claim-regenerate flow met
-- stricter prompt.
--
-- Twee nieuwe kolommen op query_log voor telemetrie + post-hoc eval-analyse:
--   * hard_fact_supported (boolean) — aggregate over alle claims na regenerate
--   * missing_hard_facts (jsonb)    — lijst categorie-prefixed strings
--                                     ("money:500", "phone:0699999999")
--
-- Beide nullable: v0.1-v0.5 runs houden NULL (check niet gedraaid).
-- Ook v0.6.1 met bot.adaptiveHardFactVerification=false zou NULL hebben.

ALTER TABLE public.query_log
  ADD COLUMN IF NOT EXISTS hard_fact_supported boolean NULL,
  ADD COLUMN IF NOT EXISTS missing_hard_facts jsonb NULL;

COMMENT ON COLUMN public.query_log.hard_fact_supported IS
  'V0.6.1 — bot.adaptiveHardFactVerification: zijn alle harde feiten (geld/percentages/datums/aantallen/e-mail/URL/telefoon) in het antwoord 1-op-1 of genormaliseerd terug te vinden in de aangeleverde chunks? Aggregate over claims. NULL voor v0.1-v0.5 (check niet gedraaid).';

COMMENT ON COLUMN public.query_log.missing_hard_facts IS
  'V0.6.1 — array van hard-fact strings die niet ondersteund konden worden door chunks, categorie-prefixed ("money:500", "phone:0699999999"). Leeg array = alles supported. NULL = check niet gedraaid.';

-- Partial index voor analytische queries: "welke queries hadden ongematchte
-- harde feiten?" — kleine result set verwacht (~5-15% van queries), partial
-- index houdt het lichtgewicht.
CREATE INDEX IF NOT EXISTS query_log_hard_fact_unsupported_idx
  ON public.query_log (organization_id, bot_version, created_at DESC)
  WHERE hard_fact_supported = false;
