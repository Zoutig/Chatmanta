-- =============================================================================
-- Migration 0030 — V0 widget feedback
--
-- Doel: bezoekers van de widget kunnen 👍/👎 geven op elk bot-antwoord, met
-- optionele toelichting bij 👎. Klantendashboard gebruikt deze tabel voor de
-- "Gesprekken → Negatieve feedback"-view.
--
-- Ontwerpkeuzes:
--   * 1-op-1 met query_log (FK + ON DELETE CASCADE): feedback zonder
--     query-context is waardeloos, dus we ruimen mee op bij log-cleanup.
--   * Optionele thread_id (ON DELETE SET NULL): widget schrijft op dit moment
--     géén threads, dus dit blijft NULL voor widget-feedback. Voor toekomst:
--     wanneer admintool feedback geeft (of widget threads gaat persisteren)
--     wijzen we hier de juiste thread aan voor "open gesprek"-link.
--   * Append-only: geen UPDATE/DELETE policies. Bezoeker kan z'n eigen
--     feedback niet wijzigen of terugtrekken — dat is bewust om churn te
--     voorkomen en past bij audit-log-semantiek (zie query_log).
--   * UNIQUE (query_log_id, rating): blokkeert dubbele submits (network
--     retry, dubbele klik). API geeft idempotent 200 terug bij conflict.
--   * RLS aan, SELECT-policy voor org-members (V1-ready). Mutations via
--     service-role wrappers vanuit de feedback-API route.
-- =============================================================================

create table public.v0_feedback (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  query_log_id    uuid        not null references public.query_log(id) on delete cascade,
  thread_id       uuid        null references public.v0_threads(id) on delete set null,
  rating          text        not null,
  comment         text        null,
  created_at      timestamptz not null default now(),
  constraint v0_feedback_rating_chk check (rating in ('up', 'down')),
  constraint v0_feedback_comment_len_chk check (comment is null or char_length(comment) <= 2000),
  constraint v0_feedback_unique_per_log unique (query_log_id, rating)
);

-- Dashboard-lijst: alle feedback van deze org, recent eerst.
create index v0_feedback_org_created_idx
  on public.v0_feedback (organization_id, created_at desc);

-- Subset-index voor de banner-check (`count(*) where rating='down' …`) en de
-- "Negatieve feedback"-tab. Niet strict nodig op V0-volume maar goedkoop en
-- maakt de query plannen-vriendelijk voor V1-volumes.
create index v0_feedback_org_rating_idx
  on public.v0_feedback (organization_id, rating, created_at desc);

alter table public.v0_feedback enable row level security;

create policy "v0_feedback_select_org_members"
  on public.v0_feedback
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- Geen INSERT/UPDATE/DELETE policy: mutations gaan via de service-role
-- wrapper in app/api/v0/feedback/route.ts.
