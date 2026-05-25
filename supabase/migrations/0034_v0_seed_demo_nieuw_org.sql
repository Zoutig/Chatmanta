-- =============================================================================
-- 0034 — SEED: lege demo-org "Demo Nieuw"
-- =============================================================================
-- Een gloednieuwe V0 sandbox-org zonder documenten, content of gesprekken.
-- Doel: laten zien hoe het klantendashboard eruitziet voor een verse klant
-- (status 'concept', alle metrics 0, onboarding-rondleiding).
--
-- Vaste UUID — spiegelt KNOWN_ORGS['demo-nieuw'] in lib/v0/server/active-org.ts
-- (zelfde deterministische-UUID-conventie als de andere V0-orgs).
-- Idempotent: opnieuw runnen verandert niets.
insert into public.organizations (id, name, slug)
values (
  '00000000-0000-0000-0000-0000000000a4',
  'Demo Nieuw',
  'demo-nieuw'
)
on conflict (id) do nothing;
