-- 0029_v1_org_fast_mode.sql
-- Fast mode per klant: OpenAI `service_tier: priority` op de antwoord- en hulpstap-calls
-- van de RAG-engine. Gemeten (v0.14, docs/LUNA_V014_RESULTATEN.md): sneller antwoord tegen
-- ~2× het tokentarief. Standaard AAN voor elke org; een Jorion-admin kan het per klant
-- uitzetten in de Beheer-tab (bv. een klant met veel verkeer en een krap budget).
--
--   fast_mode_enabled — boolean NOT NULL DEFAULT true. Bestaande orgs krijgen true.
--
-- Nummer 0029 (niet 0027): 0027 is geclaimd door de parallelle branch
-- feat/seb/vragen-limieten (0027_v1_org_question_limits.sql).
--
-- Geen RLS-wijziging: de bestaande organizations-policies (migr 0001) dekken member-reads;
-- de write loopt uitsluitend via een SA-1-gegate admin-server-action op de service-role
-- (Jorion is geen org-member → de RLS-session-client zou de org niet zien). De chat-paden
-- lezen de kolom via diezelfde service-role (lib/v1/limits/fast-mode.ts, fout → standaard
-- tier). Zelfde redenering als 0025_v1_org_suspend.sql.

alter table public.organizations
  add column fast_mode_enabled boolean not null default true;
