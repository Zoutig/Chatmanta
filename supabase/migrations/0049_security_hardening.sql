-- =============================================================================
-- Migration 0049 — Security hardening (Supabase advisor-remediatie)
--
-- Drie WARN-bevindingen uit `get_advisors(type: security)` op prod, geen van
-- alle een actief lek maar wél netjes dicht te timmeren vóór V1-auth live gaat:
--
--   1. anon/authenticated_security_definer_function_executable
--      handle_new_auth_user(), prevent_self_admin_escalation() en
--      rls_auto_enable() zijn SECURITY DEFINER en stonden default EXECUTE-baar
--      voor anon/authenticated via /rest/v1/rpc/<fn>. Het zijn (event-)trigger-
--      functies — ze worden door het trigger-mechanisme als owner uitgevoerd,
--      niet via een directe EXECUTE-grant. Direct aanroepen heeft dus geen nut
--      en de grant intrekken breekt de triggers niet.
--
--   2. function_search_path_mutable
--      9 trigger-/sql-functies hadden geen vaste search_path → role-afhankelijke
--      naamresolutie. Hun bodies refereren tabellen óf volledig schema-
--      gekwalificeerd (public.*) óf raken geen enkele tabel (alleen NEW/now()),
--      dus `set search_path = ''` (de strengste, Supabase-aanbevolen waarde)
--      breekt niets: pg_catalog blijft impliciet doorzoekbaar voor now()/coalesce.
--
--   3. auth_rls_initplan
--      De SELECT-policy op v0_org_settings riep auth.uid() per rij aan. Wrappen
--      in (select auth.uid()) laat de planner 'm één keer evalueren. Zelfde
--      policy-logica, alleen sneller op schaal.
-- =============================================================================

-- 1. SECURITY DEFINER-functies niet langer direct aanroepbaar via PostgREST RPC.
revoke execute on function public.handle_new_auth_user()        from public, anon, authenticated;
revoke execute on function public.prevent_self_admin_escalation() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()             from public, anon, authenticated;

-- 2. Vaste, niet-muteerbare search_path op de 9 onbeschermde functies.
alter function public.admin_error_capture(text, uuid, text, text, text, text, text, jsonb)
  set search_path = '';
alter function public.admin_touch_updated_at()                  set search_path = '';
alter function public.cc_assistant_threads_touch_on_message()   set search_path = '';
alter function public.cc_decisions_touch_updated_at()           set search_path = '';
alter function public.cc_milestones_touch_updated_at()          set search_path = '';
alter function public.cc_phase_status_touch_updated_at()        set search_path = '';
alter function public.cc_tasks_touch_updated_at()               set search_path = '';
alter function public.cc_test_customers_touch_updated_at()      set search_path = '';
alter function public.v0_org_settings_touch_updated_at()        set search_path = '';

-- 3. RLS-policy herschrijven met (select auth.uid()) — identieke toegangsregel,
--    één evaluatie per query i.p.v. per rij.
drop policy if exists v0_org_settings_select_org_members on public.v0_org_settings;
create policy v0_org_settings_select_org_members on public.v0_org_settings
  for select to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );
