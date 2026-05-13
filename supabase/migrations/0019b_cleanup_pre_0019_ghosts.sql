-- =============================================================================
-- Migration 0019b — Cleanup pre-0019 ghost rows in _migrations
--
-- Bij het toepassen van 0019a_normalize_id_collisions.sql is gebleken dat er
-- nog 2 oudere ghost-rijen in _migrations staan van een eerdere rename-ronde
-- die nooit is opgeschoond:
--   - `0015_v0_5_eval_metrics`         (renamed → 0016_v0_5_eval_metrics)
--   - `0016_v0_parent_index_in_rpc`    (renamed → 0017_v0_parent_index_in_rpc)
--
-- De huidige files heten al 0016/0017. De ghost-rijen veroorzaken alleen een
-- mismatch in `npm run migrate:status` (24 applied / 22 totaal vóór deze
-- migration). Niet schadelijk, wel verwarrend bij audits.
--
-- Op een fresh DB (bootstrap) was 0019a's verkort-versie de eerste keer
-- toegepast (alleen de 2 nieuwe 0019-ghosts). Nu 0019a is uitgebreid met
-- alle 4 DELETEs voor toekomstige bootstraps, is deze 0019b alleen nodig om
-- bestaande DBs in te halen.
--
-- Idempotent: DELETE raakt 0 rijen als de ids al weg zijn.
-- =============================================================================

delete from public._migrations
 where id = '0015_v0_5_eval_metrics';

delete from public._migrations
 where id = '0016_v0_parent_index_in_rpc';
