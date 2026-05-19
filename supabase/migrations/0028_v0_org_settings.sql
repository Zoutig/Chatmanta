-- =============================================================================
-- Migration 0028 — V0 klantendashboard: per-org settings (widget + chatbot + qa)
--
-- Doel: het klantendashboard mockt op dit moment alle "save"-acties — wijzigingen
-- aan widget-uiterlijk, chatbot-instellingen en handmatige Q&A verdwijnen bij
-- refresh. Deze tabel maakt die drie groepen persistent per organization, en
-- vormt de single source of truth voor zowel /klantendashboard/* als de
-- demo-widget op /widget (die nu via app/widget/org-skins.ts hardcoded skin's
-- gebruikt — bij merge overruled door de overrides hieronder).
--
-- Eén tabel met jsonb-velden ipv aparte gestructureerde tabellen, omdat:
--   - V0 is sandbox; we voegen velden bij zonder schema-migraties te willen
--     stapelen.
--   - De drie groepen worden los gelezen/geschreven; jsonb laat partial-merge
--     via Supabase's `||` operator of via een TS-side patch + upsert.
--   - Bij V1 (Phase 2 "Klanten & Chatbots beheer") kan dit gesplitst worden in
--     `chatbot_settings`, `widget_settings`, `manual_qa_items` als de scope dat
--     vereist — defaults blijven gelijk dankzij `lib/v0/klantendashboard/mock/*`.
--
-- Schrijven gaat altijd via service-role wrappers in
-- lib/v0/klantendashboard/server/settings.ts. RLS staat aan en geeft alleen
-- authenticated organization_members SELECT-toegang — zodat een toekomstige
-- client-side fetcher (V1) niet andermans settings kan zien zonder membership.
-- =============================================================================

create table if not exists public.v0_org_settings (
  organization_id uuid        primary key references public.organizations(id) on delete cascade,
  widget          jsonb       not null default '{}'::jsonb,
  chatbot         jsonb       not null default '{}'::jsonb,
  qa              jsonb       not null default '[]'::jsonb,
  updated_at      timestamptz not null default now()
);

-- Voor lijst-views (admin debugging): meest recent gewijzigde orgs eerst.
create index if not exists v0_org_settings_updated_at_idx
  on public.v0_org_settings (updated_at desc);

alter table public.v0_org_settings enable row level security;

-- SELECT: alleen leden van de org mogen hun eigen settings lezen.
-- Mutaties lopen via service-role (= bypasst RLS), zodat we geen aparte
-- INSERT/UPDATE/DELETE policies hoeven te schrijven en het patroon van
-- v0_threads/document_chunks volgen.
create policy "v0_org_settings_select_org_members"
  on public.v0_org_settings
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- updated_at auto-touch via trigger zodat client-side updates niet hoeven te
-- onthouden dit veld te bumpen. Bij upsert (= zowel INSERT als UPDATE) bumpt
-- deze trigger het veld naar now().
create or replace function public.v0_org_settings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists v0_org_settings_touch_updated_at on public.v0_org_settings;
create trigger v0_org_settings_touch_updated_at
  before insert or update on public.v0_org_settings
  for each row
  execute function public.v0_org_settings_touch_updated_at();
