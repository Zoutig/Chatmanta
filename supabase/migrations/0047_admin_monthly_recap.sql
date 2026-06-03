-- =============================================================================
-- Migration 0047 — Maandelijkse Recap: admin_monthly_recaps + admin_recap_signals
--
-- Niels triggert per klant per maand een recap vanuit het Admin Dashboard:
-- maandstatistieken (LIVE berekend, NIET opgeslagen), een AI-prozasamenvatting,
-- deterministische signaleringen, en eigen notities. Deze migratie slaat ALLEEN
-- de bewerk-/genereer-artefacten op (samenvatting, notities, status, signaal-
-- triage). De cijfers zelf komen live uit v0_threads / v0_thread_messages /
-- query_log via lib/controlroom/server/recap.ts — afgesloten maanden veranderen
-- niet, dus snapshotten van stat-kolommen zou alleen aggregatie dupliceren.
--
-- ⚠️ RLS-MODEL — volgt bewust het admin_*-precedent (migraties 0038/0039/0043),
-- NIET de "RLS overal" V1 hard rule:
--   * Interne founder-observability (Niels-only rapportage); GEEN tenant-leespad.
--   * Geen RLS, geen organization_members-check. Toegang loopt UITSLUITEND via:
--       1. proxy.ts (V0 demo-password gate over /admindashboard)
--       2. requireV0Auth() in elke server action (app/actions/recap.ts)
--       3. service-role wrappers in lib/controlroom/server/recap.ts
--   * organization_id is een PLAIN uuid (GEEN FK naar organizations): V0-orgs zijn
--     app-constants (lib/v0/server/active-org.ts KNOWN_ORGS) met stabiele UUIDs;
--     de actie-laag zet de org server-side uit de route/cookie, nooit client-
--     payload. Een harde FK zou breken op niet-geseede orgs. V1 (organizations =
--     bron-van-waarheid) kan FK + RLS additief toevoegen.
--
-- De CHECK-enums spiegelen exact de TS-unions in lib/controlroom/types.ts; bij
-- elke enum-wijziging moeten beide meegroeien.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. admin_monthly_recaps — één rij per (org, kalendermaand). De stats staan
--    hier BEWUST NIET in (live berekend); alleen samenvatting/notities/status +
--    generatie-tijdstip. unique(organization_id, period_month) geeft upsert-
--    semantiek bij (her)genereren: regenereren overschrijft ai_summary +
--    generated_at, terwijl niels_notes behouden blijft.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_monthly_recaps (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  -- Kalendermaand als 'YYYY-MM' (bv. '2026-05'). Tekst i.p.v. date → natuurlijke
  -- uniciteit per maand + leesbaar; CHECK voorkomt vrije-vormstrings.
  period_month    text not null check (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- AI-prozasamenvatting (gpt-4o-mini). Nullable: leeg bij generatie-faal of bij
  -- een lege maand (LLM-call wordt dan overgeslagen) → Niels vult handmatig in.
  ai_summary      text check (ai_summary is null or char_length(ai_summary) <= 4000),
  -- Persoonlijke notitie van Niels; blijft behouden bij opnieuw genereren.
  niels_notes     text check (niels_notes is null or char_length(niels_notes) <= 8000),
  recap_status    text not null check (recap_status in ('draft','gepubliceerd')) default 'draft',
  -- Tijdstip van de laatste (her)generatie van de AI-samenvatting.
  generated_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, period_month)
);

-- Per-org archief ("Eerdere recaps"), nieuwste maand eerst.
create index if not exists admin_monthly_recaps_org_idx
  on public.admin_monthly_recaps (organization_id, period_month desc);

-- Hergebruik de gedeelde touch-trigger uit 0038 (admin_touch_updated_at()).
drop trigger if exists admin_monthly_recaps_touch on public.admin_monthly_recaps;
create trigger admin_monthly_recaps_touch
  before update on public.admin_monthly_recaps
  for each row execute function public.admin_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. admin_recap_signals — triage-status per deterministisch signaal per recap.
--    De signaleringen zelf (type + bericht) worden LIVE deterministisch berekend
--    in lib/controlroom/server/recap.ts (computeSignals); deze tabel bewaart enkel
--    de operator-triage (nieuw/genegeerd/behandeld) zodat 'genegeerd'/'behandeld'
--    bewaard blijft over (her)generaties heen. unique(recap_id, signal_type) →
--    upsert per signaaltype.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_recap_signals (
  id          uuid primary key default gen_random_uuid(),
  recap_id    uuid not null references public.admin_monthly_recaps(id) on delete cascade,
  signal_type text not null check (signal_type in (
    'kennisbank_incompleet','ontbrekende_info','gebruik_buiten_kantooruren','geen_gebruik'
  )),
  status      text not null check (status in ('nieuw','genegeerd','behandeld')) default 'nieuw',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (recap_id, signal_type)
);

create index if not exists admin_recap_signals_recap_idx
  on public.admin_recap_signals (recap_id);

drop trigger if exists admin_recap_signals_touch on public.admin_recap_signals;
create trigger admin_recap_signals_touch
  before update on public.admin_recap_signals
  for each row execute function public.admin_touch_updated_at();
