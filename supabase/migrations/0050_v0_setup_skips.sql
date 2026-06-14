-- =============================================================================
-- Migration 0050 — V0 klantendashboard: setup-checklist "overslaan" (item 2)
--
-- Doel: de "Aan de slag"-checklist op het Overzicht leidt elke stap-status af uit
-- de echte state (bronnen/settings/widget/berichten). Een klant kan een stap nu
-- niet handmatig wegklikken als hij 'm bewust overslaat (bv. geen website, wel
-- documenten). Deze migratie voegt één jsonb-kolom toe: een array van step-id's
-- die de klant heeft overgeslagen. Bij lezen telt een overgeslagen stap als
-- "voltooid"; een echte voltooiing wint sowieso (idempotent — geen conflict).
--
-- Persistentie volgt het account-precedent (0048): aparte jsonb-kolom, geschreven
-- via een dedicated 1-koloms-upsert (saveSetupSkips), NIET via writeOrgSettings —
-- zo kan een skip nooit een gelijktijdige widget/chatbot/qa-write clobberen.
--
-- BEWUST V0-demo-data: geen per-user identiteit (V1). De bestaande RLS van
-- v0_org_settings (SELECT voor org_members; writes via service-role) geldt voor
-- de hele rij, dus de nieuwe kolom erft die — geen nieuwe policy nodig.
-- =============================================================================

alter table public.v0_org_settings
  add column if not exists setup_skips jsonb not null default '[]'::jsonb;
