-- =============================================================================
-- Migration 0051 — V0 klantendashboard FAQ (Meest gestelde vragen) backend
--
-- Twee tabellen:
--   1. klant_faq_snapshot  — version-agnostic, semantisch-geclusterde snapshot
--      van de meest gestelde vragen per org. Periodiek herberekend door een
--      scheduled cron (app/api/v0/cron/faq-snapshot). VERVANGT de live-scan in
--      lib/v0/klantendashboard/server/top-questions.ts. Klant leest dit via het
--      klantendashboard → RLS AAN, org-members SELECT (spiegelt faq_snapshot /
--      migratie 0020).
--   2. admin_config        — kleine globale key/value config voor operator-
--      instellingen (eerste gebruik: FAQ-refresh-cadans weekly/monthly). Volgt
--      bewust het admin_*-RLS-OFF-precedent (founder-intern, geen tenant-leespad).
--
-- ⚠️ Verschil met faq_snapshot (0020): GEEN bot_version, GEEN time_window.
--    De klant boeit niet welke bot-versie 'm beantwoordde, alleen of de vraag
--    vaak terugkomt — over ALLE gesprekken heen. Zie M4-spec.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. klant_faq_snapshot — version-agnostic snapshot per org.
--    Append-only: nieuwste rij per organization_id telt; oudere rijen blijven
--    staan als poor-man's history. De cron herberekent op cadans (zie 2).
-- ----------------------------------------------------------------------------
create table if not exists public.klant_faq_snapshot (
  id              uuid          primary key default gen_random_uuid(),
  organization_id uuid          not null references public.organizations(id) on delete cascade,
  generated_at    timestamptz   not null default now(),
  items           jsonb         not null,                            -- top-N array; zie format hieronder
  total_unique    int           not null default 0,
  total_queries   int           not null default 0,
  embed_cost_usd  numeric(10,6) not null default 0
);

-- items jsonb format (per element):
--   {
--     "rank":             1-based int,
--     "question":         representative-question text (meest recente variant),
--     "count":            som van hits over de cluster,
--     "last_asked":       ISO timestamp (meest recente member),
--     "last_status":      'answered' | 'unanswered' (van de meest recente member),
--     "member_questions": array van exact-string varianten in de cluster
--   }

create index if not exists klant_faq_snapshot_org_generated_idx
  on public.klant_faq_snapshot (organization_id, generated_at desc);

alter table public.klant_faq_snapshot enable row level security;

drop policy if exists "klant_faq_snapshot_select_org_members" on public.klant_faq_snapshot;

create policy "klant_faq_snapshot_select_org_members"
  on public.klant_faq_snapshot
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- No INSERT/UPDATE/DELETE policy: writes via service-role only (de cron en V0
-- compute-laag hebben geen user-context). Spiegelt faq_snapshot (0020).

-- ----------------------------------------------------------------------------
-- 2. admin_config — globale key/value config voor operator-instellingen.
--
-- ⚠️ RLS-MODEL — volgt bewust het admin_*-precedent (migraties 0038/0039/0047),
-- NIET de "RLS overal" V1 hard rule:
--   * Interne founder-instellingen (operator-only); GEEN tenant-leespad.
--   * Geen RLS, geen organization_members-check. Toegang loopt UITSLUITEND via:
--       1. proxy.ts (V0 demo-password gate over /admindashboard)
--       2. requireV0Auth() in de server action die schrijft
--       3. service-role wrappers (lib/v0/server/admin-config.ts)
--   * Globale config (geen organization_id): één rij per setting-key.
--
-- Eerste gebruik: key 'faq_refresh_cadence' → value '"weekly"' | '"monthly"'
-- (jsonb string). De FAQ-cron leest dit om de staleness-drempel te bepalen.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_config (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

-- Hergebruik de gedeelde touch-trigger uit 0038 (admin_touch_updated_at()).
drop trigger if exists admin_config_touch on public.admin_config;
create trigger admin_config_touch
  before update on public.admin_config
  for each row execute function public.admin_touch_updated_at();

-- Geen RLS: admin-only tabel (zie RLS-model-noot hierboven).
