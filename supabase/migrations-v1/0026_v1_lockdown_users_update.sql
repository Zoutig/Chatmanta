-- 0026_v1_lockdown_users_update.sql
-- Sluit de is_jorion_admin zelf-escalatie op public.users (plan 011).
-- Port van V0-migratie 0013_lockdown_users_update.sql — die fix is bij het
-- opzetten van het V1-schema nooit meegenomen; de comment in 0001_core_tenancy.sql
-- (regels 86-91) erkent het gat zelf en parkeerde het naar "a later phase".
--
-- HET GAT. De policy `users_update_own` (0001:92-97) laat iedere ingelogde user
-- zijn eigen public.users-rij updaten, en Postgres-RLS kan géén kolommen filteren.
-- Zonder kolom-lockdown kan elke authenticated user via de Supabase JS-client
-- zichzelf tot Jorion-admin promoveren:
--
--   await supabase.from('users').update({ is_jorion_admin: true }).eq('id', uid)
--
-- → requireJorionAdmin() (lib/auth.ts) leest die zelf-gezette vlag als true terug
-- en geeft toegang tot alle /admin/*-routes én getJorionAdminClient()
-- (lib/supabase/admin.ts), de cross-org service-role-client. Daarmee is de
-- tenant-isolatie volledig doorbroken, inclusief bezoekers-PII in contact_requests.
--
-- (De INSERT-route is al dicht: geen INSERT-policy voor authenticated, rijen
-- ontstaan uitsluitend via de security-definer trigger handle_new_auth_user()
-- die alléén id/email/full_name zet — is_jorion_admin valt op default false —
-- en die functie is niet als RPC aanroepbaar, 0001:195. Alleen UPDATE resteert.)
--
-- Twee lagen defense, identiek aan V0-0013.


-- -----------------------------------------------------------------------------
-- Laag 1 — Kolom-level GRANT-lockdown
-- -----------------------------------------------------------------------------
-- RLS bepaalt of de RIJ raakbaar is, GRANT bepaalt of de KOLOM raakbaar is.
-- Beide moeten kloppen. Trek de brede UPDATE in en geef alleen full_name terug:
-- email wordt gesynct vanuit auth.users (trigger), is_jorion_admin is Jorion-only,
-- created_at/deleted_at zijn system-managed.
revoke update on public.users from authenticated, anon;

grant update (full_name) on public.users to authenticated;


-- -----------------------------------------------------------------------------
-- Laag 2 — Trigger-sluitsteen tegen zelf-promotie
-- -----------------------------------------------------------------------------
-- Vangnet voor als iemand later per ongeluk een grant verbreedt of een gevoelige
-- kolom toevoegt: blokkeert een is_jorion_admin-mutatie wanneer de calling
-- identity óók de eigenaar van de rij is.
--
-- Service-role blijft ongemoeid: die draait zonder JWT, dus auth.uid() is NULL en
-- de guard slaat niet aan. De legitieme Jorion-onboarding via
-- getJorionAdminClient() (die is_jorion_admin op een ándere user zet) blijft dus
-- gewoon werken.
--
-- security definer + gepinde search_path conform de V1-conventie (zie
-- bump_cache_epoch in 0021:19-20).
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

-- Deze functie is een TRIGGER-functie en mag nooit als PostgREST-RPC aanroepbaar
-- zijn (security definer). Trek de default PUBLIC execute-grant in — de trigger
-- zelf draait als table-owner en raakt hier niet door verstoord.
-- Conventie: 0001:195 (handle_new_auth_user), 0021:28 (bump_cache_epoch).
revoke execute on function public.prevent_self_admin_escalation() from public, anon, authenticated;

drop trigger if exists users_no_self_admin_escalation on public.users;

create trigger users_no_self_admin_escalation
  before update on public.users
  for each row
  execute function public.prevent_self_admin_escalation();
