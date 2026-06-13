-- =============================================================================
-- Migration 0048 — V0 klantendashboard: account-overrides (Niels item 8)
--
-- Doel: het account-scherm (/klantendashboard/account) toonde bedrijfsnaam,
-- contactpersoon en e-mail als read-only mock-data ("Wijzigen volgt in V1").
-- Niels wil die in V0 al kunnen aanpassen voor demo's. Deze migratie voegt één
-- jsonb-kolom toe waarin de klant zijn eigen display-waarden kan overschrijven;
-- bij lezen wint de override over de mock (partial-merge, zelfde patroon als
-- widget/chatbot). Slug/UUID/workspace blijven onveranderlijk (org-resolutie,
-- embed-tokens en persona hangen aan KNOWN_ORGS).
--
-- BEWUST V0-demo-data: dit is GEEN per-user identiteit (dat is V1 Phase 1) en de
-- e-mail hier wordt NERGENS als verzend-adres gebruikt (feedback-reply gebruikt
-- submitter_email, de operator-notificatie gebruikt FEEDBACK_NOTIFY_EMAIL). De
-- bestaande RLS van v0_org_settings (SELECT voor org_members; writes via
-- service-role) geldt voor de hele rij, dus de nieuwe kolom erft die — geen
-- nieuwe policy nodig.
-- =============================================================================

alter table public.v0_org_settings
  add column if not exists account jsonb not null default '{}'::jsonb;
