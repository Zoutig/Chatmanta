-- =============================================================================
-- Migration 0013 — Lockdown users.is_jorion_admin self-escalation
--
-- Achtergrond: de policy `users_update_own` (migratie 0001, regels 92-97) staat
-- iedere ingelogde user toe om zijn eigen `public.users`-rij te updaten. RLS
-- in Postgres kan geen kolommen filteren, dus zónder column-level lockdown kan
-- elke geregistreerde user via de Supabase JS-client zichzelf tot
-- Jorion-admin promoveren:
--
--   await supabase.from('users').update({ is_jorion_admin: true }).eq('id', uid)
--
-- → `requireJorionAdmin()` in lib/auth.ts geeft daarna toegang tot alle
-- /admin/* routes en cross-org service-role wrappers. Volledige tenant-isolatie
-- breakt.
--
-- De comment in 0001 erkende dit en parkeerde de fix naar "later phase". Dit
-- ís die phase.
--
-- Aanpak: twee lagen defense.
--   1. REVOKE alle UPDATE-rechten op public.users van authenticated/anon, en
--      GRANT alleen UPDATE op de kolom `full_name` terug. Dit dekt 99% van de
--      wegen — RLS-policy bepaalt of de RIJ raakbaar is, GRANT bepaalt of de
--      KOLOM raakbaar is. Beide moeten kloppen.
--   2. BEFORE UPDATE trigger als sluitsteen: ook als iemand later per ongeluk
--      een GRANT verbreedt of een nieuwe kolom toevoegt, wordt zelf-mutatie
--      van is_jorion_admin door de eigenaar geblokkeerd. Service-role bypasst
--      deze trigger niet (security definer + check op auth.uid()), dus
--      legitieme admin-promotie via lib/supabase/admin.ts blijft werken
--      omdat daar auth.uid() leeg is.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Layer 1 — Column-level GRANT lockdown
-- -----------------------------------------------------------------------------
-- Trek brede UPDATE in. Daarna alleen full_name terug. Email blijft uit
-- handen van users (sync via auth.users + trigger), is_jorion_admin idem
-- (Jorion-admin only), created_at/deleted_at zijn system-managed.
revoke update on public.users from authenticated, anon;

grant update (full_name) on public.users to authenticated;


-- -----------------------------------------------------------------------------
-- Layer 2 — Trigger-defense tegen zelf-promotie
-- -----------------------------------------------------------------------------
-- Blokkeert is_jorion_admin-mutatie wanneer de calling identity ook de eigenaar
-- van de rij is. Service-role draait zonder auth.uid() (returns NULL), dus
-- legitieme Jorion-onboarding via getJorionAdminClient() raakt deze trigger
-- niet. security definer omdat de trigger ook moet vuren als de caller
-- normaal geen rechten heeft op pg_authid (auth.uid lookup).
create or replace function public.prevent_self_admin_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_jorion_admin is distinct from old.is_jorion_admin then
    -- Zelf-promotie? Blokkeer. Cross-user via service-role (auth.uid() = NULL)
    -- mag wel — dat is de Jorion-admin-onboarding-flow.
    if auth.uid() is not null and auth.uid() = old.id then
      raise exception 'cannot self-modify is_jorion_admin'
        using errcode = '42501';  -- insufficient_privilege
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists users_no_self_admin_escalation on public.users;

create trigger users_no_self_admin_escalation
  before update on public.users
  for each row
  execute function public.prevent_self_admin_escalation();
