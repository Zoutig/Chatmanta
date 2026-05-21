-- =============================================================================
-- Migration 0030 — Widget-gesprekken in v0_threads + Top-vragen drempel
--
-- Twee onafhankelijke schema-uitbreidingen, samengevoegd omdat ze in dezelfde
-- PR worden geleverd:
--
--   1. v0_threads.visitor_id  — anonieme cookie-UUID waarmee /api/v0/chat
--      opvolgende widget-turns binnen 24u groepeert in één thread. Testtool-
--      threads en historische rijen blijven NULL (= geen visitor-id).
--
--   2. v0_org_settings.top_questions  — per-org config voor het Klanten-
--      dashboard "Meest gestelde vragen"-scherm: drempel (minCount) + max
--      lijst-grootte (topN). Default {minCount:2, topN:10}; nieuwe orgs en
--      bestaande rijen krijgen de default automatisch dankzij DEFAULT-clause.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- ALTER: v0_threads.visitor_id
-- -----------------------------------------------------------------------------
alter table public.v0_threads
  add column if not exists visitor_id text;

-- /api/v0/chat doet bij elke widget-call een lookup:
--   waar organization_id = ? and visitor_id = ? and deleted_at is null
--   en updated_at >= now() - interval '24 hours'
-- Gefilterde index houdt 'm klein (alleen widget-rijen) en sorteer-vriendelijk.
create index if not exists v0_threads_org_visitor_updated_idx
  on public.v0_threads (organization_id, visitor_id, updated_at desc)
  where visitor_id is not null and deleted_at is null;

comment on column public.v0_threads.visitor_id is
  'Anonieme cookie-UUID (v0_widget_visitor) waarmee /api/v0/chat opvolgende widget-turns groepeert binnen een 24u-venster. NULL voor testtool- en admintool-threads.';


-- -----------------------------------------------------------------------------
-- ALTER: v0_org_settings.top_questions
-- -----------------------------------------------------------------------------
alter table public.v0_org_settings
  add column if not exists top_questions jsonb not null
    default '{"minCount": 2, "topN": 10}'::jsonb;

-- Best-effort structuur-validatie. Hard ranges (minCount ∈ [1,50], topN ∈
-- [1,100]) worden óók in de TS-laag afgedwongen voor nettere foutmeldingen.
alter table public.v0_org_settings
  add constraint v0_org_settings_top_questions_shape_chk
  check (
    jsonb_typeof(top_questions -> 'minCount') = 'number'
    and jsonb_typeof(top_questions -> 'topN') = 'number'
    and (top_questions ->> 'minCount')::int between 1 and 50
    and (top_questions ->> 'topN')::int between 1 and 100
  );

comment on column public.v0_org_settings.top_questions is
  'Drempel voor "Meest gestelde vragen" tab: {minCount, topN}. minCount = vraag pas tonen vanaf X keer gesteld; topN = maximum aantal in lijst.';
