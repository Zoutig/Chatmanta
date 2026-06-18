-- =============================================================================
-- Migration 0052 — V0 klantendashboard: widget-preview screenshot-cache (M6)
--
-- Doel: de "Preview Chatbot"-tab toont de widget over een screenshot van de
-- échte website van de klant als sfeer-backdrop. Die screenshot komt van een
-- BILLABLE Firecrawl-call (~1 credit), dus hij wordt bij de éérste preview-open
-- één keer gemaakt en daarna GECACHED — niet per render opnieuw. Deze migratie
-- voegt één jsonb-kolom toe waarin we de cache bewaren: { url, capturedAt }
--   - url:        de (publieke/signed) Storage-URL naar de PNG-bytes
--   - capturedAt: ISO-timestamp van de capture (voor "ververs"-knop in V1)
-- Een lege org of mislukte capture laat de kolom op '{}' staan → de UI valt
-- terug op een mockup-backdrop.
--
-- BEWUST V0-demo-data: dit is GEEN per-user identiteit (V1 Phase 1). De bestaande
-- RLS van v0_org_settings (SELECT voor org_members; writes via service-role) geldt
-- voor de hele rij, dus de nieuwe kolom erft die — geen nieuwe policy nodig.
-- Dedicated 1-koloms-upsert in settings.ts (saveWidgetPreview), nooit via
-- writeOrgSettings, zodat een capture nooit een gelijktijdige widget/chatbot/qa-
-- write clobbert.
-- =============================================================================

alter table public.v0_org_settings
  add column if not exists widget_preview jsonb not null default '{}'::jsonb;
