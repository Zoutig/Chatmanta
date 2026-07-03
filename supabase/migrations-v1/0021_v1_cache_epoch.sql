-- 0021: answer_cache_epoch — vangnet tegen de stale-write-race (plan 006).
-- Identiek aan V0-migratie 0054; zie die header voor het waarom.
-- NB: 0017-0020 zijn op dit project toegepast zonder repo-file (admin-overlay/
-- config/error-groups/recap, out-of-band); daarom start dit bestand op 0021.
--
-- RLS AAN zonder policies: alleen de service-role (RLS-bypass) leest/schrijft.
-- Geen FK naar organizations: puur afgeleide staat.

create table if not exists public.answer_cache_epoch (
  organization_id uuid primary key,
  epoch           bigint      not null default 1,
  updated_at      timestamptz not null default now()
);
alter table public.answer_cache_epoch enable row level security;

create or replace function public.bump_cache_epoch(p_organization_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.answer_cache_epoch (organization_id, epoch, updated_at)
  values (p_organization_id, 1, now())
  on conflict (organization_id)
  do update set epoch = public.answer_cache_epoch.epoch + 1, updated_at = now();
$$;

revoke execute on function public.bump_cache_epoch(uuid) from public, anon, authenticated;
grant execute on function public.bump_cache_epoch(uuid) to service_role;
