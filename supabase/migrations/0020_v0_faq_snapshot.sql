-- =============================================================================
-- Migration 0019 — V0 FAQ snapshot
--
-- Doel: persistente top-10 ranking van meest gestelde vragen per (org, bot,
-- venster). De ranking wordt periodiek handmatig vernieuwd via een knop in de
-- V0 admin UI. Top-5 antwoorden kunnen optioneel pre-gecached worden in
-- answer_cache; cached_answer_id in items[] verbindt FAQ-item ↔ answer_cache.
--
-- V0-specifiek: clustering gebeurt server-side (embedding + greedy single-link,
-- threshold 0.88). LLM-judge (gpt-4o-mini) kiest het beste antwoord per
-- cluster bij pre-cache. Zie lib/v0/server/faq-snapshot.ts en faq-judge.ts.
--
-- Append-only: nieuwste rij per (org, bot_version, time_window) telt. Oudere
-- rijen blijven staan als poor-man's history voor V0.
-- =============================================================================

create table if not exists public.faq_snapshot (
  id              uuid          primary key default gen_random_uuid(),
  organization_id uuid          not null references public.organizations(id) on delete cascade,
  bot_version     text          not null,                            -- 'v0.4' | 'v0.5' (UI filtert hierop)
  time_window     text          not null,                            -- '24h' | '7d' | 'all' (kolom heet niet 'window' want reserved-ish)
  generated_at    timestamptz   not null default now(),
  items           jsonb         not null,                            -- top-10 array; zie format hieronder
  total_unique    int           not null default 0,
  total_queries   int           not null default 0,
  embed_cost_usd  numeric(10,6) not null default 0,
  judge_cost_usd  numeric(10,6) not null default 0,
  constraint faq_snapshot_window_chk check (time_window in ('24h', '7d', 'all'))
);

-- items jsonb format (per element):
--   {
--     "rank":              1-based int,
--     "question":          representative-question text,
--     "count":             aantal hits in window,
--     "last_asked":        ISO timestamp,
--     "member_questions":  array van exact-string varianten in cluster,
--     "cached_answer_id":  uuid of null,
--     "judge_reason":      optionele string ("judge-pick" | "auto-pick-fallback" | "reuse-existing-cache")
--   }

create index if not exists faq_snapshot_org_version_window_idx
  on public.faq_snapshot (organization_id, bot_version, time_window, generated_at desc);

alter table public.faq_snapshot enable row level security;

drop policy if exists "faq_snapshot_select_org_members" on public.faq_snapshot;

create policy "faq_snapshot_select_org_members"
  on public.faq_snapshot
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- No INSERT/UPDATE/DELETE policy: writes via service-role only (V0 server
-- action wrapper heeft geen user-context).
