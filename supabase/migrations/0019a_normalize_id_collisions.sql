-- =============================================================================
-- Migration 0019a — Normaliseer _migrations.id collisions
--
-- Drie PRs (PR#31 general_knowledge_logging, PR#32 faq_snapshot, PR#34
-- eval_stage_timings) claimden parallel allemaal nummer 0019. Alle drie zijn
-- toegepast — DDL is idempotent of niet-conflicterend — maar de file-namen +
-- _migrations.id rijen overlappen.
--
-- Resolutie volgens chronologische apply-volgorde:
--   - 0019_v0_general_knowledge_logging  (14:57:50 UTC, eerste)   → BEHOUDT 0019
--   - 0019_v0_faq_snapshot               (15:28:52 UTC, tweede)   → naar 0020
--   - 0019_v0_eval_stage_timings         (20:53:55 UTC, derde)    → naar 0021
--
-- Files zijn parallel hernoemd via git mv. Deze migratie zorgt dat de
-- _migrations tracking-tabel mee-renamed wordt, zodat een `npm run migrate`
-- na de file-rename niet probeert de renamed files opnieuw toe te passen
-- (wat zou falen op DUPLICATE TABLE / DUPLICATE COLUMN errors).
--
-- Naamconventie: 0019a (niet 0020 / 0022) zodat dit script ALFABETISCH valt
-- tussen 0019_v0_general_knowledge_logging.sql en de renamed 0020/0021
-- bestanden. Postgres ASCII-volgorde: '_' (95) < 'a' (97), dus:
--   0019_v0_general_knowledge_logging.sql   ← runs first (already applied)
--   0019a_normalize_id_collisions.sql       ← runs second (THIS — fixes ids)
--   0020_v0_faq_snapshot.sql                ← runs third (already applied as 0020)
--   0021_v0_eval_stage_timings.sql          ← runs fourth (already applied as 0021)
--
-- Strategie: DELETE de oude id-rijen, NIET UPDATE. Reden: migrate.mjs
-- bouwt `pending` lijst aan het begin op basis van een snapshot van
-- _migrations.id. Als we via UPDATE de ids omzetten naar 0020/0021, blijven
-- die files nog steeds in `pending` staan, en de daarop volgende INSERT in
-- migrate.mjs geeft een PK-conflict. Met DELETE worden de renamed files
-- "echt pending" — hun SQL draait opnieuw (idempotent), en de INSERT slaagt.
--
-- Vereist dat 0020_v0_faq_snapshot.sql en 0021_v0_eval_stage_timings.sql
-- volledig idempotent zijn. faq_snapshot was dat al; eval_stage_timings is
-- in deze PR aangepast (`drop constraint if exists` toegevoegd).
--
-- Idempotent op een fresh DB (bootstrap): DELETE raakt 0 rijen omdat de oude
-- ids nooit bestonden in dat scenario.
-- =============================================================================

delete from public._migrations
 where id = '0019_v0_faq_snapshot';

delete from public._migrations
 where id = '0019_v0_eval_stage_timings';

-- Note: tijdens deze fix zijn óók 2 historische ghost-rijen ontdekt
-- (`0015_v0_5_eval_metrics` en `0016_v0_parent_index_in_rpc` van eerdere
-- renames die nooit waren opgeschoond). Die worden opgeruimd in
-- 0019b_cleanup_pre_0019_ghosts.sql — apart gehouden zodat dit bestand
-- een 1-op-1 mapping van de 0019-collision blijft.
