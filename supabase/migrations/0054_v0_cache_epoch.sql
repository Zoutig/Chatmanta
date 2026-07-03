-- 0054: answer_cache_epoch — vangnet tegen de stale-write-race (plan 006).
--
-- purgeAnswerCache bumpt vanaf nu de per-org epoch; de RAG-engine leest de epoch
-- bij pipeline-start en weigert de fire-and-forget cache-write wanneer de epoch
-- intussen veranderd is (KB/instellingen-wijziging mid-chat). Zonder dit kon een
-- lopende chat zijn pre-update antwoord ná de purge terug in de cache zetten,
-- waarna dat verouderde antwoord als cache-hit bleef serveren tot de volgende purge.
--
-- RLS AAN zonder policies: alleen de service-role (RLS-bypass) leest/schrijft —
-- zelfde houding als public._migrations. Geen FK naar organizations: puur
-- afgeleide staat; een orphan-rij na org-delete is onschadelijk.

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

-- Alleen de service-role mag bumpen (anon/authenticated zouden anders via
-- PostgREST-rpc cache-writes kunnen onderdrukken).
revoke execute on function public.bump_cache_epoch(uuid) from public, anon, authenticated;
grant execute on function public.bump_cache_epoch(uuid) to service_role;
